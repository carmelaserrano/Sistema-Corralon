-- ============================================================================
-- 0068 · Informe de ingresos
--
-- Dos funciones de solo lectura para la pantalla Informes → Ingresos:
--
--   informe_ingresos  → lo COBRADO: plata que efectivamente entró.
--   informe_facturado → lo FACTURADO: facturas, notas de crédito y débito.
--
-- Fuentes de lo cobrado (cada fila dice su `fuente`):
--   mostrador    · detalle_cobro de cobros_venta, SIN el medio "Cuenta
--                  corriente" (eso es deuda del cliente, no plata que entró).
--   cuenta_corriente · detalle_medio_recibo de recibos no anulados (cuando el
--                  cliente paga su deuda).
--   tienda       · pedidos_web con pagado_at (medio "Pago online"). Un pedido
--                  pagado y después cancelado sigue contando: no hay reintegro
--                  modelado.
--   caja_manual  · movimientos_caja tipo ingreso y origen 'manual'. Los de
--                  origen 'venta' y 'cobranza' repiten las dos primeras.
--
-- Las notas de crédito NO se restan de lo cobrado: la devolución real de plata
-- es un egreso de caja. Se muestran en informe_facturado.
--
-- Sucursal = depósito. En lo cobrado es la de la CAJA donde entró la plata
-- (sesión → caja → punto de venta → depósito, 0065). Un cobro de mostrador
-- anterior a las cajas (sin sesión) toma el depósito de su venta; un recibo
-- anterior a 0067 queda sin sucursal. En la tienda es el depósito que despacha.
-- En lo facturado es la del punto de venta de la factura.
--
-- Fechas en hora de Argentina; semanas de lunes a domingo.
-- p_agrupacion: 'semana' | 'mes' (el rango se amplía a períodos completos) o
-- 'total' (un solo período con el rango exacto, para el modo Comparar).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Permiso informes.ver (Administrador lo recibe por el trigger de 0064)
-- ----------------------------------------------------------------------------
insert into public.permisos (nombre)
values ('informes.ver')
on conflict (nombre) do nothing;

insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
join public.permisos p on p.nombre = 'informes.ver'
where r.nombre in ('Administrador', 'Tesorero')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 2. Períodos: inicio y fin del período que contiene una fecha
-- ----------------------------------------------------------------------------
create or replace function public.informe_inicio_periodo(p_fecha date, p_agrupacion text)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_agrupacion
    when 'semana' then date_trunc('week', p_fecha::timestamp)::date
    when 'mes' then date_trunc('month', p_fecha::timestamp)::date
    else p_fecha
  end;
$$;

create or replace function public.informe_fin_periodo(p_inicio date, p_agrupacion text)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_agrupacion
    when 'semana' then (p_inicio + 6)
    when 'mes' then (date_trunc('month', p_inicio::timestamp) + interval '1 month - 1 day')::date
    else p_inicio
  end;
$$;

