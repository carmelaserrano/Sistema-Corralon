-- ============================================================================
-- 0069 · Informe de egresos
--
-- Función de solo lectura para la pantalla Informes → Egresos, contraparte de
-- informe_ingresos (0068): lo PAGADO, la plata que efectivamente salió.
--
-- Fuentes (cada fila dice su `fuente`):
--   proveedores · pagos_proveedor (órdenes de pago) no anuladas. `importe_total`
--                 ya viene neto de notas de crédito y débito del proveedor.
--   caja        · movimientos_caja tipo egreso. Todos son origen 'manual'
--                 (0062/0067) e inmutables, así que no tienen anulados.
--
-- Reglas:
--   · Montos en positivo y sin anulados.
--   · Los traslados de dinero (efectivo al banco, entre cajas) NO se distinguen:
--     movimientos_caja solo tiene ingreso/egreso y un motivo de texto libre.
--     Hoy se cargan como egresos de caja y por eso están incluidos.
--   · Las notas de crédito a clientes no son un egreso: no mueven plata. La
--     devolución real de dinero a un cliente se carga como egreso de caja y
--     entra por la fuente 'caja'.
--   · Una orden de pago ya se cuenta sola. Si se paga en efectivo desde la caja
--     y además se registra un egreso de caja, se cuenta dos veces: no hay
--     vínculo entre ambos registros.
--
-- Sucursal = depósito. En 'caja' es la de la CAJA donde salió la plata (sesión →
-- caja → punto de venta → depósito, 0065). Los pagos a proveedores no tienen
-- sucursal: quedan en "Sin sucursal" y, igual que en ingresos, al filtrar por
-- sucursal (p_deposito_ids no nulo) quedan afuera porque NULL = ANY(...) es falso.
--
-- Fechas en hora de Argentina; semanas de lunes a domingo. Mismos períodos y
-- misma agrupación que informe_ingresos (informe_inicio_periodo y
-- informe_fin_periodo, 0068).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- informe_egresos — lo pagado
-- ----------------------------------------------------------------------------
-- @param p_desde, p_hasta date rango (inclusive), en fechas de Argentina.
-- @param p_agrupacion 'semana' | 'mes' | 'total'.
-- @param p_deposito_ids uuid[] sucursales a incluir; null = todas (incluye
--        "sin sucursal").
-- @param p_medios text[] nombres de medio a incluir (ej. 'Efectivo'); null = todos.
-- @returns una fila por período, sucursal, fuente y medio, con su monto.
create or replace function public.informe_egresos(
  p_desde date,
  p_hasta date,
  p_agrupacion text default 'mes',
  p_deposito_ids uuid[] default null,
  p_medios text[] default null
)
returns table (
  periodo_inicio date,
  periodo_fin date,
  sucursal_id uuid,
  sucursal_nombre text,
  fuente text,
  medio_pago text,
  monto numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_desde date;
  v_hasta date;
begin
  if not public.usuario_tiene_permiso('informes.ver') then
    raise exception 'No tenés permiso para ver informes' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;
  if p_agrupacion not in ('semana', 'mes', 'total') then
    raise exception 'La agrupación debe ser semana, mes o total' using errcode = '22023';
  end if;

  -- Semanas y meses completos: ninguna barra queda con medio período.
  v_desde := public.informe_inicio_periodo(p_desde, p_agrupacion);
  v_hasta := case when p_agrupacion = 'total' then p_hasta
                  else public.informe_fin_periodo(public.informe_inicio_periodo(p_hasta, p_agrupacion), p_agrupacion) end;

  return query
  with movimientos as (
    -- Órdenes de pago a proveedores (sin sucursal).
    select pp.fecha,
           null::uuid as deposito_id,
           'proveedores'::text as fuente,
           mp.nombre as medio,
           pp.importe_total as monto
      from public.pagos_proveedor pp
      join public.medios_pago mp on mp.id = pp.medio_pago_id
     where pp.estado <> 'anulado'

    union all

    -- Egresos de caja.
    select (mc.created_at at time zone 'America/Argentina/Buenos_Aires')::date,
           pv.deposito_id,
           'caja',
           mp.nombre,
           mc.monto
      from public.movimientos_caja mc
      join public.medios_pago mp on mp.id = mc.medio_pago_id
      join public.sesiones_caja sc on sc.id = mc.sesion_caja_id
      join public.cajas c on c.id = sc.caja_id
      join public.puntos_venta pv on pv.id = c.punto_venta_id
     where mc.tipo = 'egreso'
  )
  select case when p_agrupacion = 'total' then v_desde
              else public.informe_inicio_periodo(m.fecha, p_agrupacion) end as periodo_inicio,
         case when p_agrupacion = 'total' then v_hasta
              else public.informe_fin_periodo(public.informe_inicio_periodo(m.fecha, p_agrupacion), p_agrupacion) end as periodo_fin,
         m.deposito_id as sucursal_id,
         coalesce(d.nombre, 'Sin sucursal') as sucursal_nombre,
         m.fuente,
         m.medio as medio_pago,
         sum(m.monto)::numeric(14,2) as monto
    from movimientos m
    left join public.depositos d on d.id = m.deposito_id
   where m.fecha between v_desde and v_hasta
     and (p_deposito_ids is null or m.deposito_id = any(p_deposito_ids))
     and (p_medios is null or m.medio = any(p_medios))
   group by 1, 2, 3, 4, 5, 6
   order by 1, 4, 5, 6;
end;
$$;

revoke all on function public.informe_egresos(date, date, text, uuid[], text[]) from public, anon;
grant execute on function public.informe_egresos(date, date, text, uuid[], text[]) to authenticated;

commit;
