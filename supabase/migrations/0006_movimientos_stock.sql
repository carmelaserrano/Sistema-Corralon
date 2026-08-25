-- Migracion 0006: registro de movimientos de stock - US-STK-08
--
-- Historia: "Como Encargado de Deposito quiero registrar ingresos, egresos y
-- transferencias para mantener la trazabilidad del inventario".
-- Casos de prueba TC-STK-08-01 a TC-STK-08-07.
--
-- Por que casi todo vive en funciones y no en la capa JS: la migracion 0002
-- dejo movimientos_stock y detalle_movimiento con policies de INSERT y SELECT
-- unicamente, sin UPDATE ni DELETE para 'authenticated' (son inmutables a
-- proposito). Eso tiene dos consecuencias:
--   1) confirmar no puede ser un .update() desde el navegador: afectaria 0
--      filas en silencio. Necesita SECURITY DEFINER.
--   2) el alta no puede ser dos inserts desde el navegador: si el segundo
--      fallara, la cabecera ya insertada no se podria borrar y quedaria un
--      movimiento pendiente sin renglon, imposible de confirmar y de eliminar.
-- Ademas los bloqueos fail-fast (FOR UPDATE NOWAIT, advisory locks) solo
-- existen dentro de una transaccion del servidor.
--
-- Codigos SQLSTATE propios que define esta migracion. Los lee
-- src/modules/stock/api/movimientosApi.js y los traduce a .status:
--   MV001 -> 400  depositos incoherentes con el tipo de movimiento
--   MV002 -> 404  el movimiento no existe
--   MV003 -> 409  el movimiento no esta pendiente (ya confirmado o cancelado)
--   MV004 -> 409  la cantidad supera el disponible del deposito origen
--   MV005 -> 409  el movimiento no tiene detalle cargado
--   MV006 -> 423  hay otro movimiento en proceso sobre el mismo articulo/deposito
--   MV007 -> 400  el tipo de movimiento no existe
--   MV008 -> 400  articulo o cantidad invalidos
-- Postgres ademas levanta 55P03 (lock_not_available) por su cuenta -> 423.

begin;


-- =====================================================================
-- 1) Comprobante de origen
-- =====================================================================
-- CA: "Se registra el tipo de movimiento y el comprobante de origen".
-- Nullable: la tabla puede tener filas previas y no hay valor de relleno
-- con sentido. El contrato de la historia tampoco lista un 400 por
-- comprobante faltante. La obligatoriedad practica la ponen el formulario
-- y la capa JS. Mismo tratamiento que codigo_barras en articulosApi.js.

alter table movimientos_stock
  add column if not exists comprobante text;

alter table movimientos_stock
  drop constraint if exists movimientos_comprobante_no_vacio;

alter table movimientos_stock
  add constraint movimientos_comprobante_no_vacio
  check (comprobante is null or length(btrim(comprobante)) > 0);


-- =====================================================================
-- 2) Origen y destino no pueden ser el mismo deposito
-- =====================================================================
-- Esto si se puede expresar en un CHECK plano: no necesita consultar
-- tipos_movimiento. Complementa a movimiento_tiene_deposito (migracion 0001).

alter table movimientos_stock
  drop constraint if exists movimientos_origen_distinto_destino;

alter table movimientos_stock
  add constraint movimientos_origen_distinto_destino
  check (
    deposito_origen_id is null
    or deposito_destino_id is null
    or deposito_origen_id <> deposito_destino_id
  );


-- =====================================================================
-- 3) Tipos de movimiento: codigo estable + datos iniciales
-- =====================================================================
-- El contrato de la historia manda tipo: "transferencia" (un slug), no un
-- uuid. Buscar por "nombre" obligaria a comparar contra un texto con
-- acentos y mayusculas variables. La columna codigo es la clave de maquina.

alter table tipos_movimiento
  add column if not exists codigo text;

insert into tipos_movimiento (nombre, codigo)
values
  ('Ingreso', 'ingreso'),
  ('Egreso', 'egreso'),
  ('Transferencia', 'transferencia')
