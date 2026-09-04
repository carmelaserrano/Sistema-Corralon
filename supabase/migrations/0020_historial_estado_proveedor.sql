-- Migración 0020: historial de cambios de estado de proveedores.
--
-- Historia: US-PRV-06 (Épica E13) — Administración del estado del proveedor.
--
-- El CA 4 pide registrar "usuario, fecha/hora y estado anterior" en cada
-- cambio. Las dos primeras ya las cubre la 0019 (updated_by / updated_at vía
-- fn_set_updated_audit), pero esas columnas guardan sólo el último valor: no
-- existe forma de saber desde qué estado se venía, ni cuántas veces cambió.
-- Eso necesita una tabla aparte.
--
-- No se toca la 0013 ni la 0019 (regla del repo: una migración ya mergeada no
-- se toca, se corrige con una nueva).

begin;

-- ============================================================================
-- 1) Tabla de historial
-- ============================================================================
-- Es un registro de auditoría: se escribe solo, nunca se edita ni se borra.
-- Por eso no lleva updated_by/updated_at como el resto de las tablas.

create table if not exists public.historial_estado_proveedor (
  id               uuid primary key default gen_random_uuid(),
  proveedor_id     uuid not null references public.proveedores(id) on delete cascade,
  estado_anterior  text not null,
  estado_nuevo     text not null,
  cambiado_por     uuid references auth.users(id),
  cambiado_en      timestamptz not null default now(),
  constraint chk_historial_estado_anterior
    check (estado_anterior in ('activo', 'inactivo')),
  constraint chk_historial_estado_nuevo
    check (estado_nuevo in ('activo', 'inactivo')),
  -- Sólo se registran transiciones reales: un UPDATE que deja el estado igual
  -- no es un cambio de estado y no debe ensuciar el historial.
  constraint chk_historial_transicion
    check (estado_anterior <> estado_nuevo)
);

create index if not exists ix_historial_estado_proveedor_proveedor
  on public.historial_estado_proveedor (proveedor_id, cambiado_en desc);


-- ============================================================================
-- 2) Trigger que lo escribe
-- ============================================================================
-- Va en la base y no en el cliente por dos razones:
--   · Si lo escribiera la app, un cambio hecho desde el SQL Editor (o desde
--     cualquier otro módulo que toque proveedores.estado) quedaría sin
--     registrar, y el historial dejaría de ser confiable.
--   · Un UPDATE y un INSERT separados desde el navegador no son atómicos: el
--     primero podría aplicarse y el segundo fallar. Dentro del trigger, ambos
--     viven en la misma transacción.
--
-- security definer a propósito: el historial se escribe siempre, incluso si
-- el usuario no tiene permiso de escritura sobre esta tabla. Justamente por
-- eso más abajo no se crea ninguna policy de INSERT: la única vía de entrada
-- es este trigger, y nadie puede fabricar ni alterar registros a mano.

create or replace function public.fn_registrar_cambio_estado_proveedor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.estado is distinct from new.estado then
    insert into public.historial_estado_proveedor (
      proveedor_id,
      estado_anterior,
      estado_nuevo,
      cambiado_por
    ) values (
      new.id,
      old.estado,
      new.estado,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

-- AFTER UPDATE: sólo se registra si la fila efectivamente se escribió. Si el
-- UPDATE se cae por RLS o por una constraint, no queda un historial de algo
-- que nunca pasó.
drop trigger if exists trg_proveedores_historial_estado on public.proveedores;
create trigger trg_proveedores_historial_estado
  after update on public.proveedores
  for each row execute function public.fn_registrar_cambio_estado_proveedor();


-- ============================================================================
-- 3) RLS: lectura para autenticados, escritura sólo por el trigger
-- ============================================================================
-- Mismo criterio que la 0013 para el resto del módulo: cualquier autenticado
-- lee, la escritura está gobernada. Acá la escritura no está gobernada por un
-- permiso sino que directamente no se expone: sin policies de INSERT, UPDATE
-- ni DELETE, la tabla es de sólo lectura para 'authenticated'.

alter table public.historial_estado_proveedor enable row level security;

drop policy if exists "historial_estado_proveedor_select_autenticado"
  on public.historial_estado_proveedor;

create policy "historial_estado_proveedor_select_autenticado"
  on public.historial_estado_proveedor
  for select to authenticated using (true);

commit;

-- Fin migración 0020
--
-- Nota: los proveedores que ya existen arrancan sin historial. No se hace un
-- backfill porque no hay dato de origen: nadie registró cuándo ni quién los
-- puso en su estado actual, e inventar una fila sería peor que no tenerla.
