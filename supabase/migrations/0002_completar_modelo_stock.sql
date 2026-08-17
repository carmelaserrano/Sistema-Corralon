-- Completa el modelo de Stock (issue #5)
-- No modifica 0001_init_stock.sql

begin;

-- 1) Tabla de configuración de stock por producto y depósito
create table if not exists configuracion_stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  deposito_id uuid not null references depositos(id) on delete cascade,
  min_stock numeric not null default 0,
  max_stock numeric,
  created_at timestamptz not null default now(),
  constraint configuracion_stock_producto_deposito_unique unique (producto_id, deposito_id),
  constraint configuracion_stock_min_nonneg check (min_stock >= 0),
  constraint configuracion_stock_max_check check (max_stock is null or max_stock >= min_stock)
);

-- Habilitar RLS y policy similar a las tablas creadas en 0001
alter table configuracion_stock enable row level security;

create policy "configuracion_stock: acceso autenticados" on configuracion_stock
  for all to authenticated using (true) with check (true);

-- 2) Productos: código de barras, estado y costo medio ponderado (por artículo)
alter table productos
  add column if not exists codigo_barras text unique,
  add column if not exists estado_producto text not null default 'activo',
  add column if not exists costo_medio_ponderado numeric not null default 0;

alter table productos
  add constraint productos_estado_check check (estado_producto in ('activo','inactivo','descontinuado'));

alter table productos
  add constraint productos_cmp_nonneg check (costo_medio_ponderado >= 0);

-- 3) Stock por depósito: agregar comprometido y chequeos mínimos
alter table stock_x_deposito
  add column if not exists comprometido numeric not null default 0;

alter table stock_x_deposito
  add constraint stock_x_deposito_comprometido_nonneg check (comprometido >= 0);

-- Asegurar cantidad no-negativa si la aplicación lo permite
alter table stock_x_deposito
  add constraint stock_x_deposito_cantidad_nonneg check (cantidad >= 0);

-- Índices útiles para consultas por depósito/producto (evitar duplicar UNIQUE existentes)
create index if not exists idx_stock_por_deposito_producto on stock_x_deposito (deposito_id, producto_id);

-- 4) Movimientos: estado y default para created_by (para no romper INSERTs posteriores)
alter table movimientos_stock
  add column if not exists estado_movimiento text not null default 'confirmado';

alter table movimientos_stock
  add constraint movimientos_estado_check check (estado_movimiento in ('pendiente','confirmado','anulado'));

-- Establecer DEFAULT para created_by a auth.uid() (no cambia datos existentes)
alter table movimientos_stock
  alter column created_by set default auth.uid();

-- Reemplazamos el índice compuesto por dos índices optimizados por depósito y fecha descendente
create index if not exists idx_movimientos_origen_fecha on movimientos_stock (deposito_origen_id, fecha desc);
create index if not exists idx_movimientos_destino_fecha on movimientos_stock (deposito_destino_id, fecha desc);

-- 5) Índices en detalle_movimiento para consultas por producto
create index if not exists idx_detallemovimiento_producto on detalle_movimiento (producto_id);

-- 6) Políticas: hacer movimientos_stock y detalle_movimiento INSERT-only para 'authenticated'
-- Eliminamos las policies genéricas creadas en la migración 0001 y las reemplazamos por SELECT/INSERT solamente.
drop policy if exists "movimientos_stock: acceso autenticados" on movimientos_stock;
drop policy if exists "detalle_movimiento: acceso autenticados" on detalle_movimiento;

create policy "movimientos_stock_select_authenticated" on movimientos_stock
  for select to authenticated using (true);

create policy "movimientos_stock_insert_authenticated" on movimientos_stock
  for insert to authenticated with check (created_by = auth.uid());

-- No crear policies de UPDATE/DELETE para movimientos_stock -> quedan inmutables para 'authenticated'


create policy "detalle_movimiento_select_authenticated" on detalle_movimiento
  for select to authenticated using (true);

create policy "detalle_movimiento_insert_authenticated" on detalle_movimiento
  for insert to authenticated with check (
    exists (
      select 1 from movimientos_stock m
      where m.id = movimiento_id
        and m.created_by = auth.uid()
    )
  );

-- No crear policies de UPDATE/DELETE para detalle_movimiento -> quedan inmutables para 'authenticated'

-- 7) Índices adicionales para configuracion_stock (optimizar búsquedas por depósito)
create index if not exists idx_configuracion_stock_deposito_producto on configuracion_stock (deposito_id, producto_id);

commit;

-- Fin migración 0002
