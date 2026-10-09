-- ============================================================================
-- 0063 · Integridad entre depósitos, stock, movimientos y pedidos web
--
-- Hallazgos de la revisión de integración (ver
-- qa/integracion-depositos-pedidos-web/README.md y el diagnóstico de solo
-- lectura scripts/diagnostico_integracion_pedidos_web.sql):
--
--   H1  0053 cargó el stock del depósito de e-commerce con
--       `on conflict do update set comprometido = 0`: borró las reservas de
--       los pedidos web y ventas que estaban abiertos. Al cancelarlos o
--       entregarlos, liberar_stock/egresar_comprometido restan una reserva que
--       ya no existe: fallan por stock_x_deposito_comprometido_nonneg o, con
--       stock compartido, se comen la reserva de otra operación.
--       → comprometido se recalcula desde las reservas activas y cada cambio
--         queda en ajustes_comprometido_stock.
--
--   H2  cancelar_pedidos_web_vencidos (0050) procesa todos los vencidos en una
--       sola transacción: si UN pedido no puede liberar su reserva, la
--       excepción revierte el lote completo y el cron no cancela nada nunca
--       más (todos los pedidos vencidos quedan reteniendo stock).
--       → cada pedido se cancela en su propio bloque; el que falla queda
--         como aviso y el resto se procesa.
--
--   H3  La entrega de un pedido web egresa stock con el texto genérico
--       "Egreso por venta entregada": el movimiento no dice qué pedido fue.
--       → avanzar_estado_pedido pasa la referencia 'Pedido web #N'.
--
--   H4  liberar_stock y egresar_comprometido hacían un UPDATE sin verificar
--       que existiera la fila de stock. Sin fila, la reserva "se liberaba" en
--       silencio y el egreso dejaba un detalle_movimiento sin descontar stock.
--       → error explícito si no hay fila o no alcanza la reserva.
--
--   H5  Si el pago se aprueba después de que el cron canceló el pedido,
--       confirmar_pago_pedido (0057) devolvía el pedido sin registrar nada: el
--       cliente pagó y no quedaba rastro para reembolsarle.
--       → se registra el pago aprobado (sin reabrir el pedido) con un motivo
--         que pide el reembolso.
--
--   H6  parametros_ventas.deposito_ecommerce es un uuid dentro de un jsonb,
--       sin clave foránea: se podía apuntar a un depósito inexistente o borrar
--       el depósito configurado, y la tienda pasaba a "Sin stock" en silencio.
--       → triggers que validan el parámetro y protegen al depósito.
--
--   H7  pedidos_web no garantizaba que el domicilio correspondiera al tipo de
--       entrega ni al cliente del pedido, y detalle_pedido_web admitía el
--       mismo producto dos veces.
--       → constraints nuevas. Se validan solo si los datos actuales las
--         cumplen; si no, quedan NOT VALID (rigen para filas nuevas) y el
--         diagnóstico lista las filas a corregir.
--
--   H8  Datos de la base real (diagnóstico del 2026-10-07): los 2 pedidos
--       seed de 0033 no tienen historial (control P5), y quedaban NOT VALID
--       las constraints de cantidades enteras de carrito/pedidos/movimientos.
--       → se reconstruye la fila de alta del historial y se validan las
--         constraints que los datos ya cumplen.
--
-- No se edita ninguna migración ya mergeada: todo es `create or replace` o
-- DDL nuevo. Es idempotente.
-- ============================================================================

begin;

-- ============================================================================
-- 1) Reservas activas y control de comprometido (H1)
-- ============================================================================
-- Una reserva es lo que las funciones de negocio van a liberar o egresar más
-- adelante, con el mismo criterio que cada una usa:
--   - ventas Pendiente/Facturada: cantidad - cantidad_backorder (0059).
--   - pedidos web del checkout (checkout_id no nulo) que no están Entregado
--     ni Cancelado (0051). Los pedidos seed de 0033 nunca reservaron.
-- security_invoker: cada usuario ve lo que su RLS le permite (interno: todo).
-- Un cliente web puede leer sus propios pedidos (policy *_select_propio), así
-- que además se filtra a personal interno; los roles que no son de la Data
-- API (postgres en el SQL Editor y en reconciliar_comprometido_stock) ven todo.
create or replace view public.v_reservas_stock
with (security_invoker = true) as
select deposito_id, producto_id, sum(cantidad) as reservado
from (
  select v.deposito_id, dv.producto_id, dv.cantidad - dv.cantidad_backorder as cantidad
  from public.ventas v
  join public.detalle_venta dv on dv.venta_id = v.id
  where v.estado in ('Pendiente', 'Facturada')
    and dv.cantidad - dv.cantidad_backorder > 0
  union all
  select p.deposito_id, d.producto_id, d.cantidad
  from public.pedidos_web p
  join public.detalle_pedido_web d on d.pedido_id = p.id
  where p.checkout_id is not null
    and p.estado not in ('Entregado', 'Cancelado')
) r
where current_user not in ('anon', 'authenticated') or public.es_usuario_interno()
group by deposito_id, producto_id;

