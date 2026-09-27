-- Publica el conjunto controlado de productos reales usado por la demo web.
-- Los filtros por SKU y por valor actual hacen que la migracion sea acotada
-- e idempotente. No modifica precios ni existencias.
begin;

update public.productos
set publicado_web = true
where sku in (
  'QA14-01',
  'QA14-04',
  'ART-000001',
  'QA14-05',
  'QA14-02',
  'QA14-03',
  'QA14-06'
)
and publicado_web is distinct from true;

update public.productos
set publicado_web = false
where sku in (
  'QA-S3-18-001',
  'QA14-08',
  'QA14-07'
)
and publicado_web is distinct from false;

commit;
