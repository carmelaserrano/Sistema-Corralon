-- Migración 0033: auditoría de edición para clientes.
--
-- Historia: S3-01 — Alta de clientes (CA-07: "se actualizan y quedan
-- registrados updated_by y updated_at").
--
-- clientes ya tiene la columna updated_by (0031), pero el trigger que corre
-- en cada UPDATE (trg_clientes_updated_at, con fn_set_updated_at) sólo pone
-- updated_at: nadie graba quién hizo el cambio. Es el mismo gap que tenía
-- proveedores antes de la 0019, y se resuelve igual: reemplazando el
-- trigger por fn_set_updated_audit (ya definida en 0015, genérica, no hace
-- falta redefinirla).
--
-- No se toca la 0031 (regla del repo: una migración ya mergeada no se toca).

begin;

drop trigger if exists trg_clientes_updated_at on public.clientes;

drop trigger if exists trg_clientes_updated_audit on public.clientes;
create trigger trg_clientes_updated_audit
  before update on public.clientes
  for each row execute function public.fn_set_updated_audit();

commit;

-- Fin migración 0033
