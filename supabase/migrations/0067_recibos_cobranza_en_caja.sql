-- ============================================================================
-- 0067 · Recibos de cobranza de cuenta corriente ligados a la caja
--
-- Hasta ahora un recibo de cobranza (0061) no pasaba por ninguna caja: el
-- efectivo que el cliente entregaba no aparecía en la sesión del cajero, el
-- arqueo daba sobrante al cerrar, y el recibo no tenía sucursal (el informe de
-- ingresos no podía repartirlo).
--
-- Se hace igual que con los cobros de mostrador (0062):
--   1. El recibo guarda la sesión de caja abierta de quien lo registra; de ahí
--      salen la caja, el punto de venta y la sucursal (0065).
--   2. Sin caja abierta no se puede registrar un recibo, sea cual sea el medio
--      (misma regla que registrar_cobro).
--   3. Cada medio del recibo queda como movimiento de ingreso de la caja, con
--      origen 'cobranza', y entra al arqueo como cualquier cobro.
--
-- Los recibos anteriores quedan sin sesión de caja (sin sucursal).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Recibo → sesión de caja
-- ----------------------------------------------------------------------------
alter table public.recibos_cobranza_cliente
  add column if not exists sesion_caja_id uuid
  references public.sesiones_caja(id) on delete restrict;

create index if not exists idx_recibos_cobranza_sesion_caja
  on public.recibos_cobranza_cliente (sesion_caja_id);

-- ----------------------------------------------------------------------------
-- 2. Movimientos de caja con origen 'cobranza'
-- ----------------------------------------------------------------------------
alter table public.movimientos_caja
  add column if not exists recibo_id uuid
  references public.recibos_cobranza_cliente(id) on delete restrict;

alter table public.movimientos_caja
  drop constraint if exists chk_movimiento_caja_origen;
alter table public.movimientos_caja
  add constraint chk_movimiento_caja_origen
  check (origen in ('venta', 'manual', 'cobranza'));

-- Cada origen lleva su referencia y solo esa: venta → venta_id, cobranza →
-- recibo_id, manual → comprobante. Las filas existentes cumplen (recibo_id null).
alter table public.movimientos_caja
  drop constraint if exists chk_movimiento_caja_origen_venta;
alter table public.movimientos_caja
  add constraint chk_movimiento_caja_origen_venta check (
    (origen = 'venta' and venta_id is not null and recibo_id is null and tipo = 'ingreso')
    or (origen = 'manual' and venta_id is null and recibo_id is null and comprobante is not null)
    or (origen = 'cobranza' and recibo_id is not null and venta_id is null and tipo = 'ingreso')
  );

create index if not exists idx_movimientos_caja_recibo
  on public.movimientos_caja (recibo_id)
  where recibo_id is not null;

