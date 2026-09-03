-- Migración 0018: campos y permisos para el alta de proveedores.
--
-- Historia: alta de proveedores (Como Administrador necesito registrar
-- nuevos proveedores para mantener actualizado el padrón de proveedores).
--
-- proveedores se creó en la 0013 con (razon_social, cuit, condicion_fiscal,
-- condicion_pago_habitual, domicilio, localidad, estado, ...). Esta migración
-- agrega lo que el formulario de alta necesita y esa tabla todavía no tiene.
-- No modifica la 0013 (regla del repo: una migración ya mergeada no se toca,
-- se corrige con una nueva).
--
-- El campo "Rubro" del alta reutiliza proveedor_rubro (N:N, creada en 0013)
-- en vez de agregar una columna rubro_id: proveedor_rubro ya la usa el ABM de
-- Rubros para contar "proveedores asociados", y esa cuenta se rompería si el
-- vínculo se moviera a una columna aparte.

begin;

-- ============================================================================
-- 1) Campos que pide el formulario de alta y todavía no existen
-- ============================================================================

alter table public.proveedores
  add column if not exists nombre_fantasia text,
  add column if not exists provincia       text,
  add column if not exists telefono        text,
  add column if not exists email           text,
  add column if not exists observaciones   text;

do $$
begin
  -- Condición Fiscal: el AC exige un desplegable cerrado a estas 4 opciones.
  if not exists (
    select 1 from pg_constraint where conname = 'chk_proveedor_condicion_fiscal'
  ) then
    alter table public.proveedores add constraint chk_proveedor_condicion_fiscal
      check (
        condicion_fiscal in (
          'responsable_inscripto', 'monotributista', 'exento', 'consumidor_final'
        )
      );
  end if;

  -- Mismo criterio que chk_contacto_email (0013): formato liviano, campo opcional.
  if not exists (
    select 1 from pg_constraint where conname = 'chk_proveedor_email'
  ) then
    alter table public.proveedores add constraint chk_proveedor_email
      check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  end if;
end $$;


-- ============================================================================
-- 2) RLS: proveedor_rubro_insert le faltaba el permiso de alta
-- ============================================================================
-- La 0013 dejó esta policy exigiendo solo 'proveedores.modificar'. Eso rompe
-- el alta: un Administrador con 'proveedores.alta' (sin 'modificar') crea el
-- proveedor pero no puede vincularle el rubro elegido en el mismo formulario,
-- porque el INSERT en proveedor_rubro queda filtrado por RLS.

drop policy if exists "proveedor_rubro_insert" on public.proveedor_rubro;
create policy "proveedor_rubro_insert" on public.proveedor_rubro
  for insert to authenticated
  with check (
    usuario_tiene_permiso('proveedores.alta')
    or usuario_tiene_permiso('proveedores.modificar')
  );

commit;

-- Fin migración 0018
