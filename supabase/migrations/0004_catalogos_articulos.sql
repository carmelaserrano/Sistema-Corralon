-- Migración 0004: catálogos activos, factores de conversión y ajustes de artículos
--
-- Historias: US-STK-01 (#6), US-STK-02 (#7), US-STK-03 (#8), US-STK-04 (#9)
--
-- No modifica migraciones anteriores (regla del repo: una migración ya
-- mergeada a develop no se toca, se corrige con una nueva).

begin;

-- =====================================================================
-- 1) Estado activo/inactivo en los catálogos
-- =====================================================================
-- US-STK-01 CA-03 exige que la categoría, la marca y la unidad de medida
-- elegidas estén ACTIVAS, y US-STK-04 CA-03 exige que solo puedan
-- seleccionarse unidades activas. Hoy no existe forma de expresar eso:
-- las tres tablas solo tienen nombre. Sin esta columna, el caso de error
-- 422 (TC-STK-01-06) y TC-STK-04-02 son inejecutables.
--
-- Default true para que las filas ya existentes queden activas y no
-- cambie el comportamiento actual de ninguna pantalla.

alter table categorias
  add column if not exists activo boolean not null default true;

alter table marcas
  add column if not exists activo boolean not null default true;

alter table unidades_medida
  add column if not exists activo boolean not null default true;

-- =====================================================================
-- 2) Factores de conversión en unidades de medida
-- =====================================================================
-- US-STK-04 CA-04 (RF-PROD-01) pide registrar el factor de conversión y
-- la unidad base. La tabla hoy solo tiene nombre y abreviatura.
--
-- factor_conversion default 1: una unidad base (Bolsa, Unidad) convierte
-- 1:1, que es exactamente el ejemplo del contrato de la historia.
--
-- unidad_base_id es una FK a la propia tabla: es lo que hace que apuntar
-- a un id inexistente falle en la base, y de ahí sale el 422
-- (TC-STK-04-05). Es nullable porque una unidad base no tiene base.

alter table unidades_medida
  add column if not exists factor_conversion numeric not null default 1,
  add column if not exists unidad_base_id uuid references unidades_medida(id);

-- El check es el que produce el 400 de TC-STK-04-04 (factor <= 0).
-- Postgres no tiene "add constraint if not exists", así que primero se
-- dropea, igual que hace la migración 0003.
alter table unidades_medida
  drop constraint if exists unidades_medida_factor_positivo;

alter table unidades_medida
  add constraint unidades_medida_factor_positivo
  check (factor_conversion > 0);

-- Una unidad no puede declararse base de sí misma. No lo pide ningún
-- criterio de aceptación, pero rompe cualquier cálculo de conversión.
alter table unidades_medida
  drop constraint if exists unidades_medida_base_distinta;

alter table unidades_medida
  add constraint unidades_medida_base_distinta
  check (unidad_base_id is null or unidad_base_id <> id);

-- =====================================================================
-- 3) Rellenar categoría y marca de los artículos que quedaron sin ellas
-- =====================================================================
-- El artículo de prueba "Cemento Salta" (SKU CEM001) tiene categoria_id
-- y marca_id en NULL, así que el SET NOT NULL del bloque 4 fallaría.
--
-- No lo borramos: stock_x_deposito y configuracion_stock referencian
-- productos con ON DELETE CASCADE, y un delete se llevaría en silencio
-- el stock que alguien haya cargado para probar la pantalla de Stock.
-- Rellenar es reversible; borrar no.
--
-- Estas dos filas son placeholders de datos heredados, no catálogo real:
-- una vez que el ABM esté andando, ese artículo se corrige desde la UI y
-- estos placeholders se pueden desactivar o eliminar.

insert into categorias (nombre) values ('Sin categoría')
  on conflict (nombre) do nothing;

insert into marcas (nombre) values ('Sin marca')
  on conflict (nombre) do nothing;

update productos
set categoria_id = (select id from categorias where nombre = 'Sin categoría')
where categoria_id is null;

update productos
set marca_id = (select id from marcas where nombre = 'Sin marca')
where marca_id is null;

-- =====================================================================
-- 4) Categoría y marca obligatorias en artículos
-- =====================================================================
-- US-STK-01 devuelve 400 si falta categoria_id o marca_id (TC-STK-01-04).
-- Hoy las columnas son nullables, así que esa regla viviría solo en
-- JavaScript: cualquier insert por fuera de la app metería un artículo
-- sin clasificar. Con NOT NULL la garantiza la base.

alter table productos
  alter column categoria_id set not null,
  alter column marca_id     set not null;

-- =====================================================================
-- 5) SKU autogenerado
-- =====================================================================
-- productos.sku es NOT NULL UNIQUE, pero el contrato de POST /api/articulos
-- no incluye sku: el alta fallaría con 23502 (not null violation).
--
-- Con este default cada artículo nuevo recibe ART-000001, ART-000002...
-- sin que el usuario lo cargue, y la columna sigue siendo obligatoria y
-- única. Se usa una secuencia y no un "contar + 1" porque una secuencia
-- nunca entrega el mismo número dos veces, ni con altas simultáneas.

create sequence if not exists productos_sku_seq;

-- Ata la secuencia a la columna: si algún día se elimina la columna, la
-- secuencia se va con ella en vez de quedar huérfana.
alter sequence productos_sku_seq owned by productos.sku;

alter table productos
  alter column sku
  set default ('ART-' || lpad(nextval('productos_sku_seq')::text, 6, '0'));

-- El rol authenticated tiene que poder consumir la secuencia para que el
-- default se evalúe en un insert desde la app.
grant usage, select on sequence productos_sku_seq to authenticated;

commit;

-- Fin migración 0004
