-- Migracion 0007: inventario fisico y conciliacion - US-STK-11

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

commit;