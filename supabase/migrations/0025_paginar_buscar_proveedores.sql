-- Migración 0023: paginar buscar_proveedores y evitar filas duplicadas.
--
-- QA sobre US-PRV-03 (búsqueda de proveedores) encontró dos problemas en la
-- función buscar_proveedores de la 0022:
--
-- 1) [Alta] No hay paginación: la HDU pide 20 registros por página y la
--    función siempre devolvía el listado completo.
-- 2) [Media] Un proveedor vinculado a más de un rubro aparecía repetido: el
--    LEFT JOIN proveedor_rubro -> rubros_proveedor hace fan-out (una fila
--    por vínculo), y ni el RPC ni el front deduplicaban por proveedor.
--
-- Esta migración reemplaza la función:
--   - El filtro/búsqueda por rubro pasa a resolverse con EXISTS sobre
--     proveedor_rubro/rubros_proveedor, en vez de manejar el join en el
--     WHERE principal, así el fan-out no llega a filtrar filas.
--   - El rubro que se muestra en el listado sale de un LEFT JOIN LATERAL que
--     trae como mucho una fila por proveedor (la primera por nombre). El
--     modelo soporta N rubros por proveedor, pero el listado -y el front que
--     lo consume- siempre mostró uno solo (ver comentario de
--     normalizarProveedor() en proveedoresApi.js); acá se garantiza que sea
--     así también cuando hay más de uno cargado.
--   - Se agregan p_limit/p_offset (paginación) y una columna total_count
--     (count(*) over(), calculado sobre el conjunto ya filtrado y
--     deduplicado) para que el front arme "N proveedores · página X de Y"
--     sin una segunda consulta.
--
-- Como la firma cambia (dos parámetros nuevos), hay que borrar la versión de
-- 3 parámetros: create or replace no alcanza porque para Postgres es una
-- función distinta (mismo nombre, distinta lista de argumentos), y dejar las
-- dos definidas deja a PostgREST sin poder resolver la sobrecarga.
--
-- No se toca la migración 0022 (regla del repo: una migración ya mergeada no
-- se corrige, se reemplaza con una nueva).

begin;

drop function if exists public.buscar_proveedores(text, uuid, text);

create or replace function public.buscar_proveedores(
  p_search text default null,
  p_rubro_id uuid default null,
  p_estado text default 'activo',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id                       uuid,
  razon_social             text,
  nombre_fantasia          text,
  cuit                     text,
  condicion_fiscal         text,
  condicion_pago_habitual  text,
  domicilio                text,
  localidad                text,
  provincia                text,
  telefono                 text,
  email                    text,
  observaciones            text,
  estado                   text,
  created_at               timestamptz,
  created_by               uuid,
  updated_at               timestamptz,
  updated_by               uuid,
  rubro_id                 uuid,
  rubro_nombre             text,
  total_count              bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtrados as (
    select p.id, p.razon_social, p.nombre_fantasia, p.cuit, p.condicion_fiscal,
           p.condicion_pago_habitual, p.domicilio, p.localidad, p.provincia,
           p.telefono, p.email, p.observaciones, p.estado, p.created_at,
           p.created_by, p.updated_at, p.updated_by,
           rub.rubro_id, rub.rubro_nombre
      from public.proveedores p
      left join lateral (
        select r.id as rubro_id, r.nombre as rubro_nombre
          from public.proveedor_rubro pr
          join public.rubros_proveedor r on r.id = pr.rubro_id
         where pr.proveedor_id = p.id
         order by r.nombre
         limit 1
      ) rub on true
     where (p_estado = 'todos' or p.estado = p_estado)
       and (
             p_rubro_id is null
             or exists (
                  select 1
                    from public.proveedor_rubro pr2
                   where pr2.proveedor_id = p.id
                     and pr2.rubro_id = p_rubro_id
                )
           )
       and (
             p_search is null
             or btrim(p_search) = ''
             or unaccent(p.razon_social) ilike unaccent('%' || p_search || '%')
             or (
                  regexp_replace(p_search, '\D', '', 'g') <> ''
                  and p.cuit ilike '%' || regexp_replace(p_search, '\D', '', 'g') || '%'
                )
             or exists (
                  select 1
                    from public.proveedor_rubro pr3
                    join public.rubros_proveedor r3 on r3.id = pr3.rubro_id
                   where pr3.proveedor_id = p.id
                     and unaccent(r3.nombre) ilike unaccent('%' || p_search || '%')
                )
           )
  )
  select f.*, count(*) over() as total_count
    from filtrados f
   order by f.razon_social
   limit greatest(coalesce(p_limit, 20), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.buscar_proveedores(text, uuid, text, int, int) from public, anon;
grant execute on function public.buscar_proveedores(text, uuid, text, int, int) to authenticated;

commit;

-- Fin migración 0023
