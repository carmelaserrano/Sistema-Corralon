-- Protege los comprobantes cerrados del circuito de compras y tesorería.
-- Los recálculos automáticos de imputaciones conservan permiso para actualizar
-- únicamente saldos y estados derivados dentro de su propia transacción.

begin;

create or replace function public.fn_validar_proveedor_activo_oc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado text;
begin
  if tg_op = 'INSERT' or old.proveedor_id is distinct from new.proveedor_id then
    select estado into v_estado
      from public.proveedores where id = new.proveedor_id for update;
    if v_estado is distinct from 'activo' then
      raise exception 'La orden de compra requiere un proveedor activo'
        using errcode = 'OC004';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_oc_proveedor_activo on public.ordenes_compra;
create trigger trg_oc_proveedor_activo
  before insert or update of proveedor_id on public.ordenes_compra
  for each row execute function public.fn_validar_proveedor_activo_oc();

create or replace function public.proteger_factura_cerrada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.estado in ('pagada', 'anulada') then
    if tg_op = 'DELETE' then
      raise exception 'Una factura pagada o anulada no puede eliminarse'
        using errcode = 'FA004';
    end if;

    if coalesce(current_setting('app.recalculando_comprobantes', true), '') <> 'on' then
      raise exception 'Una factura pagada o anulada no puede modificarse directamente'
        using errcode = 'FA004';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_factura_cerrada_inmutable on public.facturas_proveedor;
create trigger trg_factura_cerrada_inmutable
  before update or delete on public.facturas_proveedor
  for each row execute function public.proteger_factura_cerrada();

create or replace function public.proteger_nota_cerrada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.estado in ('aplicada', 'anulada') then
    if tg_op = 'DELETE' then
      raise exception 'Una nota aplicada o anulada no puede eliminarse'
        using errcode = 'NT004';
    end if;

    if coalesce(current_setting('app.recalculando_comprobantes', true), '') <> 'on' then
      raise exception 'Una nota aplicada o anulada no puede modificarse directamente'
        using errcode = 'NT004';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_nota_cerrada_inmutable on public.notas_proveedor;
create trigger trg_nota_cerrada_inmutable
  before update or delete on public.notas_proveedor
  for each row execute function public.proteger_nota_cerrada();

create or replace function public.fn_pago_inmutable()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.estado in ('confirmada', 'anulado') then
      raise exception 'Una orden de pago confirmada no se puede eliminar'
        using errcode = 'OP007';
    end if;
    return old;
  end if;

  if new.numero is distinct from old.numero
     or new.proveedor_id is distinct from old.proveedor_id
     or new.medio_pago_id is distinct from old.medio_pago_id
     or new.fecha is distinct from old.fecha
     or new.importe_total is distinct from old.importe_total
     or new.referencia is distinct from old.referencia
     or new.observaciones is distinct from old.observaciones
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Una orden de pago confirmada no se puede editar'
      using errcode = 'OP007';
  end if;

  if old.estado = 'confirmada'
     and new.estado is distinct from old.estado
     and (new.estado <> 'anulado'
          or new.anulado_by is null
          or new.anulado_at is null
          or nullif(btrim(new.motivo_anulacion), '') is null) then
    raise exception 'Una orden de pago confirmada solo puede anularse con motivo y auditoría'
      using errcode = 'OP007';
  end if;

  if old.estado = 'anulado'
     and (new.estado is distinct from old.estado
          or new.anulado_by is distinct from old.anulado_by
          or new.anulado_at is distinct from old.anulado_at
          or new.motivo_anulacion is distinct from old.motivo_anulacion
          or new.updated_by is distinct from old.updated_by) then
    raise exception 'Una orden de pago anulada no se puede modificar'
      using errcode = 'OP007';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pago_inmutable on public.pagos_proveedor;
create trigger trg_pago_inmutable
  before update or delete on public.pagos_proveedor
  for each row execute function public.fn_pago_inmutable();