-- Diferencias entre stock_x_deposito.comprometido y las reservas activas.
-- Vacía cuando todo cuadra. stock_id nulo = reserva sin fila de stock.
create or replace view public.v_control_comprometido
with (security_invoker = true) as
select
  s.id as stock_id,
  coalesce(s.deposito_id, r.deposito_id) as deposito_id,
  coalesce(s.producto_id, r.producto_id) as producto_id,
  s.cantidad,
  coalesce(s.comprometido, 0) as comprometido,
  coalesce(r.reservado, 0) as reservado,
  coalesce(s.comprometido, 0) - coalesce(r.reservado, 0) as diferencia
from public.stock_x_deposito s
full join public.v_reservas_stock r
  on r.deposito_id = s.deposito_id and r.producto_id = s.producto_id
where coalesce(s.comprometido, 0) <> coalesce(r.reservado, 0);

revoke all on public.v_reservas_stock, public.v_control_comprometido from public, anon;
grant select on public.v_reservas_stock, public.v_control_comprometido to authenticated;

-- Bitácora de las correcciones de comprometido (no hay movimiento de stock
-- porque la reserva no mueve mercadería física).
create table if not exists public.ajustes_comprometido_stock (
  id                    uuid primary key default gen_random_uuid(),
  deposito_id           uuid not null references public.depositos(id),
  producto_id           uuid not null references public.productos(id),
  comprometido_anterior numeric not null,
  comprometido_nuevo    numeric not null,
  motivo                text not null,
  created_by            uuid default auth.uid() references auth.users(id),
  created_at            timestamptz not null default now()
);

alter table public.ajustes_comprometido_stock enable row level security;
drop policy if exists "ajustes_comprometido_stock_select_interno" on public.ajustes_comprometido_stock;
create policy "ajustes_comprometido_stock_select_interno" on public.ajustes_comprometido_stock
  for select to authenticated using (public.es_usuario_interno());
revoke all on public.ajustes_comprometido_stock from public, anon, authenticated;
grant select on public.ajustes_comprometido_stock to authenticated;

-- reconciliar_comprometido_stock — iguala comprometido a las reservas
-- activas en las filas existentes y deja cada cambio en la bitácora.
-- Las reservas sin fila de stock no se inventan: siguen visibles en
-- v_control_comprometido para revisarlas a mano.
--
-- El lock EXCLUSIVE espera a que terminen las reservas/entregas en curso y
-- frena las nuevas mientras dura el recálculo (lecturas siguen permitidas).
-- Sin grants: solo la ejecuta su owner (esta migración o el SQL Editor).
--
-- @param p_motivo text texto para la bitácora.
-- @returns integer filas de stock corregidas.
create or replace function public.reconciliar_comprometido_stock(
  p_motivo text default 'Reconciliación de reservas activas'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_corregidas integer;
begin
  lock table public.stock_x_deposito in exclusive mode;

  with diferencias as (
    select c.stock_id, c.deposito_id, c.producto_id, c.comprometido, c.reservado
    from public.v_control_comprometido c
    where c.stock_id is not null
  ),
  bitacora as (
    insert into public.ajustes_comprometido_stock (
      deposito_id, producto_id, comprometido_anterior, comprometido_nuevo, motivo
    )
    select deposito_id, producto_id, comprometido, reservado,
           coalesce(nullif(btrim(p_motivo), ''), 'Reconciliación de reservas activas')
    from diferencias
  )
  update public.stock_x_deposito s
     set comprometido = d.reservado,
         updated_at = now()
    from diferencias d
   where s.id = d.stock_id;

  get diagnostics v_corregidas = row_count;
  return v_corregidas;
end;
$$;

revoke all on function public.reconciliar_comprometido_stock(text)
  from public, anon, authenticated, service_role;


-- ============================================================================
-- 2) Primitivas de stock con verificación de fila y reserva (H4)
-- ============================================================================
-- Mismo cuerpo que 0034/0059; lo nuevo es que el UPDATE exige que la fila
-- exista y que la reserva alcance, y si no, falla con un mensaje legible en
-- vez de pasar en silencio o devolver el 23514 crudo de la constraint.

