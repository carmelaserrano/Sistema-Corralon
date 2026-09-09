-- Migración 0023: generaliza notas_credito_proveedor a notas de Crédito y de
-- Débito de proveedor — S2-16 (US-TES-04) — "Registro de notas de crédito y
-- débito de proveedor".
--
-- notas_credito_proveedor ya existe desde la 0013, pensada en ese momento
-- solo para notas de crédito ligadas a una devolución. Esta migración la
-- renombra, le agrega el vínculo directo a factura (CA 4/5/6) y el tipo
-- CREDITO/DEBITO (notas técnicas de S2-16), y ajusta en consecuencia la
-- función compartida que recalcula el saldo de una factura (0013) y la vista
-- de cuenta corriente (0013).
--
-- Depende del esquema que agregó la 0022 (facturas_proveedor.letra/sucursal,
-- S2-13): esta rama está apilada sobre feature/S2-13-factura-proveedor.
--
-- No se tocan la 0013 ni la 0022 (regla del repo: una migración ya mergeada
-- no se toca).

begin;

-- ============================================================================
-- 1) Renombrar tabla y columnas
-- ============================================================================

alter table public.notas_credito_proveedor rename to notas_proveedor;
alter table public.notas_proveedor rename column punto_venta to sucursal;

-- vw_cuenta_corriente_proveedor (0013) se redefine más abajo con los nombres
-- nuevos; no hace falta esperar a que Postgres actualice nada por su cuenta
-- ahí porque la reescribimos entera.

-- ============================================================================
-- 2) Letra (CA 3) — mismo criterio que facturas_proveedor (0022)
-- ============================================================================
-- La tabla nunca se usó desde la app (sin UI hasta esta historia): agregar
-- NOT NULL con un default transitorio es seguro. Igual conviene confirmar
-- `select count(*) from notas_proveedor` en el entorno antes de aplicar.

alter table public.notas_proveedor add column letra text not null default 'A';
alter table public.notas_proveedor alter column letra drop default;
alter table public.notas_proveedor add constraint chk_nota_letra
  check (letra in ('A', 'B', 'C', 'M'));

-- ============================================================================
-- 3) Tipo: CREDITO/DEBITO (notas técnicas de S2-16), reemplaza el CHECK de
--    comprobante AFIP que traía la 0013
-- ============================================================================

alter table public.notas_proveedor drop constraint if exists chk_nc_tipo;
alter table public.notas_proveedor add constraint chk_nota_tipo
  check (tipo in ('CREDITO', 'DEBITO'));

-- ============================================================================
-- 4) Formato de Sucursal (4 dígitos) y Número (8 dígitos) — igual que 0022
-- ============================================================================

alter table public.notas_proveedor add constraint chk_nota_sucursal_formato
  check (sucursal ~ '^[0-9]{4}$');

alter table public.notas_proveedor add constraint chk_nota_numero_formato
  check (numero ~ '^[0-9]{8}$');

-- ============================================================================
-- 5) UNIQUE (proveedor_id, tipo, letra, sucursal, numero) — notas técnicas
-- ============================================================================

alter table public.notas_proveedor drop constraint if exists uq_nc_comprobante;
alter table public.notas_proveedor add constraint uq_nota_comprobante
  unique (proveedor_id, tipo, letra, sucursal, numero);

-- ============================================================================
-- 6) Estados: 'pendiente' → 'disponible' (CA 6/9)
-- ============================================================================

alter table public.notas_proveedor alter column estado set default 'disponible';
alter table public.notas_proveedor drop constraint if exists chk_nc_estado;
alter table public.notas_proveedor add constraint chk_nota_estado
  check (estado in ('disponible', 'parcialmente_aplicada', 'aplicada', 'anulada'));

-- tipo_motivo (0013) era obligatorio para notas ligadas a una devolución;
-- esta historia no pide ese dato en el formulario. Se le pone un default
-- para no romper su NOT NULL/CHECK existentes sin tocar esa lógica.
alter table public.notas_proveedor alter column tipo_motivo set default 'otro';

-- ============================================================================
-- 7) Vínculo directo y opcional a una factura del mismo proveedor — CA 4/5/6
-- ============================================================================
-- Directo por columna, no vía `imputaciones`: esa tabla queda para la Orden
-- de Pago (S2-15, todavía sin implementar), que es el otro circuito que
-- describe el usuario para aplicar una nota "Disponible" más adelante.

alter table public.notas_proveedor
  add column if not exists factura_id uuid references public.facturas_proveedor(id) on delete restrict;

create index if not exists ix_nota_factura on public.notas_proveedor (factura_id);

