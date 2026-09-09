-- Migración 0024: vinculación manual de notas a facturas — S2-17 (US-TES-05).
--
-- Hasta la 0023 una nota se vinculaba a una factura por una columna directa
-- (notas_proveedor.factura_id), en el momento del alta, por el importe
-- completo y a una sola factura. Esta historia pide vincular después, de a
-- importes parciales y poder deshacerlo, así que el vínculo pasa a vivir en
-- `imputaciones` (nota técnica de S2-17) y la columna directa desaparece:
-- con las dos mecánicas conviviendo, el saldo de la factura se contaría dos
-- veces.
--
-- IMPORTANTE — la 0023 ya está aplicada en la base real, así que acá se
-- migran los vínculos existentes a `imputaciones` antes de borrar la columna.
--
-- Además arregla un bug latente de la 0013: fn_recalcular_saldo_nc seguía
-- leyendo y escribiendo `notas_credito_proveedor` (renombrada en la 0023) y
-- dejaba estado = 'pendiente', valor que chk_nota_estado ya no acepta. Los
-- cuerpos plpgsql no se reescriben solos con un RENAME. Estaba dormido
-- porque nadie escribía en `imputaciones`; esta historia es justo la que lo
-- despierta.
--
-- No se tocan la 0013, la 0022 ni la 0023 (regla del repo).
--
-- Códigos SQLSTATE propios (los lee imputacionesApi.js):
--   IM001 -> 400/409  el importe supera el máximo imputable
--   IM002 -> 404      la nota, la factura o la vinculación no existen
--   IM003 -> 409      la factura ya está totalmente pagada (CA 7)
--   IM004 -> 409      nota y factura de proveedores distintos
--   IM005 -> 409      nota, factura o vinculación anulada
--   IM006 -> 409      esa nota ya está vinculada a esa factura

begin;

-- ============================================================================
-- 1) `imputaciones`: nota_id + auditoría (CA 8)
-- ============================================================================

alter table public.imputaciones rename column nota_credito_id to nota_id;

-- El CHECK chk_imputacion_origen_unico y la FK siguen el renombre solos
-- (son expresiones parseadas, atadas al atributo y no a su nombre).

alter table public.imputaciones
  add column if not exists created_by uuid default auth.uid() references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists anulado_by uuid references auth.users(id),
  add column if not exists anulado_at timestamptz;

drop trigger if exists trg_imputaciones_updated_at on public.imputaciones;
create trigger trg_imputaciones_updated_at
  before update on public.imputaciones
  for each row execute function public.fn_set_updated_at();

-- Desvincular es baja lógica (CA 8 pide registrar quién y cuándo), así que
-- el índice único tiene que ignorar las vinculaciones deshechas: si no, no
-- se podría volver a vincular un par que se desvinculó antes.
drop index if exists public.ux_imputacion_nc_factura;
create unique index if not exists ux_imputacion_nota_factura
  on public.imputaciones (nota_id, factura_id)
  where nota_id is not null and anulado_at is null;

drop index if exists public.ix_imputacion_nc;
create index if not exists ix_imputacion_nota on public.imputaciones (nota_id);

drop policy if exists "imputaciones_write" on public.imputaciones;
create policy "imputaciones_write" on public.imputaciones
  for all to authenticated
  using (
    (pago_id is not null and (usuario_tiene_permiso('tesoreria.pago.registrar')
                              or usuario_tiene_permiso('tesoreria.pago.anular')))
    or
    (nota_id is not null and usuario_tiene_permiso('tesoreria.nota_credito.registrar'))
  )
  with check (
    (pago_id is not null and usuario_tiene_permiso('tesoreria.pago.registrar'))
    or
    (nota_id is not null and usuario_tiene_permiso('tesoreria.nota_credito.registrar'))
  );

-- ============================================================================
-- 2) Funciones compartidas: nombre nuevo de tabla/columna, signo por tipo
-- ============================================================================
-- Se redefinen ANTES de mover datos: el backfill del punto 4 dispara
-- trg_aplicar_imputacion, que llama a estas funciones.

