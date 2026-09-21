-- Migración 0022: búsqueda de proveedores.
--
-- Historia: buscar proveedores (Como Encargado de Compras necesito buscar
-- proveedores para seleccionar rápidamente el adecuado para una compra).
--
-- La búsqueda cruza Razón Social, CUIT y Rubro, sin distinguir mayúsculas ni
-- acentos, y se combina con filtros de rubro y de estado (estos últimos ya
-- los resuelve getProveedores() con REST plano desde la 0020/página actual).
-- Lo que REST no puede resolver es "sin acentos" (exige unaccent()) ni
-- buscar por el nombre del Rubro, que vive en una tabla relacionada
-- (proveedor_rubro / rubros_proveedor), no en proveedores. Se resuelve con
-- una función que hace el join y el filtrado del lado del servidor en una
-- sola consulta, en vez de traer todo al cliente a filtrar (no escala) o
-- encadenar varias consultas.
--
-- No se toca ninguna migración previa (regla del repo: una migración ya
-- mergeada no se toca, se corrige con una nueva).

begin;

create extension if not exists "unaccent";

create or replace function public.buscar_proveedores(
  p_search text default null,
  p_rubro_id uuid default null,
  p_estado text default 'activo'
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
  rubro_nombre             text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.id, p.razon_social, p.nombre_fantasia, p.cuit, p.condicion_fiscal,
         p.condicion_pago_habitual, p.domicilio, p.localidad, p.provincia,
         p.telefono, p.email, p.observaciones, p.estado, p.created_at,
         p.created_by, p.updated_at, p.updated_by,
         r.id as rubro_id, r.nombre as rubro_nombre
    from public.proveedores p
    left join public.proveedor_rubro pr on pr.proveedor_id = p.id
    left join public.rubros_proveedor r on r.id = pr.rubro_id
   where (p_estado = 'todos' or p.estado = p_estado)
     and (p_rubro_id is null or pr.rubro_id = p_rubro_id)
     and (
           p_search is null
           or btrim(p_search) = ''
           or unaccent(p.razon_social) ilike unaccent('%' || p_search || '%')
           or (
                regexp_replace(p_search, '\D', '', 'g') <> ''
                and p.cuit ilike '%' || regexp_replace(p_search, '\D', '', 'g') || '%'
              )
           or unaccent(coalesce(r.nombre, '')) ilike unaccent('%' || p_search || '%')
         )
   order by p.razon_social;
$$;

revoke all on function public.buscar_proveedores(text, uuid, text) from public, anon;
grant execute on function public.buscar_proveedores(text, uuid, text) to authenticated;

commit;

-- Fin migración 0022
