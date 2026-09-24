-- S3-13 · Cobro de ventas con múltiples medios de pago.
-- La RPC es el único punto de escritura para preservar atomicidad e
-- invariantes aun cuando dos cajas intenten cobrar la misma venta.

create unique index if not exists uq_cobros_venta_venta
  on public.cobros_venta (venta_id);

create or replace function public.bloquear_modificacion_cobro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Los cobros confirmados son inmutables'
    using errcode = 'CV007';
end;
$$;

drop trigger if exists trg_cobros_venta_inmutables on public.cobros_venta;
create trigger trg_cobros_venta_inmutables
before update or delete on public.cobros_venta
for each row execute function public.bloquear_modificacion_cobro();

drop trigger if exists trg_detalle_cobro_inmutable on public.detalle_cobro;
create trigger trg_detalle_cobro_inmutable
before update or delete on public.detalle_cobro
for each row execute function public.bloquear_modificacion_cobro();

-- La escritura directa permitiría omitir la validación del total, del estado
-- y de los datos sensibles. Las consultas siguen regidas por las policies
-- SELECT creadas en la base de Sprint 3.
drop policy if exists "cobros_venta_write" on public.cobros_venta;
drop policy if exists "detalle_cobro_write" on public.detalle_cobro;

revoke insert, update, delete on public.cobros_venta from anon, authenticated;
revoke insert, update, delete on public.detalle_cobro from anon, authenticated;

