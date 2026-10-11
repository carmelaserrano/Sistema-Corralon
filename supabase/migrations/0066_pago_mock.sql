-- Pago de demostración interno. Deshabilitar antes de usar pagos reales:
-- update pago_interno.configuracion set habilitado = false;
create schema if not exists pago_interno;
revoke all on schema pago_interno from public, anon, authenticated;
create table pago_interno.configuracion (
  id boolean primary key default true check (id),
  habilitado boolean not null default true
);
insert into pago_interno.configuracion (id) values (true);
alter table pago_interno.configuracion enable row level security;
revoke all on pago_interno.configuracion from public, anon, authenticated;

-- Extrae la implementación 0063 sin cambiar estados, stock ni historial.
create or replace function pago_interno.confirmar_pago_pedido(
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
  if nullif(btrim(p_referencia), '') is null then raise exception 'La referencia de pago es obligatoria'; end if;
  if p_estado not in ('approved', 'rejected', 'cancelled', 'pending', 'in_process') then
    raise exception 'Estado de pago no reconocido';
  end if;

  select * into v_pedido from public.pedidos_web where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe'; end if;

  if v_pedido.estado = 'Cancelado'
     and p_estado = 'approved'
     and v_pedido.referencia_pago is null then
    update public.pedidos_web
    set referencia_pago = p_referencia, ultimo_pago_referencia = p_referencia,
        pago_estado = 'approved',
        pago_motivo = 'Pago aprobado con el pedido ya cancelado: corresponde reembolso'
    where id = p_pedido returning * into v_pedido;
    return to_jsonb(v_pedido);
  end if;

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


revoke all on function pago_interno.confirmar_pago_pedido(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.confirmar_pago_pedido(
  p_pedido uuid, p_referencia text, p_estado text, p_motivo text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  return pago_interno.confirmar_pago_pedido(p_pedido, p_referencia, p_estado, p_motivo);
end;
$$;
revoke all on function public.confirmar_pago_pedido(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.confirmar_pago_pedido(uuid, text, text, text) to service_role;

create function public.confirmar_pago_mock(p_pedido uuid, p_estado text)
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
  select p.* into v_pedido from public.pedidos_web p
  join public.clientes c on c.id = p.cliente_id
  where p.id = p_pedido and c.usuario_web_id = auth.uid() and c.estado = 'Activo'
  for update of p;
  if not found then raise exception 'Pedido no disponible' using errcode = '42501'; end if;
  if v_pedido.referencia_pago = 'mock:' || p_pedido::text then return to_jsonb(v_pedido); end if;
  if v_pedido.estado <> 'Pendiente de pago' then raise exception 'El pedido no está pendiente de pago'; end if;
  if v_pedido.vence_at <= now() then raise exception 'El pedido venció'; end if;
  return pago_interno.confirmar_pago_pedido(p_pedido, 'mock:' || p_pedido::text, p_estado,
    case when p_estado = 'rejected' then 'Rechazo simulado para testing' else null end);
end;
$$;
revoke all on function public.confirmar_pago_mock(uuid, text) from public, anon;
grant execute on function public.confirmar_pago_mock(uuid, text) to authenticated;
