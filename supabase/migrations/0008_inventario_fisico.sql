-- Migracion 0008: inventario fisico y conciliacion - US-STK-11

begin;

create table public.inventario_fisico (
  id uuid primary key default gen_random_uuid(),

  deposito_id uuid not null
    references public.depositos(id)
    on delete restrict,

  estado text not null default 'en_carga',

  created_by uuid not null default auth.uid()
    references auth.users(id),

  created_at timestamptz not null default now(),

  enviado_at timestamptz,

  aprobado_by uuid
    references auth.users(id),

  aprobado_at timestamptz,

  constraint inventario_fisico_estado_check
    check (
      estado in (
        'en_carga',
        'pendiente_aprobacion',
        'aprobado'
      )
    )
);

create table public.detalle_inventario_fisico (
  id uuid primary key default gen_random_uuid(),

  inventario_fisico_id uuid not null
    references public.inventario_fisico(id)
    on delete cascade,

  producto_id uuid not null
    references public.productos(id)
    on delete restrict,

  stock_teorico numeric not null,

  cantidad_contada numeric,

  diferencia numeric generated always as (
    cantidad_contada - stock_teorico
  ) stored,

  created_at timestamptz not null default now(),

  constraint detalle_inventario_stock_teorico_nonneg
    check (stock_teorico >= 0),

  constraint detalle_inventario_cantidad_contada_nonneg
    check (
      cantidad_contada is null
      or cantidad_contada >= 0
    ),

  constraint detalle_inventario_producto_unique
    unique (inventario_fisico_id, producto_id)
);

create unique index idx_inventario_fisico_deposito_abierto
on public.inventario_fisico (deposito_id)
where estado in (
  'en_carga',
  'pendiente_aprobacion'
);

create index idx_inventario_fisico_deposito_fecha
on public.inventario_fisico (
  deposito_id,
  created_at desc
);

create index idx_detalle_inventario_producto
on public.detalle_inventario_fisico (producto_id);

alter table public.inventario_fisico
enable row level security;

alter table public.detalle_inventario_fisico
enable row level security;

create policy "inventario_fisico_select_authenticated"
on public.inventario_fisico
for select
to authenticated
using (true);

create policy "inventario_fisico_insert_authenticated"
on public.inventario_fisico
for insert
to authenticated
with check (created_by = auth.uid());

create policy "inventario_fisico_update_authenticated"
on public.inventario_fisico
for update
to authenticated
using (true)
with check (true);

create policy "detalle_inventario_select_authenticated"
on public.detalle_inventario_fisico
for select
to authenticated
using (true);

create policy "detalle_inventario_insert_authenticated"
on public.detalle_inventario_fisico
for insert
to authenticated
with check (
  exists (
    select 1
    from public.inventario_fisico i
    where i.id = inventario_fisico_id
      and i.estado = 'en_carga'
  )
);

create policy "detalle_inventario_update_authenticated"
on public.detalle_inventario_fisico
for update
to authenticated
using (
  exists (
    select 1
    from public.inventario_fisico i
    where i.id = inventario_fisico_id
      and i.estado = 'en_carga'
  )
)
with check (
  exists (
    select 1
    from public.inventario_fisico i
    where i.id = inventario_fisico_id
      and i.estado = 'en_carga'
  )
);

