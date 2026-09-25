-- ============================================================================
-- 0051 · S3-16: Seguimiento del estado del pedido web
--
-- Historia: el cliente web rastrea en qué etapa está su compra, y el
-- backoffice avanza el pedido por su ciclo de vida.
--
-- Ciclo de vida (CA-02):
--   Pendiente de pago → Pagado → En preparación → Listo para retirar (retiro)
--                                              → Enviado          (envío)
--                                              → Entregado
--   Desde Pendiente de pago o Pagado se puede pasar a Cancelado (CA-04).
--
-- Quién mueve cada paso:
--   - Pendiente de pago → Pagado: SOLO la pasarela (confirmar_pago_pedido,
--     0050). Acá se rechaza explícitamente para que nadie marque a mano un
--     pedido como pagado sin cobro confirmado.
--   - Pendiente de pago → Cancelado por vencimiento: cron de 0050.
--   - El resto: una persona con 'ecommerce.pedidos.gestionar' desde
--     Pedidos web, con avanzar_estado_pedido (CA-03).
--
-- Historial: igual que 0050, cada función escribe su propia fila en
-- historial_estado_pedido. No se agrega un trigger sobre pedidos_web porque
-- duplicaría las filas que ya inserta el checkout.
--
-- Stock: los pedidos creados por crear_pedido_web (0050) reservan stock con
-- comprometer_stock y quedan con checkout_id. Al cancelar se libera la
-- reserva (liberar_stock, CA-04) y al entregar se egresa (egresar_comprometido,
-- mismo criterio que cambiar_estado_venta en 0039). Los dos pedidos seed de
-- 0033 se insertaron directo, sin reservar stock y sin checkout_id: para
-- ellos no se toca el stock, porque liberar o egresar una reserva que nunca
-- existió violaría stock_x_deposito_comprometido_nonneg.
--
-- CA-05 (un cliente no ve pedidos ajenos) ya lo resuelven las policies
-- *_select_propio de 0033 sobre pedidos_web, detalle_pedido_web e
-- historial_estado_pedido. Esta migración no las toca.
-- ============================================================================

begin;

-- ============================================================================
-- 1) Matriz de transiciones manuales (CA-03)
-- ============================================================================
-- El siguiente paso después de En preparación depende del tipo de entrega:
-- un pedido para retirar nunca pasa por Enviado, y uno con envío nunca
-- queda Listo para retirar. Entregado y Cancelado son estados finales.
--
-- @param p_desde text estado actual del pedido.
-- @param p_hasta text estado al que se quiere pasar.
-- @param p_tipo_entrega text 'retiro' | 'envio'.
-- @returns boolean true si una persona puede hacer esa transición.
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
      ('Pagado', 'Cancelado'),
      ('Listo para retirar', 'Entregado'),
      ('Enviado', 'Entregado')
    )
    or (p_desde = 'En preparación' and p_tipo_entrega = 'retiro' and p_hasta = 'Listo para retirar')
    or (p_desde = 'En preparación' and p_tipo_entrega = 'envio' and p_hasta = 'Enviado');
$$;


-- ============================================================================
-- 2) avanzar_estado_pedido — CA-03, CA-04
-- ============================================================================
-- Único punto de entrada del backoffice para mover un pedido web.
--
-- SECURITY INVOKER: la RLS de 0033 ya exige 'ecommerce.pedidos.gestionar'
-- para actualizar pedidos_web y es_usuario_interno() para insertar en el
-- historial. El permiso se valida también acá para devolver un mensaje
-- claro en lugar de un "0 filas actualizadas".
--
-- El FOR UPDATE serializa contra confirmar_pago_pedido (0050): si el pago
-- se aprueba mientras el operador cancela, gana el que tome el lock primero
-- y el otro ve el estado ya actualizado.
--
-- @param p_pedido uuid del pedido.
-- @param p_estado text estado al que se quiere pasar.
-- @param p_motivo text obligatorio para Cancelado; opcional en el resto.
-- @returns el pedido ya actualizado.
create or replace function public.avanzar_estado_pedido(
  p_pedido uuid,
  p_estado text,
  p_motivo text default null
)
returns public.pedidos_web
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pedido          public.pedidos_web;
  v_estado_anterior text;
  v_motivo          text := nullif(btrim(p_motivo), '');
  v_items           jsonb;
begin
  if not public.usuario_tiene_permiso('ecommerce.pedidos.gestionar') then
    raise exception 'No tenés permiso para gestionar pedidos web'
      using errcode = '42501';
  end if;

  select * into v_pedido from public.pedidos_web where id = p_pedido for update;

  if not found then
    raise exception 'El pedido no existe o no tenés permiso para verlo'
      using errcode = '42501';
  end if;

  v_estado_anterior := v_pedido.estado;

  -- Caso puntual con mensaje propio, antes del rechazo genérico.
  if p_estado = 'Pagado' then
    raise exception 'El pago lo confirma la pasarela: un pedido no se puede marcar como Pagado a mano'
      using errcode = '22023';
  end if;

  if not public.transicion_pedido_permitida(v_estado_anterior, p_estado, v_pedido.tipo_entrega) then
    raise exception 'Transición no permitida: % → %', v_estado_anterior, p_estado
      using errcode = '22023';
  end if;

  if p_estado = 'Cancelado' and v_motivo is null then
    raise exception 'El motivo es obligatorio para cancelar un pedido'
      using errcode = '23514';
  end if;

  -- Ver encabezado: solo los pedidos del checkout tienen stock reservado.
  if v_pedido.checkout_id is not null and p_estado in ('Cancelado', 'Entregado') then
    select coalesce(
      jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad)),
      '[]'::jsonb
    )
      into v_items
    from public.detalle_pedido_web
    where pedido_id = p_pedido;

    if p_estado = 'Cancelado' then
      perform public.liberar_stock(v_pedido.deposito_id, v_items);
    else
      perform public.egresar_comprometido(v_pedido.deposito_id, v_items);
    end if;
  end if;

  update public.pedidos_web
     set estado = p_estado,
         cancelado_at = case when p_estado = 'Cancelado' then now() else cancelado_at end
   where id = p_pedido
  returning * into v_pedido;

  insert into public.historial_estado_pedido (
    pedido_id, estado_anterior, estado_nuevo, motivo, usuario_id
  ) values (
    p_pedido, v_estado_anterior, p_estado, v_motivo, auth.uid()
  );

  return v_pedido;
end;
$$;

revoke all on function public.avanzar_estado_pedido(uuid, text, text) from public;
grant execute on function public.avanzar_estado_pedido(uuid, text, text) to authenticated;

commit;

-- Fin migración 0051
