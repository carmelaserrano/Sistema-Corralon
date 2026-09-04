-- CORR-02: movimientos multiarticulo confirmados en una unica transaccion.

begin;

alter table public.movimientos_stock
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.confirmar_movimiento(p_movimiento_id uuid)
returns setof public.movimientos_stock
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov public.movimientos_stock%rowtype;
  v_det record;
  v_lock record;
  v_disponible numeric;
  v_stock_minimo numeric;
  v_disponible_nuevo numeric;
begin
  select * into v_mov
  from public.movimientos_stock
  where id = p_movimiento_id
  for update nowait;

  if not found then
    raise exception 'El movimiento no existe' using errcode = 'MV002';
  end if;
  if v_mov.estado_movimiento <> 'pendiente' then
    raise exception 'El movimiento ya esta %', v_mov.estado_movimiento
      using errcode = 'MV003';
  end if;
  if not exists (
    select 1 from public.detalle_movimiento where movimiento_id = v_mov.id
  ) then
    raise exception 'El movimiento no tiene detalle cargado' using errcode = 'MV005';
  end if;

  -- El orden determinista evita deadlocks entre carritos concurrentes.
  for v_lock in
    select d.producto_id, deposito_id
    from public.detalle_movimiento d
    cross join lateral unnest(
      array[v_mov.deposito_origen_id, v_mov.deposito_destino_id]
    ) deposito_id
    where d.movimiento_id = v_mov.id and deposito_id is not null
    order by d.producto_id, deposito_id
  loop
    if not pg_try_advisory_xact_lock(
      hashtext(v_lock.producto_id::text), hashtext(v_lock.deposito_id::text)
    ) then
      raise exception 'Hay otro movimiento en proceso sobre el mismo articulo/deposito'
        using errcode = 'MV006';
    end if;
  end loop;

  for v_det in
    select producto_id, cantidad
    from public.detalle_movimiento
    where movimiento_id = v_mov.id
    order by producto_id
  loop
    if v_mov.deposito_origen_id is not null then
      select cantidad - comprometido into v_disponible
      from public.stock_x_deposito
      where producto_id = v_det.producto_id
        and deposito_id = v_mov.deposito_origen_id
      for update nowait;

      if not found or v_disponible < v_det.cantidad then
        raise exception 'La cantidad supera el disponible del deposito origen'
          using errcode = 'MV004';
      end if;

      update public.stock_x_deposito
      set cantidad = cantidad - v_det.cantidad, updated_at = now()
      where producto_id = v_det.producto_id
        and deposito_id = v_mov.deposito_origen_id;

      select min_stock into v_stock_minimo
      from public.configuracion_stock
      where producto_id = v_det.producto_id
        and deposito_id = v_mov.deposito_origen_id;

      v_disponible_nuevo := v_disponible - v_det.cantidad;
      if v_stock_minimo is not null
        and v_disponible >= v_stock_minimo
        and v_disponible_nuevo < v_stock_minimo then
        insert into public.alertas_stock (
          producto_id, deposito_id, stock_disponible, stock_minimo
        ) values (
          v_det.producto_id, v_mov.deposito_origen_id,
          v_disponible_nuevo, v_stock_minimo
        )
        on conflict (producto_id, deposito_id) where estado = 'activa'
        do nothing;
      end if;
    end if;

    if v_mov.deposito_destino_id is not null then
      insert into public.stock_x_deposito (
        producto_id, deposito_id, cantidad, updated_at
      ) values (
        v_det.producto_id, v_mov.deposito_destino_id, v_det.cantidad, now()
      )
      on conflict (producto_id, deposito_id) do update
      set cantidad = public.stock_x_deposito.cantidad + excluded.cantidad,
          updated_at = now();
    end if;
  end loop;

  update public.movimientos_stock
  set estado_movimiento = 'confirmado', updated_by = auth.uid(), updated_at = now()
  where id = v_mov.id;

  return query select * from public.movimientos_stock where id = v_mov.id;
end;
$$;

alter function public.confirmar_movimiento(uuid) owner to postgres;
revoke all on function public.confirmar_movimiento(uuid) from public;
grant execute on function public.confirmar_movimiento(uuid) to authenticated;

create or replace function public.crear_movimiento_multiarticulo(
  p_tipo text,
  p_deposito_id uuid,
  p_items jsonb,
  p_deposito_destino_id uuid default null,
  p_comprobante text default null,
  p_observaciones text default null
)
returns setof public.movimientos_stock
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo_id uuid;
  v_codigo text := lower(btrim(coalesce(p_tipo, '')));
  v_movimiento_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion' using errcode = '42501';
  end if;
  if p_deposito_id is null then
    raise exception 'El deposito es obligatorio' using errcode = 'MV001';
  end if;
  if v_codigo not in ('ingreso', 'egreso', 'transferencia') then
    raise exception 'El tipo de movimiento no es valido' using errcode = 'MV007';
  end if;
  if v_codigo = 'transferencia'
    and (p_deposito_destino_id is null or p_deposito_destino_id = p_deposito_id) then
    raise exception 'La transferencia requiere otro deposito destino'
      using errcode = 'MV001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregue al menos un articulo al movimiento'
      using errcode = 'MV005';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric)
    where i.producto_id is null or i.cantidad is null
      or i.cantidad <= 0 or i.cantidad <> trunc(i.cantidad)
  ) then
    raise exception 'Todos los articulos deben tener una cantidad entera mayor a 0'
      using errcode = 'MV008';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric)
    group by i.producto_id having count(*) > 1
  ) then
    raise exception 'No se puede repetir un articulo en el movimiento'
      using errcode = 'MV008';
  end if;

  select id into v_tipo_id from public.tipos_movimiento where codigo = v_codigo;
  if v_tipo_id is null then
    raise exception 'El tipo de movimiento no existe' using errcode = 'MV007';
  end if;

  insert into public.movimientos_stock (
    tipo_movimiento_id, deposito_origen_id, deposito_destino_id,
    comprobante, observaciones, created_by, updated_by
  ) values (
    v_tipo_id,
    case when v_codigo in ('egreso', 'transferencia') then p_deposito_id end,
    case when v_codigo = 'ingreso' then p_deposito_id
         when v_codigo = 'transferencia' then p_deposito_destino_id end,
    nullif(btrim(coalesce(p_comprobante, '')), ''),
    nullif(btrim(coalesce(p_observaciones, '')), ''),
    auth.uid(), auth.uid()
  ) returning id into v_movimiento_id;

  insert into public.detalle_movimiento (movimiento_id, producto_id, cantidad)
  select v_movimiento_id, i.producto_id, i.cantidad
  from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric);

  perform public.confirmar_movimiento(v_movimiento_id);
  return query select * from public.movimientos_stock where id = v_movimiento_id;
end;
$$;

alter function public.crear_movimiento_multiarticulo(text, uuid, jsonb, uuid, text, text)
  owner to postgres;
revoke all on function public.crear_movimiento_multiarticulo(text, uuid, jsonb, uuid, text, text)
  from public;
grant execute on function public.crear_movimiento_multiarticulo(text, uuid, jsonb, uuid, text, text)
  to authenticated;

commit;