on conflict (nombre) do nothing;

-- Filas preexistentes (o sembradas antes de que existiera la columna)
-- reciben un codigo derivado del nombre. Para los tres tipos de arriba el
-- resultado es identico al valor sembrado, asi que el paso es idempotente.
update tipos_movimiento
set codigo = lower(regexp_replace(nombre, '[^a-zA-Z0-9]+', '_', 'g'))
where codigo is null;

alter table tipos_movimiento
  alter column codigo set not null;

alter table tipos_movimiento
  drop constraint if exists tipos_movimiento_codigo_unique;

alter table tipos_movimiento
  add constraint tipos_movimiento_codigo_unique unique (codigo);


-- =====================================================================
-- 4) Coherencia origen/destino segun el tipo
-- =====================================================================
-- Va como trigger y no como CHECK porque un CHECK no puede consultar
-- tipos_movimiento para saber de que tipo se trata.
--
-- Y no alcanza con validarlo en la funcion de alta: la policy de INSERT de
-- movimientos_stock sigue vigente, asi que cualquiera con la anon key puede
-- insertar un movimiento sin pasar por crear_movimiento(). El trigger es la
-- unica capa que no se puede saltear.
--
-- Solo BEFORE INSERT: no hay policy de UPDATE para authenticated, y la unica
-- funcion que actualiza la tabla (confirmar_movimiento) toca
-- estado_movimiento, no los depositos.

create or replace function public.validar_coherencia_movimiento()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_codigo text;
begin
  select tm.codigo into v_codigo
  from tipos_movimiento tm
  where tm.id = new.tipo_movimiento_id;

  if v_codigo is null then
    raise exception 'El tipo de movimiento no existe'
      using errcode = 'MV007';
  end if;

  if v_codigo = 'ingreso' then
    if new.deposito_destino_id is null then
      raise exception 'Un ingreso requiere deposito destino'
        using errcode = 'MV001';
    end if;
    if new.deposito_origen_id is not null then
      raise exception 'Un ingreso no lleva deposito origen'
        using errcode = 'MV001';
    end if;

  elsif v_codigo = 'egreso' then
    if new.deposito_origen_id is null then
      raise exception 'Un egreso requiere deposito origen'
        using errcode = 'MV001';
    end if;
    if new.deposito_destino_id is not null then
      raise exception 'Un egreso no lleva deposito destino'
        using errcode = 'MV001';
    end if;

  elsif v_codigo = 'transferencia' then
    if new.deposito_origen_id is null or new.deposito_destino_id is null then
      raise exception 'Una transferencia requiere deposito origen y destino'
        using errcode = 'MV001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_coherencia_movimiento on movimientos_stock;

create trigger trg_validar_coherencia_movimiento
  before insert on movimientos_stock
  for each row
  execute function public.validar_coherencia_movimiento();


-- =====================================================================
-- 5) Alta de movimiento: cabecera + detalle en una sola transaccion
-- =====================================================================
-- SECURITY INVOKER (el default) a proposito: el alta si esta permitida por
-- RLS, y asi auth.uid() sigue siendo el usuario real y la policy
-- "created_by = auth.uid()" conserva sentido.
--
-- fecha, created_by, created_at y estado_movimiento NO se pasan: los ponen
-- los defaults de la tabla (now(), auth.uid(), now(), 'pendiente'). Eso
-- cubre el CA "se registran fecha, hora y usuario" sin que el cliente pueda
-- falsearlos.

create or replace function public.crear_movimiento(
  p_tipo text,
  p_producto_id uuid,
  p_cantidad numeric,
  p_deposito_origen_id uuid default null,
  p_deposito_destino_id uuid default null,
  p_comprobante text default null,
  p_observaciones text default null
)
returns setof movimientos_stock
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tipo_id uuid;
  v_codigo text;
  v_movimiento_id uuid;
  v_disponible numeric;
