-- Migración 0015: unicidad normalizada, auditoría y baja lógica protegida
-- en rubros de proveedor.
--
-- Historia: US-PRV-04 (Épica E13)
--
-- rubros_proveedor se creó en la 0013 con (id, nombre, activo, created_at).
-- Esta migración agrega lo que la historia exige y esa tabla todavía no
-- tiene. No modifica la 0013 (regla del repo: una migración ya mergeada no
-- se toca, se corrige con una nueva).

begin;

-- ============================================================================
-- 1) Unicidad sin distinguir mayúsculas ni espacios extremos (CA 2)
-- ============================================================================
-- La 0013 dejó "constraint uq_rubro_nombre unique (nombre)" a secas, que hoy
-- permite convivir 'Cemento', 'cemento' y ' Cemento '. El criterio de
-- aceptación exige rechazar las tres como duplicadas, y eso sólo lo puede
-- garantizar un índice funcional sobre el nombre normalizado.
--
-- Se conserva uq_rubro_nombre: queda redundante (todo lo que viola el unique
-- simple viola también el normalizado), pero eliminar una constraint definida
-- en la migración de otra persona es más invasivo que dejarla.
--
-- Si la tabla ya tuviera nombres que sólo difieren en mayúsculas o espacios,
-- la creación del índice falla y este bloque revierte toda la migración. En
-- ese caso hay que unificar esos rubros antes de volver a aplicarla.

create unique index if not exists ux_rubros_proveedor_nombre_normalizado
  on public.rubros_proveedor (lower(trim(nombre)));


-- ============================================================================
-- 2) Auditoría (Definition of Done)
-- ============================================================================
-- Se sigue la convención de proveedores, la tabla hermana creada en la misma
-- 0013: created_by / updated_by / created_at / updated_at. created_at ya
-- existe. Mantener un solo estilo entre tablas hermanas pesa más que la
-- nomenclatura en español de la historia.

alter table public.rubros_proveedor
  add column if not exists created_by uuid default auth.uid()
    references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

-- fn_set_updated_at (definida en la 0013) sólo escribe updated_at. Para que
-- updated_by quede registrado aunque la fila se toque desde el SQL Editor y
-- no desde la app, tiene que ponerlo la base y no el cliente.
create or replace function public.fn_set_updated_audit()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_rubros_proveedor_updated_audit
  on public.rubros_proveedor;

create trigger trg_rubros_proveedor_updated_audit
  before update on public.rubros_proveedor
  for each row execute function public.fn_set_updated_audit();


-- ============================================================================
-- 3) Baja lógica protegida (CA 4)
-- ============================================================================
-- La baja de un rubro es lógica (activo = false), no física: la 0013 no
-- define policy de DELETE sobre rubros_proveedor, por diseño explícito de esa
-- migración ("las tablas sin política de DELETE no admiten borrado").
--
-- Consecuencia: el ON DELETE RESTRICT de proveedor_rubro nunca se dispara,
-- porque no hay DELETE que restringir. Sin este trigger, la única defensa del
-- CA 4 sería el conteo previo que hace el frontend, y eso deja una ventana:
-- si alguien asocia un proveedor entre el conteo y el update, el rubro se da
-- de baja igual.
--
-- Se usa errcode 23001 (restrict_violation) para que la capa de datos lo
-- traduzca a 409, igual que hace con 23505.

create or replace function public.fn_impedir_baja_rubro_en_uso()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_proveedores integer;
begin
  if old.activo and not new.activo then
    select count(*) into v_proveedores
      from public.proveedor_rubro pr
     where pr.rubro_id = old.id;

    if v_proveedores > 0 then
      raise exception
        'No se puede eliminar el rubro: % proveedor(es) lo utilizan',
        v_proveedores
        using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rubros_proveedor_baja_en_uso
  on public.rubros_proveedor;

create trigger trg_rubros_proveedor_baja_en_uso
  before update on public.rubros_proveedor
  for each row execute function public.fn_impedir_baja_rubro_en_uso();

commit;

-- Fin migración 0015