-- El trigger de imputaciones también recalcula comprobantes cerrados cuando
-- se revierte una imputación. El indicador local evita que una escritura REST
-- directa imite ese recálculo.
create or replace function public.fn_recalcular_saldo_factura(p_factura uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_importe numeric(14,2);
  v_reduccion numeric(14,2);
  v_flag_anterior text := coalesce(current_setting('app.recalculando_comprobantes', true), '');
begin
  select importe_total into v_importe
    from public.facturas_proveedor where id = p_factura;
  if v_importe is null then return; end if;

  select coalesce(sum(case
      when i.pago_id is not null then i.importe_imputado
      when n.tipo = 'CREDITO' then i.importe_imputado
      when n.tipo = 'DEBITO' then -i.importe_imputado
      else 0
    end), 0) into v_reduccion
    from public.imputaciones i
    left join public.pagos_proveedor pg on pg.id = i.pago_id
    left join public.notas_proveedor n on n.id = i.nota_id
   where i.factura_id = p_factura
     and i.anulado_at is null
     and coalesce(pg.estado, 'confirmada') <> 'anulado'
     and coalesce(n.estado, 'disponible') <> 'anulada';

  if v_reduccion > v_importe then
    raise exception 'La suma aplicada (%) supera el importe de la factura (%)', v_reduccion, v_importe;
  end if;

  perform set_config('app.recalculando_comprobantes', 'on', true);
  begin
    update public.facturas_proveedor
       set saldo_pendiente = importe_total - v_reduccion,
           estado = case
             when estado = 'anulada' then 'anulada'
             when importe_total - v_reduccion <= 0 then 'pagada'
             when v_reduccion > 0 then 'parcialmente_pagada'
             else 'pendiente'
           end
     where id = p_factura;
  exception when others then
    perform set_config('app.recalculando_comprobantes', v_flag_anterior, true);
    raise;
  end;
  perform set_config('app.recalculando_comprobantes', v_flag_anterior, true);
end;
$$;

create or replace function public.fn_recalcular_saldo_nc(p_nc uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_importe numeric(14,2);
  v_imputado numeric(14,2);
  v_flag_anterior text := coalesce(current_setting('app.recalculando_comprobantes', true), '');
begin
  select importe into v_importe from public.notas_proveedor where id = p_nc;
  if v_importe is null then return; end if;

  select coalesce(sum(importe_imputado), 0) into v_imputado
    from public.imputaciones where nota_id = p_nc and anulado_at is null;
  if v_imputado > v_importe then
    raise exception 'La suma imputada (%) supera el importe de la nota (%)', v_imputado, v_importe;
  end if;

  perform set_config('app.recalculando_comprobantes', 'on', true);
  begin
    update public.notas_proveedor
       set saldo_pendiente = importe - v_imputado,
           estado = case
             when estado = 'anulada' then 'anulada'
             when importe - v_imputado <= 0 then 'aplicada'
             when v_imputado > 0 then 'parcialmente_aplicada'
             else 'disponible'
           end
     where id = p_nc;
  exception when others then
    perform set_config('app.recalculando_comprobantes', v_flag_anterior, true);
    raise;
  end;
  perform set_config('app.recalculando_comprobantes', v_flag_anterior, true);
end;
$$;

-- Diagnóstico de datos derivados: deja visibles los descuadres sin corregirlos
-- automáticamente, para que puedan investigarse con su historial de auditoría.
create or replace function public.diagnosticar_consistencia_compras_tesoreria()
returns table (
  entidad text,
  entidad_id uuid,
  campo text,
  esperado text,
  actual text
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select 'detalle_orden_compra', d.id, 'cantidad_recibida',
         coalesce(sum(dr.cantidad) filter (where r.estado_recepcion = 'confirmada'), 0)::text,
         d.cantidad_recibida::text
    from public.detalle_orden_compra d
    left join public.detalle_recepcion dr on dr.orden_compra_detalle_id = d.id
    left join public.recepciones r on r.id = dr.recepcion_id
   group by d.id, d.cantidad_recibida
  having d.cantidad_recibida is distinct from
         coalesce(sum(dr.cantidad) filter (where r.estado_recepcion = 'confirmada'), 0)

  union all

  select 'ordenes_compra', oc.id, 'estado', esperado.estado, oc.estado
    from public.ordenes_compra oc
    cross join lateral (
      select case
        when count(*) = 0 then 'pendiente'
        when bool_and(d.cantidad_recibida >= d.cantidad) then 'recibida'
        when bool_or(d.cantidad_recibida > 0) then 'parcialmente_recibida'
        else 'pendiente'
      end as estado
      from public.detalle_orden_compra d where d.orden_compra_id = oc.id
    ) esperado
   where oc.estado <> 'cancelada' and oc.estado is distinct from esperado.estado

  union all

  select 'facturas_proveedor', f.id, 'saldo_pendiente/estado',
         (f.importe_total - x.reduccion)::text || '/' ||
         case
           when f.estado = 'anulada' then 'anulada'
           when f.importe_total - x.reduccion <= 0 then 'pagada'
           when x.reduccion > 0 then 'parcialmente_pagada'
           else 'pendiente'
         end,
         f.saldo_pendiente::text || '/' || f.estado
    from public.facturas_proveedor f
    cross join lateral (
      select coalesce(sum(case
          when i.pago_id is not null then i.importe_imputado
          when n.tipo = 'CREDITO' then i.importe_imputado
          when n.tipo = 'DEBITO' then -i.importe_imputado
          else 0 end), 0) as reduccion
        from public.imputaciones i
        left join public.pagos_proveedor pg on pg.id = i.pago_id
        left join public.notas_proveedor n on n.id = i.nota_id
       where i.factura_id = f.id
         and i.anulado_at is null
         and coalesce(pg.estado, 'confirmada') <> 'anulado'
         and coalesce(n.estado, 'disponible') <> 'anulada'
    ) x
   where f.saldo_pendiente is distinct from (f.importe_total - x.reduccion)
      or f.estado is distinct from case
           when f.estado = 'anulada' then 'anulada'
           when f.importe_total - x.reduccion <= 0 then 'pagada'
           when x.reduccion > 0 then 'parcialmente_pagada'
           else 'pendiente' end

  union all

  select 'notas_proveedor', n.id, 'saldo_pendiente/estado',
         (n.importe - x.imputado)::text || '/' ||
         case
           when n.estado = 'anulada' then 'anulada'
           when n.importe - x.imputado <= 0 then 'aplicada'
           when x.imputado > 0 then 'parcialmente_aplicada'
           else 'disponible' end,
         n.saldo_pendiente::text || '/' || n.estado
    from public.notas_proveedor n
    cross join lateral (
      select coalesce(sum(i.importe_imputado), 0) as imputado
        from public.imputaciones i
       where i.nota_id = n.id and i.anulado_at is null
    ) x
   where n.saldo_pendiente is distinct from (n.importe - x.imputado)
      or n.estado is distinct from case
           when n.estado = 'anulada' then 'anulada'
           when n.importe - x.imputado <= 0 then 'aplicada'
           when x.imputado > 0 then 'parcialmente_aplicada'
           else 'disponible' end

  union all

  select 'pagos_proveedor', p.id, 'importe_total', p.importe_total::text, x.imputado::text
    from public.pagos_proveedor p
    cross join lateral (
      select coalesce(sum(case
          when i.pago_id = p.id then i.importe_imputado
          when i.pago_origen_id = p.id and n.tipo = 'DEBITO' then i.importe_imputado
          when i.pago_origen_id = p.id and n.tipo = 'CREDITO' then -i.importe_imputado
          else 0 end), 0) as imputado
        from public.imputaciones i
        left join public.notas_proveedor n on n.id = i.nota_id
       where (i.pago_id = p.id or i.pago_origen_id = p.id)
         and i.anulado_at is null
    ) x
   where p.estado = 'confirmada' and p.importe_total is distinct from x.imputado

  union all

  select 'recepciones', r.id, 'movimiento_ingreso_id', 'movimiento de stock confirmado', 'sin movimiento asociado'
    from public.recepciones r
   where r.estado_recepcion = 'confirmada'
     and (r.movimiento_ingreso_id is null or not exists (
       select 1 from public.movimientos_stock m
        where m.id = r.movimiento_ingreso_id and m.estado_movimiento = 'confirmado'
     ))

  union all

  select 'detalle_recepcion', dr.id, 'movimiento_stock.cantidad', dr.cantidad::text, x.cantidad_movida::text
    from public.detalle_recepcion dr
    join public.recepciones r on r.id = dr.recepcion_id
    cross join lateral (
      select coalesce(sum(dm.cantidad), 0) as cantidad_movida
        from public.detalle_movimiento dm
       where dm.movimiento_id = r.movimiento_ingreso_id
         and dm.producto_id = dr.producto_id
    ) x
   where r.estado_recepcion = 'confirmada'
     and r.movimiento_ingreso_id is not null
     and dr.cantidad is distinct from x.cantidad_movida
$$;

revoke all on function public.diagnosticar_consistencia_compras_tesoreria() from public, anon;
grant execute on function public.diagnosticar_consistencia_compras_tesoreria() to authenticated;

-- Las escrituras de recepciones deben pasar por registrar_recepcion_oc(), que
-- crea el movimiento y actualiza el stock dentro de la misma transacción.
-- La función es SECURITY DEFINER y valida el permiso de negocio antes de operar.
drop policy if exists recepciones_insert_authenticated on public.recepciones;
drop policy if exists recepciones_update_authenticated on public.recepciones;
drop policy if exists detalle_recepcion_insert_authenticated on public.detalle_recepcion;

create or replace function public.crear_orden_compra(
  p_proveedor_id uuid,
  p_deposito_destino_id uuid,
  p_condicion_pago text,
  p_fecha_emision date,
  p_fecha_entrega_estimada date,
  p_observaciones text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orden public.ordenes_compra%rowtype;
begin
  if auth.uid() is null
     or not coalesce(public.usuario_tiene_permiso('compras.orden.crear'), false) then
    raise exception 'No tiene permiso para crear órdenes de compra' using errcode = '42501';
  end if;

  if p_proveedor_id is null or p_deposito_destino_id is null or p_fecha_emision is null then
    raise exception 'Proveedor, depósito destino y fecha de emisión son obligatorios' using errcode = 'OC001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La orden de compra debe tener al menos un artículo' using errcode = 'OC001';
  end if;

  if not exists (select 1 from public.proveedores where id = p_proveedor_id and estado = 'activo') then
    raise exception 'La orden de compra requiere un proveedor activo' using errcode = 'OC004';
  end if;

  if not exists (select 1 from public.depositos where id = p_deposito_destino_id) then
    raise exception 'El depósito destino no existe' using errcode = 'OC001';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric, precio_unitario numeric)
     where i.producto_id is null or i.cantidad is null or i.cantidad <= 0
        or i.precio_unitario is null or i.precio_unitario < 0
  ) or exists (
    select 1
      from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric, precio_unitario numeric)
     group by i.producto_id having count(*) > 1
  ) or exists (
    select 1
      from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric, precio_unitario numeric)
     where not exists (select 1 from public.productos p where p.id = i.producto_id)
  ) then
    raise exception 'Los artículos de la orden deben ser válidos, únicos y tener cantidad y precio correctos' using errcode = 'OC001';
  end if;

  insert into public.ordenes_compra (
    proveedor_id, deposito_destino_id, condicion_pago, fecha_emision,
    fecha_entrega_estimada, observaciones, created_by, updated_by
  ) values (
    p_proveedor_id, p_deposito_destino_id, nullif(btrim(p_condicion_pago), ''), p_fecha_emision,
    p_fecha_entrega_estimada, nullif(btrim(p_observaciones), ''), auth.uid(), auth.uid()
  ) returning * into v_orden;

  insert into public.detalle_orden_compra (orden_compra_id, producto_id, cantidad, precio_unitario)
  select v_orden.id, i.producto_id, i.cantidad, i.precio_unitario
    from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric, precio_unitario numeric);

  select * into v_orden from public.ordenes_compra where id = v_orden.id;
  return jsonb_build_object('id', v_orden.id, 'numero', v_orden.numero);
