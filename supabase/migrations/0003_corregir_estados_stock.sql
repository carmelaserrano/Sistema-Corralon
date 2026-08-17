-- Migración 0003: corregir valores permitidos de estados en productos y movimientos_stock
-- Requisitos: mantener estructura de tablas, convertir valores incompatibles,
-- y recrear constraints según US-STK-01 y funcionalidad de movimientos.

begin;

-- 1) PRODUCTOS: convertir 'descontinuado' -> 'inactivo', recrear constraint
update productos set estado_producto = 'inactivo' where estado_producto = 'descontinuado';

alter table productos drop constraint if exists productos_estado_check;

alter table productos
  add constraint productos_estado_check check (estado_producto in ('activo','inactivo'));

-- Mantener default 'activo' (no cambia si ya está)
alter table productos
  alter column estado_producto set default 'activo';

-- 2) MOVIMIENTOS_STOCK: convertir 'anulado' -> 'cancelado', ajustar default y constraint
-- Reordenar operaciones: eliminar constraint antes de convertir valores incompatibles
alter table movimientos_stock
  drop constraint if exists movimientos_estado_check;

update movimientos_stock
set estado_movimiento = 'cancelado'
where estado_movimiento = 'anulado';

alter table movimientos_stock
  alter column estado_movimiento set default 'pendiente';

alter table movimientos_stock
  add constraint movimientos_estado_check
  check (estado_movimiento in ('pendiente','confirmado','cancelado'));

commit;

-- Fin migración 0003
