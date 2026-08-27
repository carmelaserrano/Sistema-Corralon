-- Migracion 0010: alertas de stock minimo - US-STK-15
--
-- Historia: "Como Encargado de Compras quiero recibir alertas cuando el
-- stock disponible caiga por debajo del minimo configurado, para gestionar
-- la reposicion a tiempo".
--
-- La alerta se genera dentro de confirmar_movimiento() (migracion 0007):
-- es el unico lugar donde se actualiza stock_x_deposito al confirmar un
-- movimiento, asi que es el mismo flujo/evento que exige la historia. No hay
-- job, cron ni polling: el INSERT en alertas_stock ocurre en la misma
-- transaccion que descuenta el stock del deposito origen.
--
-- Condicion de disparo (evita el falso positivo de alertar en cada
-- movimiento mientras el stock siga por debajo del minimo):
--   disponible_anterior >= minimo  y  disponible_nuevo < minimo
-- "disponible" es cantidad - comprometido, la misma definicion que ya usa
-- confirmar_movimiento() y que documenta docs/der.md.
--
-- Solo aplica al deposito ORIGEN de un movimiento (egreso o transferencia):
-- un ingreso o el lado destino de una transferencia solo puede sumar stock,
-- nunca cruzar el minimo hacia abajo.
--
-- Codigos SQLSTATE propios que define esta migracion. Los lee
-- src/modules/stock/api/alertasStockApi.js:
--   AL001 -> 404  la alerta no existe
--   AL002 -> 409  la alerta ya fue atendida

begin;

-- =====================================================================
-- 1) Tabla de alertas
-- =====================================================================

create table public.alertas_stock (
  id uuid primary key default gen_random_uuid(),

  producto_id uuid not null
    references public.productos(id)
    on delete restrict,

  deposito_id uuid not null
    references public.depositos(id)
    on delete restrict,

  stock_disponible numeric not null,
  stock_minimo numeric not null,

  estado text not null default 'activa',

  generada_en timestamptz not null default now(),

  atendida_by uuid references auth.users(id),
  atendida_at timestamptz,

  constraint alertas_stock_estado_check
    check (estado in ('activa', 'atendida'))
);

-- Evita alertas activas duplicadas para el mismo articulo/deposito: es el
-- mecanismo que usa el INSERT de confirmar_movimiento() (ON CONFLICT DO
-- NOTHING) para no crear una alerta nueva mientras ya haya una activa.
create unique index idx_alertas_stock_activa_unica
  on public.alertas_stock (producto_id, deposito_id)
  where estado = 'activa';

create index idx_alertas_stock_estado_generada
  on public.alertas_stock (estado, generada_en desc);

alter table public.alertas_stock enable row level security;

create policy "alertas_stock_select_authenticated"
  on public.alertas_stock
  for select
  to authenticated
  using (true);

-- Sin policies de INSERT/UPDATE para 'authenticated': la alerta solo se crea
-- desde confirmar_movimiento() y solo se atiende desde atender_alerta_stock(),
-- ambas SECURITY DEFINER. Mismo criterio que movimientos_stock (migracion
-- 0002/0007): la tabla es inmutable para el cliente salvo por esas funciones.


-- =====================================================================
-- 2) confirmar_movimiento(): agrega la deteccion de cruce de minimo
-- =====================================================================
-- Se reemplaza la funcion completa (migracion 0007) agregando el paso 3b.
-- El resto del cuerpo queda identico.

create or replace function public.confirmar_movimiento(p_movimiento_id uuid)
returns setof movimientos_stock
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov movimientos_stock%rowtype;
  v_producto_id uuid;
  v_cantidad numeric;
  v_disponible numeric;
  v_deposito_id uuid;
  v_stock_minimo numeric;
  v_disponible_nuevo numeric;
