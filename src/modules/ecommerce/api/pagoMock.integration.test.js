// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

const uid = '00000000-0000-0000-0000-000000000001'
const pedidoId = '00000000-0000-0000-0000-000000000002'
let db
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select current_setting('test.uid')::uuid $$;
    create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
    create table clientes(id uuid primary key, usuario_web_id uuid, estado text);
    create table pedidos_web(id uuid primary key, cliente_id uuid, estado text, referencia_pago text,
      ultimo_pago_referencia text, pago_estado text, pago_motivo text, pagado_at timestamptz, vence_at timestamptz);
    create table historial_estado_pedido(pedido_id uuid, estado_anterior text, estado_nuevo text, motivo text);
    create table carritos(id uuid primary key, cliente_id uuid, updated_at timestamptz);
    create table items_carrito(carrito_id uuid);
    select set_config('test.uid', '${uid}', false);
  `)
  for (const nombre of ['0066_pago_mock', '0071_medios_pago_mock']) {
    await db.exec(readFileSync(`supabase/migrations/${nombre}.sql`, 'utf8'))
  }
}, 30000)
beforeEach(async () => {
  await db.exec(`begin;
    insert into clientes values ('${uid}', '${uid}', 'Activo');
    insert into pedidos_web(id, cliente_id, estado, vence_at)
      values ('${pedidoId}', '${uid}', 'Pendiente de pago', now() + interval '1 hour');
    insert into carritos values ('${uid}', '${uid}', now());
    insert into items_carrito values ('${uid}');
  `)
})
afterEach(async () => { await db.exec('rollback;') })
afterAll(async () => { await db?.close() })
const pagar = async (medio, estado = 'approved') => (await db.query(
  'select public.confirmar_pago_mock($1::uuid, $2::text, $3::text) as pedido', [pedidoId, estado, medio],
)).rows[0].pedido

it.each(['tarjeta', 'mercado_pago', 'transferencia'])('confirma %s una vez y conserva el medio del primer pago', async medio => {
  const primero = await pagar(medio)
  expect(primero.estado).toBe('Pagado')
  expect(primero.referencia_pago).toBe(`mock:${medio}:${pedidoId}`)
  expect(primero.pagado_at).toBeTruthy()
  const segundo = await pagar(medio === 'tarjeta' ? 'transferencia' : 'tarjeta')
  expect(segundo).toEqual(primero)
  expect((await db.query('select * from historial_estado_pedido')).rows).toHaveLength(1)
  expect((await db.query('select * from items_carrito')).rows).toHaveLength(0)
})

it('rechazo conserva el carrito y permite aprobar luego con otro método', async () => {
  expect((await pagar('tarjeta', 'rejected')).estado).toBe('Pendiente de pago')
  expect((await db.query('select * from items_carrito')).rows).toHaveLength(1)
  expect((await pagar('mercado_pago')).referencia_pago).toBe(`mock:mercado_pago:${pedidoId}`)
})

it('la firma anterior continúa funcionando como tarjeta', async () => {
  const { rows } = await db.query('select public.confirmar_pago_mock($1::uuid, $2::text) as pedido', [pedidoId, 'approved'])
  expect(rows[0].pedido.referencia_pago).toBe(`mock:tarjeta:${pedidoId}`)
})

it('reintentar un pago histórico no cambia su referencia ni genera historial', async () => {
  await db.query("update pedidos_web set estado = 'Pagado', referencia_pago = $1, pagado_at = now()", [`mock:${pedidoId}`])
  expect((await pagar('transferencia')).referencia_pago).toBe(`mock:${pedidoId}`)
  expect((await db.query('select * from historial_estado_pedido')).rows).toHaveLength(0)
})

it('otro usuario no puede confirmar ni cambiar el medio', async () => {
  await db.exec("select set_config('test.uid', '00000000-0000-0000-0000-000000000099', true)")
  await expect(pagar('transferencia')).rejects.toThrow('Pedido no disponible')
})

it('respeta el bloqueo de modo demo deshabilitado', async () => {
  await db.exec('update pago_interno.configuracion set habilitado = false')
  await expect(pagar('mercado_pago')).rejects.toThrow('El pago mock está deshabilitado')
})

it('respeta el vencimiento del pedido', async () => {
  await db.exec("update pedidos_web set vence_at = now() - interval '1 minute'")
  await expect(pagar('transferencia')).rejects.toThrow('El pedido venció')
})

it('no confirma pedidos cancelados', async () => {
  await db.exec("update pedidos_web set estado = 'Cancelado'")
  await expect(pagar('mercado_pago')).rejects.toThrow('El pedido no está pendiente de pago')
})

it.each(['real', null])('rechaza el medio no permitido %s', async medio => {
  await expect(pagar(medio)).rejects.toThrow('Medio de pago no válido')
})

it('solo authenticated puede ejecutar las dos firmas públicas', async () => {
  const { rows } = await db.query(`select
    has_function_privilege('authenticated', 'public.confirmar_pago_mock(uuid,text,text)', 'execute') as nueva,
    has_function_privilege('authenticated', 'public.confirmar_pago_mock(uuid,text)', 'execute') as anterior,
    has_function_privilege('anon', 'public.confirmar_pago_mock(uuid,text,text)', 'execute') as anon_nueva,
    has_function_privilege('anon', 'public.confirmar_pago_mock(uuid,text)', 'execute') as anon_anterior`)
  expect(rows[0]).toEqual({ nueva: true, anterior: true, anon_nueva: false, anon_anterior: false })
})
