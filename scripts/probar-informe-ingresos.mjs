// Verificación del informe de ingresos (0068) contra una base efímera (PGlite,
// en memoria). Los datos se cargan con fechas elegidas a mano para probar los
// cortes de semana y mes; durante la carga se apagan los triggers
// (session_replication_role) porque cajas y cobros son inmutables y fechan
// con now(). No toca Supabase.
//
// Uso:
//   npm install --prefix .temp/ventas-db --no-save --ignore-scripts @electric-sql/pglite
//   node scripts/probar-informe-ingresos.mjs
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
const ctaCte = await medio('Cuenta corriente')
const cliente = (await one("select id from clientes where numero_documento = '20123456786'")).id

const caja = async (nombre, pv) => (await one(
  'insert into cajas(nombre, punto_venta_id, usuario_asignado_id, created_by) values ($1, $2, $3, $3) returning id',
  [nombre, pv, tesorero])).id
const sesion = async (cajaId) => (await one(
  `insert into sesiones_caja(caja_id, usuario_id, saldo_inicial, estado, cerrada_at, cerrada_by, monto_declarado, saldo_teorico, diferencia)
   values ($1, $2, 0, 'cerrada', now(), $2, 0, 0, 0) returning id`,
  [cajaId, tesorero])).id
const sesionNorte = await sesion(await caja('Caja Norte', pvNorte))
const sesionSur = await sesion(await caja('Caja Sur', pvSur))

let numeroCobro = 9000
async function ventaCobrada({ dep, sesionId, cuando, lineas }) {
  const total = lineas.reduce((s, l) => s + l.monto, 0)
  const venta = (await one(
    "insert into ventas(deposito_id, cliente_id, estado, total) values ($1, $2, 'Pendiente', $3) returning id",
    [dep, cliente, total])).id
  const cobro = (await one(
    'insert into cobros_venta(venta_id, numero, total, created_by, created_at, sesion_caja_id) values ($1, $2, $3, $4, $5, $6) returning id',
    [venta, ++numeroCobro, total, tesorero, cuando, sesionId])).id
  for (const l of lineas) {
    await q('insert into detalle_cobro(cobro_id, medio_pago_id, monto) values ($1, $2, $3)', [cobro, l.medio, l.monto])
    if (sesionId && l.medio !== ctaCte) {
      // Lo que registra el trigger de 0062: no tiene que sumarse dos veces.
      await q(
        "insert into movimientos_caja(sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo, venta_id, created_by, created_at) values ($1, 'ingreso', 'venta', $2, $3, 'cobro', $4, $5, $6)",
        [sesionId, l.medio, l.monto, venta, tesorero, cuando])
    }
  }
  return venta
}

// Septiembre 2026
await ventaCobrada({ dep: norte, sesionId: sesionNorte, cuando: '2026-09-10T15:00:00Z', lineas: [{ medio: efectivo, monto: 1000 }] })
// Octubre 2026: venta de Sur cobrada en la caja de Norte → cuenta para Norte.
const ventaSurCobradaEnNorte = await ventaCobrada({
  dep: sur, sesionId: sesionNorte, cuando: '2026-10-05T15:00:00Z',
  lineas: [{ medio: efectivo, monto: 2000 }, { medio: ctaCte, monto: 500 }],
})
await ventaCobrada({ dep: sur, sesionId: sesionSur, cuando: '2026-10-06T15:00:00Z', lineas: [{ medio: transferencia, monto: 3000 }] })
// Cobro anterior a las cajas: sin sesión → depósito de la venta (Sur).
await ventaCobrada({ dep: sur, sesionId: null, cuando: '2026-10-07T15:00:00Z', lineas: [{ medio: efectivo, monto: 400 }] })
// Domingo 11/10 22:30 en Argentina = lunes 12/10 01:30 UTC: va en la semana del 5 al 11.
await ventaCobrada({ dep: norte, sesionId: sesionNorte, cuando: '2026-10-12T01:30:00Z', lineas: [{ medio: efectivo, monto: 50 }] })

// Cobranzas de cuenta corriente.
const recibo = async ({ fecha, sesionId, estado = 'emitido', medioId, monto }) => {
  const id = (await one(
    'insert into recibos_cobranza_cliente(cliente_id, fecha, total, created_by, sesion_caja_id, estado) values ($1, $2, $3, $4, $5, $6) returning id',
    [cliente, fecha, monto, tesorero, sesionId, estado])).id
  await q('insert into detalle_medio_recibo(recibo_id, medio_pago_id, monto) values ($1, $2, $3)', [id, medioId, monto])
  return id
}
await recibo({ fecha: '2026-10-08', sesionId: sesionSur, medioId: efectivo, monto: 700 })
await recibo({ fecha: '2026-10-09', sesionId: null, medioId: transferencia, monto: 300 })
await recibo({ fecha: '2026-10-09', sesionId: sesionSur, medioId: efectivo, monto: 9999, estado: 'anulado' })

