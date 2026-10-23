-- Exige que el efectivo contado coincida con el saldo teórico para cerrar.
-- No modifica el esquema: las sesiones con diferencias permanecen abiertas.

begin;

create or replace function public.cerrar_caja(
  p_sesion_caja_id uuid,
  p_monto_declarado numeric
)
returns public.sesiones_caja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_sesion public.sesiones_caja%rowtype;
  v_saldo_teorico numeric(14,2);
  v_monto_declarado numeric(14,2);
begin
  if v_usuario is null or not public.usuario_tiene_permiso('cajas.cerrar') then
    raise exception 'No tiene permiso para cerrar cajas' using errcode = '42501';
  end if;
  if p_sesion_caja_id is null or p_monto_declarado is null or p_monto_declarado < 0 then
    raise exception 'La sesión y un monto declarado no negativo son obligatorios'
      using errcode = 'CX001';
  end if;

  select * into v_sesion
  from public.sesiones_caja
  where id = p_sesion_caja_id
    and usuario_id = v_usuario
    and estado = 'abierta'
  for update;

  if not found then
    raise exception 'La sesión no existe, no está abierta o no pertenece al cajero'
      using errcode = 'CX002';
  end if;

  select (
    v_sesion.saldo_inicial
    + coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end), 0)
  )::numeric(14,2)
  into v_saldo_teorico
  from public.movimientos_caja mc
  join public.medios_pago mp on mp.id = mc.medio_pago_id
  where mc.sesion_caja_id = v_sesion.id
    and lower(mp.nombre) = 'efectivo';

  v_monto_declarado := p_monto_declarado::numeric(14,2);
  if v_monto_declarado is distinct from v_saldo_teorico then
    raise exception
      'El efectivo contado (%) no coincide con el efectivo esperado (%). La sesión sigue abierta.',
      v_monto_declarado, v_saldo_teorico
      using errcode = 'CX004';
  end if;

  update public.sesiones_caja
  set estado = 'cerrada',
      cerrada_at = now(),
      cerrada_by = v_usuario,
      monto_declarado = v_monto_declarado,
      saldo_teorico = v_saldo_teorico,
      diferencia = 0
  where id = v_sesion.id
  returning * into v_sesion;

  return v_sesion;
end;
$$;

revoke all on function public.cerrar_caja(uuid, numeric) from public, anon;
grant execute on function public.cerrar_caja(uuid, numeric) to authenticated;

commit;
