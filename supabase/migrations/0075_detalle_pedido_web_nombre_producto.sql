-- ============================================================================
-- 0075 · Nombre y SKU del producto guardados en el detalle del pedido web
--
-- El cliente web no puede leer public.productos: desde 0033 la lectura es solo
-- para internos (y la tabla tiene costo_medio_ponderado, que no debe ver). Por
-- eso el join producto:productos(nombre, sku) de Mis pedidos y del comprobante
-- de compra volvía null: el detalle mostraba "Artículo" y el PDF "Material de
-- construcción", sin nombre ni SKU.
--
-- En vez de abrir productos, el detalle guarda una foto del nombre y el SKU al
-- momento de la compra. Es lo correcto para un comprobante: si después se
-- renombra o despublica el producto, el pedido sigue diciendo lo que se compró.
--
--   1. Columnas producto_nombre y producto_sku en detalle_pedido_web.
--   2. Trigger BEFORE INSERT que las completa desde productos, para cualquier
--      camino de alta (crear_pedido_web y las RPC anteriores).
--   3. Backfill de los pedidos existentes.
-- ============================================================================

begin;

alter table public.detalle_pedido_web
  add column if not exists producto_nombre text,
  add column if not exists producto_sku text;

-- security definer: quien inserta es el cliente web (vía RPC), que no puede
-- leer productos con su propio rol.
create or replace function public.completar_producto_detalle_pedido_web()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.nombre, p.sku
    into new.producto_nombre, new.producto_sku
    from public.productos p
   where p.id = new.producto_id;
  return new;
end;
$$;

revoke all on function public.completar_producto_detalle_pedido_web() from public, anon, authenticated;

drop trigger if exists trg_detalle_pedido_web_producto on public.detalle_pedido_web;
create trigger trg_detalle_pedido_web_producto
before insert on public.detalle_pedido_web
for each row execute function public.completar_producto_detalle_pedido_web();

update public.detalle_pedido_web d
   set producto_nombre = p.nombre,
       producto_sku = p.sku
  from public.productos p
 where p.id = d.producto_id
   and (d.producto_nombre is null or d.producto_sku is null);

commit;