create or replace function public.liberar_stock(p_deposito uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
begin
  if not public.es_usuario_interno() then
    raise exception 'Solo el personal interno puede liberar stock'
      using errcode = '42501';
  end if;

  if p_deposito is null then
    raise exception 'El depósito es obligatorio';
  end if;

  for v_item in
    select (elem->>'producto_id')::uuid as producto_id,
           (elem->>'cantidad')::numeric as cantidad
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as elem
  loop
    if v_item.producto_id is null or v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cada ítem necesita producto_id y una cantidad mayor a 0';
    end if;

    update public.stock_x_deposito
    set comprometido = comprometido - v_item.cantidad,
        updated_at = now()
    where producto_id = v_item.producto_id
      and deposito_id = p_deposito
      and comprometido >= v_item.cantidad;

    if not found then
      raise exception 'RESERVA_INCONSISTENTE: el producto % no tiene % unidades reservadas en el depósito',
        v_item.producto_id, v_item.cantidad
        using errcode = 'P0001',
              hint = 'Revisar public.v_control_comprometido';
    end if;
  end loop;
end;
$$;

revoke all on function public.liberar_stock(uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.egresar_comprometido(
  p_deposito uuid,
  p_items jsonb,
  p_referencia text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_tipo_id uuid;
  v_movimiento_id uuid;
begin
  if not public.es_usuario_interno() then
    raise exception 'Solo el personal interno puede egresar stock'
      using errcode = '42501';
  end if;

  if p_deposito is null then
    raise exception 'El depósito es obligatorio';
  end if;

  select id into v_tipo_id from public.tipos_movimiento where codigo = 'egreso';
  if v_tipo_id is null then
    raise exception 'No existe el tipo de movimiento "egreso"';
  end if;

  insert into public.movimientos_stock (
    tipo_movimiento_id, deposito_origen_id, estado_movimiento, observaciones
  )
  values (
    v_tipo_id, p_deposito, 'confirmado',
    coalesce(nullif(btrim(p_referencia), ''), 'Egreso por venta entregada')
  )
  returning id into v_movimiento_id;

  for v_item in
    select (elem->>'producto_id')::uuid as producto_id,
           (elem->>'cantidad')::numeric as cantidad
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as elem
  loop
    if v_item.producto_id is null or v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cada ítem necesita producto_id y una cantidad mayor a 0';
    end if;

    update public.stock_x_deposito
    set cantidad = cantidad - v_item.cantidad,
        comprometido = comprometido - v_item.cantidad,
        updated_at = now()
    where producto_id = v_item.producto_id
      and deposito_id = p_deposito
      and comprometido >= v_item.cantidad
      and cantidad >= v_item.cantidad;

    if not found then
      raise exception 'RESERVA_INCONSISTENTE: el producto % no tiene % unidades reservadas y en existencia en el depósito',
        v_item.producto_id, v_item.cantidad
        using errcode = 'P0001',
              hint = 'Revisar public.v_control_comprometido';
    end if;

    insert into public.detalle_movimiento (movimiento_id, producto_id, cantidad)
    values (v_movimiento_id, v_item.producto_id, v_item.cantidad);
  end loop;
end;
$$;

-- 0059 lo revocó de public/anon/authenticated; service_role lo conservaba por
-- los default privileges de Supabase.
revoke all on function public.egresar_comprometido(uuid, jsonb, text)
  from public, anon, authenticated, service_role;


-- ============================================================================
-- 3) avanzar_estado_pedido con referencia en el egreso (H3)
-- ============================================================================
-- Cuerpo de 0051 con SECURITY DEFINER de 0057. Único cambio: el egreso de la
-- entrega usa la variante con referencia 'Pedido web #N'.
create or replace function public.avanzar_estado_pedido(
  p_pedido uuid,
  p_estado text,
  p_motivo text default null
)
returns public.pedidos_web
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido          public.pedidos_web;
  v_estado_anterior text;
  v_motivo          text := nullif(btrim(p_motivo), '');
  v_items           jsonb;
begin
  if not public.usuario_tiene_permiso('ecommerce.pedidos.gestionar') then
    raise exception 'No tenés permiso para gestionar pedidos web'
      using errcode = '42501';
  end if;

  select * into v_pedido from public.pedidos_web where id = p_pedido for update;

  if not found then
    raise exception 'El pedido no existe o no tenés permiso para verlo'
      using errcode = '42501';
  end if;

  v_estado_anterior := v_pedido.estado;

  if p_estado = 'Pagado' then
    raise exception 'El pago lo confirma la pasarela: un pedido no se puede marcar como Pagado a mano'
      using errcode = '22023';
  end if;

  if not public.transicion_pedido_permitida(v_estado_anterior, p_estado, v_pedido.tipo_entrega) then
    raise exception 'Transición no permitida: % → %', v_estado_anterior, p_estado
      using errcode = '22023';
  end if;

  if p_estado = 'Cancelado' and v_motivo is null then
    raise exception 'El motivo es obligatorio para cancelar un pedido'
      using errcode = '23514';
  end if;

  -- Solo los pedidos del checkout tienen stock reservado (ver 0051).
  if v_pedido.checkout_id is not null and p_estado in ('Cancelado', 'Entregado') then
    select coalesce(
      jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad)),
      '[]'::jsonb
    )
      into v_items
    from public.detalle_pedido_web
    where pedido_id = p_pedido;

    if p_estado = 'Cancelado' then
      perform public.liberar_stock(v_pedido.deposito_id, v_items);
    else
      perform public.egresar_comprometido(
        v_pedido.deposito_id, v_items, 'Pedido web #' || v_pedido.numero
      );
    end if;
  end if;

  update public.pedidos_web
     set estado = p_estado,
         cancelado_at = case when p_estado = 'Cancelado' then now() else cancelado_at end
   where id = p_pedido
  returning * into v_pedido;

  insert into public.historial_estado_pedido (
    pedido_id, estado_anterior, estado_nuevo, motivo, usuario_id
  ) values (
    p_pedido, v_estado_anterior, p_estado, v_motivo, auth.uid()
  );

  return v_pedido;