end;
$$;

create or replace function public.actualizar_orden_compra(
  p_orden_compra_id uuid,
  p_proveedor_id uuid,
  p_deposito_destino_id uuid,
  p_condicion_pago text,
  p_fecha_emision date,
  p_fecha_entrega_estimada date,
  p_observaciones text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orden public.ordenes_compra%rowtype;
begin
  if auth.uid() is null
     or not coalesce(public.usuario_tiene_permiso('compras.orden.modificar'), false) then
    raise exception 'No tiene permiso para modificar órdenes de compra' using errcode = '42501';
  end if;

  select * into v_orden from public.ordenes_compra where id = p_orden_compra_id for update;
  if not found then
    raise exception 'La orden de compra no existe' using errcode = 'OC002';
  end if;
  if v_orden.estado <> 'pendiente' then
    raise exception 'Solo se puede modificar una orden de compra pendiente' using errcode = 'OC003';
  end if;

  if p_proveedor_id is null or p_deposito_destino_id is null or p_fecha_emision is null then
    raise exception 'Proveedor, depósito destino y fecha de emisión son obligatorios' using errcode = 'OC001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La orden de compra debe tener al menos un artículo' using errcode = 'OC001';
  end if;
  if not exists (select 1 from public.proveedores where id = p_proveedor_id and estado = 'activo') then
    raise exception 'La orden de compra requiere un proveedor activo' using errcode = 'OC004';
  end if;
  if not exists (select 1 from public.depositos where id = p_deposito_destino_id) then
    raise exception 'El depósito destino no existe' using errcode = 'OC001';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric, precio_unitario numeric)
     where i.producto_id is null or i.cantidad is null or i.cantidad <= 0
        or i.precio_unitario is null or i.precio_unitario < 0
  ) or exists (
    select 1
      from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric, precio_unitario numeric)
     group by i.producto_id having count(*) > 1
  ) or exists (
    select 1
      from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric, precio_unitario numeric)
     where not exists (select 1 from public.productos p where p.id = i.producto_id)
  ) then
    raise exception 'Los artículos de la orden deben ser válidos, únicos y tener cantidad y precio correctos' using errcode = 'OC001';
  end if;

  update public.ordenes_compra
     set proveedor_id = p_proveedor_id,
         deposito_destino_id = p_deposito_destino_id,
         condicion_pago = nullif(btrim(p_condicion_pago), ''),
         fecha_emision = p_fecha_emision,
         fecha_entrega_estimada = p_fecha_entrega_estimada,
         observaciones = nullif(btrim(p_observaciones), ''),
         updated_by = auth.uid(),
         updated_at = now()
   where id = p_orden_compra_id;

  delete from public.detalle_orden_compra where orden_compra_id = p_orden_compra_id;
  insert into public.detalle_orden_compra (orden_compra_id, producto_id, cantidad, precio_unitario)
  select p_orden_compra_id, i.producto_id, i.cantidad, i.precio_unitario
    from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric, precio_unitario numeric);

  select * into v_orden from public.ordenes_compra where id = p_orden_compra_id;
  return jsonb_build_object('id', v_orden.id, 'numero', v_orden.numero);
