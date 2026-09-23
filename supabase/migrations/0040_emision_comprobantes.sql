-- ============================================================================
-- 0040 · S3-12: Emisión de comprobantes de venta y exportación PDF (US-VTA-03)
--
-- Historia: como cajero quiero emitir comprobantes de venta (Factura A/B,
-- Nota de Crédito/Débito) con los datos del cliente e impuestos para cumplir
-- la normativa fiscal (AFIP simulado en homologación, D-S3-04).
--
-- Criterios de Aceptación:
--   CA-01: Venta Pendiente cobrada (o con medio Cuenta corriente) habilita Facturar.
--   CA-02: Letra automática: Responsable Inscripto → A; otros (CF, Monotributo, Exento) → B.
--   CA-03: Numeración correlativa sin saltos (siguiente_numero_comprobante), desglose IVA 21%, CAE y vto.
--   CA-04: Exportación PDF con emisor, cliente, detalle y CAE (capa frontend/jsPDF).
--   CA-05: Nota de Crédito asociada a la factura, sin superar su saldo. Si es total, trigger 0039 anula.
--   CA-06: Atomicidad ante error (no consume número ni deja comprobante a medio grabar).
--   CA-07: Venta ya facturada no permite volverse a facturar.
-- ============================================================================

begin;

-- ============================================================================
-- 1) RPC emitir_comprobante
-- ============================================================================
-- Emite un comprobante fiscal para una venta (Factura, Nota de Crédito o Nota de Débito).
--
-- @param p_venta uuid identificador de la venta.
-- @param p_tipo text 'factura' | 'nota_credito' | 'nota_debito'.
-- @param p_items jsonb array opcional de ítems para NC parcial [{producto_id, cantidad}] o [{monto}].
-- @returns setof public.comprobantes_venta comprobante generado.
create or replace function public.emitir_comprobante(
  p_venta uuid,
  p_tipo text,
  p_items jsonb default null
)
returns setof public.comprobantes_venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta               public.ventas;
  v_comprobante         public.comprobantes_venta;
  v_factura             public.comprobantes_venta;
  v_condicion_iva       text;
  v_letra               text;
  v_punto_venta_id      uuid;
  v_numero              bigint;
  v_total_cobrado       numeric(14,2);
  v_tiene_cta_cte       boolean;
  v_total               numeric(14,2);
  v_neto                numeric(14,2);
  v_iva                 numeric(14,2);
  v_total_nc            numeric(14,2);
  v_total_nc_previas    numeric(14,2);
  v_saldo               numeric(14,2);
  v_item                jsonb;
  v_item_monto          numeric(14,2);
