-- Migración 0022: ajusta facturas_proveedor a la nomenclatura y las reglas
-- de S2-13 (US-CMP-05) — "Registro de comprobante (factura) del proveedor".
--
-- facturas_proveedor, detalle_factura_proveedor y factura_recepcion ya
-- existen desde la 0013 (migración base de Sprint 2, que adelantó el modelo
-- completo de Compras/Proveedores/Tesorería). Esta migración no crea tablas:
-- renombra columnas, ajusta constraints y agrega el vínculo de cabecera a
-- Orden de Compra que la 0013 no contemplaba.
--
-- No se toca la 0013 (regla del repo: una migración ya mergeada no se toca,
-- ver 0021).

begin;

-- ============================================================================
-- 1) Renombrar columnas (nota técnica de la issue S2-13)
-- ============================================================================

alter table public.facturas_proveedor rename column tipo_comprobante to letra;
alter table public.facturas_proveedor rename column punto_venta to sucursal;

-- La unique constraint uq_factura_comprobante (proveedor_id, tipo_comprobante,
-- punto_venta, numero) y la vista vw_cuenta_corriente_proveedor (0013), que
-- referencia punto_venta en su concat_ws, se actualizan solas con el RENAME:
-- Postgres las resuelve por atnum, no por nombre de columna.

-- ============================================================================
-- 2) Letra: A/B/C/M (CA 2) — reemplaza el CHECK provisorio de la 0013
-- ============================================================================
-- La 0013 había adelantado 'factura_a'..'factura_m'/'otro' a falta de la
-- nota técnica. La issue pide únicamente la letra AFIP de un dígito.

alter table public.facturas_proveedor drop constraint if exists chk_factura_tipo;
alter table public.facturas_proveedor add constraint chk_factura_letra
  check (letra in ('A', 'B', 'C', 'M'));

-- ============================================================================
-- 3) Formato de Sucursal (4 dígitos) y Número (8 dígitos) — CA 6
-- ============================================================================
-- El completado con ceros a la izquierda se hace en el frontend al perder el
-- foco (facturasProveedorApi.js); este CHECK es la garantía de backend,
-- mismo patrón que chk_proveedor_cuit (0013).

alter table public.facturas_proveedor add constraint chk_factura_sucursal_formato
  check (sucursal ~ '^[0-9]{4}$');

alter table public.facturas_proveedor add constraint chk_factura_numero_formato
  check (numero ~ '^[0-9]{8}$');

-- ============================================================================
-- 4) Vínculo opcional de cabecera a Orden de Compra — CA 4 y CA 8
-- ============================================================================
-- La 0013 solo vinculaba factura y OC a nivel de línea
-- (detalle_factura_proveedor.detalle_orden_compra_id), pensado para una
-- futura historia de conciliación (fuera de alcance acá: S2-13 no pide
-- cargar renglones de producto en la factura). Para poder comparar el total
-- facturado contra el total de la OC (CA 8) hace falta un vínculo de
-- cabecera, que no existía.

alter table public.facturas_proveedor
  add column if not exists orden_compra_id uuid references public.ordenes_compra(id) on delete restrict;

create index if not exists ix_factura_oc on public.facturas_proveedor (orden_compra_id);

-- ============================================================================
-- 5) Integridad: la OC y la Recepción vinculadas deben ser del mismo
--    proveedor que la factura (parte de la descripción de la historia, no
--    solo un detalle de UI)
-- ============================================================================

create or replace function public.fn_validar_factura_oc_proveedor()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_proveedor_oc uuid;
begin
  if new.orden_compra_id is null then
    return new;
  end if;

  select proveedor_id into v_proveedor_oc
    from public.ordenes_compra
   where id = new.orden_compra_id;

  if v_proveedor_oc is null then
    raise exception 'La orden de compra vinculada no existe'
      using errcode = 'FA002';
  end if;

  if v_proveedor_oc <> new.proveedor_id then
    raise exception 'La orden de compra vinculada no pertenece al proveedor de la factura'
      using errcode = 'FA003';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_factura_valida_oc on public.facturas_proveedor;
create trigger trg_factura_valida_oc
  before insert or update of orden_compra_id, proveedor_id on public.facturas_proveedor
  for each row execute function public.fn_validar_factura_oc_proveedor();


create or replace function public.fn_validar_factura_recepcion_proveedor()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_proveedor_factura uuid;
  v_proveedor_recepcion uuid;
begin
  select proveedor_id into v_proveedor_factura
    from public.facturas_proveedor where id = new.factura_id;

  select proveedor_id into v_proveedor_recepcion
    from public.recepciones where id = new.recepcion_id;

  if v_proveedor_factura is null or v_proveedor_recepcion is null then
    raise exception 'La factura o la recepción vinculada no existen'
      using errcode = 'FA002';
  end if;

  if v_proveedor_factura <> v_proveedor_recepcion then
    raise exception 'La recepción vinculada no pertenece al proveedor de la factura'
      using errcode = 'FA003';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_factura_recepcion_valida on public.factura_recepcion;
create trigger trg_factura_recepcion_valida
  before insert on public.factura_recepcion
  for each row execute function public.fn_validar_factura_recepcion_proveedor();

commit;

-- Fin migración 0022
