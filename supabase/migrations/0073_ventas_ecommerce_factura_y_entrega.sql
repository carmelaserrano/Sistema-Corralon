-- ============================================================================
-- 0073 · Ventas Ecommerce: factura automática y entrega sincronizada
--
-- Con 0072 la venta de una compra web quedaba "Pendiente" para siempre: nadie
-- la facturaba y no podía pasar a "Entregada" (su entrega se gestiona en
-- pedidos web). En Ventas parecía trabada aunque estuviera pagada y entregada.
--
--   1. Al aprobarse el pago, el sistema emite la factura (como el cobro de
--      mostrador desde 0070). Si la emisión falla, el pago igual se acepta y la
--      venta queda Pendiente para facturarla a mano: un problema fiscal no debe
--      rechazarle el pago al cliente.
--   2. Cuando el pedido web pasa a "Entregado", su venta pasa a "Entregada".
--      No mueve stock: el egreso ya lo hizo el pedido (0063).
--   3. Las ventas Ecommerce existentes se ponen al día con las mismas reglas.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Factura emitida por el sistema
-- ----------------------------------------------------------------------------
-- emitir_comprobante exige el permiso ventas.facturar del usuario, y en el pago
-- web el usuario es el cliente (o nadie, si confirma la pasarela). Esta función
-- repite su rama de factura (0065: letra A/B, punto de venta y numeración) solo
-- para ventas Ecommerce cobradas, y no la puede llamar ningún usuario.
create or replace function public.fn_facturar_venta_ecommerce(p_venta uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta          public.ventas;
  v_factura_id     uuid;
  v_total_cobrado  numeric(14,2);
  v_condicion_iva  text;
  v_letra          text;
  v_punto_venta_id uuid;
  v_numero         bigint;
  v_neto           numeric(14,2);
  v_iva            numeric(14,2);
begin
  select * into v_venta from public.ventas where id = p_venta for update;
  if not found or v_venta.origen is distinct from 'ecommerce' then
    raise exception 'La venta no es una venta Ecommerce' using errcode = '22023';
  end if;

  -- Idempotente: si ya tiene factura, devuelve esa.
  select c.id into v_factura_id
    from public.comprobantes_venta c
   where c.venta_id = p_venta and c.tipo_comprobante = 'factura' and c.estado = 'Emitido';
  if v_factura_id is not null then return v_factura_id; end if;

  if v_venta.estado <> 'Pendiente' then
    raise exception 'La venta no está en estado Pendiente' using errcode = '22023';
  end if;

  select coalesce(sum(c.total), 0) into v_total_cobrado
    from public.cobros_venta c where c.venta_id = p_venta;
  if v_total_cobrado < v_venta.total then
    raise exception 'La venta Ecommerce no está cobrada' using errcode = '22023';
  end if;

  select ci.nombre into v_condicion_iva
    from public.clientes c
    join public.condiciones_iva ci on ci.id = c.condicion_iva_id
   where c.id = v_venta.cliente_id;
  v_letra := case when lower(btrim(coalesce(v_condicion_iva, ''))) = 'responsable inscripto' then 'A' else 'B' end;

  -- Mismo criterio que emitir_comprobante: el punto de venta del depósito y,
  -- si el depósito no tiene ninguno, el general.
  select pv.id into v_punto_venta_id
    from public.puntos_venta pv
   where pv.activo and pv.deposito_id = v_venta.deposito_id;
  if v_punto_venta_id is null and not exists (
    select 1 from public.puntos_venta pv where pv.deposito_id = v_venta.deposito_id
  ) then
    select pv.id into v_punto_venta_id
      from public.puntos_venta pv
     where pv.activo and pv.deposito_id is null
     order by pv.numero
     limit 1;
  end if;
  if v_punto_venta_id is null then
    raise exception 'No hay un punto de venta activo configurado para la sucursal de la venta'
      using errcode = '22023';
  end if;

  v_numero := public.siguiente_numero_comprobante(v_punto_venta_id, 'factura', v_letra);
  v_neto := round(v_venta.total / 1.21, 2);
  v_iva := round(v_venta.total - v_neto, 2);

  -- trg_facturar_venta_automatico (0039) pasa la venta a Facturada.
  insert into public.comprobantes_venta (
    venta_id, tipo_comprobante, letra, punto_venta_id, numero,
    neto, iva, total, cae, cae_vencimiento, estado
  ) values (
    p_venta, 'factura', v_letra, v_punto_venta_id, v_numero,
    v_neto, v_iva, v_venta.total, 'HOMOLOGACIÓN', current_date + 10, 'Emitido'
  ) returning id into v_factura_id;

  return v_factura_id;
end;
$$;
revoke all on function public.fn_facturar_venta_ecommerce(uuid) from public, anon, authenticated;

-- Intenta facturar sin cortar la operación que la llama: el bloque con
-- exception deshace solo la emisión fallida (factura y numeración).
create or replace function public.fn_intentar_facturar_venta_ecommerce(p_venta uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_facturar_venta_ecommerce(p_venta);
  return true;
exception
  when others then
    raise warning 'No se pudo facturar automáticamente la venta Ecommerce %: %', p_venta, sqlerrm;
    return false;
end;
$$;
revoke all on function public.fn_intentar_facturar_venta_ecommerce(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Pago aprobado: venta, cobro y factura
-- ----------------------------------------------------------------------------
-- Igual que 0072, más la factura automática después de registrar la venta.
create or replace function pago_interno.confirmar_pago_pedido(
  p_pedido uuid, p_referencia text, p_estado text, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pedido public.pedidos_web%rowtype;
  v_venta_id uuid;
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

    v_venta_id := public.fn_registrar_venta_desde_pedido_web(p_pedido);
    if v_venta_id is not null then
      perform public.fn_intentar_facturar_venta_ecommerce(v_venta_id);
    end if;

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

-- ----------------------------------------------------------------------------
-- 3. Pedido entregado → venta entregada
-- ----------------------------------------------------------------------------
-- Si la venta todavía no tenía factura (falló la automática), se intenta
-- emitirla antes; sin factura queda Pendiente y se resuelve a mano.
create or replace function public.fn_sincronizar_venta_con_pedido_web()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta public.ventas;
begin
  select * into v_venta
    from public.ventas
   where pedido_web_id = new.id and origen = 'ecommerce'
   for update;
  if not found then return new; end if;

  if v_venta.estado = 'Pendiente' then
    perform public.fn_intentar_facturar_venta_ecommerce(v_venta.id);
    select * into v_venta from public.ventas where id = v_venta.id;
  end if;

  if v_venta.estado = 'Facturada' then
    update public.ventas set estado = 'Entregada' where id = v_venta.id;
    insert into public.historial_estado_venta (venta_id, estado_anterior, estado_nuevo, motivo, usuario_id)
    values (v_venta.id, 'Facturada', 'Entregada', 'Pedido web N.º ' || new.numero || ' entregado', auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.fn_sincronizar_venta_con_pedido_web() from public, anon, authenticated;

drop trigger if exists trg_pedidos_web_sincronizar_venta on public.pedidos_web;
create trigger trg_pedidos_web_sincronizar_venta
  after update of estado on public.pedidos_web
  for each row
  when (new.estado = 'Entregado' and old.estado is distinct from 'Entregado')
  execute function public.fn_sincronizar_venta_con_pedido_web();

-- ----------------------------------------------------------------------------
-- 4. Puesta al día de las ventas Ecommerce existentes
-- ----------------------------------------------------------------------------
do $$
declare
  v_fila record;
begin
  for v_fila in
    select v.id from public.ventas v
     where v.origen = 'ecommerce' and v.estado = 'Pendiente'
     order by v.created_at, v.id
  loop
    perform public.fn_intentar_facturar_venta_ecommerce(v_fila.id);
  end loop;

  for v_fila in
    select v.id, pw.numero
      from public.ventas v
      join public.pedidos_web pw on pw.id = v.pedido_web_id
     where v.origen = 'ecommerce' and v.estado = 'Facturada' and pw.estado = 'Entregado'
  loop
    update public.ventas set estado = 'Entregada' where id = v_fila.id;
    insert into public.historial_estado_venta (venta_id, estado_anterior, estado_nuevo, motivo, usuario_id)
    values (v_fila.id, 'Facturada', 'Entregada', 'Pedido web N.º ' || v_fila.numero || ' entregado', null);
  end loop;
end;
$$;

commit;