create or replace function public.registrar_cobro(
  p_venta uuid,
  p_detalle jsonb
)
returns table (
  venta_id uuid,
  cobro_id uuid,
  numero bigint,
  total numeric,
  fecha timestamptz,
  created_by uuid,
  cobrada boolean,
  estado_venta text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_total_venta numeric(14,2);
  v_estado_venta text;
  v_cliente_cta_cte boolean;
  v_item jsonb;
  v_medio_id uuid;
  v_medio_nombre text;
  v_monto numeric(14,2);
  v_monto_recibido numeric(14,2);
  v_vuelto numeric(14,2);
  v_referencia text;
  v_total_aplicado numeric(14,2) := 0;
  v_cobro_id uuid;
  v_cobro_numero bigint;
  v_cobro_fecha timestamptz;
begin
  if v_usuario is null or not public.usuario_tiene_permiso('ventas.cobrar') then
    raise exception 'No tiene permiso para registrar cobros'
      using errcode = '42501';
  end if;

  if p_venta is null then
    raise exception 'La venta es obligatoria' using errcode = 'CV001';
  end if;

  select v.total, v.estado, c.habilita_cta_cte
    into v_total_venta, v_estado_venta, v_cliente_cta_cte
    from public.ventas v
    join public.clientes c on c.id = v.cliente_id
   where v.id = p_venta
   for update of v, c;

  if not found then
    raise exception 'La venta no existe' using errcode = 'CV002';
  end if;

  if v_estado_venta <> 'Pendiente' then
    raise exception 'La venta no se encuentra Pendiente'
      using errcode = 'CV003';
  end if;

  if exists (select 1 from public.cobros_venta cv where cv.venta_id = p_venta) then
    raise exception 'La venta ya tiene un cobro registrado'
      using errcode = 'CV003';
  end if;

  if p_detalle is null
     or jsonb_typeof(p_detalle) <> 'array'
     or jsonb_array_length(p_detalle) = 0 then
    raise exception 'Debe indicar al menos un medio de pago'
      using errcode = 'CV001';
  end if;

  -- Se valida el lote completo antes de insertar cualquier fila.
  for v_item in select value from jsonb_array_elements(p_detalle)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada medio de pago debe ser un objeto válido'
        using errcode = 'CV001';
    end if;

    begin
      v_medio_id := nullif(btrim(v_item ->> 'medio_pago_id'), '')::uuid;
      v_monto := nullif(btrim(v_item ->> 'monto'), '')::numeric(14,2);
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'El medio de pago o el monto no es válido'
          using errcode = 'CV001';
    end;

    if v_medio_id is null or v_monto is null or v_monto <= 0 then
      raise exception 'Todos los importes deben ser mayores a 0'
        using errcode = 'CV001';
    end if;

    select mp.nombre
      into v_medio_nombre
      from public.medios_pago mp
     where mp.id = v_medio_id
       and mp.activo = true
     for share;

    if not found then
      raise exception 'El medio de pago no existe o está inactivo'
        using errcode = 'CV002';
    end if;

    v_referencia := nullif(btrim(v_item ->> 'referencia'), '');
    if v_referencia is not null and char_length(v_referencia) > 100 then
      raise exception 'La referencia no puede superar los 100 caracteres'
        using errcode = 'CV005';
    end if;

    if lower(v_medio_nombre) = 'efectivo' then
      begin
        v_monto_recibido := nullif(btrim(v_item ->> 'monto_recibido'), '')::numeric(14,2);
      exception
        when invalid_text_representation or numeric_value_out_of_range then
          raise exception 'El monto recibido no es válido'
            using errcode = 'CV001';
      end;

      if v_monto_recibido is null or v_monto_recibido < v_monto then
        raise exception 'El monto recibido en efectivo debe cubrir el importe aplicado'
          using errcode = 'CV001';
      end if;
    else
      v_monto_recibido := null;
    end if;

    if lower(v_medio_nombre) like 'tarjeta%' then
      if v_referencia is null or v_referencia !~ '^[0-9]{4}$' then
        raise exception 'Para tarjeta indique únicamente los últimos 4 dígitos'
          using errcode = 'CV005';
      end if;
    elsif lower(v_medio_nombre) like 'transferencia%' and v_referencia is null then
      raise exception 'La referencia de la transferencia es obligatoria'
        using errcode = 'CV005';
    end if;

    if lower(v_medio_nombre) = 'cuenta corriente' and not v_cliente_cta_cte then
      raise exception 'El cliente no está habilitado para cuenta corriente'
        using errcode = 'CV006';
    end if;

    v_total_aplicado := v_total_aplicado + v_monto;
  end loop;

  if v_total_aplicado <> v_total_venta then
    raise exception 'El total aplicado (%) no coincide con el total de la venta (%). Diferencia: %',
      to_char(v_total_aplicado, 'FM999999999990.00'),
      to_char(v_total_venta, 'FM999999999990.00'),
      to_char(abs(v_total_venta - v_total_aplicado), 'FM999999999990.00')
      using errcode = 'CV004';
  end if;

  insert into public.cobros_venta (venta_id, total, created_by)
  values (p_venta, v_total_venta, v_usuario)
  returning cobros_venta.id, cobros_venta.numero, cobros_venta.created_at
    into v_cobro_id, v_cobro_numero, v_cobro_fecha;

  for v_item in select value from jsonb_array_elements(p_detalle)
  loop
    v_medio_id := (v_item ->> 'medio_pago_id')::uuid;
    v_monto := (v_item ->> 'monto')::numeric(14,2);

    select mp.nombre into v_medio_nombre
      from public.medios_pago mp
     where mp.id = v_medio_id;

    v_referencia := nullif(btrim(v_item ->> 'referencia'), '');
    if lower(v_medio_nombre) = 'efectivo' then
      v_monto_recibido := (v_item ->> 'monto_recibido')::numeric(14,2);
      v_vuelto := v_monto_recibido - v_monto;
      v_referencia := null;
    else
      v_monto_recibido := null;
      v_vuelto := 0;
    end if;

    insert into public.detalle_cobro (
      cobro_id, medio_pago_id, monto, monto_recibido, vuelto, referencia
    ) values (
      v_cobro_id, v_medio_id, v_monto, v_monto_recibido, v_vuelto, v_referencia
    );
  end loop;

  return query
  select p_venta, v_cobro_id, v_cobro_numero, v_total_venta,
         v_cobro_fecha, v_usuario, true, v_estado_venta;
exception
  when unique_violation then
    raise exception 'La venta ya tiene un cobro registrado'
      using errcode = 'CV003';
end;
$$;

revoke all on function public.bloquear_modificacion_cobro() from public, anon, authenticated;
revoke all on function public.registrar_cobro(uuid, jsonb) from public, anon;
grant execute on function public.registrar_cobro(uuid, jsonb) to authenticated;