begin
  v_codigo := lower(btrim(coalesce(p_tipo, '')));

  select tm.id into v_tipo_id
  from tipos_movimiento tm
  where tm.codigo = v_codigo;

  if v_tipo_id is null then
    raise exception 'El tipo de movimiento "%" no existe', p_tipo
      using errcode = 'MV007';
  end if;

  if p_producto_id is null then
    raise exception 'El articulo es obligatorio'
      using errcode = 'MV008';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a 0'
      using errcode = 'MV008';
  end if;

  -- Chequeo temprano de disponible, SIN bloquear: sirve para dar el 409 ya
  -- en el alta (CA "se bloquea toda transferencia que supere el disponible
  -- del origen"). La garantia real la da confirmar_movimiento(), que si
  -- toma los locks.
  if p_deposito_origen_id is not null then
    select s.cantidad - s.comprometido into v_disponible
    from stock_x_deposito s
    where s.producto_id = p_producto_id
      and s.deposito_id = p_deposito_origen_id;

    if coalesce(v_disponible, 0) < p_cantidad then
      raise exception 'La cantidad supera el disponible del deposito origen'
        using errcode = 'MV004';
    end if;
  end if;

  insert into movimientos_stock (
    tipo_movimiento_id,
    deposito_origen_id,
    deposito_destino_id,
    comprobante,
    observaciones
  )
  values (
    v_tipo_id,
    p_deposito_origen_id,
    p_deposito_destino_id,
    nullif(btrim(coalesce(p_comprobante, '')), ''),
    nullif(btrim(coalesce(p_observaciones, '')), '')
  )
  returning id into v_movimiento_id;

  -- Un solo renglon por movimiento (alcance definido para US-STK-08).
  insert into detalle_movimiento (movimiento_id, producto_id, cantidad)
  values (v_movimiento_id, p_producto_id, p_cantidad);

  return query
    select * from movimientos_stock where id = v_movimiento_id;
end;
$$;

revoke all on function public.crear_movimiento(
  text, uuid, numeric, uuid, uuid, text, text
) from public;

grant execute on function public.crear_movimiento(
  text, uuid, numeric, uuid, uuid, text, text
) to authenticated;


-- =====================================================================
-- 6) Confirmacion: aplica el impacto en stock de forma atomica
-- =====================================================================
-- SECURITY DEFINER es obligatorio: sin policy de UPDATE, un .update() desde
-- el navegador afectaria 0 filas en silencio. La funcion corre con los
-- privilegios de su dueno (postgres), y el dueno de una tabla queda exento
-- de RLS salvo que se haya hecho ALTER TABLE ... FORCE ROW LEVEL SECURITY,
-- cosa que nunca se hizo en este esquema. Por eso el UPDATE de adentro pasa
-- y el de afuera no: la tabla sigue siendo inmutable para el cliente y esta
-- funcion es el unico camino para cambiarle el estado.
--
-- search_path fijo: sin el, alguien podria crear una tabla en un esquema que
-- preceda a public y hacer que la funcion (que corre como postgres) opere
-- sobre datos ajenos. pg_temp va ultimo por el mismo motivo.

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
-- 7) Cancelacion
-- =====================================================================
-- Sin esta funcion el estado 'cancelado' es inalcanzable: no hay policy de
-- UPDATE. TC-STK-08-06 usa como precondicion "un movimiento ya confirmado o
-- cancelado", asi que la mitad de ese caso seria inejecutable.
-- No toca stock: un pendiente todavia no impacto nada.

create or replace function public.cancelar_movimiento(p_movimiento_id uuid)
returns setof movimientos_stock
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov movimientos_stock%rowtype;
begin
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

  update movimientos_stock
  set estado_movimiento = 'cancelado'
  where id = v_mov.id;

  return query
    select * from movimientos_stock where id = v_mov.id;
end;
$$;

alter function public.cancelar_movimiento(uuid) owner to postgres;

revoke all on function public.cancelar_movimiento(uuid) from public;
grant execute on function public.cancelar_movimiento(uuid) to authenticated;


-- =====================================================================
-- 8) Indice para la bandeja de pendientes
-- =====================================================================

create index if not exists idx_movimientos_estado_fecha
  on movimientos_stock (estado_movimiento, fecha desc);

commit;
