-- Unifica ventas de mostrador y Ecommerce. Los pedidos web y su ciclo de
-- preparación siguen en pedidos_web; el pago crea su venta y cobro relacionados.

begin;

-- Caja Ecommerce administrada por el sistema, sin cajero ni sesión por turno.
alter table public.cajas
  add column tipo_caja text not null default 'fisica',
  add constraint chk_caja_tipo check (tipo_caja in ('fisica', 'ecommerce'));
create unique index uq_caja_ecommerce_unica on public.cajas (tipo_caja)
  where tipo_caja = 'ecommerce';

alter table public.cajas drop constraint if exists chk_caja_cajero_asignado;
alter table public.cajas
  add constraint chk_caja_cajero_por_tipo
  check (tipo_caja = 'ecommerce' or usuario_asignado_id is not null) not valid,
  alter column created_by drop not null,
  add constraint chk_caja_creador_por_tipo
  check (created_by is not null or tipo_caja = 'ecommerce') not valid;

drop policy if exists "cajas_insert_admin" on public.cajas;
create policy "cajas_insert_admin" on public.cajas for insert to authenticated
  with check (public.usuario_tiene_permiso('cajas.administrar')
    and tipo_caja = 'fisica' and created_by = auth.uid());
drop policy if exists "cajas_update_admin" on public.cajas;
create policy "cajas_update_admin" on public.cajas for update to authenticated
  using (public.usuario_tiene_permiso('cajas.administrar') and tipo_caja = 'fisica')
  with check (public.usuario_tiene_permiso('cajas.administrar') and tipo_caja = 'fisica');
drop policy if exists "cajas_select" on public.cajas;
create policy "cajas_select" on public.cajas for select to authenticated using (
  public.usuario_tiene_permiso('cajas.administrar')
  or (tipo_caja = 'ecommerce' and public.es_usuario_interno())
  or (
    (public.usuario_tiene_permiso('cajas.operar')
     or public.usuario_tiene_permiso('cajas.abrir')
     or public.usuario_tiene_permiso('cajas.cerrar'))
    and (usuario_asignado_id = auth.uid() or exists (
      select 1 from public.sesiones_caja sc
       where sc.caja_id = cajas.id and sc.usuario_id = auth.uid()
    ))
  )
);

do $$
declare
  v_deposito uuid;
  v_punto_venta uuid;
begin
  select (pv.valor ->> 'deposito_id')::uuid into v_deposito
    from public.parametros_ventas pv where pv.clave = 'deposito_ecommerce';
  if v_deposito is null then
    raise exception 'Falta configurar parametros_ventas.deposito_ecommerce';
  end if;
  select p.id into v_punto_venta from public.puntos_venta p
   where p.activo and p.deposito_id = v_deposito order by p.numero limit 1;
  if v_punto_venta is null then
    raise exception 'No hay un punto de venta activo para el depósito de Ecommerce (%)', v_deposito;
  end if;
  insert into public.cajas (nombre, punto_venta_id, usuario_asignado_id, activa, created_by, tipo_caja)
  select 'Ecommerce', v_punto_venta, null, true, null, 'ecommerce'
   where not exists (select 1 from public.cajas where tipo_caja = 'ecommerce');
end;
$$;

-- Las ventas físicas quedan como mostrador. Las web guardan su origen, pedido y caja.
alter table public.ventas
  add column origen text not null default 'mostrador',
  add column pedido_web_id uuid references public.pedidos_web(id) on delete restrict,
  add column caja_id uuid references public.cajas(id) on delete restrict,
  alter column vendedor_id drop not null,
  add constraint chk_venta_origen check (origen in ('mostrador', 'ecommerce')),
  add constraint chk_venta_origen_relaciones check (
    (origen = 'mostrador' and pedido_web_id is null and vendedor_id is not null)
    or (origen = 'ecommerce' and pedido_web_id is not null and caja_id is not null and vendedor_id is null)
  ),
  add constraint uq_venta_pedido_web unique (pedido_web_id);
