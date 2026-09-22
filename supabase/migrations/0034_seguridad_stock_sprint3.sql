-- ============================================================================
-- 0032 · SPRINT 3: Cierre de dos huecos de seguridad de 0031
--
-- Hallados en el QA de la PR de S3-00 (feature/S3-00-base-sprint3):
--
--   1. liberar_stock y egresar_comprometido son SECURITY DEFINER y no
--      verificaban quién las llama. Cualquier usuario autenticado, incluido un
--      cliente web recién registrado en /tienda, podía llamarlas por RPC y
--      descontar stock físico o liberar reservas ajenas. Ahora exigen que
--      quien llama sea un usuario interno.
--
--   2. v_stock_disponible corría con los permisos de su dueño y se saltaba la
--      RLS de stock_x_deposito: un cliente web veía las cantidades exactas de
--      todos los depósitos. Ahora corre con los permisos de quien la consulta.
--
-- comprometer_stock queda abierta a propósito: el checkout web (S3-16) la
-- necesita para reservar stock. Restringirla o envolverla en un RPC propio del
-- checkout queda como pendiente de S3-16.
--
-- 0031 ya está aplicada en staging, por eso esto va en una migración nueva y
-- no como edición de 0031. Es idempotente: se puede volver a correr.
-- ============================================================================

begin;

-- ============================================================================
-- 1. liberar_stock · solo usuarios internos
-- ============================================================================
-- Misma firma y mismo cuerpo que en 0031; lo único nuevo es el chequeo inicial.

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
      and deposito_id = p_deposito;
  end loop;
end;
$$;

revoke all on function public.liberar_stock(uuid, jsonb) from public;
grant execute on function public.liberar_stock(uuid, jsonb) to authenticated;


-- ============================================================================
-- 2. egresar_comprometido · solo usuarios internos
-- ============================================================================

create or replace function public.egresar_comprometido(p_deposito uuid, p_items jsonb)
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
  values (v_tipo_id, p_deposito, 'confirmado', 'Egreso por venta entregada')
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
      and deposito_id = p_deposito;

    insert into public.detalle_movimiento (movimiento_id, producto_id, cantidad)
    values (v_movimiento_id, v_item.producto_id, v_item.cantidad);
  end loop;
end;
$$;

revoke all on function public.egresar_comprometido(uuid, jsonb) from public;
grant execute on function public.egresar_comprometido(uuid, jsonb) to authenticated;


-- ============================================================================
-- 3. v_stock_disponible · respetar la RLS de quien consulta
-- ============================================================================
-- Con security_invoker la vista aplica las políticas de stock_x_deposito al
-- usuario que la consulta: el personal interno la sigue viendo completa y un
-- cliente web ve cero filas. Requiere PostgreSQL 15+ (Supabase lo cumple).

alter view public.v_stock_disponible set (security_invoker = true);

commit;