-- ----------------------------------------------------------------------------
-- 3. registrar_recibo_cobranza: exige caja abierta y registra los movimientos
-- ----------------------------------------------------------------------------
-- Misma firma y mismas validaciones que la versión de 0061. Cambia:
--   · busca la sesión abierta del usuario (con bloqueo, como los cobros) y
--     rechaza el recibo si no hay (CV008, el mismo código que registrar_cobro);
--   · exige cajas.operar, igual que asociar_sesion_caja_a_cobro;
--   · rechaza el medio 'Cuenta corriente' (una deuda no se paga con más deuda);
--   · guarda sesion_caja_id en el recibo y un movimiento de caja por medio.
create or replace function public.registrar_recibo_cobranza(
  p_cliente_id uuid,
  p_fecha date,
  p_medios jsonb,
  p_imputaciones jsonb default '[]'::jsonb,
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
  v_cliente record;
  v_sesion_id uuid;
  v_total_medios numeric(14,2) := 0;
  v_total_imputado numeric(14,2) := 0;
  v_recibo record;
  v_item jsonb;
  v_medio_id uuid;
  v_medio_nombre text;
  v_monto numeric(14,2);
  v_ref text;
  v_venta_id uuid;
  v_monto_imp numeric(14,2);
  v_saldo_venta numeric(14,2);
begin
  -- Mismo permiso que el cobro en mostrador (registrar_cobro).
  if v_usuario is null or not public.usuario_tiene_permiso('ventas.cobrar') then
    raise exception 'No tiene permiso para registrar cobros en cuenta corriente' using errcode = '42501';
  end if;

  if not public.usuario_tiene_permiso('cajas.operar') then
    raise exception 'No tiene permiso para operar una caja' using errcode = '42501';
  end if;

  select id, nombre, apellido, razon_social, estado
    into v_cliente
    from public.clientes
   where id = p_cliente_id
   for update;

  if not found then
    raise exception 'Cliente no encontrado' using errcode = '22023';
  end if;

  if v_cliente.estado <> 'Activo' then
    raise exception 'El cliente no se encuentra activo' using errcode = '22023';
  end if;

  -- La cobranza entra a la caja abierta de quien la registra. Se bloquea
  -- después del cliente, en el mismo orden que registrar_cobro (venta/cliente
  -- y luego la sesión en su trigger), para no cruzar bloqueos.
  select sc.id into v_sesion_id
    from public.sesiones_caja sc
   where sc.usuario_id = v_usuario and sc.estado = 'abierta'
   for update;

  if v_sesion_id is null then
    raise exception 'Debe abrir una caja antes de registrar una cobranza' using errcode = 'CV008';
  end if;

  if p_medios is null or jsonb_typeof(p_medios) <> 'array' or jsonb_array_length(p_medios) = 0 then
    raise exception 'Debe especificar al menos un medio de cobro' using errcode = '22023';
  end if;

  -- 1) Calcular y validar medios de pago
  for v_item in select value from jsonb_array_elements(p_medios)
  loop
    v_medio_id := nullif(btrim(v_item ->> 'medio_pago_id'), '')::uuid;
    v_monto := nullif(btrim(v_item ->> 'monto'), '')::numeric(14,2);

    if v_medio_id is null or v_monto is null or v_monto <= 0 then
      raise exception 'Cada medio de cobro debe tener un medio válido y un importe mayor a cero' using errcode = '22023';
    end if;

    select mp.nombre into v_medio_nombre
      from public.medios_pago mp
     where mp.id = v_medio_id and mp.activo = true;

    if not found then
      raise exception 'Medio de pago inexistente o inactivo' using errcode = '22023';
    end if;

    if lower(v_medio_nombre) = 'cuenta corriente' then
      raise exception 'Una cobranza de cuenta corriente no se puede pagar con cuenta corriente' using errcode = '22023';
    end if;

    v_total_medios := v_total_medios + v_monto;
  end loop;

  -- 2) Validar imputaciones si fueron provistas
  -- Una venta por imputación: cada línea se compara contra el saldo pendiente,
  -- así que dos líneas a la misma venta podrían imputar más de lo adeudado.
  if p_imputaciones is not null and jsonb_typeof(p_imputaciones) = 'array' and exists (
    select 1
      from jsonb_array_elements(p_imputaciones) as elem
     where nullif(btrim(elem ->> 'venta_id'), '') is not null
     group by elem ->> 'venta_id'
    having count(*) > 1
  ) then
    raise exception 'Hay ventas repetidas en las imputaciones: unificá el monto en una sola línea' using errcode = '22023';
  end if;

  if p_imputaciones is not null and jsonb_typeof(p_imputaciones) = 'array' then
    for v_item in select value from jsonb_array_elements(p_imputaciones)
    loop
      v_venta_id := nullif(btrim(v_item ->> 'venta_id'), '')::uuid;
      v_monto_imp := nullif(btrim(v_item ->> 'monto_imputado'), '')::numeric(14,2);

      if v_venta_id is null or v_monto_imp is null or v_monto_imp <= 0 then
        raise exception 'Cada imputación debe tener una venta válida y un monto mayor a cero' using errcode = '22023';
      end if;

      -- Verificar que la venta corresponda a este cliente y sea de cta cte
      select (dc.monto - coalesce((select sum(irv.monto_imputado) from public.imputacion_recibo_venta irv where irv.venta_id = v.id), 0))
        into v_saldo_venta
        from public.ventas v
        join public.cobros_venta cv on cv.venta_id = v.id
        join public.detalle_cobro dc on dc.cobro_id = cv.id
        join public.medios_pago mp on mp.id = dc.medio_pago_id and lower(mp.nombre) = 'cuenta corriente'
       where v.id = v_venta_id and v.cliente_id = p_cliente_id;

      if not found then
        raise exception 'La venta % no es una deuda válida en cuenta corriente del cliente', v_venta_id using errcode = '22023';
      end if;

      if v_monto_imp > v_saldo_venta then
        raise exception 'El monto imputado (%) supera el saldo pendiente de la venta (%)', v_monto_imp, v_saldo_venta using errcode = '22023';
      end if;

      v_total_imputado := v_total_imputado + v_monto_imp;
    end loop;

    if v_total_imputado > v_total_medios then
      raise exception 'El total imputado (%) no puede ser mayor al total cobrado (%)', v_total_imputado, v_total_medios using errcode = '22023';
    end if;
  end if;

  -- 3) Insertar Cabecera de Recibo, ligada a la sesión de caja
  insert into public.recibos_cobranza_cliente (
    cliente_id, fecha, total, observaciones, created_by, sesion_caja_id
  ) values (
    p_cliente_id, coalesce(p_fecha, current_date), v_total_medios, nullif(trim(p_observaciones), ''), v_usuario, v_sesion_id
  ) returning * into v_recibo;

  -- 4) Insertar Detalle de Medios y su movimiento de caja
  for v_item in select value from jsonb_array_elements(p_medios)
  loop
    v_medio_id := (v_item ->> 'medio_pago_id')::uuid;
    v_monto := (v_item ->> 'monto')::numeric(14,2);
    v_ref := nullif(trim(v_item ->> 'referencia'), '');

    insert into public.detalle_medio_recibo (
      recibo_id, medio_pago_id, monto, referencia
    ) values (
      v_recibo.id, v_medio_id, v_monto, v_ref
    );

    insert into public.movimientos_caja (
      sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo,
      comprobante, recibo_id, created_by
    ) values (
      v_sesion_id, 'ingreso', 'cobranza', v_medio_id, v_monto,
      'Cobranza cta. cte. · Recibo N.º ' || v_recibo.numero,
      v_ref, v_recibo.id, v_usuario
    );
  end loop;

  -- 5) Insertar Imputaciones
  if p_imputaciones is not null and jsonb_typeof(p_imputaciones) = 'array' then
    for v_item in select value from jsonb_array_elements(p_imputaciones)
    loop
      v_venta_id := (v_item ->> 'venta_id')::uuid;
      v_monto_imp := (v_item ->> 'monto_imputado')::numeric(14,2);

      insert into public.imputacion_recibo_venta (
        recibo_id, venta_id, monto_imputado
      ) values (
        v_recibo.id, v_venta_id, v_monto_imp
      );
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_recibo.id,
    'numero', v_recibo.numero,
    'total', v_recibo.total,
    'fecha', v_recibo.fecha,
    'cliente_id', v_recibo.cliente_id,
    'sesion_caja_id', v_sesion_id,
    'total_imputado', v_total_imputado,
    'saldo_a_cuenta', (v_total_medios - v_total_imputado)
  );
end;
$$;

-- create or replace conserva los permisos de 0061; se reafirman por claridad.
revoke all on function public.registrar_recibo_cobranza(uuid, date, jsonb, jsonb, text) from public, anon;
grant execute on function public.registrar_recibo_cobranza(uuid, date, jsonb, jsonb, text) to authenticated;

commit;
