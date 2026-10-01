-- Issue #136 · CA-04 / CA-08
-- El e-commerce opera exclusivamente con cantidades enteras mayores a cero.
-- La validación se repite en el carrito y en el checkout para que una fila
-- histórica inválida nunca pueda reservar stock ni convertirse en pedido.

begin;

-- Las constraints protegen también las escrituras directas. NOT VALID evita
-- bloquear el despliegue si existiera un carrito o pedido histórico decimal;
-- PostgreSQL igualmente las aplica a todas las filas nuevas o modificadas.
alter table public.items_carrito
  drop constraint if exists items_carrito_cantidad_entera;
alter table public.items_carrito
  add constraint items_carrito_cantidad_entera
  check (
    cantidad::text not in ('NaN', 'Infinity', '-Infinity')
    and cantidad = trunc(cantidad)
  ) not valid;

alter table public.detalle_pedido_web
  drop constraint if exists detalle_pedido_web_cantidad_entera;
alter table public.detalle_pedido_web
  add constraint detalle_pedido_web_cantidad_entera
  check (
    cantidad::text not in ('NaN', 'Infinity', '-Infinity')
    and cantidad = trunc(cantidad)
  ) not valid;

-- Devuelve el carrito enriquecido y ajustado al stock del depósito web.
-- [] sigue siendo válido para permitir vaciar el carrito; cada línea presente
-- debe tener una cantidad entera mayor a cero.
create or replace function public.validar_carrito_web(p_items jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_cantidad numeric;
  v_stock numeric;
  v_producto record;
  v_motivo text;
  v_resultado jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'El carrito debe ser una lista de productos';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item->'cantidad') is distinct from 'number'
       or v_item->>'producto_id' is null then
      raise exception 'Cada ítem necesita producto_id y una cantidad numérica';
    end if;

    v_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    if v_cantidad::text in ('NaN', 'Infinity', '-Infinity')
       or v_cantidad <= 0
       or v_cantidad <> trunc(v_cantidad) then
      raise exception 'La cantidad debe ser un número entero mayor a cero'
        using errcode = '22023';
    end if;
  end loop;

  for v_id, v_cantidad in
    select (value->>'producto_id')::uuid, sum((value->>'cantidad')::numeric)
    from jsonb_array_elements(p_items) with ordinality
    group by (value->>'producto_id')::uuid
    order by min(ordinality)
  loop
    select * into v_producto from public.v_catalogo_web where id = v_id;
    v_motivo := null;
    v_stock := 0;
    if not found then
      v_motivo := 'Producto no disponible';
    elsif v_producto.precio is null or v_producto.precio <= 0 then
      v_motivo := 'Sin precio disponible';
    else
      -- Solo se ofrecen unidades completas aunque una existencia histórica
      -- tuviera decimales; no se modifica el modelo global de stock.
      select trunc(coalesce(sum(greatest(cantidad - comprometido, 0)), 0))
      into v_stock from public.stock_x_deposito
      where producto_id = v_id
        and deposito_id = (
          select (pv.valor ->> 'deposito_id')::uuid
            from public.parametros_ventas pv
           where pv.clave = 'deposito_ecommerce'
        );
      if v_stock < 1 then v_motivo := 'Sin stock'; end if;
    end if;

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
      'producto_id', v_id,
      'cantidad', case when v_motivo is null then least(v_cantidad, v_stock) else v_cantidad end,
      'nombre', coalesce(v_producto.nombre, 'Producto no disponible'),
      'imagen_url', v_producto.imagen_url,
      'precio', v_producto.precio,
      'disponible', v_motivo is null,
      'motivo', v_motivo,
      'ajustado', v_motivo is null and v_cantidad > v_stock
    ));
  end loop;

  return v_resultado;
end;
$$;

revoke all on function public.validar_carrito_web(jsonb) from public;
grant execute on function public.validar_carrito_web(jsonb) to anon, authenticated;

-- Crea el pedido desde el carrito persistido. Además de las validaciones
-- originales, rechaza cantidades no enteras antes de calcular el total o
-- llamar a comprometer_stock.
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
  v_cantidad_invalida text;
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

  select coalesce(p.nombre, 'seleccionado') into v_cantidad_invalida
  from public.items_carrito ic
  left join public.productos p on p.id = ic.producto_id
  where ic.carrito_id = v_carrito
    and (
      ic.cantidad::text in ('NaN', 'Infinity', '-Infinity')
      or ic.cantidad <= 0
      or ic.cantidad <> trunc(ic.cantidad)
    )
  order by p.nombre nulls last
  limit 1;
  if found then
    raise exception 'La cantidad de % debe ser un número entero mayor a cero', v_cantidad_invalida
      using errcode = '22023';
  end if;

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

  select d.id, d.nombre
  into v_deposito, v_deposito_nombre
  from public.parametros_ventas pv
  join public.depositos d on d.id = (pv.valor ->> 'deposito_id')::uuid
  where pv.clave = 'deposito_ecommerce';
  if v_deposito is null then
    raise exception 'La tienda no tiene un depósito configurado para despachar pedidos';
  end if;

  select i.nombre into v_no_disponible
  from jsonb_to_recordset(v_items) as i(producto_id uuid, cantidad numeric, nombre text)
  where not exists (
    select 1 from public.stock_x_deposito s
    where s.producto_id = i.producto_id
      and s.deposito_id = v_deposito
      and s.cantidad - s.comprometido >= i.cantidad
  )
  order by i.nombre limit 1;
  if v_no_disponible is not null then
    raise exception 'Stock insuficiente para %', v_no_disponible using errcode = 'P0001';
  end if;

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

commit;
