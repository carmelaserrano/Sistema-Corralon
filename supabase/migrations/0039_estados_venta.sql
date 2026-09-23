-- ============================================================================
-- 0039 · S3-07: Supervisión de ventas — estados y transiciones
--
-- Historia: supervisor gestiona el estado de cada venta (Pendiente,
-- Facturada, Entregada, Anulada) para seguir el proceso comercial completo.
--
-- Dos caminos para cambiar de estado:
--   1) Manual, desde la pantalla, con cambiar_estado_venta (CA-03, CA-04).
--   2) Automático, por triggers sobre comprobantes_venta (CA-02, CA-05):
--      al insertar una Factura, o al insertar una Nota de Crédito por el
--      total de una venta Facturada.
--
-- Decisión clave (confirmada con el equipo): una venta Facturada NO se
-- puede anular por el camino manual. cambiar_estado_venta la rechaza con un
-- mensaje que pide una Nota de Crédito; ESA es la única forma de anular una
-- Facturada, y la hace el trigger de abajo, no esta función.
--
-- ventas, historial_estado_venta, comprobantes_venta, detalle_venta ya
-- existen desde 0031. liberar_stock y egresar_comprometido también (0031,
-- endurecidas en 0032 para exigir es_usuario_interno()). No se toca la 0031
-- (regla del repo: una migración ya mergeada no se toca).
-- ============================================================================

begin;

-- ============================================================================
-- 1) Matriz de transiciones (CA-07)
-- ============================================================================
-- Sólo describe los caminos que puede iniciar una persona desde la pantalla
-- (cambiar_estado_venta). Los dos caminos automáticos (Pendiente→Facturada,
-- Facturada→Anulada por NC) no pasan por acá: los hacen los triggers de la
-- sección 3, directo sobre la fila, sin pasar por esta función.
--
-- Entregada y Anulada son estados finales: no aparecen como "desde" en
-- ningún renglón, así que cualquier intento de salir de ahí (el ejemplo de
-- la historia es Entregada → Pendiente) cae en el `else false` de abajo.
--
-- @param p_desde text estado actual de la venta.
-- @param p_hasta text estado al que se quiere pasar.
-- @returns boolean true si la transición está permitida por este camino.
create or replace function public.transicion_venta_permitida(p_desde text, p_hasta text)
returns boolean
language sql
immutable
as $$
  select (p_desde, p_hasta) in (
    ('Pendiente', 'Anulada'),
    ('Facturada', 'Entregada')
  );
$$;


-- ============================================================================
-- 2) cambiar_estado_venta — CA-03, CA-04, CA-05 (rechazo), CA-06, CA-07
-- ============================================================================
-- Un solo punto de entrada para las dos acciones manuales de la pantalla:
--   - Marcar entregada (CA-03): exige 'ventas.entregar', descuenta stock
--     físico con egresar_comprometido.
--   - Anular (CA-04): exige 'ventas.anular' y motivo, libera la reserva de
--     stock con liberar_stock.
--
-- El permiso se valida acá, no sólo en la policy de RLS: "ventas_update"
-- (0031) acepta cualquiera de las cinco permisos de ventas para actualizar
-- CUALQUIER columna. Sin este chequeo, alguien con sólo 'ventas.registrar'
-- podría marcar una venta como entregada sin tener 'ventas.entregar'.
-- Mismo criterio que cambiar_estado_cliente (0035).
--
-- @param p_venta uuid de la venta.
-- @param p_estado_nuevo 'Entregada' | 'Anulada'.
-- @param p_motivo Obligatorio para anular; se ignora para entregar.
-- @returns la venta ya actualizada.
create or replace function public.cambiar_estado_venta(
  p_venta uuid,
  p_estado_nuevo text,
  p_motivo text default null
)
returns setof public.ventas
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_venta           public.ventas;
  v_estado_anterior text;
  v_items           jsonb;
