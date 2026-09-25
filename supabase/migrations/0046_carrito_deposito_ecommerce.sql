-- S3-14: el carrito web usa el mismo depósito que el catálogo (D-S3-03).
--
-- 0043_catalogo_web.sql hizo que v_catalogo_web calcule "Disponible" solo
-- sobre el depósito de e-commerce (parametros_ventas.clave =
-- 'deposito_ecommerce'), pero validar_carrito_web (0042_carrito_web.sql)
-- seguía topeando las cantidades con la suma de todos los depósitos: el
-- carrito aceptaba mercadería que el depósito de e-commerce no puede
-- despachar. Misma función que 0042; solo cambia el cálculo de v_stock.
-- Sin el parámetro configurado, el stock es 0 ("Sin stock"), igual que la vista.
begin;

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
      into v_stock from public.stock_x_deposito
      where producto_id = v_id
        and deposito_id = (
          select (pv.valor ->> 'deposito_id')::uuid
            from public.parametros_ventas pv
           where pv.clave = 'deposito_ecommerce'
        );
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

commit;
