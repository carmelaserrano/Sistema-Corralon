-- Migración 0025: orden de pago a proveedores — S2-15 (US-TES-03).
--
-- Cierra el circuito de Tesorería: facturas (S2-13), notas (S2-16) y
-- vinculación manual (S2-17) ya existen; faltaba pagar. `pagos_proveedor` e
-- `imputaciones` vienen de la 0013 y la 0024 dejó `imputaciones` con nota_id,
-- auditoría y baja lógica, así que acá se agrega sobre todo el flujo de
-- armado y confirmación de la orden.
--
-- D-03 (decisión pendiente que marcaba el issue): la entidad sigue llamándose
-- `pagos_proveedor` en la base, como dice el diccionario. "Orden de Pago" es
-- el nombre en la UI. Renombrar la tabla arrastraba imputaciones.pago_id,
-- cuatro funciones, dos policies y la vista de cuenta corriente, todo por un
-- cambio cosmético.
--
-- No se tocan las migraciones anteriores (regla del repo).
--
-- Códigos SQLSTATE propios (los lee ordenesPagoApi.js):
--   OP001 -> 400  faltan datos obligatorios o son inválidos
--   OP002 -> 404  proveedor, medio de pago, factura o nota inexistente
--   OP003 -> 400  el importe imputado supera el máximo imputable
--   OP004 -> 409  el total imputado no coincide con el importe de la orden
--   OP005 -> 409  no pertenece al proveedor, o la nota ya está imputada ahí
--   OP006 -> 409  la factura o la nota no está en un estado imputable
--   OP007 -> 409  se intentó editar una orden ya confirmada

begin;

-- ============================================================================
-- 1) pagos_proveedor: observaciones (CA 9) y auditoría (DoD)
-- ============================================================================

alter table public.pagos_proveedor
  add column if not exists observaciones text,
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_pagos_updated_at on public.pagos_proveedor;
create trigger trg_pagos_updated_at
  before update on public.pagos_proveedor
  for each row execute function public.fn_set_updated_at();

-- ============================================================================
-- 2) Estado: 'registrado' → 'confirmada' (CA 11)
-- ============================================================================
-- El CHECK se baja primero: si no, el UPDATE de las filas existentes chocaría
-- contra el CHECK viejo, que solo admite 'registrado'/'anulado'.
--
-- 'anulado' se deja en masculino a propósito: es como lo escriben
-- fn_recalcular_saldo_factura y fn_anulacion_restituye_saldo (0013/0024), y
-- cambiarlo obligaría a redefinir ambas sin ninguna necesidad.

alter table public.pagos_proveedor drop constraint if exists chk_pago_estado;

update public.pagos_proveedor set estado = 'confirmada' where estado = 'registrado';

alter table public.pagos_proveedor alter column estado set default 'confirmada';

alter table public.pagos_proveedor add constraint chk_pago_estado
  check (estado in ('confirmada', 'anulado'));

-- ============================================================================
-- 3) Una orden confirmada no se edita (CA 11)
-- ============================================================================
-- Solo se dejan pasar la transición de anulación (que la 0013 ya contempla,
-- aunque ninguna historia la use todavía) y los campos de auditoría.

create or replace function public.fn_pago_inmutable()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.numero        is distinct from old.numero
     or new.proveedor_id  is distinct from old.proveedor_id
     or new.medio_pago_id is distinct from old.medio_pago_id
     or new.fecha         is distinct from old.fecha
     or new.importe_total is distinct from old.importe_total
     or new.referencia    is distinct from old.referencia
     or new.observaciones is distinct from old.observaciones then
    raise exception 'Una orden de pago confirmada no se puede editar'
      using errcode = 'OP007';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pago_inmutable on public.pagos_proveedor;
create trigger trg_pago_inmutable
  before update on public.pagos_proveedor
  for each row execute function public.fn_pago_inmutable();

-- ============================================================================
-- 4) Trazabilidad: qué orden aplicó cada nota (CA 13)
-- ============================================================================
-- Una imputación lleva pago_id O nota_id, nunca las dos
-- (chk_imputacion_origen_unico), así que una nota aplicada dentro de una
-- orden no quedaba ligada a esa orden. Esta columna es SOLO trazabilidad: el
-- cálculo de saldos (fn_recalcular_saldo_factura / _nc) nunca la mira, para
-- que no haya forma de que una fila se cuente dos veces.

alter table public.imputaciones
  add column if not exists pago_origen_id uuid references public.pagos_proveedor(id);

create index if not exists ix_imputacion_pago_origen
  on public.imputaciones (pago_origen_id);

