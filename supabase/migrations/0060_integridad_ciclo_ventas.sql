-- ============================================================================
-- 0059 · Issue #140: integridad del ciclo de ventas (reserva, entrega, anulación)
--
-- Hallazgos de la verificación integral contra la base (ver qa/issue-140):
--
--   H1  El backorder (0049) compromete sólo la parte disponible de cada línea
--       (cantidad - cantidad_backorder), pero cambiar_estado_venta (0039) y
--       fn_anular_venta_por_nota_credito (0040) liberaban/egresaban la
--       `cantidad` completa. Con stock justo la anulación fallaba por
--       stock_x_deposito_comprometido_nonneg; con stock compartido TENÍA ÉXITO
--       y liberaba reservas de otras ventas (riesgo de sobreventa).
--       Ahora ambas usan sólo lo efectivamente comprometido.
--       La entrega de una venta con backorder pendiente se bloquea con un
--       mensaje claro: el modelo todavía no tiene cumplimiento posterior del
--       backorder (queda como historia aparte).
--
--   H3  Una venta Pendiente con cobro registrado podía anularse: los cobros son
--       inmutables (0041), así que el dinero quedaba sin contrapartida. Ahora
--       se rechaza y se indica el camino fiscal (facturar + Nota de Crédito).
--
--   H4  El movimiento de stock del egreso no decía a qué venta pertenecía.
--       egresar_comprometido gana una variante con referencia; la firma de dos
--       parámetros se conserva (la usa el flujo de pedidos web, 0051).
--
--   H6  registrar_venta aceptaba el mismo producto dos veces y fallaba tarde con
--       un 23505 crudo (uq_detalle_venta_producto). Ahora se rechaza al inicio
--       con un mensaje claro.
--
-- Esta migración reemplaza funciones con `create or replace` (no se toca ninguna
-- migración ya mergeada). cambiar_estado_venta parte de la versión SECURITY
-- DEFINER de 0057 (PR #143) y restablece su ACL, para que el orden de merge
-- entre ambas no importe.
-- ============================================================================

begin;

-- ============================================================================
-- 1) egresar_comprometido con referencia (H4)
-- ============================================================================
-- Misma lógica que 0034, más `p_referencia`: texto que queda en las
-- observaciones del movimiento de stock para poder rastrear el origen.
-- Sin referencia conserva el texto histórico.
--
-- @param p_deposito uuid depósito de origen del egreso.
-- @param p_items jsonb array de {producto_id, cantidad}.
-- @param p_referencia text observación del movimiento (ej. 'Venta #12').
-- @returns void
create or replace function public.egresar_comprometido(
  p_deposito uuid,
  p_items jsonb,
  p_referencia text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_tipo_id uuid;
  v_movimiento_id uuid;
begin
  if not public.es_usuario_interno() then
    raise exception 'Solo el personal interno puede egresar stock'
      using errcode = '42501';
  end if;

  if p_deposito is null then
    raise exception 'El depósito es obligatorio';
  end if;

  select id into v_tipo_id from public.tipos_movimiento where codigo = 'egreso';
  if v_tipo_id is null then
    raise exception 'No existe el tipo de movimiento "egreso"';
  end if;

  insert into public.movimientos_stock (
    tipo_movimiento_id, deposito_origen_id, estado_movimiento, observaciones
  )
  values (
    v_tipo_id, p_deposito, 'confirmado',
    coalesce(nullif(btrim(p_referencia), ''), 'Egreso por venta entregada')
  )
  returning id into v_movimiento_id;

  for v_item in
    select (elem->>'producto_id')::uuid as producto_id,
           (elem->>'cantidad')::numeric as cantidad
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as elem
  loop
    if v_item.producto_id is null or v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cada ítem necesita producto_id y una cantidad mayor a 0';
    end if;

    update public.stock_x_deposito
    set cantidad = cantidad - v_item.cantidad,
        comprometido = comprometido - v_item.cantidad,
        updated_at = now()
    where producto_id = v_item.producto_id
      and deposito_id = p_deposito;

    insert into public.detalle_movimiento (movimiento_id, producto_id, cantidad)
    values (v_movimiento_id, v_item.producto_id, v_item.cantidad);
  end loop;
end;
$$;

-- Primitiva interna: sólo la invocan funciones SECURITY DEFINER (mismo criterio
-- que 0057 para la variante de dos parámetros).
revoke all on function public.egresar_comprometido(uuid, jsonb, text)
  from public, anon, authenticated;

-- La variante de dos parámetros delega en la nueva. `create or replace`
-- conserva sus permisos actuales.
create or replace function public.egresar_comprometido(p_deposito uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.egresar_comprometido(p_deposito, p_items, null);
end;
$$;


-- ============================================================================
-- 2) cambiar_estado_venta (H1, H3, H4)
-- ============================================================================
create or replace function public.cambiar_estado_venta(
  p_venta uuid,
  p_estado_nuevo text,
  p_motivo text default null
)
returns setof public.ventas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta           public.ventas;
  v_estado_anterior text;
  v_items           jsonb;
begin
  if not public.es_usuario_interno() then
    raise exception 'La venta no existe o no tenés permiso para modificarla'
      using errcode = '42501';
  end if;

  select * into v_venta from public.ventas where id = p_venta for update;

  if not found then
    raise exception 'La venta no existe o no tenés permiso para modificarla'
      using errcode = '42501';
  end if;

  v_estado_anterior := v_venta.estado;

  if v_estado_anterior = 'Facturada' and p_estado_nuevo = 'Anulada' then
    raise exception 'Una venta facturada no se puede anular directamente: generá una Nota de Crédito por el total'
      using errcode = '22023';
  end if;

  if not public.transicion_venta_permitida(v_estado_anterior, p_estado_nuevo) then
    raise exception 'Transición no permitida: % → %', v_estado_anterior, p_estado_nuevo
      using errcode = '22023';
  end if;

  if p_estado_nuevo = 'Entregada' then
    if not public.usuario_tiene_permiso('ventas.entregar') then
      raise exception 'No tenés permiso para marcar ventas como entregadas'
        using errcode = '42501';
    end if;

    -- H1: no hay todavía cumplimiento posterior del backorder; entregar una
    -- venta con mercadería sin reservar dejaría el stock físico en negativo.
    if exists (
      select 1 from public.detalle_venta
      where venta_id = p_venta and cantidad_backorder > 0
    ) then
      raise exception 'La venta tiene artículos en backorder pendientes de reposición: no se puede marcar como entregada'
        using errcode = '22023';
    end if;
  elsif p_estado_nuevo = 'Anulada' then
    if not public.usuario_tiene_permiso('ventas.anular') then
      raise exception 'No tenés permiso para anular ventas'
        using errcode = '42501';
    end if;
    if nullif(btrim(p_motivo), '') is null then
      raise exception 'El motivo es obligatorio para anular una venta'
        using errcode = '23514';
    end if;

    -- H3: los cobros son inmutables; anular dejaría el dinero sin contrapartida.
    if exists (select 1 from public.cobros_venta where venta_id = p_venta) then
      raise exception 'La venta tiene un cobro registrado: facturala y emití una Nota de Crédito por el total para anularla'
        using errcode = '22023';
    end if;
  end if;

  -- H1: sólo la parte efectivamente comprometida (la porción en backorder
  -- nunca se reservó, así que no hay nada que liberar ni egresar).
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'producto_id', producto_id,
      'cantidad', cantidad - cantidad_backorder
    )) filter (where cantidad - cantidad_backorder > 0),
    '[]'::jsonb
  )
    into v_items
  from public.detalle_venta
  where venta_id = p_venta;

  if p_estado_nuevo = 'Entregada' then
    perform public.egresar_comprometido(
      v_venta.deposito_id, v_items, 'Egreso por venta entregada · Venta #' || v_venta.numero
    );
  elsif p_estado_nuevo = 'Anulada' then
    perform public.liberar_stock(v_venta.deposito_id, v_items);
  end if;

  update public.ventas
     set estado = p_estado_nuevo
   where id = p_venta
  returning * into v_venta;

  insert into public.historial_estado_venta (
    venta_id, estado_anterior, estado_nuevo, motivo, usuario_id
  ) values (
    p_venta, v_estado_anterior, p_estado_nuevo, p_motivo, auth.uid()
  );

  return next v_venta;
