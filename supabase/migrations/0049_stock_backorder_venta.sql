-- S3-10: validación de stock al confirmar y backorder opcional.
-- La consulta FOR UPDATE y comprometer_stock se ejecutan en la misma
-- transacción para que dos confirmaciones concurrentes no puedan vender
-- la misma disponibilidad.

begin;

create or replace function public.registrar_venta(
  p_cabecera jsonb,
  p_items jsonb
)
returns setof public.ventas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deposito_id uuid;
  v_cliente_id uuid;
  v_observaciones text;
  v_venta public.ventas;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_cantidad_comprometida numeric;
  v_cantidad_backorder numeric;
  v_disponible numeric;
  v_comprometido_previo numeric;
  v_precio_unitario numeric;
  v_precio_esperado numeric;
  v_descuento_pct numeric;
  v_autorizacion_id uuid;
  v_subtotal numeric;
  v_total numeric := 0;
  v_items_stock jsonb := '[]'::jsonb;
  v_backorder_items jsonb := '[]'::jsonb;
  v_stock_insuficiente jsonb := '[]'::jsonb;
  v_index integer := 0;
  v_requiere_aut boolean;
begin
  if not public.es_usuario_interno() then
    raise exception 'Solo el personal interno puede registrar ventas' using errcode = '42501';
  end if;
  if not public.usuario_tiene_permiso('ventas.registrar') then
    raise exception 'No tenés permiso para registrar ventas' using errcode = '42501';
  end if;

  if p_cabecera is null then
    raise exception 'Los datos de la cabecera son obligatorios' using errcode = '22023';
  end if;
  v_deposito_id := nullif(p_cabecera->>'deposito_id', '')::uuid;
  v_cliente_id := nullif(p_cabecera->>'cliente_id', '')::uuid;
  v_observaciones := nullif(btrim(p_cabecera->>'observaciones'), '');
  if v_deposito_id is null then raise exception 'El depósito es obligatorio' using errcode = '22023'; end if;
  if v_cliente_id is null then raise exception 'El cliente es obligatorio' using errcode = '22023'; end if;
  if not exists (select 1 from public.depositos where id = v_deposito_id) then
    raise exception 'El depósito especificado no existe' using errcode = '23503';
  end if;
  if not public.cliente_habilitado_para_vender(v_cliente_id) then
    raise exception 'El cliente no está habilitado para operar ventas' using errcode = '23514';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe contener al menos un artículo' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_precio_unitario := (v_item->>'precio_unitario')::numeric;
    v_descuento_pct := coalesce((v_item->>'descuento_pct')::numeric, 0);
    v_autorizacion_id := nullif(v_item->>'autorizacion_descuento_id', '')::uuid;
    if v_producto_id is null then raise exception 'Cada ítem necesita un producto_id válido' using errcode = '22023'; end if;
    if v_cantidad is null or v_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a 0' using errcode = '23514'; end if;
    if v_precio_unitario is null or v_precio_unitario <= 0 then raise exception 'El precio unitario debe ser mayor a 0' using errcode = '23514'; end if;
    if v_descuento_pct < 0 or v_descuento_pct > 100 then raise exception 'El porcentaje de descuento debe estar entre 0 y 100' using errcode = '23514'; end if;

    v_precio_esperado := public.calcular_precio_venta(v_producto_id, v_cliente_id, v_cantidad);
    if v_precio_esperado is null then
      raise exception 'El producto % no tiene un precio válido configurado', v_producto_id using errcode = '22023';
    end if;
    if abs(v_precio_unitario - v_precio_esperado) > 0.01 then
      raise exception 'PRECIO_DESACTUALIZADO: El precio del producto % cambió o no coincide con la lista vigente (esperado %, recibido %). Actualizá la venta.',
        v_producto_id, v_precio_esperado, v_precio_unitario using errcode = 'P0001';
    end if;
    if v_descuento_pct > 0 then
      select coalesce((public.validar_descuento_manual(v_descuento_pct)->>'requiere_autorizacion')::boolean, false) into v_requiere_aut;
      if v_requiere_aut and (v_autorizacion_id is null or not public.autorizacion_descuento_valida(v_autorizacion_id, v_descuento_pct)) then
        raise exception 'El descuento del % %% requiere una autorización válida y vigente', v_descuento_pct using errcode = 'P0001';
      end if;
    end if;

    -- El lock se toma antes de decidir el backorder; la disponibilidad es la
    -- de la base al confirmar, no la que vio el navegador.
    select greatest(s.cantidad - s.comprometido, 0) into v_disponible
      from public.stock_x_deposito s
      where s.producto_id = v_producto_id and s.deposito_id = v_deposito_id
      for update;
    v_disponible := coalesce(v_disponible, 0);
    select coalesce(sum((item->>'cantidad')::numeric), 0)
      into v_comprometido_previo
      from jsonb_array_elements(v_items_stock) as item
      where (item->>'producto_id')::uuid = v_producto_id;
    v_disponible := greatest(v_disponible - v_comprometido_previo, 0);
    if v_disponible < v_cantidad and not coalesce((v_item->>'backorder')::boolean, false) then
      v_stock_insuficiente := v_stock_insuficiente || jsonb_build_object(
        'producto_id', v_producto_id, 'disponible', v_disponible, 'solicitado', v_cantidad
      );
    end if;
    v_cantidad_comprometida := least(v_cantidad, v_disponible);
    v_cantidad_backorder := v_cantidad - v_cantidad_comprometida;
    if v_cantidad_comprometida > 0 then
      v_items_stock := v_items_stock || jsonb_build_object('producto_id', v_producto_id, 'cantidad', v_cantidad_comprometida);
    end if;
    v_backorder_items := v_backorder_items || jsonb_build_object('cantidad_backorder', v_cantidad_backorder);
    v_subtotal := round(v_cantidad * v_precio_esperado * (1 - v_descuento_pct / 100.0), 2);
    v_total := v_total + v_subtotal;
  end loop;

  if jsonb_array_length(v_stock_insuficiente) > 0 then
    raise exception 'STOCK_INSUFICIENTE' using errcode = 'P0001', detail = v_stock_insuficiente::text;
  end if;

  -- La función contractual mantiene la actualización de comprometido
  -- protegida por fila y no modifica el stock físico.
  perform public.comprometer_stock(v_deposito_id, v_items_stock);

  insert into public.ventas (deposito_id, cliente_id, vendedor_id, estado, total, observaciones)
  values (v_deposito_id, v_cliente_id, auth.uid(), 'Pendiente', v_total, v_observaciones)
  returning * into v_venta;

  v_index := 0;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_descuento_pct := coalesce((v_item->>'descuento_pct')::numeric, 0);
    v_autorizacion_id := nullif(v_item->>'autorizacion_descuento_id', '')::uuid;
    v_cantidad_backorder := coalesce((v_backorder_items->v_index->>'cantidad_backorder')::numeric, 0);
    v_precio_esperado := public.calcular_precio_venta(v_producto_id, v_cliente_id, v_cantidad);
    insert into public.detalle_venta (venta_id, producto_id, cantidad, cantidad_backorder, precio_unitario, descuento_pct, autorizacion_descuento_id)
    values (v_venta.id, v_producto_id, v_cantidad, v_cantidad_backorder, v_precio_esperado, v_descuento_pct, v_autorizacion_id);
    v_index := v_index + 1;
  end loop;

  insert into public.historial_estado_venta (venta_id, estado_anterior, estado_nuevo, motivo, usuario_id)
  values (v_venta.id, null, 'Pendiente', 'Registro de venta en mostrador (POS)', auth.uid());
  return next v_venta;
end;
$$;

revoke all on function public.registrar_venta(jsonb, jsonb) from public;
grant execute on function public.registrar_venta(jsonb, jsonb) to authenticated;

commit;