-- ============================================================================
-- 8) Auditoría updated_by/updated_at (DoD) — la 0013 solo traía created_*
-- ============================================================================

alter table public.notas_proveedor
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_notas_updated_at on public.notas_proveedor;
create trigger trg_notas_updated_at
  before update on public.notas_proveedor
  for each row execute function public.fn_set_updated_at();

-- ============================================================================
-- 9) Saldo/estado inicial de la nota según si viene vinculada a una factura
-- ============================================================================
-- Redefine fn_init_saldo_nc (0013): el trigger trg_init_saldo_nc que ya la
-- usa sigue apuntando a esta función sin necesidad de recrearlo (un rename
-- de tabla no rompe los triggers ya creados sobre ella).

create or replace function public.fn_init_saldo_nc()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.factura_id is not null then
    -- CA 5: vinculación automática, la nota queda totalmente aplicada.
    new.saldo_pendiente := 0;
    new.estado := 'aplicada';
  else
    -- CA 6: sin factura, queda Disponible con su saldo completo.
    new.saldo_pendiente := new.importe;
    new.estado := coalesce(nullif(new.estado, ''), 'disponible');
  end if;
  return new;
end;
$$;

-- ============================================================================
-- 10) Integridad: la factura vinculada debe ser del mismo proveedor — CA 4
-- ============================================================================

create or replace function public.fn_validar_nota_factura_proveedor()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_proveedor_factura uuid;
begin
  if new.factura_id is null then
    return new;
  end if;

  select proveedor_id into v_proveedor_factura
    from public.facturas_proveedor
   where id = new.factura_id;

  if v_proveedor_factura is null then
    raise exception 'La factura vinculada no existe'
      using errcode = 'NT002';
  end if;

  if v_proveedor_factura <> new.proveedor_id then
    raise exception 'La factura vinculada no pertenece al proveedor de la nota'
      using errcode = 'NT003';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nota_valida_factura on public.notas_proveedor;
create trigger trg_nota_valida_factura
  before insert or update of factura_id, proveedor_id on public.notas_proveedor
  for each row execute function public.fn_validar_nota_factura_proveedor();

-- ============================================================================
-- 11) Recalcular el saldo de la factura vinculada — CA 5
-- ============================================================================
-- Redefine fn_recalcular_saldo_factura (0013): agrega, al cálculo existente
-- vía `imputaciones` (pagos y, en el futuro, notas aplicadas desde la Orden
-- de Pago S2-15), el efecto de las notas vinculadas directamente por
-- factura_id. El signo lo define el tipo (notas técnicas): CREDITO resta,
-- DEBITO suma — por eso ya no alcanza con "siempre restar".

create or replace function public.fn_recalcular_saldo_factura(p_factura uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_importe   numeric(14,2);
  v_imputado  numeric(14,2);
  v_notas     numeric(14,2);
  v_reduccion numeric(14,2);
begin
  select importe_total into v_importe
    from public.facturas_proveedor where id = p_factura;

  if v_importe is null then
    return;
  end if;

  -- Pagos y notas aplicados vía `imputaciones` (S2-15, todavía sin
  -- implementar): igual que en la 0013, siempre reducen el saldo.
  select coalesce(sum(i.importe_imputado), 0) into v_imputado
    from public.imputaciones i
    left join public.pagos_proveedor pg on pg.id = i.pago_id
    left join public.notas_proveedor nc on nc.id = i.nota_credito_id
   where i.factura_id = p_factura
     and coalesce(pg.estado, 'registrado') <> 'anulado'
     and coalesce(nc.estado, 'disponible') <> 'anulada';

  -- S2-16 CA 5: notas vinculadas directamente por factura_id.
  select coalesce(sum(
           case n.tipo when 'CREDITO' then n.importe when 'DEBITO' then -n.importe end
         ), 0) into v_notas
    from public.notas_proveedor n
   where n.factura_id = p_factura
     and n.estado <> 'anulada';

  v_reduccion := v_imputado + v_notas;

  if v_reduccion > v_importe then
    raise exception 'La suma aplicada (%) supera el importe de la factura (%)', v_reduccion, v_importe;
  end if;

  update public.facturas_proveedor
     set saldo_pendiente = importe_total - v_reduccion,
         estado = case
                    when estado = 'anulada' then 'anulada'
                    when importe_total - v_reduccion <= 0 then 'pagada'
                    when v_reduccion > 0 then 'parcialmente_pagada'
                    else 'pendiente'
                  end
   where id = p_factura;
end;
$$;

-- Dispara el recálculo cuando una nota se vincula, cambia de factura, o
-- cambia algo que afecte el cálculo (importe/tipo/anulación).
create or replace function public.fn_notas_trigger_recalcular_factura()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.factura_id is not null and old.factura_id is distinct from new.factura_id then
    perform public.fn_recalcular_saldo_factura(old.factura_id);
  end if;

  if new.factura_id is not null then
    perform public.fn_recalcular_saldo_factura(new.factura_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_notas_recalcular_factura on public.notas_proveedor;
create trigger trg_notas_recalcular_factura
  after insert or update of factura_id, importe, tipo, estado on public.notas_proveedor
  for each row
  execute function public.fn_notas_trigger_recalcular_factura();

-- ============================================================================
-- 12) facturas_proveedor.saldo_pendiente ahora puede superar importe_total
-- ============================================================================
-- Una nota de Débito vinculada aumenta lo adeudado por encima del importe
-- original de la factura. El único límite real sigue siendo no bajar de 0
-- (eso ya lo bloquea fn_recalcular_saldo_factura con una excepción).

alter table public.facturas_proveedor drop constraint if exists chk_factura_saldo;
alter table public.facturas_proveedor add constraint chk_factura_saldo_no_negativo
  check (saldo_pendiente >= 0);

-- ============================================================================
-- 13) Eliminar una nota no aplicada — CA 10
-- ============================================================================
-- El resto del esquema no borra comprobantes financieros, los anula (ver
-- comentario de la 0013 sobre las políticas de DELETE). "Eliminar" se
-- implementa entonces como anulación guardada: si la nota sigue con su
-- saldo completo (nunca se vinculó a una factura) se anula sin más trámite;
-- si ya está aplicada, se bloquea y se informa la factura.

