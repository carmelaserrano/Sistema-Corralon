// Verificación del informe de egresos (0069) contra una base efímera (PGlite,
// en memoria). Los datos se cargan con fechas elegidas a mano para probar los
// cortes de semana y mes; durante la carga se apagan los triggers
// (session_replication_role) porque cajas y movimientos son inmutables y fechan
// con now(). No toca Supabase.
//
// No hace falta aplicar 0027: informe_egresos solo usa columnas de
// pagos_proveedor que existen desde 0013 y filtra estado <> 'anulado', así que
// sirve igual con el estado 'registrado' original que con 'confirmada'.
//
// Uso:
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

async function actuarComo(id) {
  await db.exec('reset role')
  await q("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await q("select set_config('request.jwt.claims', '{}', false)")
  await db.exec('set role authenticated')
}
async function crearUsuario(email, rol) {
  await db.exec('reset role')
  const id = (await one('insert into auth.users values (gen_random_uuid(), $1) returning id', [email])).id
  await q('insert into usuarios_internos(usuario_id, nombre, rol_id) values ($1, $2, (select id from roles where nombre = $3))', [id, email, rol])
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
// Datos con fechas controladas (hora de Argentina = UTC-3)
// ---------------------------------------------------------------------------
const tesorero = await crearUsuario('tesorero@example.test', 'Tesorero')
const vendedor = await crearUsuario('vendedor@example.test', 'Vendedor')
await db.exec('reset role')
// Columnas con default auth.uid() (vendedor_id, created_by) quedan a nombre del tesorero.
await q("select set_config('request.jwt.claim.sub', $1, false)", [tesorero])
await db.exec("set session_replication_role = 'replica'")

const deposito = async (nombre) => (await one('select id from depositos where nombre = $1', [nombre])).id
const norte = await deposito('Sucursal Norte')
const sur = await deposito('Sucursal Sur')
const pvDe = async (dep) => (await one('select id from puntos_venta where deposito_id = $1', [dep])).id
const pvNorte = await pvDe(norte)
const pvSur = await pvDe(sur)
const medio = async (nombre) => (await one('select id from medios_pago where nombre = $1', [nombre])).id
const efectivo = await medio('Efectivo')
const transferencia = await medio('Transferencia bancaria')
const cliente = (await one("select id from clientes where numero_documento = '20123456786'")).id
const proveedor = (await one(
  "insert into proveedores(razon_social, cuit, condicion_fiscal) values ('Proveedor Test', '30111111118', 'responsable_inscripto') returning id")).id

const caja = async (nombre, pv) => (await one(
  'insert into cajas(nombre, punto_venta_id, usuario_asignado_id, created_by) values ($1, $2, $3, $3) returning id',
  [nombre, pv, tesorero])).id
const sesion = async (cajaId) => (await one(
  `insert into sesiones_caja(caja_id, usuario_id, saldo_inicial, estado, cerrada_at, cerrada_by, monto_declarado, saldo_teorico, diferencia)
   values ($1, $2, 0, 'cerrada', now(), $2, 0, 0, 0) returning id`,
  [cajaId, tesorero])).id
const sesionNorte = await sesion(await caja('Caja Norte', pvNorte))
const sesionSur = await sesion(await caja('Caja Sur', pvSur))

// Órdenes de pago a proveedores (sin sucursal). El estado por defecto es el de 0013.
const ordenPago = (fecha, medioId, monto, anulada = false) => q(
  anulada
    ? "insert into pagos_proveedor(proveedor_id, medio_pago_id, fecha, importe_total, estado, anulado_by, anulado_at, motivo_anulacion) values ($1, $2, $3, $4, 'anulado', $5, now(), 'error de carga')"
    : 'insert into pagos_proveedor(proveedor_id, medio_pago_id, fecha, importe_total) values ($1, $2, $3, $4)',
  anulada ? [proveedor, medioId, fecha, monto, tesorero] : [proveedor, medioId, fecha, monto])
await ordenPago('2026-09-10', efectivo, 1000)
await ordenPago('2026-10-05', efectivo, 2000)
await ordenPago('2026-10-06', transferencia, 3000)
await ordenPago('2026-10-06', efectivo, 9999, true)

// Movimientos de caja. Solo los egresos cuentan.
const movimiento = (sesionId, tipo, medioId, monto, cuando) => q(
  "insert into movimientos_caja(sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo, comprobante, created_by, created_at) values ($1, $2, 'manual', $3, $4, 'manual', 'C-1', $5, $6)",
  [sesionId, tipo, medioId, monto, tesorero, cuando])
await movimiento(sesionNorte, 'egreso', efectivo, 200, '2026-10-08T15:00:00Z')
// Domingo 11/10 22:30 en Argentina = lunes 12/10 01:30 UTC: va en la semana del 5 al 11.
await movimiento(sesionNorte, 'egreso', efectivo, 50, '2026-10-12T01:30:00Z')
await movimiento(sesionSur, 'egreso', efectivo, 77, '2026-10-13T16:00:00Z')
await movimiento(sesionSur, 'egreso', transferencia, 300, '2026-10-14T16:00:00Z')
await movimiento(sesionSur, 'ingreso', efectivo, 120, '2026-10-13T15:00:00Z')
// Ingresos de venta y de cobranza (los que registran 0062 y 0067): tampoco cuentan.
const venta = (await one(
  "insert into ventas(deposito_id, cliente_id, estado, total) values ($1, $2, 'Pendiente', 4444) returning id", [sur, cliente])).id
await q(
  "insert into movimientos_caja(sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo, venta_id, created_by, created_at) values ($1, 'ingreso', 'venta', $2, 4444, 'cobro', $3, $4, '2026-10-13T17:00:00Z')",
  [sesionSur, efectivo, venta, tesorero])
const recibo = (await one(
  "insert into recibos_cobranza_cliente(cliente_id, fecha, total, created_by, sesion_caja_id) values ($1, '2026-10-13', 5555, $2, $3) returning id",
  [cliente, tesorero, sesionSur])).id
await q(
  "insert into movimientos_caja(sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo, recibo_id, created_by, created_at) values ($1, 'ingreso', 'cobranza', $2, 5555, 'cobranza', $3, $4, '2026-10-13T18:00:00Z')",
  [sesionSur, efectivo, recibo, tesorero])

await db.exec("set session_replication_role = 'origin'")

const egresos = (desde, hasta, agrupacion, deps = null, medios = null) =>
  q('select periodo_inicio::text as inicio, periodo_fin::text as fin, sucursal_nombre as sucursal, fuente, medio_pago as medio, monto::float as monto from informe_egresos($1, $2, $3, $4, $5)',
    [desde, hasta, agrupacion, deps, medios])
const suma = (filas, filtro = () => true) => filas.filter(filtro).reduce((s, f) => s + f.monto, 0)

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------
await escenario('sin el permiso informes.ver se rechaza; el Tesorero puede verlo', async () => {
  await actuarComo(vendedor)
  await rechaza("select * from informe_egresos('2026-10-01', '2026-10-31')", [], { code: '42501' })
  await actuarComo(tesorero)
  await q("select * from informe_egresos('2026-10-01', '2026-10-31')")
})

await escenario('por mes: septiembre y octubre con el total pagado de cada fuente', async () => {
  await actuarComo(tesorero)
  const filas = await egresos('2026-09-01', '2026-10-31', 'mes')
  const sep = (f) => f.inicio === '2026-09-01'
  const oct = (f) => f.inicio === '2026-10-01'
  assert.equal(suma(filas, sep), 1000)
  assert.equal(suma(filas, (f) => oct(f) && f.fuente === 'proveedores'), 5000)
  // Oct caja: 200 + 50 (Norte) + 77 + 300 (Sur).
  assert.equal(suma(filas, (f) => oct(f) && f.fuente === 'caja'), 627)
  assert.ok(filas.every((f) => f.fin === (sep(f) ? '2026-09-30' : '2026-10-31')))
  assert.ok(filas.every((f) => f.monto > 0))
})

await escenario('las órdenes de pago anuladas y los ingresos de caja no suman', async () => {
  const filas = await egresos('2026-10-01', '2026-10-31', 'mes')
  for (const excluido of [9999, 4444, 5555, 120]) assert.ok(!filas.some((f) => f.monto === excluido))
  assert.equal(suma(filas), 5000 + 627)
})

await escenario('un egreso de caja va a la sucursal de la caja; el pago a proveedor queda sin sucursal', async () => {
  const filas = await egresos('2026-10-01', '2026-10-31', 'mes')
  assert.equal(suma(filas, (f) => f.fuente === 'caja' && f.sucursal === 'Sucursal Norte'), 250)
  assert.equal(suma(filas, (f) => f.fuente === 'caja' && f.sucursal === 'Sucursal Sur'), 377)
  assert.ok(filas.filter((f) => f.fuente === 'proveedores').every((f) => f.sucursal === 'Sin sucursal'))
})

await escenario('desglosa por medio de pago', async () => {
  const filas = await egresos('2026-10-01', '2026-10-31', 'mes')
  assert.equal(suma(filas, (f) => f.medio === 'Efectivo'), 2000 + 250 + 77)
  assert.equal(suma(filas, (f) => f.medio === 'Transferencia bancaria'), 3000 + 300)
})

await escenario('semanas de lunes a domingo en hora de Argentina', async () => {
  const filas = await egresos('2026-10-05', '2026-10-18', 'semana')
  assert.deepEqual([...new Set(filas.map((f) => f.inicio))], ['2026-10-05', '2026-10-12'])
  const semana1 = filas.filter((f) => f.inicio === '2026-10-05')
  assert.ok(semana1.every((f) => f.fin === '2026-10-11'))
  // El egreso del domingo 22:30 (lunes 01:30 UTC) cae en la semana del 5 al 11.
  assert.equal(suma(semana1, (f) => f.fuente === 'caja' && f.sucursal === 'Sucursal Norte'), 250)
  assert.equal(suma(semana1, (f) => f.fuente === 'proveedores'), 5000)
  assert.equal(suma(filas.filter((f) => f.inicio === '2026-10-12')), 77 + 300)
})

await escenario('el rango se amplía a semanas completas: del miércoles 7 al miércoles 14', async () => {
  const filas = await egresos('2026-10-07', '2026-10-14', 'semana')
  // La semana 5-11 entra entera: incluye las órdenes de pago del 5 y el 6 aunque el rango empiece el 7.
  assert.equal(suma(filas, (f) => f.inicio === '2026-10-05' && f.fuente === 'proveedores'), 5000)
})

await escenario('el modo total respeta el rango exacto (para comparar períodos)', async () => {
  const filas = await egresos('2026-10-08', '2026-10-08', 'total')
  assert.ok(filas.every((f) => f.inicio === '2026-10-08' && f.fin === '2026-10-08'))
  assert.equal(suma(filas), 200)
})

await escenario('filtra por sucursal (los pagos a proveedores quedan afuera) y por medio de pago', async () => {
  const soloNorte = await egresos('2026-10-01', '2026-10-31', 'mes', [norte])
  assert.ok(soloNorte.every((f) => f.sucursal === 'Sucursal Norte' && f.fuente === 'caja'))
  assert.equal(suma(soloNorte), 250)
  const transf = await egresos('2026-10-01', '2026-10-31', 'mes', null, ['Transferencia bancaria'])
  assert.equal(suma(transf), 3000 + 300)
  assert.deepEqual([...new Set(transf.map((f) => f.fuente))].sort(), ['caja', 'proveedores'])
})

await escenario('valida el rango y la agrupación', async () => {
  await rechaza("select * from informe_egresos('2026-10-31', '2026-10-01')", [], { code: '22023' })
  await rechaza("select * from informe_egresos('2026-10-01', '2026-10-31', 'anio')", [], { code: '22023' })
})

console.log(fallos ? `\n${fallos} escenario(s) fallaron.` : '\nTodos los escenarios pasaron.')
process.exit(fallos ? 1 : 0)
