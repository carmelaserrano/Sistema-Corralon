-- Issue #136 · CA-08
-- Cierra los accesos directos a cambios de estado y a las primitivas de
-- stock. También evita que una notificación de pago tardía o repetida haga
-- retroceder un pedido que ya salió de Pendiente de pago.

begin;

-- Hasta que exista un flujo de reembolso, sólo se puede cancelar un pedido
-- que todavía esté pendiente de pago.
create or replace function public.transicion_pedido_permitida(
  p_desde text,
  p_hasta text,
  p_tipo_entrega text
)
returns boolean
language sql
immutable
as $$
  select (p_desde, p_hasta) in (
      ('Pendiente de pago', 'Cancelado'),
      ('Pagado', 'En preparación'),
      ('Listo para retirar', 'Entregado'),
      ('Enviado', 'Entregado')
    )
    or (p_desde = 'En preparación' and p_tipo_entrega = 'retiro' and p_hasta = 'Listo para retirar')
    or (p_desde = 'En preparación' and p_tipo_entrega = 'envio' and p_hasta = 'Enviado');
$$;

-- La pasarela sólo puede sacar al pedido de Pendiente de pago. Cualquier
-- notificación posterior es idempotente y no modifica ni el estado operativo
-- ni los datos del último pago aprobado.
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

  if v_pedido.estado is distinct from 'Pendiente de pago' then
    return to_jsonb(v_pedido);
  end if;

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

-- Al cerrar UPDATE directo y las primitivas, las funciones de negocio que
-- coordinan stock y estado deben ejecutar como su owner (postgres). Ambas
-- conservan sus validaciones explícitas de permisos y su search_path previo.
alter function public.avanzar_estado_pedido(uuid, text, text) security definer;

-- cambiar_estado_venta pasa a SECURITY DEFINER porque llama a las primitivas
-- de stock revocadas arriba. Sin RLS de por medio, el acceso se restringe
-- explícitamente a usuarios internos ANTES de leer la venta, para que un
-- cliente web no pueda sondear ventas ni sus estados. El resto del cuerpo es
-- el de 0039 sin cambios.
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
  elsif p_estado_nuevo = 'Anulada' then
    if not public.usuario_tiene_permiso('ventas.anular') then
      raise exception 'No tenés permiso para anular ventas'
        using errcode = '42501';
    end if;
    if nullif(btrim(p_motivo), '') is null then
      raise exception 'El motivo es obligatorio para anular una venta'
        using errcode = '23514';
    end if;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad)),
    '[]'::jsonb
  )
    into v_items
  from public.detalle_venta
  where venta_id = p_venta;

  if p_estado_nuevo = 'Entregada' then
    perform public.egresar_comprometido(v_venta.deposito_id, v_items);
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

-- El backoffice sólo cambia pedidos mediante avanzar_estado_pedido. Se quita
-- además la policy para que una futura concesión accidental de UPDATE no
-- vuelva a abrir el bypass.
revoke update on table public.pedidos_web from public, anon, authenticated;
drop policy if exists "pedidos_web_update_interno" on public.pedidos_web;

-- Las primitivas quedan disponibles únicamente para su owner. Los wrappers
-- SECURITY DEFINER y los triggers SECURITY DEFINER pueden seguir llamándolas,
-- pero no son invocables por la Data API.
revoke all on function public.liberar_stock(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.egresar_comprometido(uuid, jsonb)
  from public, anon, authenticated, service_role;

-- ACL explícita para los dos endpoints de negocio expuestos.
revoke all on function public.avanzar_estado_pedido(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.avanzar_estado_pedido(uuid, text, text)
  to authenticated;

revoke all on function public.cambiar_estado_venta(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cambiar_estado_venta(uuid, text, text)
  to authenticated;

revoke all on function public.confirmar_pago_pedido(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.confirmar_pago_pedido(uuid, text, text, text)
  to service_role;

-- Verificación de cierre: si algún nombre de policy o grant cambió y el
-- bypass sigue abierto, la migración falla en lugar de pasar en silencio.
do $$
begin
  if has_table_privilege('authenticated', 'public.pedidos_web', 'UPDATE')
     or has_table_privilege('anon', 'public.pedidos_web', 'UPDATE') then
    raise exception 'pedidos_web conserva UPDATE directo para authenticated/anon';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'pedidos_web'
       and cmd in ('UPDATE', 'INSERT', 'ALL')
  ) then
    raise exception 'pedidos_web conserva una policy de escritura';
  end if;
end $$;

commit;