-- ============================================================================
-- 5) Imputar una nota es parte del circuito de pago
-- ============================================================================
-- Hasta ahora la rama de notas exigía 'tesoreria.nota_credito.registrar'.
-- Sin esto, el Encargado de Administración necesitaría dos permisos para
-- usar una sola pantalla.

drop policy if exists "imputaciones_write" on public.imputaciones;
create policy "imputaciones_write" on public.imputaciones
  for all to authenticated
  using (
    (pago_id is not null and (usuario_tiene_permiso('tesoreria.pago.registrar')
                              or usuario_tiene_permiso('tesoreria.pago.anular')))
    or
    (nota_id is not null and (usuario_tiene_permiso('tesoreria.nota_credito.registrar')
                              or usuario_tiene_permiso('tesoreria.pago.registrar')))
  )
  with check (
    (pago_id is not null and usuario_tiene_permiso('tesoreria.pago.registrar'))
    or
    (nota_id is not null and (usuario_tiene_permiso('tesoreria.nota_credito.registrar')
                              or usuario_tiene_permiso('tesoreria.pago.registrar')))
  );

-- ============================================================================
-- 6) Armado y confirmación de la orden, en una sola transacción
-- ============================================================================
-- Mismo patrón de arrays jsonb que crear_recepcion (0011):
--   p_facturas: [{ "factura_id": "...", "importe": 100 }, ...]
--   p_notas:    [{ "nota_id": "...", "factura_id": "...", "importe": 50 }, ...]
--
-- El orden de los pasos importa: las notas se aplican antes que el efectivo
-- para que el saldo de la factura ya las refleje cuando se valida cuánto
-- efectivo se le puede imputar (CA 3 y CA 8).
--
-- El CA 12 no necesita código propio: al insertar cada imputación,
-- trg_aplicar_imputacion recalcula la factura y la nota y las deja en
-- Pagada parcial/Pagada y Aplicada parcial/Aplicada.

create or replace function public.crear_orden_pago(
  p_proveedor_id uuid,
  p_medio_pago_id uuid,
  p_fecha date,
  p_importe_total numeric,
  p_facturas jsonb,
  p_notas jsonb default '[]'::jsonb,
  p_referencia text default null,
  p_observaciones text default null
)
returns public.pagos_proveedor
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pago       public.pagos_proveedor%rowtype;
  v_nota       public.notas_proveedor%rowtype;
  v_factura    public.facturas_proveedor%rowtype;
  v_item       jsonb;
  v_suma       numeric(14,2) := 0;
  v_importe    numeric(14,2);
  v_maximo     numeric(14,2);
  v_factura_id uuid;