create index idx_ventas_caja_fecha on public.ventas (caja_id, created_at desc)
  where caja_id is not null;

drop policy if exists "ventas_insert" on public.ventas;
create policy "ventas_insert" on public.ventas for insert to authenticated
  with check (public.usuario_tiene_permiso('ventas.registrar')
    and origen = 'mostrador' and pedido_web_id is null);

drop policy if exists "ventas_update" on public.ventas;
create policy "ventas_update" on public.ventas for update to authenticated
  using (
    origen = 'mostrador'
    and (public.usuario_tiene_permiso('ventas.registrar')
      or public.usuario_tiene_permiso('ventas.anular')
      or public.usuario_tiene_permiso('ventas.entregar')
      or public.usuario_tiene_permiso('ventas.facturar')
      or public.usuario_tiene_permiso('ventas.cobrar'))
  )
  with check (
    origen = 'mostrador'
    and (public.usuario_tiene_permiso('ventas.registrar')
      or public.usuario_tiene_permiso('ventas.anular')
      or public.usuario_tiene_permiso('ventas.entregar')
      or public.usuario_tiene_permiso('ventas.facturar')
      or public.usuario_tiene_permiso('ventas.cobrar'))
  );

create or replace function public.fn_proteger_origen_venta()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.origen = 'ecommerce' and (
    new.origen is distinct from old.origen
    or new.pedido_web_id is distinct from old.pedido_web_id
    or new.caja_id is distinct from old.caja_id
    or new.deposito_id is distinct from old.deposito_id
    or new.cliente_id is distinct from old.cliente_id
    or new.vendedor_id is distinct from old.vendedor_id
    or new.total is distinct from old.total
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Los datos de origen de una venta Ecommerce no se pueden editar manualmente';
  elsif old.origen = 'mostrador' and (
    new.origen is distinct from old.origen or new.pedido_web_id is not null
  ) then
    raise exception 'El origen de una venta no se puede cambiar';
  end if;
  return new;
end;
$$;
create trigger trg_ventas_proteger_origen
  before update on public.ventas
  for each row execute function public.fn_proteger_origen_venta();
revoke all on function public.fn_proteger_origen_venta() from public, anon, authenticated;

drop policy if exists "detalle_venta_write" on public.detalle_venta;
create policy "detalle_venta_write" on public.detalle_venta for all to authenticated
  using (public.usuario_tiene_permiso('ventas.registrar') and exists (
    select 1 from public.ventas v
     where v.id = detalle_venta.venta_id and v.origen = 'mostrador'
  ))
  with check (public.usuario_tiene_permiso('ventas.registrar') and exists (
    select 1 from public.ventas v
     where v.id = detalle_venta.venta_id and v.origen = 'mostrador'
  ));

alter table public.cobros_venta
  add column caja_id uuid references public.cajas(id) on delete restrict;
-- El backfill sólo agrega la referencia de caja. El bloqueo DDL se conserva
-- hasta COMMIT y la protección vuelve a habilitarse en esta transacción.
alter table public.cobros_venta disable trigger trg_cobros_venta_inmutables;
update public.cobros_venta cv set caja_id = sc.caja_id
  from public.sesiones_caja sc
 where cv.sesion_caja_id = sc.id and cv.caja_id is null;
alter table public.cobros_venta enable trigger trg_cobros_venta_inmutables;
update public.ventas v set caja_id = cv.caja_id
  from public.cobros_venta cv
 where cv.venta_id = v.id and cv.caja_id is not null and v.caja_id is null;

-- Los ingresos automáticos del sitio no pertenecen a una sesión física.
alter table public.movimientos_caja
  add column caja_id uuid references public.cajas(id) on delete restrict;
alter table public.movimientos_caja disable trigger trg_movimientos_caja_inmutables;
update public.movimientos_caja mc set caja_id = sc.caja_id
  from public.sesiones_caja sc
 where mc.sesion_caja_id = sc.id and mc.caja_id is null;
alter table public.movimientos_caja enable trigger trg_movimientos_caja_inmutables;
alter table public.movimientos_caja
  alter column sesion_caja_id drop not null,
  alter column created_by drop not null,
  drop constraint if exists chk_movimiento_caja_origen,
  add constraint chk_movimiento_caja_origen
    check (origen in ('venta', 'manual', 'cobranza', 'ecommerce')),
  drop constraint if exists chk_movimiento_caja_origen_venta,
  add constraint chk_movimiento_caja_origen_venta check (
    (origen = 'venta' and venta_id is not null and recibo_id is null and tipo = 'ingreso'
      and sesion_caja_id is not null and caja_id is not null and created_by is not null)
    or (origen = 'manual' and venta_id is null and recibo_id is null
      and comprobante is not null and sesion_caja_id is not null
      and caja_id is not null and created_by is not null)
    or (origen = 'cobranza' and recibo_id is not null and venta_id is null and tipo = 'ingreso'
      and sesion_caja_id is not null and caja_id is not null and created_by is not null)
    or (origen = 'ecommerce' and venta_id is not null and recibo_id is null and tipo = 'ingreso'
      and sesion_caja_id is null and caja_id is not null and created_by is null)
  );
create index idx_movimientos_caja_caja_fecha on public.movimientos_caja (caja_id, created_at desc);

-- Las RPC existentes de movimientos manuales y recibos siguen enviando la
-- sesión. Derivar aquí la caja mantiene su compatibilidad y evita discrepancias.
create or replace function public.asociar_caja_a_movimiento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_caja_id uuid;
begin
  if new.origen = 'ecommerce' then
    select v.caja_id into v_caja_id
      from public.ventas v join public.cajas c on c.id = v.caja_id
     where v.id = new.venta_id and v.origen = 'ecommerce' and c.tipo_caja = 'ecommerce';
  else
    select sc.caja_id into v_caja_id
      from public.sesiones_caja sc join public.cajas c on c.id = sc.caja_id
     where sc.id = new.sesion_caja_id and c.tipo_caja = 'fisica';
  end if;
  if v_caja_id is null or (new.caja_id is not null and new.caja_id is distinct from v_caja_id) then
    raise exception 'La caja del movimiento no coincide con su sesión o venta' using errcode = '23514';
  end if;
  new.caja_id := v_caja_id;
  return new;
end;
$$;
create trigger trg_movimientos_asociar_caja before insert on public.movimientos_caja
  for each row execute function public.asociar_caja_a_movimiento();
revoke all on function public.asociar_caja_a_movimiento() from public, anon, authenticated;

create or replace function public.asociar_sesion_caja_a_cobro()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := coalesce(new.created_by, auth.uid());
  v_venta record;
  v_sesion record;
begin
  select v.id, v.origen, v.caja_id into v_venta
    from public.ventas v where v.id = new.venta_id for update;
  if not found then raise exception 'La venta no existe' using errcode = 'CV002'; end if;

  if v_venta.origen = 'ecommerce' then
    if not exists (select 1 from public.cajas c where c.id = v_venta.caja_id
      and c.tipo_caja = 'ecommerce' and c.activa) then
      raise exception 'La venta Ecommerce no tiene una caja Ecommerce activa';
    end if;
    if new.caja_id is not null and new.caja_id is distinct from v_venta.caja_id then
      raise exception 'El cobro debe registrarse en la caja Ecommerce de la venta';
    end if;
    new.caja_id := v_venta.caja_id;
    new.sesion_caja_id := null;
    new.created_by := null;
    return new;
  end if;

  if v_usuario is null or not public.usuario_tiene_permiso('cajas.operar') then
    raise exception 'No tiene permiso para operar una caja' using errcode = '42501';
  end if;
  select sc.id, sc.caja_id into v_sesion from public.sesiones_caja sc
   where sc.usuario_id = v_usuario and sc.estado = 'abierta' for update;
  if v_sesion.id is null then
    raise exception 'Debe abrir una caja antes de registrar un cobro' using errcode = 'CV008';
  end if;
  if v_venta.caja_id is not null and v_venta.caja_id is distinct from v_sesion.caja_id then
    raise exception 'La venta ya está asociada a otra caja';
  end if;
  new.sesion_caja_id := v_sesion.id;
  new.caja_id := v_sesion.caja_id;
  update public.ventas set caja_id = v_sesion.caja_id where id = new.venta_id;
  return new;
end;
$$;

create or replace function public.registrar_movimiento_por_detalle_cobro()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cobro record;
begin
  select cv.id, cv.sesion_caja_id, cv.caja_id, cv.numero, cv.venta_id,
         cv.created_by, cv.created_at, v.origen
    into v_cobro
    from public.cobros_venta cv join public.ventas v on v.id = cv.venta_id
   where cv.id = new.cobro_id;
  if not found then raise exception 'No se encontró el cobro asociado al detalle'; end if;

  if v_cobro.origen = 'ecommerce' then
    insert into public.movimientos_caja (
      sesion_caja_id, caja_id, tipo, origen, medio_pago_id, monto,
      motivo, comprobante, venta_id, created_by, created_at
    ) values (
      null, v_cobro.caja_id, 'ingreso', 'ecommerce', new.medio_pago_id, new.monto,
      'Cobro Ecommerce · Venta N.º ' || v_cobro.numero, new.referencia,
      v_cobro.venta_id, null, v_cobro.created_at
    );
  else
    insert into public.movimientos_caja (
      sesion_caja_id, caja_id, tipo, origen, medio_pago_id, monto,
      motivo, comprobante, venta_id, created_by, created_at
    ) values (
      v_cobro.sesion_caja_id, v_cobro.caja_id, 'ingreso', 'venta',
      new.medio_pago_id, new.monto, 'Cobro de venta N.º ' || v_cobro.numero,
      new.referencia, v_cobro.venta_id, coalesce(auth.uid(), v_cobro.created_by),
      v_cobro.created_at
    );
  end if;
  return new;
end;
$$;

-- Copia de pagos aprobados a ventas/cobros. No reserva, egresa ni libera stock:
-- ese ciclo sigue perteneciendo a pedidos_web.
create or replace function public.fn_registrar_venta_desde_pedido_web(p_pedido uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.pedidos_web%rowtype;
  v_venta public.ventas%rowtype;
  v_caja_id uuid;
  v_medio_nombre text;
  v_medio_id uuid;
  v_total_detalle numeric(14,2);
begin
  select pw.* into v_pedido from public.pedidos_web pw where pw.id = p_pedido for update;
  if not found then raise exception 'El pedido web no existe'; end if;
  if v_pedido.pagado_at is null or v_pedido.pago_estado is distinct from 'approved' then return null; end if;

  select v.* into v_venta from public.ventas v where v.pedido_web_id = p_pedido;
  if found then return v_venta.id; end if;

  select c.id into v_caja_id from public.cajas c
   where c.tipo_caja = 'ecommerce' and c.activa order by c.created_at, c.id limit 1;
  if v_caja_id is null then raise exception 'No hay una caja Ecommerce activa'; end if;
  if not exists (select 1 from public.detalle_pedido_web dpw where dpw.pedido_id = p_pedido) then
    raise exception 'El pedido web no tiene artículos';
  end if;
  if exists (
    select 1 from public.detalle_pedido_web dpw where dpw.pedido_id = p_pedido
     group by dpw.producto_id having count(distinct dpw.precio_unitario) > 1
  ) then
    raise exception 'El pedido web repite un artículo con precios diferentes';
  end if;

  select coalesce(sum(dpw.subtotal), 0)::numeric(14,2) into v_total_detalle
    from public.detalle_pedido_web dpw where dpw.pedido_id = p_pedido;
  if v_total_detalle is distinct from v_pedido.total then
    raise exception 'El total del pedido web (%) no coincide con sus artículos (%)',
      v_pedido.total, v_total_detalle;
  end if;

  insert into public.ventas (
    deposito_id, cliente_id, vendedor_id, estado, total, observaciones,
    created_at, origen, pedido_web_id, caja_id
  ) values (
    v_pedido.deposito_id, v_pedido.cliente_id, null, 'Pendiente', v_pedido.total,
    'Venta de Ecommerce · Pedido web N.º ' || v_pedido.numero,
    v_pedido.pagado_at, 'ecommerce', p_pedido, v_caja_id
  ) returning * into v_venta;

  insert into public.detalle_venta (
    venta_id, producto_id, cantidad, cantidad_backorder, precio_unitario, descuento_pct, created_at
  )
  select v_venta.id, dpw.producto_id, sum(dpw.cantidad), 0,
         max(dpw.precio_unitario), 0, v_pedido.pagado_at
    from public.detalle_pedido_web dpw where dpw.pedido_id = p_pedido
   group by dpw.producto_id;

  insert into public.historial_estado_venta (
    venta_id, estado_anterior, estado_nuevo, motivo, usuario_id, created_at
  ) values (
    v_venta.id, null, 'Pendiente', 'Venta creada desde pedido web pagado', null, v_pedido.pagado_at
  );

  v_medio_nombre := case
    when v_pedido.referencia_pago in ('mock:' || p_pedido::text, 'mock:tarjeta:' || p_pedido::text)
      then 'Tarjeta de crédito'
    when v_pedido.referencia_pago = 'mock:mercado_pago:' || p_pedido::text then 'Mercado Pago'
    when v_pedido.referencia_pago = 'mock:transferencia:' || p_pedido::text then 'Transferencia bancaria'
    else 'Mercado Pago'
  end;
  select mp.id into v_medio_id from public.medios_pago mp
   where lower(btrim(mp.nombre)) = lower(v_medio_nombre) and mp.activo
   order by mp.id limit 1;
  if v_medio_id is null then
    raise exception 'No está configurado el medio de pago activo "%"', v_medio_nombre;
  end if;

  insert into public.cobros_venta (venta_id, total, created_by, created_at, caja_id)
  values (v_venta.id, v_pedido.total, null, v_pedido.pagado_at, v_caja_id);
  insert into public.detalle_cobro (cobro_id, medio_pago_id, monto, referencia, created_at)
  select cv.id, v_medio_id, v_pedido.total, v_pedido.referencia_pago, v_pedido.pagado_at
    from public.cobros_venta cv where cv.venta_id = v_venta.id;
  return v_venta.id;
end;
$$;
revoke all on function public.fn_registrar_venta_desde_pedido_web(uuid) from public, anon, authenticated;

-- Pago aprobado y asiento de venta/cobro forman una sola transacción.
create or replace function pago_interno.confirmar_pago_pedido(
  p_pedido uuid, p_referencia text, p_estado text, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pedido public.pedidos_web%rowtype;
begin
  if nullif(btrim(p_referencia), '') is null then raise exception 'La referencia de pago es obligatoria'; end if;
  if p_estado not in ('approved', 'rejected', 'cancelled', 'pending', 'in_process') then
    raise exception 'Estado de pago no reconocido';
  end if;
  select * into v_pedido from public.pedidos_web where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe'; end if;

  if v_pedido.estado = 'Cancelado' and p_estado = 'approved' and v_pedido.referencia_pago is null then
    update public.pedidos_web
       set referencia_pago = p_referencia, ultimo_pago_referencia = p_referencia,
           pago_estado = 'approved',
           pago_motivo = 'Pago aprobado con el pedido ya cancelado: corresponde reembolso'
     where id = p_pedido returning * into v_pedido;
    return to_jsonb(v_pedido);
  end if;
  if v_pedido.estado is distinct from 'Pendiente de pago' then return to_jsonb(v_pedido); end if;

  if p_estado = 'approved' then
    update public.pedidos_web
       set estado = 'Pagado', referencia_pago = p_referencia,
           ultimo_pago_referencia = p_referencia, pago_estado = p_estado,
           pago_motivo = null, pagado_at = now()
     where id = p_pedido returning * into v_pedido;
    insert into public.historial_estado_pedido (pedido_id, estado_anterior, estado_nuevo, motivo)
    values (p_pedido, 'Pendiente de pago', 'Pagado', 'Pago online aprobado');

    perform public.fn_registrar_venta_desde_pedido_web(p_pedido);

    delete from public.items_carrito
     where carrito_id in (select id from public.carritos where cliente_id = v_pedido.cliente_id);
    update public.carritos set updated_at = now() where cliente_id = v_pedido.cliente_id;
  else
    update public.pedidos_web
       set ultimo_pago_referencia = p_referencia, pago_estado = p_estado,
           pago_motivo = nullif(btrim(p_motivo), '')
     where id = p_pedido returning * into v_pedido;
  end if;
  return to_jsonb(v_pedido);
end;
$$;
revoke all on function pago_interno.confirmar_pago_pedido(uuid, text, text, text)
  from public, anon, authenticated;

-- Trae compras ya pagadas a la tabla común, sin recrear sus movimientos de stock.
do $$
declare
  v_pedido record;
begin
  for v_pedido in
    select pw.id from public.pedidos_web pw
     where pw.pagado_at is not null and pw.pago_estado = 'approved'
     order by pw.pagado_at, pw.id
  loop
    perform public.fn_registrar_venta_desde_pedido_web(v_pedido.id);
  end loop;
end;
$$;

-- La entrega/anulación física no debe volver a tocar el stock de pedidos web.
create or replace function public.cambiar_estado_venta(
  p_venta uuid, p_estado_nuevo text, p_motivo text default null
) returns setof public.ventas
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_venta public.ventas;
  v_estado_anterior text;
  v_items jsonb;
begin
  if not public.es_usuario_interno() then
    raise exception 'La venta no existe o no tenés permiso para modificarla' using errcode = '42501';
  end if;
  select * into v_venta from public.ventas where id = p_venta for update;
  if not found then
    raise exception 'La venta no existe o no tenés permiso para modificarla' using errcode = '42501';
  end if;
  if v_venta.origen = 'ecommerce' then
    raise exception 'El estado de entrega de Ecommerce se gestiona desde pedidos web' using errcode = '22023';
  end if;

  v_estado_anterior := v_venta.estado;
  if v_estado_anterior = 'Facturada' and p_estado_nuevo = 'Anulada' then
    raise exception 'Una venta facturada no se puede anular directamente: generá una Nota de Crédito por el total'
      using errcode = '22023';
  end if;
  if not public.transicion_venta_permitida(v_estado_anterior, p_estado_nuevo) then
    raise exception 'Transición no permitida: % → %', v_estado_anterior, p_estado_nuevo using errcode = '22023';
  end if;

  if p_estado_nuevo = 'Entregada' then
    if not public.usuario_tiene_permiso('ventas.entregar') then
      raise exception 'No tenés permiso para marcar ventas como entregadas' using errcode = '42501';
    end if;
    if exists (select 1 from public.detalle_venta where venta_id = p_venta and cantidad_backorder > 0) then
      raise exception 'La venta tiene artículos en backorder pendientes de reposición: no se puede marcar como entregada'
        using errcode = '22023';
    end if;
  elsif p_estado_nuevo = 'Anulada' then
    if not public.usuario_tiene_permiso('ventas.anular') then
      raise exception 'No tenés permiso para anular ventas' using errcode = '42501';
    end if;
    if nullif(btrim(p_motivo), '') is null then
      raise exception 'El motivo es obligatorio para anular una venta' using errcode = '23514';
    end if;
    if exists (select 1 from public.cobros_venta where venta_id = p_venta) then
      raise exception 'La venta tiene un cobro registrado: facturala y emití una Nota de Crédito por el total para anularla'
        using errcode = '22023';
    end if;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad - cantidad_backorder))
      filter (where cantidad - cantidad_backorder > 0), '[]'::jsonb
  ) into v_items from public.detalle_venta where venta_id = p_venta;
  if p_estado_nuevo = 'Entregada' then
    perform public.egresar_comprometido(
      v_venta.deposito_id, v_items, 'Egreso por venta entregada · Venta #' || v_venta.numero
    );
  elsif p_estado_nuevo = 'Anulada' then
    perform public.liberar_stock(v_venta.deposito_id, v_items);
  end if;

  update public.ventas set estado = p_estado_nuevo where id = p_venta returning * into v_venta;
  insert into public.historial_estado_venta (venta_id, estado_anterior, estado_nuevo, motivo, usuario_id)
  values (p_venta, v_estado_anterior, p_estado_nuevo, p_motivo, auth.uid());
  return next v_venta;
