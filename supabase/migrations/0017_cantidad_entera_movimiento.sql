-- CORR-02: los movimientos operativos se cargan en unidades enteras.
-- NOT VALID evita bloquear el despliegue si hubiera datos historicos decimales,
-- pero PostgreSQL aplica el constraint a todos los renglones nuevos.

begin;

alter table public.detalle_movimiento
  drop constraint if exists detalle_movimiento_cantidad_entera;

alter table public.detalle_movimiento
  add constraint detalle_movimiento_cantidad_entera
  check (cantidad = trunc(cantidad)) not valid;

commit;