begin
  -- 1) Obligatorios
  if p_proveedor_id is null or p_medio_pago_id is null or p_fecha is null then
    raise exception 'El proveedor, el medio de pago y la fecha son obligatorios'
      using errcode = 'OP001';
  end if;

  if p_importe_total is null or p_importe_total <= 0 then
    raise exception 'El importe de la orden debe ser mayor a 0'
      using errcode = 'OP001';
  end if;

  if p_facturas is null
     or jsonb_typeof(p_facturas) <> 'array'
     or jsonb_array_length(p_facturas) = 0 then
    raise exception 'La orden debe imputar al menos una factura'
      using errcode = 'OP001';
  end if;

  -- No se exige proveedor activo: se le puede seguir debiendo a un proveedor
  -- dado de baja, y ningún criterio de aceptación lo pide.
  if not exists (select 1 from public.proveedores where id = p_proveedor_id) then
    raise exception 'El proveedor no existe' using errcode = 'OP002';
  end if;

  if not exists (
    select 1 from public.medios_pago where id = p_medio_pago_id and activo
  ) then
    raise exception 'El medio de pago no existe o está inactivo'
      using errcode = 'OP002';
  end if;

  -- 2) CA 10: aritmética pura, antes de tocar nada.
  for v_item in select * from jsonb_array_elements(p_facturas)
  loop
    v_suma := v_suma + coalesce((v_item->>'importe')::numeric, 0);
  end loop;

  if v_suma <> p_importe_total then
    raise exception
      'El total imputado (%) no coincide con el importe de la orden (%). Diferencia: %',
      v_suma, p_importe_total, p_importe_total - v_suma
      using errcode = 'OP004';
  end if;

  -- 3) Cabecera (CA 11): el número lo da la identity de la 0013.
  insert into public.pagos_proveedor (
    proveedor_id, medio_pago_id, fecha, importe_total, referencia, observaciones, estado
  )
  values (
    p_proveedor_id,
    p_medio_pago_id,
    p_fecha,
    p_importe_total,
    nullif(btrim(coalesce(p_referencia, '')), ''),
    nullif(btrim(coalesce(p_observaciones, '')), ''),
    'confirmada'
  )
  returning * into v_pago;

  -- 4) Notas primero (CA 5/6): bajan o suben el saldo de su factura antes de
  --    que se valide el efectivo.
  if p_notas is not null and jsonb_typeof(p_notas) = 'array' then
    for v_item in select * from jsonb_array_elements(p_notas)
    loop
      v_factura_id := (v_item->>'factura_id')::uuid;
      v_importe := (v_item->>'importe')::numeric;

      if not exists (
        select 1 from jsonb_array_elements(p_facturas) f
         where (f.value->>'factura_id')::uuid = v_factura_id
      ) then
        raise exception 'La nota se imputa a una factura que no está en la orden'
          using errcode = 'OP005';
      end if;

      select * into v_nota from public.notas_proveedor
       where id = (v_item->>'nota_id')::uuid
       for update;

      if not found then
        raise exception 'La nota no existe' using errcode = 'OP002';
      end if;

      select * into v_factura from public.facturas_proveedor
       where id = v_factura_id
       for update;

      if not found then
        raise exception 'La factura no existe' using errcode = 'OP002';
      end if;

      if v_nota.proveedor_id <> p_proveedor_id or v_factura.proveedor_id <> p_proveedor_id then
        raise exception 'La nota o la factura no pertenecen al proveedor de la orden'
          using errcode = 'OP005';
      end if;

      if v_nota.estado = 'anulada' or v_factura.estado = 'anulada' then
        raise exception 'No se puede imputar una nota o una factura anulada'
          using errcode = 'OP006';
      end if;

      if exists (
        select 1 from public.imputaciones
         where nota_id = v_nota.id
           and factura_id = v_factura_id
           and anulado_at is null
      ) then
        raise exception 'La nota % ya está imputada a esa factura',
          concat_ws('-', v_nota.letra, v_nota.sucursal, v_nota.numero)
          using errcode = 'OP005';
      end if;

      -- Misma regla que S2-17: un crédito no puede dejar la factura en
      -- negativo; un débito solo está limitado por el saldo de la nota.
      v_maximo := case
                    when v_nota.tipo = 'CREDITO'
                      then least(v_nota.saldo_pendiente, v_factura.saldo_pendiente)
                    else v_nota.saldo_pendiente
                  end;

      if v_importe is null or v_importe <= 0 or v_importe > v_maximo then
        raise exception
          'El importe a imputar de la nota % (%) supera el máximo imputable (%)',
          concat_ws('-', v_nota.letra, v_nota.sucursal, v_nota.numero),
          coalesce(v_importe, 0),
          v_maximo
          using errcode = 'OP003';
      end if;

      insert into public.imputaciones (factura_id, nota_id, importe_imputado, pago_origen_id)
      values (v_factura_id, v_nota.id, v_importe, v_pago.id);
    end loop;
  end if;

  -- 5) Efectivo, ya con el saldo neteado por las notas (CA 8).
  for v_item in select * from jsonb_array_elements(p_facturas)
  loop
    v_factura_id := (v_item->>'factura_id')::uuid;
    v_importe := (v_item->>'importe')::numeric;

    select * into v_factura from public.facturas_proveedor
     where id = v_factura_id
     for update;

    if not found then
      raise exception 'La factura no existe' using errcode = 'OP002';
    end if;

    if v_factura.proveedor_id <> p_proveedor_id then
      raise exception 'La factura no pertenece al proveedor de la orden'
        using errcode = 'OP005';
    end if;

    if v_factura.estado not in ('pendiente', 'parcialmente_pagada') then
      raise exception 'La factura % no está en un estado imputable (%)',
        concat_ws('-', v_factura.letra, v_factura.sucursal, v_factura.numero),
        v_factura.estado
        using errcode = 'OP006';
    end if;

    if v_importe is null or v_importe <= 0 or v_importe > v_factura.saldo_pendiente then
      raise exception
        'El importe a imputar a la factura % (%) supera su saldo pendiente (máximo imputable: %)',
        concat_ws('-', v_factura.letra, v_factura.sucursal, v_factura.numero),
        coalesce(v_importe, 0),
        v_factura.saldo_pendiente
        using errcode = 'OP003';
    end if;

    insert into public.imputaciones (factura_id, pago_id, importe_imputado)
    values (v_factura_id, v_pago.id, v_importe);
  end loop;

  return v_pago;
end;
$$;

revoke all on function public.crear_orden_pago(
  uuid, uuid, date, numeric, jsonb, jsonb, text, text
) from public;

grant execute on function public.crear_orden_pago(
  uuid, uuid, date, numeric, jsonb, jsonb, text, text
) to authenticated;

commit;

-- Fin migración 0025