// Tienda online: uno pagado, uno pagado y cancelado (cuenta), uno sin pagar.
const pedido = (estado, pagadoAt, total) => q(
  "insert into pedidos_web(cliente_id, deposito_id, tipo_entrega, total, estado, pagado_at) values ($1, $2, 'retiro', $3, $4, $5)",
  [cliente, norte, total, estado, pagadoAt])
await pedido('Pagado', '2026-10-10T18:00:00Z', 1500)
await pedido('Cancelado', '2026-10-11T18:00:00Z', 250)
await pedido('Pendiente de pago', null, 8888)

// Ingreso manual de caja (cuenta) y egreso manual (no cuenta).
const movimientoManual = (tipo, monto, cuando) => q(
  "insert into movimientos_caja(sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo, comprobante, created_by, created_at) values ($1, $2, 'manual', $3, $4, 'manual', 'C-1', $5, $6)",
  [sesionSur, tipo, efectivo, monto, tesorero, cuando])
await movimientoManual('ingreso', 120, '2026-10-13T15:00:00Z')
await movimientoManual('egreso', 77, '2026-10-13T16:00:00Z')

// Comprobantes: factura y NC en Sur, factura anulada (no cuenta).
const comprobante = (tipo, total, estado, numero) => q(
  "insert into comprobantes_venta(venta_id, tipo_comprobante, letra, punto_venta_id, numero, neto, iva, total, estado, fecha_emision) values ($1, $2, 'B', $3, $4, $5, $6, $5, $7, '2026-10-06T15:00:00Z')",
  [ventaSurCobradaEnNorte, tipo, pvSur, numero, total, 0, estado])
await comprobante('factura', 2500, 'Emitido', 1)
await comprobante('nota_credito', 600, 'Emitido', 1)
await comprobante('factura', 4000, 'Anulado', 2)

await db.exec("set session_replication_role = 'origin'")

const ingresos = (desde, hasta, agrupacion, deps = null, medios = null) =>
  q('select periodo_inicio::text as inicio, periodo_fin::text as fin, sucursal_nombre as sucursal, fuente, medio_pago as medio, monto::float as monto from informe_ingresos($1, $2, $3, $4, $5)',
    [desde, hasta, agrupacion, deps, medios])
const suma = (filas, filtro = () => true) => filas.filter(filtro).reduce((s, f) => s + f.monto, 0)

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------
await escenario('sin el permiso informes.ver se rechaza; el Tesorero puede verlo', async () => {
  await actuarComo(vendedor)
  await rechaza("select * from informe_ingresos('2026-10-01', '2026-10-31')", [], { code: '42501' })
  await actuarComo(tesorero)
  await q("select * from informe_ingresos('2026-10-01', '2026-10-31')")
})

await escenario('por mes: septiembre y octubre con el total cobrado de cada fuente', async () => {
  await actuarComo(tesorero)
  const filas = await ingresos('2026-09-01', '2026-10-31', 'mes')
  const sep = (f) => f.inicio === '2026-09-01'
  const oct = (f) => f.inicio === '2026-10-01'
  assert.equal(suma(filas, sep), 1000)
  // Oct: mostrador 2000+3000+400+50, cta cte 700+300, tienda 1500+250, caja 120.
  assert.equal(suma(filas, (f) => oct(f) && f.fuente === 'mostrador'), 5450)
  assert.equal(suma(filas, (f) => oct(f) && f.fuente === 'cuenta_corriente'), 1000)
  assert.equal(suma(filas, (f) => oct(f) && f.fuente === 'tienda'), 1750)
  assert.equal(suma(filas, (f) => oct(f) && f.fuente === 'caja_manual'), 120)
  assert.ok(filas.every((f) => f.fin === (sep(f) ? '2026-09-30' : '2026-10-31')))
})

await escenario('la parte en cuenta corriente, los movimientos de venta y los egresos no suman', async () => {
  const filas = await ingresos('2026-10-01', '2026-10-31', 'mes')
  assert.ok(!filas.some((f) => f.medio === 'Cuenta corriente'))
  // 2500 (venta) - 500 (cta cte): solo los 2000 en efectivo.
  assert.equal(suma(filas, (f) => f.fuente === 'mostrador' && f.sucursal === 'Sucursal Norte' && f.medio === 'Efectivo'), 2050)
  assert.equal(suma(filas, (f) => f.fuente === 'caja_manual'), 120)
})

