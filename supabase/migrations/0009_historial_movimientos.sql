-- Migracion 0009: historial y trazabilidad de movimientos - US-STK-10

begin;

-- Búsqueda cronológica general.
create index if not exists idx_movimientos_fecha
  on public.movimientos_stock (fecha desc);

-- Filtro por depósito origen y rango de fecha.
create index if not exists idx_movimientos_origen_fecha
  on public.movimientos_stock (deposito_origen_id, fecha desc);

-- Filtro por depósito destino y rango de fecha.
create index if not exists idx_movimientos_destino_fecha
  on public.movimientos_stock (deposito_destino_id, fecha desc);

-- Filtro por tipo de movimiento y rango de fecha.
create index if not exists idx_movimientos_tipo_fecha
  on public.movimientos_stock (tipo_movimiento_id, fecha desc);

-- Permite localizar rápidamente todos los movimientos de un artículo.
create index if not exists idx_detalle_movimiento_producto_movimiento
  on public.detalle_movimiento (producto_id, movimiento_id);

commit;