begin
  select * into v_venta from public.ventas where id = p_venta for update;

  if not found then
    raise exception 'La venta no existe o no tenés permiso para modificarla'
      using errcode = '42501';
  end if;

  v_estado_anterior := v_venta.estado;

  -- CA-05: caso puntual con mensaje propio, antes del rechazo genérico.
  if v_estado_anterior = 'Facturada' and p_estado_nuevo = 'Anulada' then
    raise exception 'Una venta facturada no se puede anular directamente: generá una Nota de Crédito por el total'
      using errcode = '22023';
  end if;

  if not public.transicion_venta_permitida(v_estado_anterior, p_estado_nuevo) then
    raise exception 'Transición no permitida: % → %', v_estado_anterior, p_estado_nuevo
      using errcode = '22023';
  end if;

  if p_estado_nuevo = 'Entregada' then
    if not public.usuario_tiene_permiso('ventas.entregar') then
      raise exception 'No tenés permiso para marcar ventas como entregadas'
        using errcode = '42501';
    end if;
  elsif p_estado_nuevo = 'Anulada' then
    if not public.usuario_tiene_permiso('ventas.anular') then
      raise exception 'No tenés permiso para anular ventas'
        using errcode = '42501';
    end if;
    if nullif(btrim(p_motivo), '') is null then
      raise exception 'El motivo es obligatorio para anular una venta'
        using errcode = '23514';
    end if;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad)),
    '[]'::jsonb
  )
    into v_items
  from public.detalle_venta
  where venta_id = p_venta;

  if p_estado_nuevo = 'Entregada' then
    perform public.egresar_comprometido(v_venta.deposito_id, v_items);
  elsif p_estado_nuevo = 'Anulada' then
    perform public.liberar_stock(v_venta.deposito_id, v_items);
  end if;

  update public.ventas
     set estado = p_estado_nuevo
   where id = p_venta
  returning * into v_venta;

  insert into public.historial_estado_venta (
    venta_id, estado_anterior, estado_nuevo, motivo, usuario_id
  ) values (
    p_venta, v_estado_anterior, p_estado_nuevo, p_motivo, auth.uid()
  );

  return next v_venta;
end;
$$;

revoke all on function public.cambiar_estado_venta(uuid, text, text) from public;
grant execute on function public.cambiar_estado_venta(uuid, text, text) to authenticated;


-- ============================================================================
-- 3) Triggers sobre comprobantes_venta — CA-02, CA-05 (camino automático)
-- ============================================================================
-- SECURITY DEFINER: quien inserta el comprobante puede tener sólo
-- 'ventas.facturar' o sólo 'ventas.anular' (comprobantes_venta_write, 0031
-- acepta cualquiera de los dos), y el cambio de estado automático tiene que
-- funcionar en los dos casos sin depender de cuál de los dos permisos
-- tenga. auth.uid() sigue siendo el usuario real: SECURITY DEFINER sólo
-- cambia los permisos sobre tablas, no de dónde sale auth.uid() (misma nota
-- que en comprometer_stock, 0031).

-- CA-02: Factura sobre una venta Pendiente → Facturada.
create or replace function public.fn_facturar_venta_automatico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado_actual text;
begin
  select estado into v_estado_actual
  from public.ventas
  where id = new.venta_id
  for update;

  if v_estado_actual = 'Pendiente' then
    update public.ventas set estado = 'Facturada' where id = new.venta_id;

    insert into public.historial_estado_venta (
      venta_id, estado_anterior, estado_nuevo, motivo, usuario_id
    ) values (
      new.venta_id, 'Pendiente', 'Facturada', 'Factura emitida', auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_facturar_venta_automatico on public.comprobantes_venta;
create trigger trg_facturar_venta_automatico
  after insert on public.comprobantes_venta
  for each row
  when (new.tipo_comprobante = 'factura')
  execute function public.fn_facturar_venta_automatico();


-- CA-05: Nota de Crédito por el total de una venta Facturada → Anulada,
-- libera la reserva de stock. Una NC que no es por el total, o que llega
-- para una venta que no está Facturada (ya se anuló, ya se entregó, etc.),
-- se guarda igual pero no dispara el cambio de estado: mismo criterio que
-- el trigger de arriba, que tampoco actúa si la venta no está Pendiente.
create or replace function public.fn_anular_venta_por_nota_credito()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta  public.ventas;
  v_items  jsonb;
begin
  select * into v_venta from public.ventas where id = new.venta_id for update;

  if v_venta.estado is distinct from 'Facturada' or new.total is distinct from v_venta.total then
    return new;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad)),
    '[]'::jsonb
  )
    into v_items
  from public.detalle_venta
  where venta_id = new.venta_id;

  perform public.liberar_stock(v_venta.deposito_id, v_items);

  update public.ventas set estado = 'Anulada' where id = new.venta_id;

  insert into public.historial_estado_venta (
    venta_id, estado_anterior, estado_nuevo, motivo, usuario_id
  ) values (
    new.venta_id, 'Facturada', 'Anulada', 'Nota de crédito por el total', auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists trg_anular_venta_por_nota_credito on public.comprobantes_venta;
create trigger trg_anular_venta_por_nota_credito
  after insert on public.comprobantes_venta
  for each row
  when (new.tipo_comprobante = 'nota_credito')
  execute function public.fn_anular_venta_por_nota_credito();

commit;
