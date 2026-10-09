// Verificación de la cuenta corriente de clientes (0061) contra una base
// efímera (PGlite, en memoria): límite de crédito, recibos con imputación,
// Notas de Crédito y permisos. No toca Supabase.
//
// Uso:
//   npm install --prefix .temp/ventas-db --no-save --ignore-scripts @electric-sql/pglite
//   node scripts/probar-cuenta-corriente.mjs
import { PGlite } from '../.temp/ventas-db/node_modules/@electric-sql/pglite/dist/index.js'
import { unaccent } from '../.temp/ventas-db/node_modules/@electric-sql/pglite/dist/contrib/unaccent.js'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRACIONES = process.env.MIGRACIONES_DIR ?? join(RAIZ, 'supabase', 'migrations')
// 0027 referencia una columna que crea 0029 y 0059 depende de 0027 (circuito
// de compras, issue #141): no se pueden aplicar desde cero y no afectan ventas.
const OMITIBLES = new Set(['0027_orden_de_pago.sql', '0059_proteger_comprobantes_cerrados.sql'])
const db = new PGlite({ extensions: { unaccent } })
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await q(sql, params))[0]
const num = (v) => Number(v)

async function rechaza(sql, params, { code, mensaje }) {
  let error
  try { await q(sql, params) } catch (e) { error = e }
  assert.ok(error, `se esperaba un error${mensaje ? `: ${mensaje}` : ''}`)
  if (code) assert.equal(error.code, code, `SQLSTATE de "${error.message}"`)
  if (mensaje) assert.match(error.message, mensaje)
}

let fallos = 0
async function escenario(nombre, fn) {
  try { await fn(); console.log(`OK:    ${nombre}`) } catch (e) {
    fallos += 1
    console.log(`FALLA: ${nombre}\n       ${String(e.message).split('\n')[0]}`)
  }
}

async function actuarComo(id, claims) {
  await db.exec('reset role')
  await q("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)])
  await db.exec('set role authenticated')
}
async function crearUsuario(email, { interno = true } = {}) {
  await db.exec('reset role')
  const id = (await one('insert into auth.users values (gen_random_uuid(), $1) returning id', [email])).id
  if (interno) await q(`insert into usuarios_internos(usuario_id, nombre, rol_id) values ($1, $2, (select id from roles where nombre = 'Encargado de Depósito'))`, [id, email])
  return id
}

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create schema cron;
  create table cron.job(jobid bigint, jobname text);
  create function cron.schedule(nombre text, expresion text, comando text) returns bigint
    language sql as $$ select 1::bigint $$;
  create function cron.unschedule(id bigint) returns boolean language sql as $$ select true $$;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean);
  create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to authenticated, anon, service_role;
  alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
  alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
  alter default privileges in schema public grant all on functions to authenticated, anon, service_role;