end;
$$;

revoke all on function public.avanzar_estado_pedido(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.avanzar_estado_pedido(uuid, text, text)
  to authenticated;


-- ============================================================================
-- 4) Vencimiento de pedidos: un pedido roto no frena al resto (H2)
-- ============================================================================
-- Cada pedido corre en su propio bloque BEGIN/EXCEPTION (subtransacción): si
-- no se puede liberar su reserva, se revierte solo ese pedido, queda un
-- WARNING en el log de Postgres y sigue apareciendo en el control P8 del
-- diagnóstico hasta que se corrija.
create or replace function public.cancelar_pedidos_web_vencidos()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido record;
  v_linea record;
  v_cancelados integer := 0;
begin
  for v_pedido in
    select id, numero, deposito_id, checkout_id from public.pedidos_web
    where estado = 'Pendiente de pago' and vence_at <= now()
    order by vence_at
    for update skip locked
  loop
    begin
      if v_pedido.checkout_id is not null then
        for v_linea in
          select producto_id, cantidad from public.detalle_pedido_web where pedido_id = v_pedido.id
        loop
          update public.stock_x_deposito
          set comprometido = comprometido - v_linea.cantidad, updated_at = now()
          where deposito_id = v_pedido.deposito_id
            and producto_id = v_linea.producto_id
            and comprometido >= v_linea.cantidad;
          if not found then
            raise exception 'No se pudo liberar la reserva del pedido web #%', v_pedido.numero;
          end if;
        end loop;
      end if;

      update public.pedidos_web
      set estado = 'Cancelado', pago_estado = 'expired', pago_motivo = 'Tiempo de pago agotado', cancelado_at = now()
      where id = v_pedido.id;
      insert into public.historial_estado_pedido (pedido_id, estado_anterior, estado_nuevo, motivo)
      values (v_pedido.id, 'Pendiente de pago', 'Cancelado', 'Pedido sin pago después de 60 minutos');
      v_cancelados := v_cancelados + 1;
    exception when others then
      raise warning 'cancelar_pedidos_web_vencidos: pedido web #% sin cancelar: %',
        v_pedido.numero, sqlerrm;
    end;
  end loop;
  return v_cancelados;