-- ----------------------------------------------------------------------------
-- 3. informe_ingresos — lo cobrado
-- ----------------------------------------------------------------------------
-- @param p_desde, p_hasta date rango (inclusive), en fechas de Argentina.
-- @param p_agrupacion 'semana' | 'mes' | 'total'.
-- @param p_deposito_ids uuid[] sucursales a incluir; null = todas (incluye
--        "sin sucursal").
-- @param p_medios text[] nombres de medio a incluir (ej. 'Efectivo',
--        'Pago online'); null = todos.
-- @returns una fila por período, sucursal, fuente y medio, con su monto.
create or replace function public.informe_ingresos(
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
    -- Mostrador: lo cobrado en caja, sin la parte financiada en cuenta corriente.
    select (cv.created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
           coalesce(pv.deposito_id, v.deposito_id) as deposito_id,
           'mostrador'::text as fuente,
           mp.nombre as medio,
           dc.monto
      from public.detalle_cobro dc
      join public.cobros_venta cv on cv.id = dc.cobro_id
      join public.ventas v on v.id = cv.venta_id
      join public.medios_pago mp on mp.id = dc.medio_pago_id
      left join public.sesiones_caja sc on sc.id = cv.sesion_caja_id
      left join public.cajas c on c.id = sc.caja_id
      left join public.puntos_venta pv on pv.id = c.punto_venta_id
     where lower(mp.nombre) <> 'cuenta corriente'

    union all

    -- Cobranzas de cuenta corriente.
    select r.fecha,
           pv.deposito_id,
           'cuenta_corriente',
           mp.nombre,
           dmr.monto
      from public.detalle_medio_recibo dmr
      join public.recibos_cobranza_cliente r on r.id = dmr.recibo_id
      join public.medios_pago mp on mp.id = dmr.medio_pago_id
      left join public.sesiones_caja sc on sc.id = r.sesion_caja_id
      left join public.cajas c on c.id = sc.caja_id
      left join public.puntos_venta pv on pv.id = c.punto_venta_id
     where r.estado <> 'anulado'

    union all

    -- Tienda online.
    select (pw.pagado_at at time zone 'America/Argentina/Buenos_Aires')::date,
           pw.deposito_id,
           'tienda',
           'Pago online',
           pw.total
      from public.pedidos_web pw
     where pw.pagado_at is not null

    union all

    -- Ingresos manuales de caja.
    select (mc.created_at at time zone 'America/Argentina/Buenos_Aires')::date,
           pv.deposito_id,
           'caja_manual',
           mp.nombre,
           mc.monto
      from public.movimientos_caja mc
      join public.medios_pago mp on mp.id = mc.medio_pago_id
      join public.sesiones_caja sc on sc.id = mc.sesion_caja_id
      join public.cajas c on c.id = sc.caja_id
      join public.puntos_venta pv on pv.id = c.punto_venta_id
     where mc.tipo = 'ingreso' and mc.origen = 'manual'
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

-- ----------------------------------------------------------------------------
-- 4. informe_facturado — facturas, notas de crédito y débito emitidas
-- ----------------------------------------------------------------------------
-- Mismos parámetros de rango, agrupación y sucursal (sin medio de pago).
-- `tipo`: 'factura' | 'nota_credito' | 'nota_debito'. Comprobantes anulados
-- no cuentan.
create or replace function public.informe_facturado(
  p_desde date,
  p_hasta date,
  p_agrupacion text default 'mes',
  p_deposito_ids uuid[] default null
)
returns table (
  periodo_inicio date,
  periodo_fin date,
  sucursal_id uuid,
  sucursal_nombre text,
  tipo text,
  cantidad bigint,
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

  v_desde := public.informe_inicio_periodo(p_desde, p_agrupacion);
  v_hasta := case when p_agrupacion = 'total' then p_hasta
                  else public.informe_fin_periodo(public.informe_inicio_periodo(p_hasta, p_agrupacion), p_agrupacion) end;

  return query
  with comprobantes as (
    select (cv.fecha_emision at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
           pv.deposito_id,
           cv.tipo_comprobante as tipo,
           cv.total
      from public.comprobantes_venta cv
      join public.puntos_venta pv on pv.id = cv.punto_venta_id
     where cv.estado = 'Emitido'
  )
  select case when p_agrupacion = 'total' then v_desde
              else public.informe_inicio_periodo(c.fecha, p_agrupacion) end,
         case when p_agrupacion = 'total' then v_hasta
              else public.informe_fin_periodo(public.informe_inicio_periodo(c.fecha, p_agrupacion), p_agrupacion) end,
         c.deposito_id,
         coalesce(d.nombre, 'Sin sucursal'),
         c.tipo,
         count(*),
         sum(c.total)::numeric(14,2)
    from comprobantes c
    left join public.depositos d on d.id = c.deposito_id
   where c.fecha between v_desde and v_hasta
     and (p_deposito_ids is null or c.deposito_id = any(p_deposito_ids))
   group by 1, 2, 3, 4, 5
   order by 1, 4, 5;
end;
$$;

revoke all on function public.informe_inicio_periodo(date, text) from public, anon;
revoke all on function public.informe_fin_periodo(date, text) from public, anon;
grant execute on function public.informe_inicio_periodo(date, text) to authenticated;
grant execute on function public.informe_fin_periodo(date, text) to authenticated;
revoke all on function public.informe_ingresos(date, date, text, uuid[], text[]) from public, anon;
grant execute on function public.informe_ingresos(date, date, text, uuid[], text[]) to authenticated;
revoke all on function public.informe_facturado(date, date, text, uuid[]) from public, anon;
grant execute on function public.informe_facturado(date, date, text, uuid[]) to authenticated;

commit;
