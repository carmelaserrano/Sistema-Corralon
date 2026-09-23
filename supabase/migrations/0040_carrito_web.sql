-- S3-17: validación pública de cantidades y persistencia atómica del carrito.
-- No reserva stock. Usa la disponibilidad agregada del catálogo S3-00.
begin;

-- Reintentar una fusión tras perder la respuesta HTTP no vuelve a sumar ítems.
-- Esta tabla solo es accesible desde la función, nunca desde el navegador.
create table if not exists public.fusiones_carrito_web (
  carrito_id uuid not null references public.carritos(id) on delete cascade,
  fusion_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (carrito_id, fusion_id)
);
alter table public.fusiones_carrito_web enable row level security;
revoke all on public.fusiones_carrito_web from public, anon, authenticated;

-- p_items: [{producto_id: uuid, cantidad: numeric >= 0}].
-- Devuelve precio General, imagen, cantidad permitida, disponibilidad y motivo.
-- Solo revela productos publicados; nunca cantidades o identidades por depósito.
create or replace function public.validar_carrito_web(p_items jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_cantidad numeric;
  v_stock numeric;
  v_producto record;
  v_motivo text;
  v_resultado jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'El carrito debe ser una lista de productos';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item->'cantidad') is distinct from 'number'
       or v_item->>'producto_id' is null then
      raise exception 'Cada ítem necesita producto_id y una cantidad numérica';
    end if;
    v_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    if v_cantidad < 0 then raise exception 'La cantidad no puede ser negativa'; end if;
  end loop;

  for v_id, v_cantidad in
    select (value->>'producto_id')::uuid, sum((value->>'cantidad')::numeric)
    from jsonb_array_elements(p_items) with ordinality
    group by (value->>'producto_id')::uuid
    having sum((value->>'cantidad')::numeric) > 0
    order by min(ordinality)
  loop
    select * into v_producto from public.v_catalogo_web where id = v_id;
    v_motivo := null;
    v_stock := 0;
    if not found then
      v_motivo := 'Producto no disponible';
    elsif v_producto.precio is null or v_producto.precio <= 0 then
      v_motivo := 'Sin precio disponible';
    else
      select coalesce(sum(greatest(cantidad - comprometido, 0)), 0)
      into v_stock from public.stock_x_deposito where producto_id = v_id;
      if v_stock <= 0 then v_motivo := 'Sin stock'; end if;
    end if;
    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
      'producto_id', v_id,
      'cantidad', case when v_motivo is null then least(v_cantidad, v_stock) else v_cantidad end,
      'nombre', coalesce(v_producto.nombre, 'Producto no disponible'),
      'imagen_url', v_producto.imagen_url,
      'precio', v_producto.precio,
      'disponible', v_motivo is null,
      'motivo', v_motivo,
      'ajustado', v_motivo is null and v_cantidad > v_stock
    ));
  end loop;
  return v_resultado;
end;
$$;
revoke all on function public.validar_carrito_web(jsonb) from public;
grant execute on function public.validar_carrito_web(jsonb) to anon, authenticated;

-- p_fusion_id null reemplaza el carrito; UUID suma el visitante una sola vez.
-- La transacción y el bloqueo del carrito serializan guardados y fusiones.
-- Comprueba la identidad en servidor, sin confiar en el clienteId recibido.
create or replace function public.guardar_carrito_web(
  p_cliente_id uuid, p_items jsonb, p_fusion_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_carrito uuid;
  v_items jsonb;
  v_guardados jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.clientes where id = p_cliente_id and usuario_web_id = auth.uid()
  ) then
    raise exception 'Solo podés modificar tu propio carrito' using errcode = '42501';
  end if;
  perform public.validar_carrito_web(p_items);
  insert into public.carritos(cliente_id) values (p_cliente_id)
    on conflict (cliente_id) do nothing;
  select id into v_carrito from public.carritos
    where cliente_id = p_cliente_id for update;
  select coalesce(jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad)
    order by created_at, id), '[]'::jsonb)
    into v_guardados from public.items_carrito where carrito_id = v_carrito;

  if p_fusion_id is not null then
    if exists (select 1 from public.fusiones_carrito_web
      where carrito_id = v_carrito and fusion_id = p_fusion_id) then
      return public.validar_carrito_web(v_guardados);
    end if;
    v_items := public.validar_carrito_web(v_guardados || p_items);
  else
    v_items := public.validar_carrito_web(p_items);
  end if;

  delete from public.items_carrito where carrito_id = v_carrito;
  insert into public.items_carrito(carrito_id, producto_id, cantidad)
    select v_carrito, (value->>'producto_id')::uuid, (value->>'cantidad')::numeric
    from jsonb_array_elements(v_items);
  update public.carritos set updated_at = now() where id = v_carrito;
  if p_fusion_id is not null then
    insert into public.fusiones_carrito_web(carrito_id, fusion_id) values (v_carrito, p_fusion_id);
  end if;
  return v_items;
end;
$$;
revoke all on function public.guardar_carrito_web(uuid, jsonb, uuid) from public;
grant execute on function public.guardar_carrito_web(uuid, jsonb, uuid) to authenticated;

commit;