begin
  -- 1) Bloqueo de la cabecera. NOWAIT: si otra sesion ya esta confirmando
  --    ESTE mismo movimiento, Postgres levanta 55P03 al instante en vez de
  --    esperar.
  select * into v_mov
  from movimientos_stock
  where id = p_movimiento_id
  for update nowait;

  if not found then
    raise exception 'El movimiento no existe'
      using errcode = 'MV002';
  end if;

  if v_mov.estado_movimiento <> 'pendiente' then
    raise exception 'El movimiento ya esta %', v_mov.estado_movimiento
      using errcode = 'MV003';
  end if;

  select d.producto_id, d.cantidad
    into v_producto_id, v_cantidad
  from detalle_movimiento d
  where d.movimiento_id = v_mov.id
  order by d.created_at, d.id
  limit 1;

  if v_producto_id is null then
    raise exception 'El movimiento no tiene detalle cargado'
      using errcode = 'MV005';
  end if;

  -- 2) Locks por par (articulo, deposito), en orden determinista.
  --
  --    Por que advisory locks y no solo FOR UPDATE NOWAIT: la fila de
  --    stock_x_deposito del DESTINO puede no existir todavia. FOR UPDATE no
  --    puede bloquear una fila inexistente, y el conflicto se terminaria
  --    resolviendo dentro del INSERT .. ON CONFLICT, que ESPERA al otro
  --    insertor (speculative insertion) en vez de fallar rapido. Eso
  --    convertiria el 423 en una espera silenciosa.
  --    pg_try_advisory_xact_lock si es un intento real: devuelve false al
  --    instante y se libera solo al terminar la transaccion.
  for v_deposito_id in
    select d
    from unnest(array[v_mov.deposito_origen_id, v_mov.deposito_destino_id]) as d
    where d is not null
    order by d
  loop
    if not pg_try_advisory_xact_lock(
      hashtext(v_producto_id::text),
      hashtext(v_deposito_id::text)
    ) then
      raise exception 'Hay otro movimiento en proceso sobre el mismo articulo/deposito'
        using errcode = 'MV006';
    end if;
  end loop;

  -- 3) ORIGEN: verificar disponible y descontar.
  --    disponible = cantidad - comprometido (definido en docs/der.md).
  if v_mov.deposito_origen_id is not null then
    select s.cantidad - s.comprometido into v_disponible
    from stock_x_deposito s
    where s.producto_id = v_producto_id
      and s.deposito_id = v_mov.deposito_origen_id
    for update nowait;

    if not found then
      raise exception 'El deposito origen no tiene stock de ese articulo'
        using errcode = 'MV004';
    end if;

    if v_disponible < v_cantidad then
      raise exception 'La cantidad supera el disponible del deposito origen'
        using errcode = 'MV004';
    end if;

    update stock_x_deposito
    set cantidad = cantidad - v_cantidad,
        updated_at = now()
    where producto_id = v_producto_id
      and deposito_id = v_mov.deposito_origen_id;

    -- 3b) Alerta de stock minimo (US-STK-15). Solo se dispara si el
    --     descuento hace CRUZAR el minimo hacia abajo, no en cualquier
    --     confirmacion sobre un articulo que ya estaba por debajo.
    select cs.min_stock into v_stock_minimo
    from configuracion_stock cs
    where cs.producto_id = v_producto_id
      and cs.deposito_id = v_mov.deposito_origen_id;

    if v_stock_minimo is not null then
      v_disponible_nuevo := v_disponible - v_cantidad;

      if v_disponible >= v_stock_minimo and v_disponible_nuevo < v_stock_minimo then
        insert into alertas_stock (
          producto_id,
          deposito_id,
          stock_disponible,
          stock_minimo
        )
        values (
          v_producto_id,
          v_mov.deposito_origen_id,
          v_disponible_nuevo,
          v_stock_minimo
        )
        -- Si ya hay una alerta activa para este articulo/deposito (por un
        -- movimiento previo que ya la genero), no se duplica.
        on conflict (producto_id, deposito_id) where estado = 'activa'
        do nothing;
      end if;
    end if;
  end if;

  -- 4) DESTINO: alta o suma. El upsert cubre el caso de que el articulo
  --    nunca haya estado en ese deposito.
  if v_mov.deposito_destino_id is not null then
    insert into stock_x_deposito (producto_id, deposito_id, cantidad, updated_at)
    values (v_producto_id, v_mov.deposito_destino_id, v_cantidad, now())
    on conflict (producto_id, deposito_id) do update
      set cantidad = stock_x_deposito.cantidad + excluded.cantidad,
          updated_at = now();
  end if;

  update movimientos_stock
  set estado_movimiento = 'confirmado'
  where id = v_mov.id;

  return query
    select * from movimientos_stock where id = v_mov.id;
end;
$$;

alter function public.confirmar_movimiento(uuid) owner to postgres;

revoke all on function public.confirmar_movimiento(uuid) from public;
grant execute on function public.confirmar_movimiento(uuid) to authenticated;


-- =====================================================================
-- 3) Atender una alerta
-- =====================================================================
-- SECURITY DEFINER por el mismo motivo que confirmar_movimiento/
-- cancelar_movimiento: no hay policy de UPDATE para 'authenticated', asi que
-- un .update() directo desde el navegador afectaria 0 filas en silencio.
-- El FOR UPDATE NOWAIT + el chequeo de estado son los que garantizan el 409
-- cuando dos personas intentan atender la misma alerta a la vez.

create or replace function public.atender_alerta_stock(p_alerta_id uuid)
returns setof alertas_stock
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alerta alertas_stock%rowtype;
begin
  select * into v_alerta
  from alertas_stock
  where id = p_alerta_id
  for update nowait;

  if not found then
    raise exception 'La alerta no existe'
      using errcode = 'AL001';
  end if;

  if v_alerta.estado <> 'activa' then
    raise exception 'La alerta ya fue atendida'
      using errcode = 'AL002';
  end if;

  update alertas_stock
  set estado = 'atendida',
      atendida_by = auth.uid(),
      atendida_at = now()
  where id = v_alerta.id;

  return query
    select * from alertas_stock where id = v_alerta.id;
end;
$$;

alter function public.atender_alerta_stock(uuid) owner to postgres;

revoke all on function public.atender_alerta_stock(uuid) from public;
grant execute on function public.atender_alerta_stock(uuid) to authenticated;

commit;
