\set uid :uid
begin;
select set_config('request.jwt.claim.sub', :'uid', true);
select set_config('request.jwt.claims', '{"app_metadata":{"rol":"admin"}}', true);
set local role authenticated;
select 'anulada' as op, numero, estado from cambiar_estado_venta((select id from ventas order by numero desc limit 1), 'Anulada', 'concurrencia');
select pg_sleep(2);
commit;
