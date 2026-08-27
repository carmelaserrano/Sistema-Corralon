-- Migracion 0011: confirmacion de recepcion de mercaderia - US-STK-09
--
-- Historia: "Como Encargado de Deposito quiero confirmar la recepcion de
-- mercaderia para actualizar el stock unicamente cuando la recepcion sea
-- efectiva". Casos de prueba TC-STK-09-01 a TC-STK-09-04 (TC-STK-09-05 queda
-- fuera de alcance: el propio issue lo marca condicional a que exista el
-- modulo de Compras, que todavia no existe en este repo).
--
-- Mismo patron que movimientos_stock/detalle_movimiento (migraciones
-- 0001/0002/0007): recepciones y detalle_recepcion solo tienen policies de
-- SELECT e INSERT para 'authenticated'. El alta deja la recepcion en
-- 'pendiente' sin tocar stock; confirmar_recepcion() es SECURITY DEFINER
-- porque es el unico camino para llegar a 'confirmada' (no hay policy de
-- UPDATE) y es ahi donde se aplica el impacto real en stock_x_deposito y en
-- el costo medio ponderado del articulo.
--
-- orden_compra_id es un uuid SIN foreign key a proposito: el modulo de
-- Compras no existe todavia (no hay tabla orden_compra en el esquema).
-- Mismo tratamiento que movimientos_stock.comprobante (migracion 0007):
-- el campo existe, la validacion de existencia se difiere a cuando el
-- modulo de Compras se integre.
--
-- Codigos SQLSTATE propios que define esta migracion. Los lee
-- src/modules/stock/api/recepcionesApi.js y los traduce a .status:
--   RC001 -> 400  deposito destino, items o cantidades/costos invalidos
--   RC002 -> 404  la recepcion no existe
--   RC003 -> 409  la recepcion ya fue confirmada (idempotencia)
--   RC005 -> 409  la recepcion no tiene items (defensivo)
--   RC006 -> 423  hay otra operacion en proceso sobre el mismo articulo/deposito
-- Postgres ademas levanta 55P03 (lock_not_available) por su cuenta -> 423.

begin;

-- =====================================================================
-- 1) Tablas
-- =====================================================================

create table public.recepciones (
  id uuid primary key default gen_random_uuid(),

  orden_compra_id uuid,

  deposito_destino_id uuid not null
    references public.depositos(id)
    on delete restrict,

  estado_recepcion text not null default 'pendiente',

  observaciones text,

  created_by uuid not null default auth.uid()
    references auth.users(id),
  created_at timestamptz not null default now(),

  confirmado_by uuid references auth.users(id),
  confirmado_at timestamptz,

  constraint recepciones_estado_check
    check (estado_recepcion in ('pendiente', 'confirmada')),

  constraint recepciones_observaciones_no_vacio
    check (observaciones is null or length(btrim(observaciones)) > 0)
);

create table public.detalle_recepcion (
  id uuid primary key default gen_random_uuid(),

  recepcion_id uuid not null
    references public.recepciones(id)
    on delete cascade,

  producto_id uuid not null
    references public.productos(id),

  cantidad numeric not null check (cantidad > 0),
  costo_unitario numeric not null check (costo_unitario > 0),

  created_at timestamptz not null default now()
);

create index idx_recepciones_estado_created
  on public.recepciones (estado_recepcion, created_at desc);

create index idx_detalle_recepcion_recepcion
  on public.detalle_recepcion (recepcion_id);

create index idx_detalle_recepcion_producto
  on public.detalle_recepcion (producto_id);


-- =====================================================================
-- 2) RLS: igual criterio que movimientos_stock/detalle_movimiento
-- =====================================================================

alter table public.recepciones enable row level security;
alter table public.detalle_recepcion enable row level security;

create policy "recepciones_select_authenticated"
  on public.recepciones
  for select
  to authenticated
  using (true);

create policy "recepciones_insert_authenticated"
  on public.recepciones
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Sin policies de UPDATE/DELETE: confirmar_recepcion() (SECURITY DEFINER) es
-- el unico camino para pasar de 'pendiente' a 'confirmada'.

create policy "detalle_recepcion_select_authenticated"
  on public.detalle_recepcion
  for select
  to authenticated
  using (true);

create policy "detalle_recepcion_insert_authenticated"
  on public.detalle_recepcion
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.recepciones r
      where r.id = recepcion_id
        and r.created_by = auth.uid()
    )
  );

