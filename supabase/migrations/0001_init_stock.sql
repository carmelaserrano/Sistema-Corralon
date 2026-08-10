-- Módulo de Stock

create extension if not exists "pgcrypto";

create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists unidades_medida (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  abreviatura text not null,
  created_at timestamptz not null default now()
);

create table if not exists tipos_deposito (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists depositos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  tipo_deposito_id uuid not null references tipos_deposito(id),
  created_at timestamptz not null default now()
);

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  nombre text not null,
  descripcion text,
  categoria_id uuid references categorias(id),
  marca_id uuid references marcas(id),
  unidad_medida_id uuid not null references unidades_medida(id),
  created_at timestamptz not null default now()
);

create table if not exists stock_x_deposito (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  deposito_id uuid not null references depositos(id) on delete cascade,
  cantidad numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (producto_id, deposito_id)
);

create table if not exists tipos_movimiento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  tipo_movimiento_id uuid not null references tipos_movimiento(id),
  deposito_origen_id uuid references depositos(id),
  deposito_destino_id uuid references depositos(id),
  fecha timestamptz not null default now(),
  observaciones text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint movimiento_tiene_deposito check (
    deposito_origen_id is not null or deposito_destino_id is not null
  )
);

create table if not exists detalle_movimiento (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references movimientos_stock(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad numeric not null check (cantidad > 0),
  created_at timestamptz not null default now()
);

-- RLS: por ahora, cualquier usuario autenticado puede leer y escribir todo.
-- TODO: restringir por depósito cuando exista una tabla de perfiles (usuario -> depósito, rol).
alter table categorias enable row level security;
alter table marcas enable row level security;
alter table unidades_medida enable row level security;
alter table tipos_deposito enable row level security;
alter table depositos enable row level security;
alter table productos enable row level security;
alter table stock_x_deposito enable row level security;
alter table tipos_movimiento enable row level security;
alter table movimientos_stock enable row level security;
alter table detalle_movimiento enable row level security;

create policy "categorias: acceso autenticados" on categorias
  for all to authenticated using (true) with check (true);
create policy "marcas: acceso autenticados" on marcas
  for all to authenticated using (true) with check (true);
create policy "unidades_medida: acceso autenticados" on unidades_medida
  for all to authenticated using (true) with check (true);
create policy "tipos_deposito: acceso autenticados" on tipos_deposito
  for all to authenticated using (true) with check (true);
create policy "depositos: acceso autenticados" on depositos
  for all to authenticated using (true) with check (true);
create policy "productos: acceso autenticados" on productos
  for all to authenticated using (true) with check (true);
create policy "stock_x_deposito: acceso autenticados" on stock_x_deposito
  for all to authenticated using (true) with check (true);
create policy "tipos_movimiento: acceso autenticados" on tipos_movimiento
  for all to authenticated using (true) with check (true);
create policy "movimientos_stock: acceso autenticados" on movimientos_stock
  for all to authenticated using (true) with check (true);
create policy "detalle_movimiento: acceso autenticados" on detalle_movimiento
  for all to authenticated using (true) with check (true);
