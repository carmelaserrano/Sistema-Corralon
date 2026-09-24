-- Migración 0041: Registro de venta en mostrador (POS)
--
-- Historia: S3-09 (#104) — Registro de venta en mostrador (POS)
--
-- Permite registrar una venta completa con sus líneas en una única transacción atómica:
--   1. Valida permisos del usuario (es_usuario_interno y permiso 'ventas.registrar').
--   2. Valida que el cliente esté habilitado para operar (cliente_habilitado_para_vender).
--   3. Valida y autoriza descuentos manuales si superan el límite (autorizacion_descuento_valida).
--   4. Compromete el stock en el depósito indicado (comprometer_stock), abortando si hay STOCK_INSUFICIENTE.
--   5. Inserta la cabecera en `ventas` con estado 'Pendiente' y número correlativo automático.
--   6. Inserta cada ítem en `detalle_venta`.
--   7. Registra el estado inicial en `historial_estado_venta`.

begin;

-- ============================================================================
-- 1. FUNCIÓN registrar_venta
-- ============================================================================
-- @param p_cabecera jsonb con {deposito_id, cliente_id, observaciones}
-- @param p_items jsonb array de {producto_id, cantidad, precio_unitario, descuento_pct, autorizacion_descuento_id}
-- @returns setof public.ventas La venta creada con número y estado 'Pendiente'.

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
  v_deposito_id      uuid;
  v_cliente_id       uuid;
  v_observaciones    text;
  v_venta            public.ventas;
  v_item             record;
  v_producto_id      uuid;
  v_cantidad         numeric;
  v_precio_unitario  numeric;
  v_descuento_pct    numeric;
  v_autorizacion_id  uuid;
  v_subtotal         numeric;
  v_total            numeric := 0;
  v_items_stock      jsonb := '[]'::jsonb;
  v_requiere_aut     boolean;
begin
  -- 1. Validar autenticación interna y permisos
  if not public.es_usuario_interno() then
    raise exception 'Solo el personal interno puede registrar ventas'
      using errcode = '42501';
  end if;

  if not public.usuario_tiene_permiso('ventas.registrar') then
    raise exception 'No tenés permiso para registrar ventas'
      using errcode = '42501';
  end if;

  -- 2. Validar cabecera
  if p_cabecera is null then
    raise exception 'Los datos de la cabecera son obligatorios'
      using errcode = '22023';
  end if;

  v_deposito_id   := nullif(p_cabecera->>'deposito_id', '')::uuid;
  v_cliente_id    := nullif(p_cabecera->>'cliente_id', '')::uuid;
  v_observaciones := nullif(btrim(p_cabecera->>'observaciones'), '');

  if v_deposito_id is null then
    raise exception 'El depósito es obligatorio'
      using errcode = '22023';
  end if;

  if v_cliente_id is null then
    raise exception 'El cliente es obligatorio'
      using errcode = '22023';
  end if;

  -- Validar que el depósito exista
  if not exists (select 1 from public.depositos where id = v_deposito_id) then
    raise exception 'El depósito especificado no existe'
      using errcode = '23503';
  end if;

  -- Validar que el cliente esté habilitado para vender (CA-02)
  if not public.cliente_habilitado_para_vender(v_cliente_id) then
    raise exception 'El cliente no está habilitado para operar ventas'
      using errcode = '23514';
  end if;

  -- 3. Validar array de ítems
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe contener al menos un artículo'
      using errcode = '22023';
  end if;

  -- 4. Validar cada ítem, descuentos y calcular totales
  for v_item in
    select elem
    from jsonb_array_elements(p_items) as elem
  loop
    v_producto_id     := nullif(v_item.elem->>'producto_id', '')::uuid;
    v_cantidad        := (v_item.elem->>'cantidad')::numeric;
    v_precio_unitario := (v_item.elem->>'precio_unitario')::numeric;
    v_descuento_pct   := coalesce((v_item.elem->>'descuento_pct')::numeric, 0);
    v_autorizacion_id := nullif(v_item.elem->>'autorizacion_descuento_id', '')::uuid;

    if v_producto_id is null then
      raise exception 'Cada ítem necesita un producto_id válido'
        using errcode = '22023';
    end if;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad debe ser mayor a 0'
        using errcode = '23514';
    end if;

    if v_precio_unitario is null or v_precio_unitario <= 0 then
      raise exception 'El precio unitario debe ser mayor a 0'
        using errcode = '23514';
    end if;

    if v_descuento_pct < 0 or v_descuento_pct > 100 then
      raise exception 'El porcentaje de descuento debe estar entre 0 y 100'
        using errcode = '23514';
    end if;

    -- Validar si el descuento manual requiere autorización (CA-05)
    if v_descuento_pct > 0 then
      select coalesce((public.validar_descuento_manual(v_descuento_pct)->>'requiere_autorizacion')::boolean, false)
        into v_requiere_aut;

      if v_requiere_aut then
        if v_autorizacion_id is null or not public.autorizacion_descuento_valida(v_autorizacion_id, v_descuento_pct) then
          raise exception 'El descuento del % %% requiere una autorización válida y vigente', v_descuento_pct
            using errcode = 'P0001';
        end if;
      end if;
    end if;

    -- Calcular subtotal de la línea redondeado a 2 decimales
    v_subtotal := round(v_cantidad * v_precio_unitario * (1 - v_descuento_pct / 100.0), 2);
    v_total    := v_total + v_subtotal;

    -- Construir array para comprometer_stock
    v_items_stock := v_items_stock || jsonb_build_object(
      'producto_id', v_producto_id,
      'cantidad', v_cantidad
    );
  end loop;

  -- 5. Comprometer stock de todos los artículos (todo o nada, arroja STOCK_INSUFICIENTE si falla)
  perform public.comprometer_stock(v_deposito_id, v_items_stock);

  -- 6. Insertar cabecera de la venta
  insert into public.ventas (
    deposito_id,
    cliente_id,
    vendedor_id,
    estado,
    total,
    observaciones
  ) values (
    v_deposito_id,
    v_cliente_id,
    auth.uid(),
    'Pendiente',
    v_total,
    v_observaciones
  ) returning * into v_venta;

  -- 7. Insertar líneas en detalle_venta
  for v_item in
    select elem
    from jsonb_array_elements(p_items) as elem
  loop
    v_producto_id     := (v_item.elem->>'producto_id')::uuid;
    v_cantidad        := (v_item.elem->>'cantidad')::numeric;
    v_precio_unitario := (v_item.elem->>'precio_unitario')::numeric;
    v_descuento_pct   := coalesce((v_item.elem->>'descuento_pct')::numeric, 0);
    v_autorizacion_id := nullif(v_item.elem->>'autorizacion_descuento_id', '')::uuid;

    insert into public.detalle_venta (
      venta_id,
      producto_id,
      cantidad,
      cantidad_backorder,
      precio_unitario,
      descuento_pct,
      autorizacion_descuento_id
    ) values (
      v_venta.id,
      v_producto_id,
      v_cantidad,
      0,
      v_precio_unitario,
      v_descuento_pct,
      v_autorizacion_id
    );
  end loop;

  -- 8. Registrar historial inicial de estado
  insert into public.historial_estado_venta (
    venta_id,
    estado_anterior,
    estado_nuevo,
    motivo,
    usuario_id
  ) values (
    v_venta.id,
    null,
    'Pendiente',
    'Registro de venta en mostrador (POS)',
    auth.uid()
  );

  return next v_venta;
end;
$$;

revoke all on function public.registrar_venta(jsonb, jsonb) from public;
grant execute on function public.registrar_venta(jsonb, jsonb) to authenticated;

commit;