-- Sin policies de UPDATE/DELETE: detalle_recepcion es inmutable para
-- 'authenticated', igual que detalle_movimiento.


-- =====================================================================
-- 3) Alta: cabecera + N renglones de detalle en una sola transaccion
-- =====================================================================
-- SECURITY INVOKER a proposito: el alta si esta permitida por RLS, y asi
-- auth.uid() sigue siendo el usuario real (igual que crear_movimiento).
--
-- p_items es un jsonb array (mismo patron que cargar_conteos_inventario en
-- la migracion 0008): [{ "producto_id": "...", "cantidad": 1, "costo_unitario": 1 }, ...]
-- La capa JS traduce "articulo_id" (termino de dominio) a "producto_id"
-- antes de llamar a esta funcion.

create or replace function public.crear_recepcion(
  p_deposito_destino_id uuid,
  p_items jsonb,
  p_orden_compra_id uuid default null,
  p_observaciones text default null
)
returns setof public.recepciones
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_recepcion_id uuid;
  v_item jsonb;
  v_cantidad numeric;
  v_costo numeric;
begin
  if p_deposito_destino_id is null then
    raise exception 'El deposito destino es obligatorio'
      using errcode = 'RC001';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Los items son obligatorios'
      using errcode = 'RC001';
  end if;

  -- Se valida todo el array antes de insertar nada: si un item a mitad de
  -- camino fuera invalido, no debe quedar una cabecera con detalle parcial.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if nullif(btrim(coalesce(v_item->>'producto_id', '')), '') is null then
      raise exception 'El articulo es obligatorio en cada item'
        using errcode = 'RC001';
    end if;

    v_cantidad := (v_item->>'cantidad')::numeric;
    v_costo := (v_item->>'costo_unitario')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad debe ser mayor a 0'
        using errcode = 'RC001';
    end if;

    if v_costo is null or v_costo <= 0 then
      raise exception 'El costo unitario debe ser mayor a 0'
        using errcode = 'RC001';
    end if;
  end loop;

  insert into public.recepciones (
    orden_compra_id,
    deposito_destino_id,
    observaciones
  )
  values (
    p_orden_compra_id,
    p_deposito_destino_id,
    nullif(btrim(coalesce(p_observaciones, '')), '')
  )
  returning id into v_recepcion_id;

  insert into public.detalle_recepcion (
    recepcion_id,
    producto_id,
    cantidad,
    costo_unitario
  )
  select
    v_recepcion_id,
    (item->>'producto_id')::uuid,
    (item->>'cantidad')::numeric,
    (item->>'costo_unitario')::numeric
  from jsonb_array_elements(p_items) as item;

  return query
    select * from public.recepciones where id = v_recepcion_id;
end;
$$;

revoke all on function public.crear_recepcion(
  uuid, jsonb, uuid, text
) from public;

grant execute on function public.crear_recepcion(
  uuid, jsonb, uuid, text
) to authenticated;