end;
$$;

revoke all on function public.cancelar_pedidos_web_vencidos()
  from public, anon, authenticated;
grant execute on function public.cancelar_pedidos_web_vencidos() to service_role;


-- ============================================================================
-- 5) Pago aprobado sobre un pedido ya cancelado (H5)
-- ============================================================================
-- Cuerpo de 0057. Nuevo: si el pedido está Cancelado y llega un pago
-- aprobado que todavía no estaba registrado, se guardan sus datos y un motivo
-- que pide el reembolso. El pedido NO se reabre: la reserva ya se liberó y
-- el stock pudo venderse. Las demás notificaciones siguen siendo idempotentes.
create or replace function public.confirmar_pago_pedido(
  p_pedido uuid,
  p_referencia text,
  p_estado text,
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos_web%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  if nullif(btrim(p_referencia), '') is null then raise exception 'La referencia de pago es obligatoria'; end if;
  if p_estado not in ('approved', 'rejected', 'cancelled', 'pending', 'in_process') then
    raise exception 'Estado de pago no reconocido';
  end if;

  select * into v_pedido from public.pedidos_web where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe'; end if;

  if v_pedido.estado = 'Cancelado'
     and p_estado = 'approved'
     and v_pedido.referencia_pago is null then
    update public.pedidos_web
    set referencia_pago = p_referencia, ultimo_pago_referencia = p_referencia,
        pago_estado = 'approved',
        pago_motivo = 'Pago aprobado con el pedido ya cancelado: corresponde reembolso'
    where id = p_pedido returning * into v_pedido;
    return to_jsonb(v_pedido);
  end if;

  if v_pedido.estado is distinct from 'Pendiente de pago' then
    return to_jsonb(v_pedido);
  end if;

  if p_estado = 'approved' then
    update public.pedidos_web
    set estado = 'Pagado', referencia_pago = p_referencia,
        ultimo_pago_referencia = p_referencia, pago_estado = p_estado,
        pago_motivo = null, pagado_at = now()
    where id = p_pedido returning * into v_pedido;

    insert into public.historial_estado_pedido (pedido_id, estado_anterior, estado_nuevo, motivo)
    values (p_pedido, 'Pendiente de pago', 'Pagado', 'Pago online aprobado');

    delete from public.items_carrito
    where carrito_id in (select id from public.carritos where cliente_id = v_pedido.cliente_id);
    update public.carritos set updated_at = now() where cliente_id = v_pedido.cliente_id;
  else
    update public.pedidos_web
    set ultimo_pago_referencia = p_referencia, pago_estado = p_estado,
        pago_motivo = nullif(btrim(p_motivo), '')
    where id = p_pedido returning * into v_pedido;
  end if;
  return to_jsonb(v_pedido);
end;
$$;

revoke all on function public.confirmar_pago_pedido(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.confirmar_pago_pedido(uuid, text, text, text)
  to service_role;


-- ============================================================================
-- 6) Depósito de e-commerce con integridad referencial (H6)
-- ============================================================================
create or replace function public.fn_validar_parametro_deposito_ecommerce()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_texto text := new.valor ->> 'deposito_id';
begin
  if new.clave <> 'deposito_ecommerce' then
    return new;
  end if;

  if v_texto is null
     or v_texto !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not exists (select 1 from public.depositos where id = v_texto::uuid) then
    raise exception 'El depósito de e-commerce debe ser un depósito existente'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_parametro_deposito_ecommerce on public.parametros_ventas;
create trigger trg_validar_parametro_deposito_ecommerce
  before insert or update on public.parametros_ventas
  for each row execute function public.fn_validar_parametro_deposito_ecommerce();

create or replace function public.fn_proteger_deposito_ecommerce()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.parametros_ventas
    where clave = 'deposito_ecommerce'
      and valor ->> 'deposito_id' = old.id::text
  ) then
    raise exception 'El depósito % despacha los pedidos de la tienda web: configurá otro depósito de e-commerce antes de eliminarlo',
      old.nombre
      using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_proteger_deposito_ecommerce on public.depositos;
create trigger trg_proteger_deposito_ecommerce
  before delete on public.depositos
  for each row execute function public.fn_proteger_deposito_ecommerce();

revoke all on function public.fn_validar_parametro_deposito_ecommerce() from public, anon, authenticated;
revoke all on function public.fn_proteger_deposito_ecommerce() from public, anon, authenticated;


