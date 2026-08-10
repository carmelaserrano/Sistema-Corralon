-- Módulo de Stock: sucursales, productos y stock por sucursal

create extension if not exists "pgcrypto";

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  unit text not null default 'unidad',
  category text,
  created_at timestamptz not null default now()
);

create table if not exists stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  quantity numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, branch_id)
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  branch_id uuid not null references branches(id) on delete restrict,
  type text not null check (type in ('in', 'out', 'transfer')),
  quantity numeric not null check (quantity > 0),
  reference text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- RLS: por ahora, cualquier usuario autenticado puede leer y escribir.
-- TODO: restringir por sucursal cuando exista la tabla profiles (user -> branch_id, role).
alter table branches enable row level security;
alter table products enable row level security;
alter table stock enable row level security;
alter table stock_movements enable row level security;

create policy "branches: lectura autenticados" on branches
  for select to authenticated using (true);
create policy "products: lectura autenticados" on products
  for select to authenticated using (true);
create policy "stock: lectura autenticados" on stock
  for select to authenticated using (true);
create policy "stock_movements: lectura autenticados" on stock_movements
  for select to authenticated using (true);

create policy "products: escritura autenticados" on products
  for all to authenticated using (true) with check (true);
create policy "stock: escritura autenticados" on stock
  for all to authenticated using (true) with check (true);
create policy "stock_movements: escritura autenticados" on stock_movements
  for all to authenticated using (true) with check (true);
create policy "branches: escritura autenticados" on branches
  for all to authenticated using (true) with check (true);
