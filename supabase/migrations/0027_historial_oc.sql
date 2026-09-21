-- S2-14: consulta de solo lectura. SECURITY INVOKER conserva las políticas RLS.
begin;
create or replace function public.consultar_historial_oc(
  p_estado text default null, p_proveedor uuid default null,
  p_desde date default null, p_hasta date default null,
  p_orden text default 'created_at', p_ascendente boolean default false,
  p_pagina integer default 1
) returns jsonb language plpgsql stable security invoker
set search_path = public as $$
declare v_resultado jsonb;
begin
  if p_pagina is null or p_pagina < 1 or p_orden is null or p_orden not in ('created_at', 'total')
    or (p_estado is not null and p_estado not in ('pendiente','parcialmente_recibida','recibida','cancelada'))
    or (p_desde is not null and p_hasta is not null and p_desde > p_hasta) then
    raise exception 'Filtros de historial inválidos' using errcode = '22023';
  end if;
  with filtradas as materialized (
    select o.* from public.ordenes_compra o
    where (p_estado is null or o.estado = p_estado)
      and (p_proveedor is null or o.proveedor_id = p_proveedor)
      and (p_desde is null or o.created_at >= (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires'))
      and (p_hasta is null or o.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'))
  ), pagina as (
    select f.*, row_number() over (order by
      case when p_orden = 'created_at' and p_ascendente then f.created_at end asc,
      case when p_orden = 'created_at' and not p_ascendente then f.created_at end desc,
      case when p_orden = 'total' and p_ascendente then f.total end asc,
      case when p_orden = 'total' and not p_ascendente then f.total end desc, f.id) as posicion
    from filtradas f
    order by posicion limit 20 offset ((p_pagina::bigint - 1) * 20)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtradas),
    'importeTotal', (select coalesce(sum(total) filter (where estado <> 'cancelada'),0) from filtradas),
    'totalPaginas', greatest(1, (select ceil(count(*) / 20.0)::integer from filtradas)),
    'ordenes', coalesce((select jsonb_agg(
      (to_jsonb(p) - 'posicion') || jsonb_build_object(
        'proveedor', (select jsonb_build_object('razon_social', razon_social) from public.proveedores where id = p.proveedor_id),
        'deposito_destino', (select jsonb_build_object('nombre', nombre) from public.depositos where id = p.deposito_destino_id),
        'cantidad_recepciones', (select count(*) from public.recepciones where orden_compra_id = p.id)
      ) order by p.posicion) from pagina p), '[]'::jsonb)
  ) into v_resultado;
  return v_resultado;
end;
$$;
revoke all on function public.consultar_historial_oc(text,uuid,date,date,text,boolean,integer) from public;
grant execute on function public.consultar_historial_oc(text,uuid,date,date,text,boolean,integer) to authenticated;
commit;
