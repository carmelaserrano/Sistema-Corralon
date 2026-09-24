-- S3-18: checkout web, confirmacion idempotente de pagos y expiracion.
begin;

alter table public.pedidos_web
  add column if not exists checkout_id uuid,
  add column if not exists preferencia_pago_id text,
  add column if not exists ultimo_pago_referencia text,
  add column if not exists pago_estado text,
  add column if not exists pago_motivo text,
  add column if not exists vence_at timestamptz,
  add column if not exists pagado_at timestamptz,
  add column if not exists cancelado_at timestamptz;

create unique index if not exists ux_pedido_web_checkout
  on public.pedidos_web (checkout_id) where checkout_id is not null;
create unique index if not exists ux_pedido_web_pago_aprobado
  on public.pedidos_web (referencia_pago) where referencia_pago is not null;
create index if not exists ix_pedido_web_expiracion
  on public.pedidos_web (vence_at)
  where estado = 'Pendiente de pago';

-- Crea un pedido usando exclusivamente el carrito persistido del usuario.
-- p_datos: {checkout_id, tipo_entrega, domicilio_id?}.
-- Devuelve el pedido creado y el deposito asignado automaticamente.
create or replace function public.crear_pedido_web(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
  v_cliente public.clientes%rowtype;
  v_carrito uuid;
  v_checkout uuid;
  v_tipo text;
  v_domicilio uuid;
  v_deposito uuid;
  v_deposito_nombre text;
  v_items jsonb;
  v_cantidad_items integer;
  v_total numeric(14,2);
  v_no_disponible text;
  v_pedido public.pedidos_web%rowtype;
begin
  if v_usuario is null then
    raise exception 'Necesitás iniciar sesión para comprar' using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos del checkout no son válidos';
  end if;

  begin
    v_checkout := (p_datos->>'checkout_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'El identificador del checkout no es válido';
  end;
  if v_checkout is null then raise exception 'Falta el identificador del checkout'; end if;

  v_tipo := lower(btrim(coalesce(p_datos->>'tipo_entrega', '')));
  if v_tipo not in ('retiro', 'envio') then
    raise exception 'Elegí retiro en sucursal o envío';
  end if;

  select * into v_cliente
  from public.clientes
  where usuario_web_id = v_usuario
  for update;
  if not found then raise exception 'No existe un cliente asociado a tu cuenta' using errcode = '42501'; end if;
  if v_cliente.estado <> 'Activo' then
    raise exception 'Tu cuenta no está habilitada para realizar compras' using errcode = '42501';
  end if;

  select * into v_pedido from public.pedidos_web
  where checkout_id = v_checkout and cliente_id = v_cliente.id;
  if found then
    select nombre into v_deposito_nombre from public.depositos where id = v_pedido.deposito_id;
    return to_jsonb(v_pedido) || jsonb_build_object('deposito_nombre', v_deposito_nombre);
  end if;

  if v_tipo = 'envio' then
    begin
      v_domicilio := (p_datos->>'domicilio_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'El domicilio seleccionado no es válido';
    end;
    if v_domicilio is null or not exists (
      select 1 from public.domicilios_cliente
      where id = v_domicilio and cliente_id = v_cliente.id and activo
    ) then
      raise exception 'Elegí un domicilio activo para el envío';
    end if;
  else
    v_domicilio := null;
  end if;

  select id into v_carrito from public.carritos
  where cliente_id = v_cliente.id for update;
  if v_carrito is null then raise exception 'Tu carrito está vacío'; end if;

  select p.nombre into v_no_disponible
  from public.items_carrito ic
  left join public.v_catalogo_web c on c.id = ic.producto_id
  left join public.productos p on p.id = ic.producto_id
  where ic.carrito_id = v_carrito
    and (c.id is null or c.precio is null or c.precio <= 0)
  order by p.nombre nulls last
  limit 1;
  if found then
    raise exception 'El producto % ya no está disponible', coalesce(v_no_disponible, 'seleccionado');
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'producto_id', ic.producto_id,
      'cantidad', ic.cantidad,
      'precio_unitario', c.precio,
      'nombre', c.nombre
    ) order by ic.producto_id), '[]'::jsonb),
    count(*),
    coalesce(round(sum(ic.cantidad * c.precio), 2), 0)
  into v_items, v_cantidad_items, v_total
  from public.items_carrito ic
  join public.v_catalogo_web c on c.id = ic.producto_id
  where ic.carrito_id = v_carrito;

  if v_cantidad_items = 0 then raise exception 'Tu carrito está vacío'; end if;

  -- Un pedido se prepara completo en un solo deposito. Se elige en forma
  -- deterministica el que deja mayor stock total luego de reservar.
  select s.deposito_id, d.nombre
  into v_deposito, v_deposito_nombre
  from public.stock_x_deposito s
  join public.depositos d on d.id = s.deposito_id
  join jsonb_to_recordset(v_items) as i(producto_id uuid, cantidad numeric)
    on i.producto_id = s.producto_id
  where s.cantidad - s.comprometido >= i.cantidad
  group by s.deposito_id, d.nombre
  having count(*) = v_cantidad_items
  order by sum(s.cantidad - s.comprometido - i.cantidad) desc, s.deposito_id
  limit 1;

  if v_deposito is null then
    select i.nombre into v_no_disponible
    from jsonb_to_recordset(v_items) as i(producto_id uuid, cantidad numeric, nombre text)
    where not exists (
      select 1 from public.stock_x_deposito s
      where s.producto_id = i.producto_id
        and s.cantidad - s.comprometido >= i.cantidad
    )
    order by i.nombre limit 1;
    if v_no_disponible is not null then
      raise exception 'Stock insuficiente para %', v_no_disponible using errcode = 'P0001';
    end if;
    raise exception 'No hay una sucursal con stock suficiente para preparar todo el pedido' using errcode = 'P0001';
  end if;

  -- Esta llamada bloquea el stock y vuelve a validar la disponibilidad. Si
  -- falla por una compra concurrente, toda la transaccion se revierte.
  perform public.comprometer_stock(v_deposito, v_items);

  insert into public.pedidos_web (
    cliente_id, deposito_id, tipo_entrega, domicilio_id, estado, total,
    checkout_id, pago_estado, vence_at
  ) values (
    v_cliente.id, v_deposito, v_tipo, v_domicilio, 'Pendiente de pago', v_total,
    v_checkout, 'pending', now() + interval '60 minutes'
  ) returning * into v_pedido;

  insert into public.detalle_pedido_web (pedido_id, producto_id, cantidad, precio_unitario)
  select v_pedido.id, i.producto_id, i.cantidad, i.precio_unitario
  from jsonb_to_recordset(v_items)
    as i(producto_id uuid, cantidad numeric, precio_unitario numeric);

  insert into public.historial_estado_pedido (pedido_id, estado_anterior, estado_nuevo, motivo)
  values (v_pedido.id, null, 'Pendiente de pago', 'Pedido creado desde la tienda web');

  return to_jsonb(v_pedido) || jsonb_build_object('deposito_nombre', v_deposito_nombre);
