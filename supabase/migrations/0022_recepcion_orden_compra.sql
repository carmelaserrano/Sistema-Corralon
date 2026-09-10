-- S2-12 / US-CMP-04: recepción confirmada de OC, atómica e inmutable.
begin;

alter table public.recepciones drop column if exists remito_proveedor;
alter table public.recepciones
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();
update public.recepciones set updated_by = coalesce(confirmado_by, created_by);
alter table public.detalle_orden_compra
  add column if not exists cantidad_recibida numeric not null default 0;
update public.detalle_orden_compra d set cantidad_recibida = (
  select coalesce(sum(dr.cantidad), 0) from public.detalle_recepcion dr
  join public.recepciones r on r.id = dr.recepcion_id
  where dr.orden_compra_detalle_id = d.id and r.estado_recepcion = 'confirmada'
);
alter table public.detalle_orden_compra add constraint detalle_oc_recibida_rango
  check (cantidad_recibida >= 0 and cantidad_recibida <= cantidad) not valid;
alter table public.detalle_recepcion add constraint detalle_recepcion_entera
  check (cantidad = trunc(cantidad)) not valid;
-- Se preservan registros históricos que pudieron ser compras directas.
alter table public.recepciones add constraint recepcion_oc_obligatoria
  check (orden_compra_id is not null and tipo_origen = 'orden_compra') not valid;
alter table public.detalle_recepcion add constraint recepcion_detalle_oc_obligatorio
  check (orden_compra_detalle_id is not null) not valid;
-- La OC permite precio cero según S2-08; la recepción conserva ese precio.
alter table public.detalle_recepcion drop constraint if exists detalle_recepcion_costo_unitario_check;
alter table public.detalle_recepcion add constraint detalle_recepcion_costo_no_negativo check (costo_unitario >= 0);

