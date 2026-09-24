-- ============================================================================
-- 0044 · Corrección: validación de precio y descuento en registrar_venta
--
-- La migración 0043_registrar_venta.sql ya estaba aplicada en entorno compartido;
-- por eso esta corrección va en una migración nueva para mantener el historial
-- de cambios y evitar reescribir la lógica original ya desplegada.
--
-- Cambios principales:
--   - Validar precio_unitario contra public.calcular_precio_venta(...)
--   - Rechazar productos sin precio válido
--   - Rechazar si el precio del navegador cambió respecto del precio autorizado
--   - Mantener el descuento manual sin duplicar descuentos automáticos
--   - Garantizar rollback completo si falla cualquier validación
-- ============================================================================

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
  v_deposito_id      uuid;
  v_cliente_id       uuid;
  v_observaciones    text;
  v_venta            public.ventas;
  v_item             record;
  v_producto_id      uuid;
  v_cantidad         numeric;
  v_precio_unitario  numeric;
  v_precio_esperado  numeric;
  v_descuento_pct    numeric;
  v_autorizacion_id  uuid;
  v_subtotal         numeric;
  v_total            numeric := 0;
  v_items_stock      jsonb := '[]'::jsonb;
  v_requiere_aut     boolean;
begin
  if not public.es_usuario_interno() then
    raise exception 'Solo el personal interno puede registrar ventas'
      using errcode = '42501';
  end if;

  if not public.usuario_tiene_permiso('ventas.registrar') then
    raise exception 'No tenés permiso para registrar ventas'
      using errcode = '42501';
  end if;

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

  if not exists (select 1 from public.depositos where id = v_deposito_id) then
    raise exception 'El depósito especificado no existe'
      using errcode = '23503';
  end if;

  if not public.cliente_habilitado_para_vender(v_cliente_id) then
    raise exception 'El cliente no está habilitado para operar ventas'
      using errcode = '23514';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe contener al menos un artículo'
      using errcode = '22023';
  end if;

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

    select public.calcular_precio_venta(v_producto_id, v_cliente_id, v_cantidad)
      into v_precio_esperado;

    if v_precio_esperado is null then
      raise exception 'No existe un precio válido para el producto % en la lista del cliente', v_producto_id
        using errcode = '23514';
    end if;

    if abs(v_precio_unitario - v_precio_esperado) > 0.01 then
      raise exception 'El precio del artículo cambió. Actualizá y confirmá nuevamente.'
        using errcode = '23514';
    end if;

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

    v_subtotal := round(v_cantidad * v_precio_esperado * (1 - v_descuento_pct / 100.0), 2);
    v_total := v_total + v_subtotal;

    v_items_stock := v_items_stock || jsonb_build_object(
      'producto_id', v_producto_id,
      'cantidad', v_cantidad
    );
  end loop;

  perform public.comprometer_stock(v_deposito_id, v_items_stock);

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

  for v_item in
    select elem
    from jsonb_array_elements(p_items) as elem
  loop
    v_producto_id     := (v_item.elem->>'producto_id')::uuid;
    v_cantidad        := (v_item.elem->>'cantidad')::numeric;
    v_precio_unitario := (v_item.elem->>'precio_unitario')::numeric;
    v_descuento_pct   := coalesce((v_item.elem->>'descuento_pct')::numeric, 0);
    v_autorizacion_id := nullif(v_item.elem->>'autorizacion_descuento_id', '')::uuid;

    select public.calcular_precio_venta(v_producto_id, v_cliente_id, v_cantidad)
      into v_precio_esperado;

    if v_precio_esperado is null then
      raise exception 'No existe un precio válido para el producto % en la lista del cliente', v_producto_id
        using errcode = '23514';
    end if;

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
      v_precio_esperado,
      v_descuento_pct,
      v_autorizacion_id
    );
  end loop;

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
