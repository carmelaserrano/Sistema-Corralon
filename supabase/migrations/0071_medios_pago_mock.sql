-- Solo DEMO. Agrega el medio a la referencia sin columnas ni reglas nuevas
-- de pedidos/stock. La confirmación transaccional sigue siendo la de 0066.
create function public.confirmar_pago_mock(p_pedido uuid, p_estado text, p_medio text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pedido public.pedidos_web%rowtype;
begin
  if auth.uid() is null then raise exception 'Necesitás iniciar sesión' using errcode = '42501'; end if;
  if not exists (select 1 from pago_interno.configuracion where habilitado) then
    raise exception 'El pago mock está deshabilitado';
  end if;
  if p_estado is null or p_estado not in ('approved', 'rejected') then
    raise exception 'Resultado de pago no válido';
  end if;
  if p_medio is null or p_medio not in ('tarjeta', 'mercado_pago', 'transferencia') then
    raise exception 'Medio de pago no válido';
  end if;
  select p.* into v_pedido from public.pedidos_web p
  join public.clientes c on c.id = p.cliente_id
  where p.id = p_pedido and c.usuario_web_id = auth.uid() and c.estado = 'Activo'
  for update of p;
  if not found then raise exception 'Pedido no disponible' using errcode = '42501'; end if;
  -- El primer pago aprobado conserva su referencia y medio, incluso si el
  -- reintento elige otro medio o llega después de avanzar el pedido.
  if v_pedido.referencia_pago = 'mock:' || p_pedido::text
     or v_pedido.referencia_pago in (
       'mock:tarjeta:' || p_pedido::text,
       'mock:mercado_pago:' || p_pedido::text,
       'mock:transferencia:' || p_pedido::text
     ) then return to_jsonb(v_pedido); end if;
  if v_pedido.estado <> 'Pendiente de pago' then raise exception 'El pedido no está pendiente de pago'; end if;
  if v_pedido.vence_at <= now() then raise exception 'El pedido venció'; end if;
  return pago_interno.confirmar_pago_pedido(p_pedido, 'mock:' || p_medio || ':' || p_pedido::text, p_estado,
    case when p_estado = 'rejected' then 'Rechazo simulado para testing' else null end);
end;
$$;
revoke all on function public.confirmar_pago_mock(uuid, text, text) from public, anon;
grant execute on function public.confirmar_pago_mock(uuid, text, text) to authenticated;

-- Mantiene la firma anterior: los clientes existentes siguen usando tarjeta.
create or replace function public.confirmar_pago_mock(p_pedido uuid, p_estado text)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.confirmar_pago_mock(p_pedido, p_estado, 'tarjeta');
$$;
revoke all on function public.confirmar_pago_mock(uuid, text) from public, anon;
grant execute on function public.confirmar_pago_mock(uuid, text) to authenticated;