-- ============================================================================
-- 7) Constraints de pedidos web (H7)
-- ============================================================================
-- Envío ⇔ domicilio.
alter table public.pedidos_web
  drop constraint if exists chk_pedido_web_domicilio_entrega;
alter table public.pedidos_web
  add constraint chk_pedido_web_domicilio_entrega
  check ((tipo_entrega = 'envio') = (domicilio_id is not null)) not valid;

-- El domicilio es del mismo cliente del pedido (FK compuesta).
create unique index if not exists ux_domicilio_cliente_id
  on public.domicilios_cliente (id, cliente_id);
alter table public.pedidos_web
  drop constraint if exists fk_pedido_web_domicilio_cliente;
alter table public.pedidos_web
  add constraint fk_pedido_web_domicilio_cliente
  foreign key (domicilio_id, cliente_id)
  references public.domicilios_cliente (id, cliente_id) not valid;

do $$
begin
  if not exists (
    select 1 from public.pedidos_web
    where (tipo_entrega = 'envio') <> (domicilio_id is not null)
  ) then
    alter table public.pedidos_web validate constraint chk_pedido_web_domicilio_entrega;
  else
    raise notice 'chk_pedido_web_domicilio_entrega queda NOT VALID: ver control P4 del diagnóstico';
  end if;

  if not exists (
    select 1 from public.pedidos_web p
    join public.domicilios_cliente d on d.id = p.domicilio_id
    where d.cliente_id <> p.cliente_id
  ) then
    alter table public.pedidos_web validate constraint fk_pedido_web_domicilio_cliente;
  else
    raise notice 'fk_pedido_web_domicilio_cliente queda NOT VALID: ver control P4 del diagnóstico';
  end if;

  -- Un producto por línea. Un índice único no admite NOT VALID: si hay
  -- duplicados se informa y no se crea.
  if not exists (
    select 1 from public.detalle_pedido_web
    group by pedido_id, producto_id having count(*) > 1
  ) then
    create unique index if not exists ux_detalle_pedido_web_producto
      on public.detalle_pedido_web (pedido_id, producto_id);
  else
    raise notice 'ux_detalle_pedido_web_producto no se creó: ver control P10 del diagnóstico';
  end if;
end $$;


-- ============================================================================
-- 8) Corrección de datos: reservas (H1)
-- ============================================================================
do $$
declare
  v_corregidas integer;
begin
  v_corregidas := public.reconciliar_comprometido_stock(
    '0063: comprometido recalculado desde las reservas activas (0053 lo había puesto en 0)'
  );
  raise notice 'reconciliar_comprometido_stock: % filas de stock corregidas', v_corregidas;
end $$;


-- ============================================================================
-- 9) Corrección de datos: pedidos sin historial y constraints pendientes
-- ============================================================================
-- Diagnóstico en la base real (2026-10-07), control P5: los 2 pedidos seed de
-- 0033 se insertaron directo y no tienen ninguna fila en
-- historial_estado_pedido. Se reconstruye una fila de alta con su estado
-- actual y su fecha de creación. No se inventan pasos intermedios ni se
-- cambia el estado del pedido.
insert into public.historial_estado_pedido (
  pedido_id, estado_anterior, estado_nuevo, motivo, usuario_id, created_at
)
select p.id, null, p.estado,
       'Historial reconstruido por 0063: el pedido se cargó sin pasar por el checkout',
       null, p.created_at
from public.pedidos_web p
where not exists (
  select 1 from public.historial_estado_pedido h where h.pedido_id = p.id
);

-- Control R1: constraints de cantidades enteras que 0017/0055 dejaron NOT
-- VALID. Rigen para filas nuevas desde entonces; si los datos históricos ya
-- las cumplen, se validan. Si no, quedan como están (sin error).
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass::text as tabla, c.conname
    from pg_constraint c
    where not c.convalidated
      and c.conrelid in (
        'public.items_carrito'::regclass,
        'public.detalle_pedido_web'::regclass,
        'public.detalle_movimiento'::regclass
      )
  loop
    begin
      execute format('alter table %s validate constraint %I', r.tabla, r.conname);
    exception when check_violation then
      raise notice '% sigue NOT VALID: hay filas históricas que no la cumplen', r.conname;
    end;
  end loop;
end $$;

commit;

-- Fin migración 0063
