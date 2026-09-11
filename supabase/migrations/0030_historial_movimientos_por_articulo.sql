-- CORR-04: historial de movimientos por articulo y deposito.
--
-- La consulta parte del stock actual del deposito y descuenta los impactos
-- posteriores a cada movimiento para reconstruir el stock resultante de cada
-- renglon historico. Se filtran solo movimientos confirmados porque son los
-- unicos que afectan stock_x_deposito.

begin;

create or replace function public.consultar_historial_articulo_deposito(
  p_producto_id uuid,
  p_deposito_id uuid
)
returns table (
  movimiento_id uuid,
  detalle_id uuid,
  fecha timestamptz,
  tipo text,
  tipo_codigo text,
  deposito_id uuid,
  deposito_nombre text,
  cantidad numeric,
  impacto numeric,
  stock_resultante numeric,
  comprobante text,
  observaciones text,
  estado_movimiento text,
  creado_por uuid,
  creado_en timestamptz,
  modificado_por uuid,
  modificado_en timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with movimientos_articulo as (
    select
      m.id as movimiento_id,
      d.id as detalle_id,
      m.fecha,
      m.created_at,
      m.tipo_movimiento_id,
      m.deposito_origen_id,
      m.deposito_destino_id,
      d.cantidad,
      case
        when m.deposito_destino_id = p_deposito_id then d.cantidad
        when m.deposito_origen_id = p_deposito_id then -d.cantidad
        else 0
      end as impacto,
      m.comprobante,
      m.observaciones,
      m.estado_movimiento,
      m.created_by,
      m.created_at as movimiento_created_at,
      m.updated_by,
      m.updated_at
    from public.movimientos_stock m
    join public.detalle_movimiento d on d.movimiento_id = m.id
    where d.producto_id = p_producto_id
      and m.estado_movimiento = 'confirmado'
      and (
        m.deposito_origen_id = p_deposito_id
        or m.deposito_destino_id = p_deposito_id
      )
  ),
  stock_actual as (
    select coalesce((
      select s.cantidad
      from public.stock_x_deposito s
      where s.producto_id = p_producto_id
        and s.deposito_id = p_deposito_id
    ), 0) as cantidad
  )
  select
    ma.movimiento_id,
    ma.detalle_id,
    ma.fecha,
    case
      when ma.impacto >= 0 then 'Ingreso'
      else 'Egreso'
    end as tipo,
    case
      when ma.impacto >= 0 then 'ingreso'
      else 'egreso'
    end as tipo_codigo,
    dep.id as deposito_id,
    dep.nombre as deposito_nombre,
    abs(ma.cantidad) as cantidad,
    ma.impacto,
    (
      sa.cantidad
      - coalesce((
        select sum(mp.impacto)
        from movimientos_articulo mp
        where (mp.fecha, mp.created_at, mp.movimiento_id::text, mp.detalle_id::text)
          > (ma.fecha, ma.created_at, ma.movimiento_id::text, ma.detalle_id::text)
      ), 0)
    ) as stock_resultante,
    ma.comprobante,
    ma.observaciones,
    ma.estado_movimiento,
    ma.created_by as creado_por,
    ma.movimiento_created_at as creado_en,
    ma.updated_by as modificado_por,
    ma.updated_at as modificado_en
  from movimientos_articulo ma
  cross join stock_actual sa
  join public.depositos dep on dep.id = p_deposito_id
  order by ma.fecha desc, ma.created_at desc, ma.movimiento_id desc, ma.detalle_id desc;
$$;

alter function public.consultar_historial_articulo_deposito(uuid, uuid)
  owner to postgres;
revoke all on function public.consultar_historial_articulo_deposito(uuid, uuid)
  from public;
grant execute on function public.consultar_historial_articulo_deposito(uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
