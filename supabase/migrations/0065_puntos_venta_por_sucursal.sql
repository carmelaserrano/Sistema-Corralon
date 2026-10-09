begin;

alter table public.puntos_venta
  add column if not exists deposito_id uuid
  references public.depositos(id) on delete restrict;

update public.puntos_venta pv
set deposito_id = d.id
from public.depositos d
where d.nombre ilike 'Sucursal %'
  and pv.deposito_id is null
  and lower(btrim(pv.nombre)) = lower(btrim(d.nombre));

create unique index if not exists uq_punto_venta_deposito
  on public.puntos_venta (deposito_id)
  where deposito_id is not null;

alter table public.cajas
  add constraint chk_caja_cajero_asignado
  check (usuario_asignado_id is not null) not valid;

with sucursales as (
  select
    d.id as deposito_id,
    d.nombre,
    row_number() over (order by d.nombre) as orden
  from public.depositos d
  where d.nombre ilike 'Sucursal %'
    and not exists (
      select 1
      from public.puntos_venta pv
      where pv.deposito_id = d.id
    )
),
ultimo_numero as (
  select coalesce(max(numero::numeric), 0) as numero
  from public.puntos_venta
  where numero ~ '^[0-9]+$'
)
insert into public.puntos_venta (numero, nombre, deposito_id)
select lpad((ultimo_numero.numero + sucursales.orden)::text, 4, '0'),
       sucursales.nombre,
       sucursales.deposito_id
from sucursales
cross join ultimo_numero;

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
  if p_tipo not in ('factura', 'nota_credito', 'nota_debito') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo
      using errcode = '22023';
  end if;

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

  select * into v_venta
  from public.ventas
  where id = p_venta
  for update;

  if not found then
    raise exception 'Venta no encontrada'
      using errcode = 'P0002';
  end if;

  if p_tipo = 'factura' then
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

    select ci.nombre into v_condicion_iva
    from public.clientes c
    join public.condiciones_iva ci on ci.id = c.condicion_iva_id
    where c.id = v_venta.cliente_id;

    if lower(btrim(coalesce(v_condicion_iva, ''))) = 'responsable inscripto' then
      v_letra := 'A';
    else
      v_letra := 'B';
    end if;

    select pv.id into v_punto_venta_id
    from public.puntos_venta pv
    where pv.activo and pv.deposito_id = v_venta.deposito_id;

    if v_punto_venta_id is null and not exists (
      select 1
      from public.puntos_venta pv
      where pv.deposito_id = v_venta.deposito_id
    ) then
      select pv.id into v_punto_venta_id
      from public.puntos_venta pv
      where pv.activo and pv.deposito_id is null
      order by pv.numero
      limit 1;
    end if;

    if v_punto_venta_id is null then
      raise exception 'No hay un punto de venta activo configurado para la sucursal de la venta'
        using errcode = '22023';
    end if;

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

    return next v_comprobante;

  elsif p_tipo = 'nota_credito' then
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
      raise exception 'El monto de la nota de crédito (%) supera el saldo de la factura (%)',
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

    return next v_comprobante;

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