begin
  -- Validación de tipo
  if p_tipo not in ('factura', 'nota_credito', 'nota_debito') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo
      using errcode = '22023';
  end if;

  -- Validación de permisos (DoD / RLS contract)
  if p_tipo in ('factura', 'nota_debito') then
    if not public.usuario_tiene_permiso('ventas.facturar') then
      raise exception 'No tenés permiso para emitir comprobantes de venta'
        using errcode = '42501';
    end if;
  elsif p_tipo = 'nota_credito' then
    if not public.usuario_tiene_permiso('ventas.anular') then
      raise exception 'No tenés permiso para emitir notas de crédito'
        using errcode = '42501';
    end if;
  end if;

  -- Bloqueo pesimista de la venta
  select * into v_venta
  from public.ventas
  where id = p_venta
  for update;

  if not found then
    raise exception 'Venta no encontrada'
      using errcode = 'P0002';
  end if;

  -- --------------------------------------------------------------------------
  -- CASO 1: FACTURA
  -- --------------------------------------------------------------------------
  if p_tipo = 'factura' then
    -- CA-07: No se puede facturar una venta no pendiente o ya facturada
    if v_venta.estado <> 'Pendiente' then
      raise exception 'La venta no está en estado Pendiente'
        using errcode = '22023';
    end if;

    if exists (
      select 1 from public.comprobantes_venta
      where venta_id = p_venta and tipo_comprobante = 'factura' and estado = 'Emitido'
    ) then
      raise exception 'La venta ya posee una factura emitida'
        using errcode = '22023';
    end if;

    -- CA-01: Requiere estar cobrada o tener medio Cuenta corriente
    select coalesce(sum(c.total), 0) into v_total_cobrado
    from public.cobros_venta c
    where c.venta_id = p_venta;

    select exists (
      select 1
      from public.cobros_venta c
      join public.detalle_cobro dc on dc.cobro_id = c.id
      join public.medios_pago mp on mp.id = dc.medio_pago_id
      where c.venta_id = p_venta and mp.nombre = 'Cuenta corriente'
    ) into v_tiene_cta_cte;

    if v_total_cobrado < v_venta.total and not v_tiene_cta_cte then
      raise exception 'La venta debe estar cobrada o tener medio Cuenta corriente para ser facturada'
        using errcode = '22023';
    end if;

    -- CA-02: Determinación automática de letra
    select ci.nombre into v_condicion_iva
    from public.clientes c
    join public.condiciones_iva ci on ci.id = c.condicion_iva_id
    where c.id = v_venta.cliente_id;

    if lower(btrim(coalesce(v_condicion_iva, ''))) = 'responsable inscripto' then
      v_letra := 'A';
    else
      v_letra := 'B';
    end if;

    -- Punto de venta activo
    select id into v_punto_venta_id
    from public.puntos_venta
    where activo
    order by numero
    limit 1;

    if v_punto_venta_id is null then
      raise exception 'No hay un punto de venta activo configurado'
        using errcode = '22023';
    end if;

    -- CA-03: Correlativo sin saltos y desglose de IVA 21%
    v_numero := public.siguiente_numero_comprobante(v_punto_venta_id, 'factura', v_letra);
    v_total := v_venta.total;
    v_neto := round(v_total / 1.21, 2);
    v_iva := round(v_total - v_neto, 2);

    insert into public.comprobantes_venta (
      venta_id, tipo_comprobante, letra, punto_venta_id, numero,
      neto, iva, total, cae, cae_vencimiento, estado
    ) values (
      p_venta, 'factura', v_letra, v_punto_venta_id, v_numero,
      v_neto, v_iva, v_total, 'HOMOLOGACIÓN', current_date + 10, 'Emitido'
    ) returning * into v_comprobante;

    -- El trigger trg_facturar_venta_automatico pasa la venta a Facturada
    return next v_comprobante;

  -- --------------------------------------------------------------------------
  -- CASO 2: NOTA DE CRÉDITO
  -- --------------------------------------------------------------------------
  elsif p_tipo = 'nota_credito' then
    -- CA-05: Solo ventas Facturadas
    if v_venta.estado <> 'Facturada' then
      raise exception 'Solo se pueden emitir notas de crédito sobre ventas en estado Facturada'
        using errcode = '22023';
    end if;

    select * into v_factura
    from public.comprobantes_venta
    where venta_id = p_venta and tipo_comprobante = 'factura' and estado = 'Emitido'
    order by created_at desc
    limit 1;

    if not found then
      raise exception 'La venta no posee una factura emitida para asociar la nota de crédito'
        using errcode = '22023';
    end if;

    -- Saldo disponible de la factura
    select coalesce(sum(total), 0) into v_total_nc_previas
    from public.comprobantes_venta
    where comprobante_asociado_id = v_factura.id
      and tipo_comprobante = 'nota_credito'
      and estado = 'Emitido';

    v_saldo := v_factura.total - v_total_nc_previas;

    if v_saldo <= 0 then
      raise exception 'La factura ya ha sido acreditada en su totalidad'
        using errcode = '22023';
    end if;

    -- Cálculo de monto total o parcial
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      v_total_nc := v_saldo;
    else
      v_total_nc := 0;
      for v_item in select * from jsonb_array_elements(p_items) loop
        if (v_item->>'monto') is not null then
          v_total_nc := v_total_nc + (v_item->>'monto')::numeric;
        elsif (v_item->>'producto_id') is not null and (v_item->>'cantidad') is not null then
          select round((dv.subtotal / dv.cantidad) * (v_item->>'cantidad')::numeric, 2)
          into v_item_monto
          from public.detalle_venta dv
          where dv.venta_id = p_venta and dv.producto_id = (v_item->>'producto_id')::uuid;

          if v_item_monto is null then
            raise exception 'El producto % no pertenece a la venta', (v_item->>'producto_id')
              using errcode = '22023';
          end if;
          v_total_nc := v_total_nc + v_item_monto;
        end if;
      end loop;
    end if;

    if v_total_nc <= 0 then
      raise exception 'El total de la nota de crédito debe ser mayor a cero'
        using errcode = '22023';
    end if;

    if v_total_nc > v_saldo then
      raise exception 'El monto de la nota de crédito (%s) supera el saldo de la factura (%s)',
        v_total_nc, v_saldo
        using errcode = '22023';
    end if;

    v_letra := v_factura.letra;
    v_punto_venta_id := v_factura.punto_venta_id;
    v_numero := public.siguiente_numero_comprobante(v_punto_venta_id, 'nota_credito', v_letra);
    v_neto := round(v_total_nc / 1.21, 2);
    v_iva := round(v_total_nc - v_neto, 2);

    insert into public.comprobantes_venta (
      venta_id, tipo_comprobante, letra, punto_venta_id, numero,
      comprobante_asociado_id, neto, iva, total, cae, cae_vencimiento, estado
    ) values (
      p_venta, 'nota_credito', v_letra, v_punto_venta_id, v_numero,
      v_factura.id, v_neto, v_iva, v_total_nc, 'HOMOLOGACIÓN', current_date + 10, 'Emitido'
    ) returning * into v_comprobante;

    -- Si la NC es por el total, el trigger trg_anular_venta_por_nota_credito pasa a Anulada y libera stock
    return next v_comprobante;

  -- --------------------------------------------------------------------------
  -- CASO 3: NOTA DE DÉBITO
  -- --------------------------------------------------------------------------
  else
    if v_venta.estado <> 'Facturada' then
      raise exception 'Solo se pueden emitir notas de débito sobre ventas en estado Facturada'
        using errcode = '22023';
    end if;

    select * into v_factura
    from public.comprobantes_venta
    where venta_id = p_venta and tipo_comprobante = 'factura' and estado = 'Emitido'
    order by created_at desc
    limit 1;

    if not found then
      raise exception 'La venta no posee una factura emitida para asociar la nota de débito'
        using errcode = '22023';
    end if;

    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'La nota de débito requiere detalle de ítems o monto'
        using errcode = '22023';
    end if;

    v_total := 0;
    for v_item in select * from jsonb_array_elements(p_items) loop
      if (v_item->>'monto') is not null then
        v_total := v_total + (v_item->>'monto')::numeric;
      end if;
    end loop;

    if v_total <= 0 then
      raise exception 'El total de la nota de débito debe ser mayor a cero'
        using errcode = '22023';
    end if;

    v_letra := v_factura.letra;
    v_punto_venta_id := v_factura.punto_venta_id;
    v_numero := public.siguiente_numero_comprobante(v_punto_venta_id, 'nota_debito', v_letra);
    v_neto := round(v_total / 1.21, 2);
    v_iva := round(v_total - v_neto, 2);

    insert into public.comprobantes_venta (
      venta_id, tipo_comprobante, letra, punto_venta_id, numero,
      comprobante_asociado_id, neto, iva, total, cae, cae_vencimiento, estado
    ) values (
      p_venta, 'nota_debito', v_letra, v_punto_venta_id, v_numero,
      v_factura.id, v_neto, v_iva, v_total, 'HOMOLOGACIÓN', current_date + 10, 'Emitido'
    ) returning * into v_comprobante;

    return next v_comprobante;
  end if;
end;
$$;

revoke all on function public.emitir_comprobante(uuid, text, jsonb) from public;
grant execute on function public.emitir_comprobante(uuid, text, jsonb) to authenticated;

commit;
