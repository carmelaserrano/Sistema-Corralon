-- Migración 0021: contactos de proveedor.
--
-- Historia: US-PRV-05 (Épica E13) — Registrar los datos de contacto de cada
-- proveedor.
--
-- contactos_proveedor se creó en la 0013 con (nombre, cargo, telefono, email,
-- principal, activo, created_at) y ya trae el índice parcial
-- ux_contacto_principal que la nota técnica de la historia pide. Esta
-- migración agrega lo que falta: teléfono obligatorio, auditoría, y el
-- comportamiento automático del contacto principal.
--
-- Nota sobre nombres: la nota técnica menciona `es_principal`, pero la
-- columna aplicada se llama `principal`. Se usa el nombre real del esquema.
--
-- No se toca la 0013 (regla del repo: una migración ya mergeada no se toca).

begin;

-- ============================================================================
-- 1) Teléfono obligatorio (CA 4)
-- ============================================================================
-- La 0013 lo dejó nullable. El criterio exige que el sistema pida el teléfono
-- al guardar, así que además de la validación en la UI la garantiza la base.
--
-- Si ya existieran contactos sin teléfono, el SET NOT NULL falla y esta
-- migración revierte entera. En ese caso hay que completar esos teléfonos
-- antes de volver a aplicarla.

alter table public.contactos_proveedor
  alter column telefono set not null;

-- No alcanza con NOT NULL: una cadena vacía o de espacios pasaría igual.
alter table public.contactos_proveedor
  drop constraint if exists chk_contacto_telefono;

alter table public.contactos_proveedor
  add constraint chk_contacto_telefono
  check (length(trim(telefono)) > 0);

-- Mismo criterio para el nombre, que ya era NOT NULL pero admitía ''.
alter table public.contactos_proveedor
  drop constraint if exists chk_contacto_nombre;

alter table public.contactos_proveedor
  add constraint chk_contacto_nombre
  check (length(trim(nombre)) > 0);


-- ============================================================================
-- 2) Auditoría (Definition of Done)
-- ============================================================================
-- Misma convención que proveedores y rubros_proveedor: created_by /
-- updated_by / created_at / updated_at. created_at ya existe.
-- fn_set_updated_audit viene de la 0015; es genérica y no hace falta
-- redefinirla.

alter table public.contactos_proveedor
  add column if not exists created_by uuid default auth.uid()
    references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_contactos_updated_audit on public.contactos_proveedor;
create trigger trg_contactos_updated_audit
  before update on public.contactos_proveedor
  for each row execute function public.fn_set_updated_audit();


-- ============================================================================
-- 3) Un solo principal por proveedor, en forma automática (CA 5)
-- ============================================================================
-- ux_contacto_principal (0013) ya impide que existan dos principales, pero lo
-- hace rechazando la operación con 23505. El criterio pide lo contrario: que
-- al marcar un contacto como principal, "el anterior deja de serlo
-- automáticamente".
--
-- Se resuelve en la base y no en el cliente porque desmarcar-y-marcar desde
-- el navegador son dos escrituras separadas: si la segunda falla, el
-- proveedor queda sin ningún contacto principal. Dentro del trigger las dos
-- viven en la misma transacción.
--
-- security invoker a propósito: a diferencia del historial de estados, esto
-- no es auditoría sino una operación normal del negocio, y debe respetar la
-- policy contactos_update. Quien está marcando un principal ya tiene el
-- permiso 'proveedores.modificar' que esa policy exige.
--
-- No hay recursión infinita: el UPDATE interno deja principal = false, y para
-- esas filas la condición de abajo no se cumple, así que el trigger corta.

create or replace function public.fn_unico_contacto_principal()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.principal then
    update public.contactos_proveedor
       set principal = false
     where proveedor_id = new.proveedor_id
       and id <> new.id
       and principal;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_contactos_unico_principal on public.contactos_proveedor;
create trigger trg_contactos_unico_principal
  before insert or update on public.contactos_proveedor
  for each row execute function public.fn_unico_contacto_principal();

commit;

-- Fin migración 0021
