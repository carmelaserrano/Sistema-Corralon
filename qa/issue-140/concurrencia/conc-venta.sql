\set uid :uid
begin;
select set_config('request.jwt.claim.sub', :'uid', true);
select set_config('request.jwt.claims', '{"app_metadata":{"rol":"admin"}}', true);
set local role authenticated;
select 'venta' as op, numero, estado from registrar_venta(
  jsonb_build_object('deposito_id',(select id from depositos order by nombre limit 1),'cliente_id',(select id from clientes where numero_documento='30111222')),
  '[{"producto_id":"00000000-0000-0000-0000-00000000b001","cantidad":1,"precio_unitario":100}]'::jsonb);
select pg_sleep(2);
commit;
