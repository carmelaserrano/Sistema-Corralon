-- Migracion 0006: configuracion de stock por deposito - US-STK-06

begin;

-- US-STK-06 requiere informar stock minimo y maximo.
-- La tabla configuracion_stock ya existe desde una migracion anterior.
-- Se hace obligatorio max_stock para cumplir el contrato de la historia.
alter table public.configuracion_stock
  alter column max_stock set not null;

commit;