-- Arregla el bug latente descrito arriba y suma el filtro de anuladas.
create or replace function public.fn_recalcular_saldo_nc(p_nc uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_importe  numeric(14,2);
  v_imputado numeric(14,2);
begin
  select importe into v_importe
    from public.notas_proveedor where id = p_nc;

  if v_importe is null then
    return;
  end if;

  select coalesce(sum(importe_imputado), 0) into v_imputado
    from public.imputaciones
   where nota_id = p_nc
     and anulado_at is null;

  if v_imputado > v_importe then
    raise exception 'La suma imputada (%) supera el importe de la nota (%)', v_imputado, v_importe;
  end if;

  update public.notas_proveedor
     set saldo_pendiente = importe - v_imputado,
         estado = case
                    when estado = 'anulada' then 'anulada'
                    when importe - v_imputado <= 0 then 'aplicada'
                    when v_imputado > 0 then 'parcialmente_aplicada'
                    else 'disponible'
                  end
   where id = p_nc;
end;
$$;


create or replace function public.fn_aplicar_imputacion()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_factura  uuid := coalesce(new.factura_id, old.factura_id);
  v_pago     uuid := coalesce(new.pago_id, old.pago_id);
  v_nota     uuid := coalesce(new.nota_id, old.nota_id);
  v_imputado numeric(14,2);
  v_importe  numeric(14,2);
begin
  if v_pago is not null then
    select importe_total into v_importe from public.pagos_proveedor where id = v_pago;
    select coalesce(sum(importe_imputado), 0) into v_imputado
      from public.imputaciones where pago_id = v_pago and anulado_at is null;
    if v_imputado > v_importe then
      raise exception 'La suma imputada (%) supera el importe del pago (%)', v_imputado, v_importe;
    end if;
  end if;

  if v_nota is not null then
    perform public.fn_recalcular_saldo_nc(v_nota);
  end if;

  perform public.fn_recalcular_saldo_factura(v_factura);
  return null;
end;
$$;


create or replace function public.fn_anulacion_restituye_saldo()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_factura uuid;
begin
  if tg_table_name = 'pagos_proveedor' then
    for v_factura in select distinct factura_id from public.imputaciones where pago_id = new.id
    loop
      perform public.fn_recalcular_saldo_factura(v_factura);
    end loop;
  else
    for v_factura in select distinct factura_id from public.imputaciones where nota_id = new.id
    loop
      perform public.fn_recalcular_saldo_factura(v_factura);
    end loop;
  end if;
  return null;
end;
$$;


-- Reemplaza el término de notas_proveedor.factura_id (que desaparece) por el
-- signo dentro de `imputaciones`: pago y nota de CREDITO reducen el saldo,
-- nota de DEBITO lo aumenta (CA 3/CA 4). El importe siempre es positivo.
create or replace function public.fn_recalcular_saldo_factura(p_factura uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_importe   numeric(14,2);
  v_reduccion numeric(14,2);
begin
  select importe_total into v_importe
    from public.facturas_proveedor where id = p_factura;

  if v_importe is null then
    return;
  end if;

  select coalesce(sum(
           case
             when i.pago_id is not null then i.importe_imputado
             when n.tipo = 'CREDITO'    then i.importe_imputado
             when n.tipo = 'DEBITO'     then -i.importe_imputado
             else 0
           end
         ), 0) into v_reduccion
    from public.imputaciones i
    left join public.pagos_proveedor pg on pg.id = i.pago_id
    left join public.notas_proveedor n  on n.id = i.nota_id
   where i.factura_id = p_factura
     and i.anulado_at is null
     and coalesce(pg.estado, 'registrado') <> 'anulado'
     and coalesce(n.estado, 'disponible')  <> 'anulada';

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


-- Ya no hay vínculo en el alta: toda nota nace Disponible con su saldo
-- completo, y el vínculo (si lo hay) lo crea vincular_nota_factura.
create or replace function public.fn_init_saldo_nc()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.saldo_pendiente := new.importe;
  new.estado := coalesce(nullif(new.estado, ''), 'disponible');
  return new;
end;
$$;

-- ============================================================================
-- 3) Baja de la mecánica de la 0023 atada a factura_id
-- ============================================================================
-- Se hace antes del backfill para que el recálculo de la nota no dispare de
-- rebote el trigger que estamos por eliminar.

drop trigger if exists trg_notas_recalcular_factura on public.notas_proveedor;
drop function if exists public.fn_notas_trigger_recalcular_factura();

-- La validación de "misma factura, mismo proveedor" pasa a vivir dentro de
-- vincular_nota_factura, que es el único camino para crear el vínculo.
drop trigger if exists trg_nota_valida_factura on public.notas_proveedor;
drop function if exists public.fn_validar_nota_factura_proveedor();

-- ============================================================================
-- 4) Backfill: los vínculos que ya existen pasan a `imputaciones`
-- ============================================================================

insert into public.imputaciones (factura_id, nota_id, importe_imputado, created_by, created_at)
select n.factura_id, n.id, n.importe, n.created_by, n.created_at
  from public.notas_proveedor n
 where n.factura_id is not null
   and n.estado <> 'anulada'
on conflict do nothing;

-- ============================================================================
-- 5) Se va la columna directa
-- ============================================================================

drop index if exists public.ix_nota_factura;
alter table public.notas_proveedor drop column if exists factura_id;

-- ============================================================================
-- 6) Pasada de recálculo, por si quedó algún saldo colgado de la fórmula vieja
-- ============================================================================

do $$
declare
  v_factura uuid;
begin
  for v_factura in select distinct factura_id from public.imputaciones
  loop
    perform public.fn_recalcular_saldo_factura(v_factura);
  end loop;
end $$;

-- ============================================================================
-- 7) Vincular (CA 1/2/3/4/5/7/8)
-- ============================================================================
-- Todo en una transacción, como pide la nota técnica: valida, inserta la
-- imputación y deja que trg_aplicar_imputacion recalcule nota y factura.