create or replace function public.eliminar_nota_proveedor(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_nota     public.notas_proveedor%rowtype;
  v_factura  text;
begin
  select * into v_nota from public.notas_proveedor where id = p_id for update;

  if not found then
    raise exception 'La nota no existe'
      using errcode = 'NT002';
  end if;

  if v_nota.saldo_pendiente <> v_nota.importe then
    select concat_ws('-', f.letra, f.sucursal, f.numero) into v_factura
      from public.facturas_proveedor f
     where f.id = v_nota.factura_id;

    raise exception 'La nota ya está aplicada (factura %) y no puede eliminarse',
      coalesce(v_factura, 'vinculada')
      using errcode = 'NT001';
  end if;

  update public.notas_proveedor
     set estado = 'anulada',
         anulado_by = auth.uid(),
         anulado_at = now(),
         motivo_anulacion = 'Eliminada sin aplicar',
         updated_by = auth.uid()
   where id = p_id;
end;
$$;

revoke all on function public.eliminar_nota_proveedor(uuid) from public;
grant execute on function public.eliminar_nota_proveedor(uuid) to authenticated;

-- ============================================================================
-- 14) vw_cuenta_corriente_proveedor (0013): una nota Débito va al haber
-- ============================================================================
-- La versión de la 0013 mandaba toda nota de crédito al "debe" (reduce
-- deuda). Con Débito la deuda aumenta, igual que una factura, así que va al
-- "haber".

create or replace view public.vw_cuenta_corriente_proveedor as
with movimientos as (
  select f.proveedor_id,
         f.fecha_emision                      as fecha,
         'factura'::text                      as tipo_movimiento,
         f.id                                 as comprobante_id,
         concat_ws('-', f.sucursal, f.numero) as comprobante,
         0::numeric(14,2)                     as debe,
         f.importe_total                      as haber,
         f.created_at
    from public.facturas_proveedor f
   where f.estado <> 'anulada'
  union all
  select p.proveedor_id, p.fecha, 'pago'::text, p.id,
         coalesce(p.referencia, p.numero::text),
         p.importe_total, 0::numeric(14,2), p.created_at
    from public.pagos_proveedor p
   where p.estado <> 'anulado'
  union all
  select n.proveedor_id, n.fecha,
         case n.tipo when 'CREDITO' then 'nota_credito' else 'nota_debito' end,
         n.id,
         concat_ws('-', n.letra, n.sucursal, n.numero),
         case n.tipo when 'CREDITO' then n.importe else 0::numeric(14,2) end,
         case n.tipo when 'DEBITO'  then n.importe else 0::numeric(14,2) end,
         n.created_at
    from public.notas_proveedor n
   where n.estado <> 'anulada'
)
select proveedor_id, fecha, tipo_movimiento, comprobante_id, comprobante, debe, haber,
       sum(haber - debe) over (
         partition by proveedor_id
         order by fecha, created_at
         rows between unbounded preceding and current row
       ) as saldo_acumulado
  from movimientos;

commit;

-- Fin migración 0023