end;
$$;

revoke all on function public.cambiar_estado_venta(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.cambiar_estado_venta(uuid, text, text)
  to authenticated;


-- ============================================================================
-- 3) fn_anular_venta_por_nota_credito (H1)
-- ============================================================================
-- Igual que la versión de 0040; la única diferencia es que libera sólo lo que
-- la venta tiene comprometido (sin la porción en backorder).
create or replace function public.fn_anular_venta_por_nota_credito()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta            public.ventas;
  v_items            jsonb;
  v_total_factura    numeric(14,2);
  v_total_acreditado numeric(14,2);
begin
  select * into v_venta from public.ventas where id = new.venta_id for update;

  if v_venta.estado is distinct from 'Facturada' then
    return new;
  end if;

  if new.comprobante_asociado_id is not null then
    select f.total into v_total_factura
    from public.comprobantes_venta f
    where f.id = new.comprobante_asociado_id
      and f.tipo_comprobante = 'factura';

    -- AFTER INSERT: la NC recién insertada ya suma en este total.
    select coalesce(sum(nc.total), 0) into v_total_acreditado
    from public.comprobantes_venta nc
    where nc.comprobante_asociado_id = new.comprobante_asociado_id
      and nc.tipo_comprobante = 'nota_credito'
      and nc.estado = 'Emitido';

    if v_total_factura is null or v_total_acreditado < v_total_factura then
      return new;
    end if;
  elsif new.total is distinct from v_venta.total then
    return new;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'producto_id', producto_id,
      'cantidad', cantidad - cantidad_backorder
    )) filter (where cantidad - cantidad_backorder > 0),
    '[]'::jsonb
  )
    into v_items
  from public.detalle_venta
  where venta_id = new.venta_id;

  perform public.liberar_stock(v_venta.deposito_id, v_items);

  update public.ventas set estado = 'Anulada' where id = new.venta_id;

  insert into public.historial_estado_venta (
    venta_id, estado_anterior, estado_nuevo, motivo, usuario_id
  ) values (
    new.venta_id, 'Facturada', 'Anulada', 'Nota de crédito por el total', auth.uid()
  );

  return new;
end;
$$;


-- ============================================================================
-- 4) registrar_venta: rechazar productos repetidos (H6)
-- ============================================================================
-- Cuerpo de 0049 sin cambios, más la validación de productos repetidos antes
-- de tocar stock.
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

  -- H6: un producto por línea (detalle_venta es único por venta y producto).
  if exists (
    select 1
    from jsonb_array_elements(p_items) as elem
    where nullif(elem->>'producto_id', '') is not null
    group by elem->>'producto_id'
    having count(*) > 1
  ) then
    raise exception 'Hay artículos repetidos en la venta: unificá las cantidades en una sola línea'
      using errcode = '22023';
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