create or replace function public.vincular_nota_factura(
  p_nota_id uuid,
  p_factura_id uuid,
  p_importe numeric
)
returns public.imputaciones
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_nota    public.notas_proveedor%rowtype;
  v_factura public.facturas_proveedor%rowtype;
  v_maximo  numeric(14,2);
  v_fila    public.imputaciones%rowtype;
begin
  select * into v_nota from public.notas_proveedor where id = p_nota_id for update;
  if not found then
    raise exception 'La nota no existe' using errcode = 'IM002';
  end if;

  select * into v_factura from public.facturas_proveedor where id = p_factura_id for update;
  if not found then
    raise exception 'La factura no existe' using errcode = 'IM002';
  end if;

  if v_nota.estado = 'anulada' then
    raise exception 'La nota está anulada' using errcode = 'IM005';
  end if;

  if v_factura.estado = 'anulada' then
    raise exception 'La factura está anulada' using errcode = 'IM005';
  end if;

  -- CA 7
  if v_factura.estado = 'pagada' then
    raise exception 'La factura ya está totalmente pagada: no admite vincular ni desvincular notas'
      using errcode = 'IM003';
  end if;

  if v_nota.proveedor_id <> v_factura.proveedor_id then
    raise exception 'La nota y la factura son de proveedores distintos'
      using errcode = 'IM004';
  end if;

  if exists (
    select 1 from public.imputaciones
     where nota_id = p_nota_id and factura_id = p_factura_id and anulado_at is null
  ) then
    raise exception 'La nota ya está vinculada a esa factura' using errcode = 'IM006';
  end if;

  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe a imputar debe ser mayor a 0' using errcode = 'IM001';
  end if;

  -- CA 5: una nota de CREDITO no puede dejar la factura en negativo; una de
  -- DEBITO solo está limitada por su propio saldo, porque aumenta el saldo
  -- de la factura en vez de reducirlo.
  v_maximo := case
                when v_nota.tipo = 'CREDITO'
                  then least(v_nota.saldo_pendiente, v_factura.saldo_pendiente)
                else v_nota.saldo_pendiente
              end;

  if p_importe > v_maximo then
    raise exception 'El importe a imputar (%) supera el máximo imputable (%)', p_importe, v_maximo
      using errcode = 'IM001';
  end if;

  insert into public.imputaciones (factura_id, nota_id, importe_imputado)
  values (p_factura_id, p_nota_id, p_importe)
  returning * into v_fila;

  return v_fila;
end;
$$;

revoke all on function public.vincular_nota_factura(uuid, uuid, numeric) from public;
grant execute on function public.vincular_nota_factura(uuid, uuid, numeric) to authenticated;

-- ============================================================================
-- 8) Desvincular (CA 6/7/8)
-- ============================================================================
-- Baja lógica: el UPDATE dispara trg_aplicar_imputacion, que revierte los
-- saldos de la nota y de la factura en la misma transacción.

create or replace function public.desvincular_nota_factura(p_imputacion_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_imp     public.imputaciones%rowtype;
  v_factura public.facturas_proveedor%rowtype;
begin
  select * into v_imp from public.imputaciones where id = p_imputacion_id for update;
  if not found then
    raise exception 'La vinculación no existe' using errcode = 'IM002';
  end if;

  if v_imp.anulado_at is not null then
    raise exception 'La vinculación ya fue deshecha' using errcode = 'IM005';
  end if;

  if v_imp.nota_id is null then
    raise exception 'Solo se pueden desvincular notas, no pagos' using errcode = 'IM004';
  end if;

  select * into v_factura from public.facturas_proveedor where id = v_imp.factura_id for update;

  -- CA 7
  if v_factura.estado = 'pagada' then
    raise exception 'La factura ya está totalmente pagada: no admite vincular ni desvincular notas'
      using errcode = 'IM003';
  end if;

  update public.imputaciones
     set anulado_by = auth.uid(),
         anulado_at = now(),
         updated_by = auth.uid()
   where id = p_imputacion_id;
end;
$$;

revoke all on function public.desvincular_nota_factura(uuid) from public;
grant execute on function public.desvincular_nota_factura(uuid) to authenticated;

-- ============================================================================
-- 9) eliminar_nota_proveedor (0023): las facturas ahora salen de imputaciones
-- ============================================================================

create or replace function public.eliminar_nota_proveedor(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_nota     public.notas_proveedor%rowtype;
  v_facturas text;
begin
  select * into v_nota from public.notas_proveedor where id = p_id for update;

  if not found then
    raise exception 'La nota no existe'
      using errcode = 'NT002';
  end if;

  if v_nota.saldo_pendiente <> v_nota.importe then
    select string_agg(concat_ws('-', f.letra, f.sucursal, f.numero), ', ')
      into v_facturas
      from public.imputaciones i
      join public.facturas_proveedor f on f.id = i.factura_id
     where i.nota_id = p_id
       and i.anulado_at is null;

    raise exception 'La nota ya está aplicada (facturas: %) y no puede eliminarse',
      coalesce(v_facturas, 'vinculada')
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

commit;

-- Fin migración 0024
