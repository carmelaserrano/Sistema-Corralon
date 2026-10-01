-- Issue #136 · CA-06
-- La creación de pedidos web y la reserva de stock deben pasar por las RPC
-- que validan el flujo completo. Los clientes no pueden escribir pedidos ni
-- invocar directamente la primitiva privilegiada de reserva.

begin;

-- Solo las funciones SECURITY DEFINER propiedad de postgres (actualmente
-- crear_pedido_web y registrar_venta) necesitan invocar esta primitiva.
revoke all on function public.comprometer_stock(uuid, jsonb)
  from public, anon, authenticated, service_role;

-- crear_pedido_web es el punto de entrada autenticado del checkout. Se quita
-- el permiso anon heredado de los default privileges de Supabase.
revoke execute on function public.crear_pedido_web(jsonb) from public, anon;
grant execute on function public.crear_pedido_web(jsonb) to authenticated;

-- Defensa en profundidad: aunque RLS estuviera mal configurado en el futuro,
-- ningún rol de la Data API tiene privilegio de INSERT directo.
revoke insert on table public.pedidos_web from anon, authenticated, service_role;
revoke insert on table public.detalle_pedido_web from anon, authenticated, service_role;

-- Se explicitan los permisos que el e-commerce y el backoffice sí necesitan.
-- Las policies existentes siguen limitando SELECT al cliente dueño o a un
-- usuario interno, y UPDATE a quien gestiona pedidos en el backoffice.
grant select on table public.pedidos_web to authenticated;
grant select on table public.detalle_pedido_web to authenticated;
grant update on table public.pedidos_web to authenticated;
grant select, update on table public.pedidos_web to service_role;
grant select on table public.detalle_pedido_web to service_role;

-- Sin policies INSERT, las escrituras autenticadas tampoco pueden atravesar
-- RLS. crear_pedido_web conserva SECURITY DEFINER y opera como owner.
drop policy if exists "pedidos_web_insert_propio" on public.pedidos_web;
drop policy if exists "detalle_pedido_web_insert_propio" on public.detalle_pedido_web;

commit;