-- Solo la nueva RPC puede escribir: no se puede eludir la confirmación con REST
-- ni mediante las RPC antiguas que creaban recepciones sin OC.
revoke insert, update, delete on public.recepciones, public.detalle_recepcion from public, anon, authenticated;
revoke all on function public.crear_recepcion(uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.confirmar_recepcion(uuid) from public, anon, authenticated;

create or replace function public.proteger_recepcion_confirmada()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.estado_recepcion = 'confirmada' then
    raise exception 'Una recepción confirmada no puede editarse ni eliminarse' using errcode = 'RC003';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger recepcion_confirmada_inmutable before update or delete on public.recepciones
  for each row execute function public.proteger_recepcion_confirmada();

create or replace function public.proteger_detalle_recepcion_confirmada()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then
    if exists (select 1 from public.recepciones where id = old.recepcion_id and estado_recepcion = 'confirmada') then
      raise exception 'Una recepción confirmada no puede editarse ni eliminarse' using errcode = 'RC003';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if exists (select 1 from public.recepciones where id = new.recepcion_id and estado_recepcion = 'confirmada') then
      raise exception 'Una recepción confirmada no puede editarse ni eliminarse' using errcode = 'RC003';
    end if;
    return new;
  end if;
  return old;
end;
$$;
create trigger detalle_recepcion_confirmada_inmutable before insert or update or delete on public.detalle_recepcion
  for each row execute function public.proteger_detalle_recepcion_confirmada();

-- Las recepciones históricas pendientes no reservan cantidades.
create or replace function public.fn_validar_cantidad_recibida()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_det public.detalle_orden_compra%rowtype;
begin
  select * into v_det from public.detalle_orden_compra where id = new.orden_compra_detalle_id for update;
  if not found or v_det.producto_id <> new.producto_id or not exists (
    select 1 from public.recepciones where id = new.recepcion_id and orden_compra_id = v_det.orden_compra_id
  ) then
    raise exception 'El producto no pertenece a la orden de compra' using errcode = 'RC001';
  end if;
  if new.cantidad > v_det.cantidad - v_det.cantidad_recibida then
    raise exception 'Cantidad máxima admitida para el producto %: %', new.producto_id,
      v_det.cantidad - v_det.cantidad_recibida using errcode = 'RC001';
  end if;
  return new;
end;
$$;

create or replace function public.registrar_recepcion_oc(
  p_orden_compra_id uuid, p_deposito_destino_id uuid, p_items jsonb,
  p_observaciones text default null
)
returns setof public.recepciones language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_oc public.ordenes_compra%rowtype;
  v_det public.detalle_orden_compra%rowtype;
  v_item jsonb;
  v_cantidad numeric;
  v_total numeric := 0;
  v_rec uuid;
  v_numero bigint;
  v_mov uuid;
  v_tipo uuid;
  v_stock numeric;
  v_cmp numeric;
  v_nombre text;
begin
  if auth.uid() is null or not coalesce(public.usuario_tiene_permiso('compras.recepcion.registrar'), false) then
    raise exception 'No tiene permiso para registrar recepciones' using errcode = '42501';
  end if;
  select * into v_oc from public.ordenes_compra where id = p_orden_compra_id for update;
  if not found then raise exception 'La orden de compra es obligatoria y debe existir' using errcode = 'RC001'; end if;
  if v_oc.estado not in ('pendiente', 'parcialmente_recibida') then
    raise exception 'La orden de compra debe estar Pendiente o Parcial' using errcode = 'RC003';
  end if;
  if p_deposito_destino_id is null or not exists (select 1 from public.depositos where id = p_deposito_destino_id) then
    raise exception 'El depósito destino es obligatorio y debe existir' using errcode = 'RC001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Debe recibir al menos un producto' using errcode = 'RC001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i group by i->>'orden_compra_detalle_id' having count(*) > 1) then
    raise exception 'No se puede repetir un renglón de la orden' using errcode = 'RC001';
  end if;
  perform id from public.detalle_orden_compra where orden_compra_id = v_oc.id order by id for update;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_det from public.detalle_orden_compra
      where id = (v_item->>'orden_compra_detalle_id')::uuid and orden_compra_id = v_oc.id;
    if not found then raise exception 'El renglón no pertenece a la orden de compra' using errcode = 'RC001'; end if;
    v_cantidad := (v_item->>'cantidad')::numeric;
    if v_cantidad is null or v_cantidad::text in ('NaN','Infinity','-Infinity') or v_cantidad < 0 or v_cantidad <> trunc(v_cantidad) then
      raise exception 'La cantidad debe ser un número entero mayor o igual a cero' using errcode = 'RC001';
    end if;
    if v_cantidad > v_det.cantidad - v_det.cantidad_recibida then
      select nombre into v_nombre from public.productos where id = v_det.producto_id;
      raise exception 'Cantidad máxima admitida para %: %', v_nombre, v_det.cantidad - v_det.cantidad_recibida using errcode = 'RC001';
    end if;
    v_total := v_total + v_cantidad;
  end loop;
  if v_total = 0 then raise exception 'Debe recibir al menos un producto' using errcode = 'RC001'; end if;

  insert into public.recepciones (orden_compra_id, deposito_destino_id, tipo_origen, proveedor_id,
    observaciones, created_by, updated_by, fecha_recepcion)
  values (v_oc.id, p_deposito_destino_id, 'orden_compra', v_oc.proveedor_id,
    nullif(btrim(p_observaciones), ''), auth.uid(), auth.uid(), (now() at time zone 'America/Argentina/Buenos_Aires')::date)
  returning id, numero into v_rec, v_numero;
  select id into strict v_tipo from public.tipos_movimiento where codigo = 'ingreso';
  insert into public.movimientos_stock (tipo_movimiento_id, deposito_destino_id, estado_movimiento,
    comprobante, observaciones, created_by, updated_by)
  values (v_tipo, p_deposito_destino_id, 'confirmado', 'Recepción ' || v_numero,
    nullif(btrim(p_observaciones), ''), auth.uid(), auth.uid()) returning id into v_mov;

  -- Orden estable y mismos locks que los movimientos existentes.
  for v_item in select i from jsonb_array_elements(p_items) i
    join public.detalle_orden_compra d on d.id = (i->>'orden_compra_detalle_id')::uuid
    where (i->>'cantidad')::numeric > 0 order by d.producto_id
  loop
    select * into v_det from public.detalle_orden_compra where id = (v_item->>'orden_compra_detalle_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    if not pg_try_advisory_xact_lock(hashtext(v_det.producto_id::text), hashtext(p_deposito_destino_id::text)) then
      raise exception 'Hay otra operación en proceso sobre el mismo artículo o depósito' using errcode = 'RC006';
    end if;
    select costo_medio_ponderado into v_cmp from public.productos where id = v_det.producto_id for update nowait;
    select coalesce(sum(cantidad), 0) into v_stock from public.stock_x_deposito where producto_id = v_det.producto_id;
    update public.productos set costo_medio_ponderado =
      (v_stock * coalesce(v_cmp, 0) + v_cantidad * v_det.precio_unitario) / (v_stock + v_cantidad)
      where id = v_det.producto_id;
    insert into public.detalle_recepcion (recepcion_id, orden_compra_detalle_id, producto_id, cantidad, costo_unitario)
      values (v_rec, v_det.id, v_det.producto_id, v_cantidad, v_det.precio_unitario);
    insert into public.stock_x_deposito (producto_id, deposito_id, cantidad, updated_at)
      values (v_det.producto_id, p_deposito_destino_id, v_cantidad, now())
      on conflict (producto_id, deposito_id) do update set cantidad = stock_x_deposito.cantidad + excluded.cantidad, updated_at = now();
    insert into public.detalle_movimiento (movimiento_id, producto_id, cantidad) values (v_mov, v_det.producto_id, v_cantidad);
    update public.detalle_orden_compra set cantidad_recibida = cantidad_recibida + v_cantidad where id = v_det.id;
  end loop;
  update public.ordenes_compra set estado = case when exists (
    select 1 from public.detalle_orden_compra where orden_compra_id = v_oc.id and cantidad_recibida < cantidad
  ) then 'parcialmente_recibida' else 'recibida' end, updated_by = auth.uid(), updated_at = now() where id = v_oc.id;
  update public.recepciones set estado_recepcion = 'confirmada', confirmado_by = auth.uid(),
    confirmado_at = now(), updated_by = auth.uid(), updated_at = now(), movimiento_ingreso_id = v_mov where id = v_rec;
  return query select * from public.recepciones where id = v_rec;
end;
$$;
revoke all on function public.registrar_recepcion_oc(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.registrar_recepcion_oc(uuid, uuid, jsonb, text) to authenticated;
commit;
