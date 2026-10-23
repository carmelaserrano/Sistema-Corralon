-- ============================================================================
-- 0074 · Motivo del movimiento de caja con el número de la venta
--
-- Desde 0062 el ingreso de caja que genera cada cobro dice
-- "Cobro de venta N.º <n>", pero <n> era el número del COBRO (cobros_venta),
-- no el de la venta: la venta #49 aparecía como "Cobro de venta N.º 37".
-- 0072 repitió el error en la rama Ecommerce ("Cobro Ecommerce · Venta N.º").
--
-- Se redefine el trigger con el número de la venta. Misma firma, mismas
-- columnas y mismo comportamiento que 0072; solo cambia el texto del motivo.
--
-- Los movimientos ya registrados NO se corrigen: movimientos_caja es inmutable
-- por diseño (trg_movimientos_caja_inmutables, 0062) y el arqueo de las
-- sesiones cerradas se apoya en ellos. El vínculo correcto ya está en
-- movimientos_caja.venta_id.
-- ============================================================================

begin;

create or replace function public.registrar_movimiento_por_detalle_cobro()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cobro record;
begin
  select cv.id, cv.sesion_caja_id, cv.caja_id, cv.venta_id,
         cv.created_by, cv.created_at, v.origen, v.numero as venta_numero
    into v_cobro
    from public.cobros_venta cv join public.ventas v on v.id = cv.venta_id
   where cv.id = new.cobro_id;
  if not found then raise exception 'No se encontró el cobro asociado al detalle'; end if;

  if v_cobro.origen = 'ecommerce' then
    insert into public.movimientos_caja (
      sesion_caja_id, caja_id, tipo, origen, medio_pago_id, monto,
      motivo, comprobante, venta_id, created_by, created_at
    ) values (
      null, v_cobro.caja_id, 'ingreso', 'ecommerce', new.medio_pago_id, new.monto,
      'Cobro Ecommerce · Venta N.º ' || v_cobro.venta_numero, new.referencia,
      v_cobro.venta_id, null, v_cobro.created_at
    );
  else
    insert into public.movimientos_caja (
      sesion_caja_id, caja_id, tipo, origen, medio_pago_id, monto,
      motivo, comprobante, venta_id, created_by, created_at
    ) values (
      v_cobro.sesion_caja_id, v_cobro.caja_id, 'ingreso', 'venta',
      new.medio_pago_id, new.monto, 'Cobro de venta N.º ' || v_cobro.venta_numero,
      new.referencia, v_cobro.venta_id, coalesce(auth.uid(), v_cobro.created_by),
      v_cobro.created_at
    );
  end if;
  return new;
end;
$$;

revoke all on function public.registrar_movimiento_por_detalle_cobro() from public, anon, authenticated;

commit;