await escenario('un cobro va a la sucursal de la caja, no a la de la venta', async () => {
  const filas = await ingresos('2026-10-05', '2026-10-05', 'total')
  assert.deepEqual(filas.map((f) => [f.sucursal, f.fuente, f.monto]), [['Sucursal Norte', 'mostrador', 2000]])
})

await escenario('un cobro sin caja toma la sucursal de su venta; un recibo sin caja queda sin sucursal', async () => {
  const filas = await ingresos('2026-10-07', '2026-10-09', 'total')
  assert.equal(suma(filas, (f) => f.fuente === 'mostrador' && f.sucursal === 'Sucursal Sur'), 400)
  assert.equal(suma(filas, (f) => f.fuente === 'cuenta_corriente' && f.sucursal === 'Sin sucursal'), 300)
  assert.equal(suma(filas, (f) => f.fuente === 'cuenta_corriente' && f.sucursal === 'Sucursal Sur'), 700)
})

await escenario('los recibos anulados no cuentan; un pedido pagado y cancelado sí, uno sin pagar no', async () => {
  const filas = await ingresos('2026-10-01', '2026-10-31', 'mes')
  assert.ok(!filas.some((f) => f.monto === 9999))
  assert.equal(suma(filas, (f) => f.fuente === 'tienda' && f.medio === 'Pago online'), 1750)
})

await escenario('semanas de lunes a domingo en hora de Argentina', async () => {
  const filas = await ingresos('2026-10-05', '2026-10-18', 'semana')
  const inicios = [...new Set(filas.map((f) => f.inicio))]
  assert.deepEqual(inicios, ['2026-10-05', '2026-10-12'])
  // El cobro del domingo 22:30 (lunes 01:30 UTC) cae en la semana del 5 al 11.
  const semana1 = filas.filter((f) => f.inicio === '2026-10-05')
  assert.ok(semana1.every((f) => f.fin === '2026-10-11'))
  assert.equal(suma(semana1, (f) => f.fuente === 'mostrador' && f.sucursal === 'Sucursal Norte'), 2050)
})

await escenario('el rango se amplía a semanas completas: del miércoles 7 al miércoles 14', async () => {
  const filas = await ingresos('2026-10-07', '2026-10-14', 'semana')
  // La semana 5-11 entra entera: incluye el cobro del lunes 5 aunque el rango empiece el 7.
  assert.equal(suma(filas, (f) => f.inicio === '2026-10-05' && f.fuente === 'mostrador' && f.sucursal === 'Sucursal Norte'), 2050)
})

await escenario('el modo total respeta el rango exacto (para comparar períodos)', async () => {
  const filas = await ingresos('2026-10-07', '2026-10-09', 'total')
  assert.ok(filas.every((f) => f.inicio === '2026-10-07' && f.fin === '2026-10-09'))
  assert.equal(suma(filas), 400 + 700 + 300)
})

await escenario('filtra por sucursales y por medio de pago', async () => {
  const soloSur = await ingresos('2026-10-01', '2026-10-31', 'mes', [sur])
  assert.ok(soloSur.every((f) => f.sucursal === 'Sucursal Sur'))
  assert.equal(suma(soloSur), 3000 + 400 + 700 + 120)
  const online = await ingresos('2026-10-01', '2026-10-31', 'mes', null, ['Pago online'])
  assert.equal(suma(online), 1750)
  assert.ok(online.every((f) => f.fuente === 'tienda'))
})

await escenario('lo facturado separa facturas y notas de crédito por sucursal y omite anuladas', async () => {
  const filas = await q(
    "select sucursal_nombre as sucursal, tipo, cantidad::int as cantidad, monto::float as monto from informe_facturado('2026-10-01', '2026-10-31', 'mes')")
  assert.deepEqual(filas, [
    { sucursal: 'Sucursal Sur', tipo: 'factura', cantidad: 1, monto: 2500 },
    { sucursal: 'Sucursal Sur', tipo: 'nota_credito', cantidad: 1, monto: 600 },
  ])
})

await escenario('valida el rango y la agrupación', async () => {
  await rechaza("select * from informe_ingresos('2026-10-31', '2026-10-01')", [], { code: '22023' })
  await rechaza("select * from informe_ingresos('2026-10-01', '2026-10-31', 'anio')", [], { code: '22023' })
})

console.log(fallos ? `\n${fallos} escenario(s) fallaron.` : '\nTodos los escenarios pasaron.')
process.exit(fallos ? 1 : 0)
