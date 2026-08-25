-- Migracion 0005: gestion de depositos - US-STK-05

begin;


-- 1) Agregar los campos requeridos por la historia de usuario
alter table depositos
  add column if not exists localidad text,
  add column if not exists capacidad_maxima numeric;

-- 2) Limpiar datos de prueba asociados al deposito viejo
delete from stock_x_deposito
where deposito_id in (
  select id
  from depositos
  where nombre = 'Deposito Centro'
);

delete from depositos
where nombre = 'Deposito Centro';

-- 3) Proteger los registros de stock antes de permitir bajas de depositos
-- Antes existia ON DELETE CASCADE.
-- Con RESTRICT, un deposito con cualquier registro en stock_x_deposito
-- no puede eliminarse, aunque la cantidad sea 0.
alter table stock_x_deposito
  drop constraint if exists stock_x_deposito_deposito_id_fkey;

alter table stock_x_deposito
  add constraint stock_x_deposito_deposito_id_fkey
  foreign key (deposito_id)
  references depositos(id)
  on delete restrict;
-- 4) Campos obligatorios
alter table depositos
  alter column direccion set not null,
  alter column localidad set not null,
  alter column capacidad_maxima set not null;

-- 5) La capacidad maxima debe ser mayor a cero
alter table depositos
  add constraint depositos_capacidad_maxima_check
  check (capacidad_maxima > 0);

-- 6) El nombre del deposito no puede repetirse
alter table depositos
  add constraint depositos_nombre_unique
  unique (nombre);

-- 7) Tipos de deposito
insert into tipos_deposito (nombre)
values
  ('Minorista'),
  ('Mayorista'),
  ('Mixto')
on conflict (nombre) do nothing;

-- 8) Depositos iniciales

-- Sucursal Norte: Minorista - 5.000 unidades
insert into depositos (
  nombre,
  direccion,
  localidad,
  tipo_deposito_id,
  capacidad_maxima
)
select
  'Sucursal Norte',
  'Av. Bolivia 2500',
  'Salta',
  id,
  5000
from tipos_deposito
where nombre = 'Minorista'
on conflict (nombre) do nothing;

-- Sucursal Centro: Mixto - 10.000 unidades
insert into depositos (
  nombre,
  direccion,
  localidad,
  tipo_deposito_id,
  capacidad_maxima
)
select
  'Sucursal Centro',
  'Caseros 850',
  'Salta',
  id,
  10000
from tipos_deposito
where nombre = 'Mixto'
on conflict (nombre) do nothing;

-- Sucursal Sur: Mayorista - 15.000 unidades
insert into depositos (
  nombre,
  direccion,
  localidad,
  tipo_deposito_id,
  capacidad_maxima
)
select
  'Sucursal Sur',
  'Av. Ex Combatientes de Malvinas 3200',
  'Salta',
  id,
  15000
from tipos_deposito
where nombre = 'Mayorista'
on conflict (nombre) do nothing;

commit;