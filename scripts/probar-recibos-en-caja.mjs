// Verificación de los recibos de cobranza ligados a la caja (0067) contra una
// base efímera (PGlite, en memoria). No toca Supabase.
//
// Uso:
//   npm install --prefix .temp/ventas-db --no-save --ignore-scripts @electric-sql/pglite
//   node scripts/probar-recibos-en-caja.mjs
import { PGlite } from '../.temp/ventas-db/node_modules/@electric-sql/pglite/dist/index.js'
import { unaccent } from '../.temp/ventas-db/node_modules/@electric-sql/pglite/dist/contrib/unaccent.js'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRACIONES = process.env.MIGRACIONES_DIR ?? join(RAIZ, 'supabase', 'migrations')
// 0027 referencia una columna que crea 0029 y 0059 depende de 0027 (circuito
// de compras, issue #141): no se pueden aplicar desde cero y no afectan cajas.
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
async function crearUsuario(email) {
  await db.exec('reset role')
  const id = (await one('insert into auth.users values (gen_random_uuid(), $1) returning id', [email])).id
  await q(`insert into usuarios_internos(usuario_id, nombre, rol_id) values ($1, $2, (select id from roles where nombre = 'Encargado de Depósito'))`, [id, email])
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

// ---------------------------------------------------------------------------
// Datos: un cajero con caja abierta en Sucursal Norte y un cliente con deuda
// ---------------------------------------------------------------------------
const ADMIN = { app_metadata: { rol: 'admin' } }
const cajero = await crearUsuario('cajero@example.test')
const sinCaja = await crearUsuario('sin-caja@example.test')
await db.exec('reset role')
const norte = (await one("select id from depositos where nombre = 'Sucursal Norte'")).id
const pvNorte = (await one('select id from puntos_venta where deposito_id = $1', [norte])).id
const unidad = (await one('select id from unidades_medida limit 1')).id
const categoria = (await one('select id from categorias limit 1')).id
const marca = (await one('select id from marcas limit 1')).id
const cliente = (await one("select id from clientes where numero_documento = '20123456786'")).id
const efectivo = (await one("select id from medios_pago where nombre = 'Efectivo'")).id
const transferencia = (await one("select id from medios_pago where lower(nombre) like 'transferencia%'")).id
const ctaCte = (await one("select id from medios_pago where lower(nombre) = 'cuenta corriente'")).id
const prod = (await one(
  `insert into productos(sku, nombre, unidad_medida_id, categoria_id, marca_id)
   values ('QA-RC-1', 'QA-RC-1', $1, $2, $3) returning id`, [unidad, categoria, marca])).id
for (const { id } of await q('select id from listas_precio')) {
  await q('insert into precios_lista(lista_precio_id, producto_id, precio) values ($1, $2, 1000)', [id, prod])
}
await q('insert into stock_x_deposito(producto_id, deposito_id, cantidad, comprometido) values ($1, $2, 1000, 0)', [prod, norte])

await actuarComo(cajero, ADMIN)
await q('update clientes set habilita_cta_cte = true, limite_credito = 0 where id = $1', [cliente])
const caja = (await one(
  'insert into cajas(nombre, punto_venta_id, usuario_asignado_id) values ($1, $2, $3) returning id',
  ['Caja QA Norte', pvNorte, cajero])).id
const sesion = (await one('select * from abrir_caja($1, 1000)', [caja])).id

// Una venta en cuenta corriente para tener deuda que cobrar.
const precio = num((await one('select calcular_precio_venta($1, $2, 1) as p', [prod, cliente])).p)
const venta = await one('select * from registrar_venta($1::jsonb, $2::jsonb)', [
  JSON.stringify({ deposito_id: norte, cliente_id: cliente }),
  JSON.stringify([{ producto_id: prod, cantidad: 8, precio_unitario: precio }]),
])
await one('select * from registrar_cobro($1, $2::jsonb)', [venta.id, JSON.stringify([{ medio_pago_id: ctaCte, monto: num(venta.total) }])])

const recibo = (medios, imputaciones = []) => one(
  'select registrar_recibo_cobranza($1, current_date, $2::jsonb, $3::jsonb) as r',
  [cliente, JSON.stringify(medios), JSON.stringify(imputaciones)])

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------
await escenario('sin caja abierta no se puede registrar un recibo (CV008)', async () => {
  await actuarComo(sinCaja, ADMIN)
  await rechaza('select registrar_recibo_cobranza($1, current_date, $2::jsonb)',
    [cliente, JSON.stringify([{ medio_pago_id: transferencia, monto: 100, referencia: 'OP-1' }])],
    { code: 'CV008', mensaje: /abrir una caja/ })
  await actuarComo(cajero, ADMIN)
})

let r1
await escenario('con caja abierta el recibo queda ligado a la sesión del cajero', async () => {
  r1 = (await recibo(
    [{ medio_pago_id: efectivo, monto: 3000 }, { medio_pago_id: transferencia, monto: 2000, referencia: 'OP-77' }],
    [{ venta_id: venta.id, monto_imputado: 5000 }],
  )).r
  assert.equal(r1.sesion_caja_id, sesion)
  await db.exec('reset role')
  const fila = await one('select sesion_caja_id from recibos_cobranza_cliente where id = $1', [r1.id])
  assert.equal(fila.sesion_caja_id, sesion)
  await actuarComo(cajero, ADMIN)
})

await escenario('cada medio del recibo es un movimiento de ingreso de la caja con origen cobranza', async () => {
  await db.exec('reset role')
  const movs = await q(
    `select mc.tipo, mc.origen, mp.nombre as medio, mc.monto::float as monto, mc.comprobante, mc.venta_id, mc.motivo
       from movimientos_caja mc join medios_pago mp on mp.id = mc.medio_pago_id
      where mc.recibo_id = $1 order by mc.monto desc`, [r1.id])
  assert.equal(movs.length, 2)
  assert.deepEqual(movs.map((m) => [m.tipo, m.origen, m.medio, m.monto]), [
    ['ingreso', 'cobranza', 'Efectivo', 3000],
    ['ingreso', 'cobranza', 'Transferencia bancaria', 2000],
  ])
  assert.equal(movs[1].comprobante, 'OP-77')
  assert.ok(movs.every((m) => m.venta_id === null))
  assert.match(movs[0].motivo, new RegExp(`Recibo N.º ${r1.numero}`))
  await actuarComo(cajero, ADMIN)
})

await escenario('la sucursal del recibo sale de su caja (Sucursal Norte)', async () => {
  await db.exec('reset role')
  const fila = await one(
    `select d.nombre from recibos_cobranza_cliente r
       join sesiones_caja sc on sc.id = r.sesion_caja_id
       join cajas c on c.id = sc.caja_id
       join puntos_venta pv on pv.id = c.punto_venta_id
       join depositos d on d.id = pv.deposito_id
      where r.id = $1`, [r1.id])
  assert.equal(fila.nombre, 'Sucursal Norte')
  await actuarComo(cajero, ADMIN)
})

await escenario('no se puede pagar una cobranza con cuenta corriente, y nada queda a medias', async () => {
  await db.exec('reset role')
  const antes = num((await one('select count(*) from recibos_cobranza_cliente')).count)
  await actuarComo(cajero, ADMIN)
  await rechaza('select registrar_recibo_cobranza($1, current_date, $2::jsonb)',
    [cliente, JSON.stringify([{ medio_pago_id: ctaCte, monto: 100 }])],
    { code: '22023', mensaje: /cuenta corriente/ })
  await db.exec('reset role')
  assert.equal(num((await one('select count(*) from recibos_cobranza_cliente')).count), antes)
  await actuarComo(cajero, ADMIN)
})

await escenario('la cuenta corriente del cliente baja con el recibo', async () => {
  const resumen = (await one('select obtener_resumen_cta_cte_cliente($1) as r', [cliente])).r
  assert.equal(num(resumen.saldo_deudor), num(venta.total) - 5000)
})

await escenario('el arqueo cuenta solo el efectivo de la cobranza y cierra sin diferencia', async () => {
  // Saldo inicial 1000 + efectivo cobrado 3000; la transferencia no va al cajón.
  const cierre = await one('select * from cerrar_caja($1, 4000)', [sesion])
  assert.equal(num(cierre.saldo_teorico), 4000)
  assert.equal(num(cierre.diferencia), 0)
})

await escenario('un recibo viejo sin sesión de caja sigue siendo válido', async () => {
  await db.exec('reset role')
  const viejo = await one(
    `insert into recibos_cobranza_cliente (cliente_id, fecha, total, created_by)
     values ($1, current_date, 500, $2) returning sesion_caja_id`, [cliente, cajero])
  assert.equal(viejo.sesion_caja_id, null)
})

await escenario('un movimiento de cobranza exige su recibo y uno de venta no puede tener recibo', async () => {
  await db.exec('reset role')
  await rechaza(
    `insert into movimientos_caja (sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo, created_by)
     values ($1, 'ingreso', 'cobranza', $2, 10, 'sin recibo', $3)`,
    [sesion, efectivo, cajero], { code: '23514' })
  await rechaza(
    `insert into movimientos_caja (sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo, venta_id, recibo_id, created_by)
     values ($1, 'ingreso', 'venta', $2, 10, 'mezcla', $3, $4, $5)`,
    [sesion, efectivo, venta.id, r1.id, cajero], { code: '23514' })
})

console.log(fallos ? `\n${fallos} escenario(s) fallaron.` : '\nTodos los escenarios pasaron.')
process.exit(fallos ? 1 : 0)