`)
try { await db.exec('create publication supabase_realtime') } catch { /* sin replicación */ }

for (const archivo of readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(MIGRACIONES, archivo), 'utf8')
    .replace(/create extension if not exists "?(pgcrypto|pg_cron)"?;/gi, '')
  try { await db.exec(sql) } catch (error) {
    if (!OMITIBLES.has(archivo)) {
      console.error(`ERROR: ${archivo}: ${error.message}`)
      process.exit(1)
    }
    await db.exec('rollback')
    console.log(`AVISO: se omitió ${archivo} (${error.message})`)
  }
}
console.log('OK:    migraciones aplicadas')

// Datos
const admin = await crearUsuario('qa-admin@example.test')
const ADMIN = { app_metadata: { rol: 'admin' } }
await db.exec('reset role')
const dep = (await one('select id from depositos order by nombre limit 1')).id
const unidad = (await one('select id from unidades_medida limit 1')).id
const categoria = (await one('select id from categorias limit 1')).id
const marca = (await one('select id from marcas limit 1')).id
const cliente = (await one("select id from clientes where numero_documento = '20123456786'")).id
const clienteWeb = (await one("select id from clientes where numero_documento = '30111222'")).id
const efectivo = (await one("select id from medios_pago where nombre = 'Efectivo'")).id
const ctaCte = (await one("select id from medios_pago where lower(nombre) = 'cuenta corriente'")).id
const listas = (await q('select id from listas_precio')).map((r) => r.id)
const prod = (await one(
  `insert into productos(sku, nombre, unidad_medida_id, categoria_id, marca_id)
   values ('QA-CC-1', 'QA-CC-1', $1, $2, $3) returning id`, [unidad, categoria, marca])).id
for (const l of listas) await q('insert into precios_lista(lista_precio_id, producto_id, precio) values ($1, $2, 1000)', [l, prod])
await q('insert into stock_x_deposito(producto_id, deposito_id, cantidad, comprometido) values ($1, $2, 1000, 0)', [prod, dep])

await actuarComo(admin, ADMIN)
await q('update clientes set habilita_cta_cte = true, limite_credito = 10000 where id = $1', [cliente])
const precio = num((await one('select calcular_precio_venta($1, $2, 1) as p', [prod, cliente])).p)
const venta = (cant) => one('select * from registrar_venta($1::jsonb, $2::jsonb)', [
  JSON.stringify({ deposito_id: dep, cliente_id: cliente }),
  JSON.stringify([{ producto_id: prod, cantidad: cant, precio_unitario: precio }]),
])
const cobrar = (v, detalle) => one('select * from registrar_cobro($1, $2::jsonb)', [v, JSON.stringify(detalle)])
const resumen = async () => (await one('select obtener_resumen_cta_cte_cliente($1) as r', [cliente])).r
const saldo = async () => num((await resumen()).saldo_deudor)
const recibo = (medios, imputaciones = []) => one(
  'select registrar_recibo_cobranza($1, current_date, $2::jsonb, $3::jsonb) as r',
  [cliente, JSON.stringify(medios), JSON.stringify(imputaciones)])

let v1
await escenario('venta a cuenta corriente dentro del límite suma al saldo deudor', async () => {
  v1 = await venta(6000 / precio)
  await cobrar(v1.id, [{ medio_pago_id: ctaCte, monto: num(v1.total) }])
  const r = await resumen()
  assert.equal(num(r.saldo_deudor), num(v1.total))
  assert.equal(num(r.credito_disponible), 10000 - num(v1.total))
  assert.equal(r.facturas_pendientes_count, 1)
})

await escenario('venta que supera el límite se rechaza con CV007', async () => {
  const v = await venta(5000 / precio)
  await rechaza('select * from registrar_cobro($1, $2::jsonb)',
    [v.id, JSON.stringify([{ medio_pago_id: ctaCte, monto: num(v.total) }])], { code: 'CV007' })
})

await escenario('pago combinado cta cte + efectivo dentro del límite pasa', async () => {
  const v = await venta(5000 / precio)
  const cc = 10000 - (await saldo())
  await cobrar(v.id, [
    { medio_pago_id: ctaCte, monto: cc },
    { medio_pago_id: efectivo, monto: num(v.total) - cc, monto_recibido: num(v.total) - cc },
  ])
  assert.equal(await saldo(), 10000)
})

await escenario('recibo de cobranza con imputación baja el saldo y la deuda de la venta', async () => {
  const antes = await saldo()
  await recibo([{ medio_pago_id: efectivo, monto: 3000 }], [{ venta_id: v1.id, monto_imputado: 3000 }])
  assert.equal(await saldo(), antes - 3000)
  const pend = await q('select saldo_pendiente::float as s from listar_ventas_pendientes_cta_cte($1) where venta_id = $2', [cliente, v1.id])
  assert.equal(pend[0].s, num(v1.total) - 3000)
})

await escenario('imputar más que el saldo de la venta se rechaza', async () => {
  await rechaza('select registrar_recibo_cobranza($1, current_date, $2::jsonb, $3::jsonb)',
    [cliente, JSON.stringify([{ medio_pago_id: efectivo, monto: 99999 }]), JSON.stringify([{ venta_id: v1.id, monto_imputado: 99999 }])],
    { mensaje: /supera el saldo pendiente/ })
})

await escenario('la misma venta repetida en las imputaciones se rechaza', async () => {
  const pendiente = num(v1.total) - 3000
  await rechaza('select registrar_recibo_cobranza($1, current_date, $2::jsonb, $3::jsonb)',
    [cliente, JSON.stringify([{ medio_pago_id: efectivo, monto: pendiente * 2 }]),
      JSON.stringify([{ venta_id: v1.id, monto_imputado: pendiente }, { venta_id: v1.id, monto_imputado: pendiente }])],
    { code: '22023' })
})

await escenario('NC total de una venta en cta cte devuelve el saldo al valor previo (no negativo)', async () => {
  const antes = await saldo()
  const v = await venta(1000 / precio)
  await cobrar(v.id, [{ medio_pago_id: ctaCte, monto: num(v.total) }])
  assert.equal(await saldo(), antes + num(v.total))
  await one("select * from emitir_comprobante($1, 'factura', null)", [v.id])
  await one("select * from emitir_comprobante($1, 'nota_credito', null)", [v.id])
  assert.equal((await one('select estado from ventas where id = $1', [v.id])).estado, 'Anulada')
  assert.equal(await saldo(), antes)
})

await escenario('la vista y el resumen coinciden (saldo acumulado final = saldo deudor)', async () => {
  const fila = await one('select saldo_acumulado::float as s from vw_cuenta_corriente_cliente where cliente_id = $1 order by fecha desc, created_at desc, comprobante_id desc limit 1', [cliente])
  assert.equal(fila.s, await saldo())
})

// Seguridad
const web = await crearUsuario('cliente-web@example.test', { interno: false })
await db.exec('reset role')
await q('update clientes set usuario_web_id = $1 where id = $2', [web, clienteWeb])

await escenario('un cliente web no ve la cuenta corriente de otros clientes (vista)', async () => {
  await actuarComo(web, {})
  const filas = await q('select * from vw_cuenta_corriente_cliente where cliente_id = $1', [cliente])
  assert.equal(filas.length, 0)
})

await escenario('un cliente web no puede consultar resumen, pendientes ni saldo', async () => {
  await actuarComo(web, {})
  await rechaza('select obtener_resumen_cta_cte_cliente($1)', [cliente], { code: '42501' })
  await rechaza('select * from listar_ventas_pendientes_cta_cte($1)', [cliente], { code: '42501' })
  await rechaza('select fn_saldo_cta_cte_cliente($1)', [cliente], { code: '42501' })
})

await escenario('un cliente web no puede cambiarse el límite ni el plazo de crédito', async () => {
  await actuarComo(web, {})
  await rechaza('update clientes set limite_credito = 999999 where id = $1', [clienteWeb], { code: '42501' })
  await rechaza('update clientes set plazo_credito_dias = 365 where id = $1', [clienteWeb], { code: '42501' })
  await q("update clientes set telefono = '1155550000' where id = $1", [clienteWeb])
})

await escenario('un interno sin ventas.cobrar no puede cobrar ni registrar recibos', async () => {
  const deposito = await crearUsuario('deposito@example.test')
  await actuarComo(admin, ADMIN)
  const v = await venta(1)
  await actuarComo(deposito, { app_metadata: { permisos: ['stock.ver'] } })
  await rechaza('select * from registrar_cobro($1, $2::jsonb)',
    [v.id, JSON.stringify([{ medio_pago_id: efectivo, monto: num(v.total), monto_recibido: num(v.total) }])], { code: '42501' })
  await rechaza('select registrar_recibo_cobranza($1, current_date, $2::jsonb)',
    [cliente, JSON.stringify([{ medio_pago_id: efectivo, monto: 100 }])], { code: '42501' })
})

console.log(fallos ? `\n${fallos} escenario(s) fallaron.` : '\nTodos los escenarios pasaron.')
process.exit(fallos ? 1 : 0)