end;
$$;

create or replace function public.registrar_factura_proveedor(
  p_proveedor_id uuid,
  p_letra text,
  p_sucursal text,
  p_numero text,
  p_fecha_emision date,
  p_fecha_vencimiento date,
  p_importe_neto numeric,
  p_impuestos numeric,
  p_importe_total numeric,
  p_orden_compra_id uuid,
  p_recepcion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_factura public.facturas_proveedor%rowtype;
begin
  if auth.uid() is null
     or not coalesce(public.usuario_tiene_permiso('tesoreria.factura.registrar'), false) then
    raise exception 'No tiene permiso para registrar facturas de proveedor' using errcode = '42501';
  end if;

  insert into public.facturas_proveedor (
    proveedor_id, letra, sucursal, numero, fecha_emision, fecha_vencimiento,
    importe_neto, impuestos, importe_total, orden_compra_id, created_by
  ) values (
    p_proveedor_id, p_letra, p_sucursal, p_numero, p_fecha_emision, p_fecha_vencimiento,
    coalesce(p_importe_neto, 0), coalesce(p_impuestos, 0), p_importe_total, p_orden_compra_id, auth.uid()
  ) returning * into v_factura;

  if p_recepcion_id is not null then
    insert into public.factura_recepcion (factura_id, recepcion_id)
    values (v_factura.id, p_recepcion_id);
  end if;

  return to_jsonb(v_factura);
end;
$$;

revoke all on function public.crear_orden_compra(uuid, uuid, text, date, date, text, jsonb) from public, anon;
revoke all on function public.actualizar_orden_compra(uuid, uuid, uuid, text, date, date, text, jsonb) from public, anon;
revoke all on function public.registrar_factura_proveedor(uuid, text, text, text, date, date, numeric, numeric, numeric, uuid, uuid) from public, anon;
grant execute on function public.crear_orden_compra(uuid, uuid, text, date, date, text, jsonb) to authenticated;
grant execute on function public.actualizar_orden_compra(uuid, uuid, uuid, text, date, date, text, jsonb) to authenticated;
grant execute on function public.registrar_factura_proveedor(uuid, text, text, text, date, date, numeric, numeric, numeric, uuid, uuid) to authenticated;

commit;