-- =====================================================================
-- 4) Confirmacion: aplica el impacto en stock y recalcula el CMP
-- =====================================================================
-- SECURITY DEFINER obligatorio: no hay policy de UPDATE para 'authenticated'
-- sobre recepciones, asi que un .update() desde el navegador afectaria 0
-- filas en silencio (mismo razonamiento que confirmar_movimiento, 0007).
--
-- Por cada renglon de detalle_recepcion:
--   1) Bloquea la fila de productos (FOR UPDATE NOWAIT) para serializar el
--      recalculo de CMP entre confirmaciones concurrentes del mismo articulo.
--   2) Lee el stock actual del articulo EN TODOS LOS DEPOSITOS: el CMP es
--      por articulo, no por deposito (docs/der.md).
--   3) CMP_nuevo = (stock_total * CMP_actual + cantidad * costo_unitario)
--                  / (stock_total + cantidad)
--      y lo guarda en productos.costo_medio_ponderado.
--   4) Suma (o da de alta) el stock en stock_x_deposito del destino.
--   5) Inserta un movimientos_stock tipo 'ingreso' ya confirmado, con su
--      detalle_movimiento, para trazabilidad (el CA "genera movimiento_stock
--      tipo ingreso"). No pasa por crear_movimiento/confirmar_movimiento:
--      esta funcion ya corre con privilegios de postgres y aplica el mismo
--      efecto en una sola pasada.
--
-- No hay pg_notify ni tabla de eventos para "disparar" el recalculo de CMP
-- (US-STK-13): igual que alertas_stock (migracion 0010), el efecto ocurre
-- dentro de la misma transaccion, sin job ni polling.

create or replace function public.confirmar_recepcion(p_recepcion_id uuid)
returns setof public.recepciones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rec public.recepciones%rowtype;
  v_producto_id uuid;
  v_item record;
  v_stock_total numeric;
  v_cmp_actual numeric;
  v_cmp_nuevo numeric;
  v_movimiento_id uuid;
  v_tipo_ingreso_id uuid;
begin
  select * into v_rec
  from public.recepciones
  where id = p_recepcion_id
  for update nowait;

  if not found then
    raise exception 'La recepcion no existe'
      using errcode = 'RC002';
  end if;

  if v_rec.estado_recepcion <> 'pendiente' then
    raise exception 'La recepcion ya esta %', v_rec.estado_recepcion
      using errcode = 'RC003';
  end if;

  if not exists (
    select 1 from public.detalle_recepcion where recepcion_id = v_rec.id
  ) then
    raise exception 'La recepcion no tiene items cargados'
      using errcode = 'RC005';
  end if;

  -- Locks deterministas por articulo (orden por producto_id), antes de
  -- tocar nada: mismo motivo que confirmar_movimiento (0007), la fila de
  -- stock_x_deposito del destino puede no existir todavia y un
  -- INSERT .. ON CONFLICT esperaria en vez de fallar rapido.
  for v_producto_id in
    select distinct producto_id
    from public.detalle_recepcion
    where recepcion_id = v_rec.id
    order by producto_id
  loop
    if not pg_try_advisory_xact_lock(
      hashtext(v_producto_id::text),
      hashtext(v_rec.deposito_destino_id::text)
    ) then
      raise exception 'Hay otra operacion en proceso sobre el mismo articulo/deposito'
        using errcode = 'RC006';
    end if;
  end loop;

  select tm.id into v_tipo_ingreso_id
  from public.tipos_movimiento tm
  where tm.codigo = 'ingreso';

  for v_item in
    select producto_id, cantidad, costo_unitario
    from public.detalle_recepcion
    where recepcion_id = v_rec.id
    order by created_at, id
  loop
    -- Bloquea el articulo para serializar el recalculo de CMP.
    select costo_medio_ponderado into v_cmp_actual
    from public.productos
    where id = v_item.producto_id
    for update nowait;

    select coalesce(sum(cantidad), 0) into v_stock_total
    from public.stock_x_deposito
    where producto_id = v_item.producto_id;

    v_cmp_nuevo := (
      (v_stock_total * v_cmp_actual) + (v_item.cantidad * v_item.costo_unitario)
    ) / (v_stock_total + v_item.cantidad);

    update public.productos
    set costo_medio_ponderado = v_cmp_nuevo
    where id = v_item.producto_id;

    insert into public.stock_x_deposito (producto_id, deposito_id, cantidad, updated_at)
    values (v_item.producto_id, v_rec.deposito_destino_id, v_item.cantidad, now())
    on conflict (producto_id, deposito_id) do update
      set cantidad = stock_x_deposito.cantidad + excluded.cantidad,
          updated_at = now();

    insert into public.movimientos_stock (
      tipo_movimiento_id,
      deposito_destino_id,
      estado_movimiento,
      comprobante,
      observaciones
    )
    values (
      v_tipo_ingreso_id,
      v_rec.deposito_destino_id,
      'confirmado',
      'Recepcion ' || v_rec.id,
      v_rec.observaciones
    )
    returning id into v_movimiento_id;

    insert into public.detalle_movimiento (movimiento_id, producto_id, cantidad)
    values (v_movimiento_id, v_item.producto_id, v_item.cantidad);
  end loop;

  update public.recepciones
  set estado_recepcion = 'confirmada',
      confirmado_by = auth.uid(),
      confirmado_at = now()
  where id = v_rec.id;

  return query
    select * from public.recepciones where id = v_rec.id;
end;
$$;

alter function public.confirmar_recepcion(uuid) owner to postgres;

revoke all on function public.confirmar_recepcion(uuid) from public;
grant execute on function public.confirmar_recepcion(uuid) to authenticated;

commit;