end;
$$;

revoke all on function public.crear_pedido_web(jsonb) from public;
grant execute on function public.crear_pedido_web(jsonb) to authenticated;

-- Asocia la preferencia creada por Mercado Pago. Solo la Edge Function usa
-- esta funcion con service_role.
create or replace function public.registrar_preferencia_pago(p_pedido uuid, p_preferencia text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_pedido public.pedidos_web%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  if nullif(btrim(p_preferencia), '') is null then raise exception 'La preferencia es obligatoria'; end if;
  select * into v_pedido from public.pedidos_web where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if v_pedido.estado <> 'Pendiente de pago' or v_pedido.vence_at <= now() then
    raise exception 'El pedido ya no admite pagos';
  end if;
  update public.pedidos_web set preferencia_pago_id = p_preferencia
  where id = p_pedido returning * into v_pedido;
  return to_jsonb(v_pedido);
end;
$$;
revoke all on function public.registrar_preferencia_pago(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_preferencia_pago(uuid, text) to service_role;

-- Confirma el estado consultado directamente a Mercado Pago. El bloqueo y
-- los estados terminales hacen idempotente una notificacion repetida.
create or replace function public.confirmar_pago_pedido(
  p_pedido uuid,
  p_referencia text,
  p_estado text,
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos_web%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  if nullif(btrim(p_referencia), '') is null then raise exception 'La referencia de pago es obligatoria'; end if;
  if p_estado not in ('approved', 'rejected', 'cancelled', 'pending', 'in_process') then
    raise exception 'Estado de pago no reconocido';
  end if;

  select * into v_pedido from public.pedidos_web where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe'; end if;

  -- Una aprobacion o cancelacion ya procesada no se repite ni se degrada.
  if v_pedido.estado in ('Pagado', 'Cancelado') then return to_jsonb(v_pedido); end if;

  if p_estado = 'approved' then
    update public.pedidos_web
    set estado = 'Pagado', referencia_pago = p_referencia,
        ultimo_pago_referencia = p_referencia, pago_estado = p_estado,
        pago_motivo = null, pagado_at = now()
    where id = p_pedido returning * into v_pedido;

    insert into public.historial_estado_pedido (pedido_id, estado_anterior, estado_nuevo, motivo)
    values (p_pedido, 'Pendiente de pago', 'Pagado', 'Pago online aprobado');

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
revoke all on function public.confirmar_pago_pedido(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.confirmar_pago_pedido(uuid, text, text, text) to service_role;

-- Cancela pedidos vencidos y libera sus reservas sin depender del JWT de un
-- usuario interno. El FOR UPDATE evita competir con una aprobacion de pago.
create or replace function public.cancelar_pedidos_web_vencidos()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido record;
  v_linea record;
  v_cancelados integer := 0;
begin
  for v_pedido in
    select id, deposito_id from public.pedidos_web
    where estado = 'Pendiente de pago' and vence_at <= now()
    order by vence_at
    for update skip locked
  loop
    for v_linea in
      select producto_id, cantidad from public.detalle_pedido_web where pedido_id = v_pedido.id
    loop
      update public.stock_x_deposito
      set comprometido = comprometido - v_linea.cantidad, updated_at = now()
      where deposito_id = v_pedido.deposito_id
        and producto_id = v_linea.producto_id
        and comprometido >= v_linea.cantidad;
      if not found then raise exception 'No se pudo liberar la reserva del pedido %', v_pedido.id; end if;
    end loop;

    update public.pedidos_web
    set estado = 'Cancelado', pago_estado = 'expired', pago_motivo = 'Tiempo de pago agotado', cancelado_at = now()
    where id = v_pedido.id;
    insert into public.historial_estado_pedido (pedido_id, estado_anterior, estado_nuevo, motivo)
    values (v_pedido.id, 'Pendiente de pago', 'Cancelado', 'Pedido sin pago después de 60 minutos');
    v_cancelados := v_cancelados + 1;
  end loop;
  return v_cancelados;
end;
$$;
revoke all on function public.cancelar_pedidos_web_vencidos() from public, anon, authenticated;
grant execute on function public.cancelar_pedidos_web_vencidos() to service_role;

-- Supabase incluye pg_cron. El nombre fijo permite reaplicar la migracion en
-- entornos de prueba sin duplicar el trabajo programado.
create extension if not exists pg_cron;
do $$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname = 'expirar-pedidos-web' loop
    perform cron.unschedule(v_job);
  end loop;
  perform cron.schedule(
    'expirar-pedidos-web',
    '*/5 * * * *',
    'select public.cancelar_pedidos_web_vencidos();'
  );
end;
$$;

commit;