create or replace function public.iniciar_inventario_fisico(
  p_deposito_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inventario_id uuid;
  v_cantidad_articulos integer;
begin
  -- Verificar que exista el depósito.
  if not exists (
    select 1
    from public.depositos
    where id = p_deposito_id
  ) then
    raise exception 'El depósito no existe'
      using errcode = 'P0002';
  end if;

  -- No permitir más de una toma abierta por depósito.
  if exists (
    select 1
    from public.inventario_fisico
    where deposito_id = p_deposito_id
      and estado in ('en_carga', 'pendiente_aprobacion')
  ) then
    raise exception 'Ya existe una toma de inventario abierta para ese depósito'
      using errcode = '23505';
  end if;

  -- Debe existir al menos un artículo vinculado al depósito.
  select count(*)
  into v_cantidad_articulos
  from public.stock_x_deposito
  where deposito_id = p_deposito_id;

  if v_cantidad_articulos = 0 then
    raise exception 'El depósito no tiene artículos vinculados para inventariar'
      using errcode = 'P0001';
  end if;

  -- Crear la cabecera.
  insert into public.inventario_fisico (
    deposito_id,
    estado
  )
  values (
    p_deposito_id,
    'en_carga'
  )
  returning id into v_inventario_id;

  -- Crear todos los detalles y congelar el stock teórico.
  insert into public.detalle_inventario_fisico (
    inventario_fisico_id,
    producto_id,
    stock_teorico
  )
  select
    v_inventario_id,
    producto_id,
    cantidad
  from public.stock_x_deposito
  where deposito_id = p_deposito_id;

  return v_inventario_id;
end;
$$;

create or replace function public.cargar_conteos_inventario(
  p_inventario_id uuid,
  p_conteos jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado text;
  v_total_detalles integer;
  v_total_conteos integer;
  v_total_productos_distintos integer;
begin
  -- Verificar que exista la toma y obtener su estado.
  select estado
  into v_estado
  from public.inventario_fisico
  where id = p_inventario_id;

  if not found then
    raise exception 'La toma de inventario no existe'
      using errcode = 'P0002';
  end if;

  if v_estado <> 'en_carga' then
    raise exception 'Solo se pueden cargar conteos en una toma en estado en_carga'
      using errcode = 'P0001';
  end if;

  -- Debe recibirse un array JSON.
  if p_conteos is null
     or jsonb_typeof(p_conteos) <> 'array'
     or jsonb_array_length(p_conteos) = 0 then
    raise exception 'El conteo físico es obligatorio'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_total_detalles
  from public.detalle_inventario_fisico
  where inventario_fisico_id = p_inventario_id;

  v_total_conteos := jsonb_array_length(p_conteos);

  -- No permitir guardado parcial.
  if v_total_conteos <> v_total_detalles then
    raise exception 'Debe informarse el conteo de todos los artículos de la toma'
      using errcode = 'P0001';
  end if;

  -- No permitir artículos repetidos.
  select count(distinct elemento->>'producto_id')
  into v_total_productos_distintos
  from jsonb_array_elements(p_conteos) as elemento;

  if v_total_productos_distintos <> v_total_conteos then
    raise exception 'No se puede repetir un artículo en el conteo'
      using errcode = 'P0001';
  end if;

  -- Validar que todos los artículos correspondan a esta toma.
  if exists (
    select 1
    from jsonb_array_elements(p_conteos) as elemento
    where not exists (
      select 1
      from public.detalle_inventario_fisico d
      where d.inventario_fisico_id = p_inventario_id
        and d.producto_id = (elemento->>'producto_id')::uuid
    )
  ) then
    raise exception 'El conteo incluye un artículo que no pertenece a la toma'
      using errcode = 'P0001';
  end if;

  -- Validar cantidades.
  if exists (
    select 1
    from jsonb_array_elements(p_conteos) as elemento
    where elemento->>'cantidad_contada' is null
       or (elemento->>'cantidad_contada')::numeric < 0
  ) then
    raise exception 'Las cantidades contadas deben informarse y no pueden ser negativas'
      using errcode = 'P0001';
  end if;

  -- Actualizar todos los detalles dentro de la misma transacción.
  update public.detalle_inventario_fisico d
  set cantidad_contada =
    (elemento->>'cantidad_contada')::numeric
  from jsonb_array_elements(p_conteos) as elemento
  where d.inventario_fisico_id = p_inventario_id
    and d.producto_id = (elemento->>'producto_id')::uuid;
end;
$$;

commit;