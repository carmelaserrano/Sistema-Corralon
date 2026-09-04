-- Migración 0019: auditoría de edición para la modificación de proveedores.
--
-- Historia: modificar proveedores (Como Administrador necesito modificar la
-- información de un proveedor para mantener actualizados sus datos).
--
-- proveedores ya tiene updated_by/updated_at (0013), pero el trigger que
-- corre en cada UPDATE (trg_proveedores_updated_at, con fn_set_updated_at)
-- solo pone updated_at: nadie graba quién hizo el cambio. Es el mismo gap
-- que tenía rubros_proveedor antes de la 0015, y se resuelve igual:
-- reemplazando el trigger por fn_set_updated_audit (ya definida en 0015,
-- genérica, no hace falta redefinirla).
--
-- No se toca la 0013 (regla del repo: una migración ya mergeada no se toca).

begin;

drop trigger if exists trg_proveedores_updated_at on public.proveedores;

drop trigger if exists trg_proveedores_updated_audit on public.proveedores;
create trigger trg_proveedores_updated_audit
  before update on public.proveedores
  for each row execute function public.fn_set_updated_audit();

commit;

-- Fin migración 0019