end;
$$;
revoke all on function public.cambiar_estado_venta(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cambiar_estado_venta(uuid, text, text) to authenticated;

-- Nota de crédito de una venta Ecommerce cancela el comprobante, pero no
-- libera stock: pedidos_web es responsable del stock reservado y egresado.
create or replace function public.fn_anular_venta_por_nota_credito()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_venta public.ventas;
  v_items jsonb;
  v_total_factura numeric(14,2);
  v_total_acreditado numeric(14,2);
begin
  select * into v_venta from public.ventas where id = new.venta_id for update;
  if v_venta.estado is distinct from 'Facturada' then return new; end if;

  if new.comprobante_asociado_id is not null then
    select f.total into v_total_factura from public.comprobantes_venta f
     where f.id = new.comprobante_asociado_id and f.tipo_comprobante = 'factura';
    select coalesce(sum(nc.total), 0) into v_total_acreditado from public.comprobantes_venta nc
     where nc.comprobante_asociado_id = new.comprobante_asociado_id
       and nc.tipo_comprobante = 'nota_credito' and nc.estado = 'Emitido';
    if v_total_factura is null or v_total_acreditado < v_total_factura then return new; end if;
  elsif new.total is distinct from v_venta.total then
    return new;
  end if;

  if v_venta.origen <> 'ecommerce' then
    select coalesce(
      jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad - cantidad_backorder))
        filter (where cantidad - cantidad_backorder > 0), '[]'::jsonb
    ) into v_items from public.detalle_venta where venta_id = new.venta_id;
    perform public.liberar_stock(v_venta.deposito_id, v_items);
  end if;
  update public.ventas set estado = 'Anulada' where id = new.venta_id;
  insert into public.historial_estado_venta (venta_id, estado_anterior, estado_nuevo, motivo, usuario_id)
  values (new.venta_id, 'Facturada', 'Anulada', 'Nota de crédito por el total', auth.uid());
  return new;
