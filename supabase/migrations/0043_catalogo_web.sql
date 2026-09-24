-- S3-14: catálogo web de productos.
--
-- 1. D-S3-03: la disponibilidad web se calcula sobre el depósito configurado
--    para e-commerce (parametros_ventas.clave = 'deposito_ecommerce'), no
--    sobre la suma de todos los depósitos como hacía la versión de S3-00.
-- 2. v_catalogo_web suma al final las columnas que la tienda necesita y que
--    `anon` no puede leer de las tablas: categoría, marca y unidad de medida.
--    Se agregan al final para no romper el `create or replace` ni a los
--    consumidores actuales (validar_carrito_web de S3-17).
-- 3. Solo quien tiene `ecommerce.publicar` puede cambiar publicado_web o
--    imagen_url (antes lo podía hacer cualquier usuario interno).
begin;

-- ----------------------------------------------------------------------------
-- 1. Parámetro del depósito de e-commerce
-- ----------------------------------------------------------------------------
-- valor: {"deposito_id": "<uuid>"}. Por defecto, el primer depósito creado
-- (el mismo criterio que usa el seed de pedidos web). Si no hay depósitos o
-- el parámetro no existe, todo el catálogo figura "Sin stock": nunca se
-- ofrece mercadería que no se puede despachar.
insert into public.parametros_ventas (clave, valor)
select 'deposito_ecommerce', jsonb_build_object('deposito_id', d.id)
  from public.depositos d
 order by d.created_at
 limit 1
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Vista pública del catálogo
-- ----------------------------------------------------------------------------
-- Sin cantidades exactas (CA-01 de S3-14): solo "Disponible"/"Sin stock".
-- El precio es el de la lista General.
create or replace view public.v_catalogo_web as
select
  p.id,
  p.sku,
  p.nombre,
  p.descripcion,
  p.imagen_url,
  p.categoria_id,
  p.marca_id,
  pl.precio as precio,
  coalesce((
    select sum(greatest(sd.cantidad - sd.comprometido, 0))
      from public.stock_x_deposito sd
     where sd.producto_id = p.id
       and sd.deposito_id = (
         select (pv.valor ->> 'deposito_id')::uuid
           from public.parametros_ventas pv
          where pv.clave = 'deposito_ecommerce'
       )
  ), 0) > 0 as disponible,
  c.nombre as categoria_nombre,
  m.nombre as marca_nombre,
  u.nombre as unidad_medida,
  u.abreviatura as unidad_abreviatura
from public.productos p
left join public.precios_lista pl
  on pl.producto_id = p.id
 and pl.lista_precio_id = (select id from public.listas_precio where nombre = 'General')
left join public.categorias c on c.id = p.categoria_id
left join public.marcas m on m.id = p.marca_id
left join public.unidades_medida u on u.id = p.unidad_medida_id
where p.estado_producto = 'activo'
  and p.publicado_web;

grant select on public.v_catalogo_web to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Publicación restringida a `ecommerce.publicar`
-- ----------------------------------------------------------------------------
-- Sin sesión (migraciones, service role) no se valida: auth.uid() es null.
create or replace function public.validar_publicacion_web()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and (new.publicado_web is distinct from old.publicado_web
          or new.imagen_url is distinct from old.imagen_url)
     and not public.usuario_tiene_permiso('ecommerce.publicar') then
    raise exception 'No tenés permiso para publicar productos en la tienda'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_publicacion_web() from public, anon, authenticated;

drop trigger if exists trg_validar_publicacion_web on public.productos;
create trigger trg_validar_publicacion_web
  before update of publicado_web, imagen_url on public.productos
  for each row execute function public.validar_publicacion_web();

commit;