end;
$$;

-- Los cobros unificados se reportan desde detalle_cobro. El pedido queda como
-- respaldo sólo cuando todavía no tiene una venta asociada (compatibilidad).
create or replace function public.informe_ingresos(
  p_desde date, p_hasta date, p_agrupacion text default 'mes',
  p_deposito_ids uuid[] default null, p_medios text[] default null
)
returns table (
  periodo_inicio date, periodo_fin date, sucursal_id uuid, sucursal_nombre text,
  fuente text, medio_pago text, monto numeric
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_desde date;
  v_hasta date;
begin
  if not public.usuario_tiene_permiso('informes.ver') then
    raise exception 'No tenés permiso para ver informes' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;
  if p_agrupacion not in ('semana', 'mes', 'total') then
    raise exception 'La agrupación debe ser semana, mes o total' using errcode = '22023';
  end if;

  v_desde := public.informe_inicio_periodo(p_desde, p_agrupacion);
  v_hasta := case when p_agrupacion = 'total' then p_hasta else
    public.informe_fin_periodo(public.informe_inicio_periodo(p_hasta, p_agrupacion), p_agrupacion) end;

  return query
  with movimientos as (
    select (cv.created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
           case when v.origen = 'ecommerce' then v.deposito_id else coalesce(pv.deposito_id, v.deposito_id) end as deposito_id,
           case when v.origen = 'ecommerce' then 'tienda'::text else 'mostrador'::text end as fuente,
           mp.nombre as medio, dc.monto
      from public.detalle_cobro dc
      join public.cobros_venta cv on cv.id = dc.cobro_id
      join public.ventas v on v.id = cv.venta_id
      join public.medios_pago mp on mp.id = dc.medio_pago_id
      left join public.sesiones_caja sc on sc.id = cv.sesion_caja_id
      left join public.cajas c on c.id = coalesce(cv.caja_id, sc.caja_id)
      left join public.puntos_venta pv on pv.id = c.punto_venta_id
     where lower(mp.nombre) <> 'cuenta corriente'

    union all

    select r.fecha, pv.deposito_id, 'cuenta_corriente', mp.nombre, dmr.monto
      from public.detalle_medio_recibo dmr
      join public.recibos_cobranza_cliente r on r.id = dmr.recibo_id
      join public.medios_pago mp on mp.id = dmr.medio_pago_id
      left join public.sesiones_caja sc on sc.id = r.sesion_caja_id
      left join public.cajas c on c.id = sc.caja_id
      left join public.puntos_venta pv on pv.id = c.punto_venta_id
     where r.estado <> 'anulado'

    union all

    select (pw.pagado_at at time zone 'America/Argentina/Buenos_Aires')::date,
           pw.deposito_id, 'tienda', 'Pago online', pw.total
      from public.pedidos_web pw
     where pw.pagado_at is not null
       and not exists (select 1 from public.ventas v where v.pedido_web_id = pw.id)

    union all

    select (mc.created_at at time zone 'America/Argentina/Buenos_Aires')::date,
           pv.deposito_id, 'caja_manual', mp.nombre, mc.monto
      from public.movimientos_caja mc
      join public.medios_pago mp on mp.id = mc.medio_pago_id
      join public.sesiones_caja sc on sc.id = mc.sesion_caja_id
      join public.cajas c on c.id = coalesce(mc.caja_id, sc.caja_id)
      join public.puntos_venta pv on pv.id = c.punto_venta_id
     where mc.tipo = 'ingreso' and mc.origen = 'manual'
  )
  select case when p_agrupacion = 'total' then v_desde else public.informe_inicio_periodo(m.fecha, p_agrupacion) end,
         case when p_agrupacion = 'total' then v_hasta else
           public.informe_fin_periodo(public.informe_inicio_periodo(m.fecha, p_agrupacion), p_agrupacion) end,
         m.deposito_id, coalesce(d.nombre, 'Sin sucursal'), m.fuente, m.medio,
         sum(m.monto)::numeric(14,2)
    from movimientos m
    left join public.depositos d on d.id = m.deposito_id
   where m.fecha between v_desde and v_hasta
     and (p_deposito_ids is null or m.deposito_id = any(p_deposito_ids))
     and (p_medios is null or m.medio = any(p_medios))
   group by 1, 2, 3, 4, 5, 6
   order by 1, 4, 5, 6;
end;
$$;
revoke all on function public.informe_ingresos(date, date, text, uuid[], text[]) from public, anon;
grant execute on function public.informe_ingresos(date, date, text, uuid[], text[]) to authenticated;

commit;
