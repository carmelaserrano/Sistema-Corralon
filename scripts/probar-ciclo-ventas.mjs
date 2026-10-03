// Verificación integral del ciclo de ventas contra la base (issue #140).
//
// Aplica TODAS las migraciones de supabase/migrations en una base PostgreSQL
// efímera (PGlite, en memoria) y ejecuta los escenarios CA-01 a CA-07 contra
// las RPC reales: registrar_venta, registrar_cobro, emitir_comprobante y
// cambiar_estado_venta. No se conecta a Supabase ni escribe datos reales.
//
// Preparación (una sola vez, desde la raíz):
//   npm install --prefix .temp/ventas-db --no-save --ignore-scripts @electric-sql/pglite
// Ejecución:
//   node scripts/probar-ciclo-ventas.mjs
//
// Limitaciones conocidas de la base efímera (no son defectos de ventas):
//   - 0027_orden_de_pago.sql referencia una columna que recién crea la 0029
//     (orden de migraciones de compras, issue #141). Se omite con un aviso.
//   - Supabase aporta los roles anon/authenticated/service_role, los esquemas
//     auth y storage y la extensión pg_cron; acá van stubs mínimos.
//   - PGlite es de una sola conexión: la concurrencia se prueba aparte
//     (ver qa/issue-140/README.md).
import { PGlite } from '../.temp/ventas-db/node_modules/@electric-sql/pglite/dist/index.js'
import { unaccent } from '../.temp/ventas-db/node_modules/@electric-sql/pglite/dist/contrib/unaccent.js'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
// MIGRACIONES_DIR permite probar otra combinación de migraciones (ej. una rama
// en paralelo) sin tocar el repo.
const MIGRACIONES = process.env.MIGRACIONES_DIR ?? join(RAIZ, 'supabase', 'migrations')
const OMITIBLES = new Set(['0027_orden_de_pago.sql'])

const db = new PGlite({ extensions: { unaccent } })
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await q(sql, params))[0]
const num = (valor) => Number(valor)

// Verifica que la sentencia falle con el SQLSTATE y el mensaje esperados y
// devuelve el error. Cada sentencia corre sola: PGlite revierte la
// transacción implícita, igual que PostgREST con cada llamada RPC.
async function rechaza(sql, params, { code, mensaje }) {
  let error
  try {
    await q(sql, params)
  } catch (e) {
    error = e
  }
  assert.ok(error, `se esperaba un error: ${mensaje}`)
  if (code) assert.equal(error.code, code, `SQLSTATE de "${error.message}"`)
  if (mensaje) assert.match(error.message, mensaje)
  return error
}

let fallos = 0
async function escenario(nombre, fn) {
  try {
    await fn()
    console.log(`OK:    ${nombre}`)
  } catch (error) {
    fallos += 1
    console.log(`FALLA: ${nombre}\n       ${String(error.message).split('\n')[0]}`)
  }
}

async function usuario(email, claims) {
  await db.exec('reset role')
  const id = (
    await one('insert into auth.users values (gen_random_uuid(), $1) returning id', [email])
  ).id
  await q('insert into usuarios_internos(usuario_id, nombre) values ($1, $2)', [id, email])
  await actuarComo(id, claims)
  return id
}

async function actuarComo(id, claims) {
  await db.exec('reset role')
  await q("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)])
  await db.exec('set role authenticated')
}

// ---------------------------------------------------------------------------
// Base efímera: stubs de Supabase + todas las migraciones
// ---------------------------------------------------------------------------
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

// Publicación de Realtime (la crea Supabase); sólo hace falta si alguna migración
// la modifica.
try {
  await db.exec('create publication supabase_realtime')
} catch {
  // PGlite sin replicación lógica: las migraciones que la usen se omiten abajo.
}

for (const archivo of readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(MIGRACIONES, archivo), 'utf8').replace(
    /create extension if not exists "?(pgcrypto|pg_cron)"?;/gi,
    '',
  )
  try {
    await db.exec(sql)
  } catch (error) {
    if (!OMITIBLES.has(archivo)) {
      console.error(`ERROR: la migración ${archivo} no se pudo aplicar: ${error.message}`)
      process.exit(1)
    }
    await db.exec('rollback')
    console.log(`AVISO: se omitió ${archivo} (${error.message}) — ver issue #141`)
  }
}
console.log('OK:    migraciones aplicadas')

// ---------------------------------------------------------------------------
// Datos de prueba
// ---------------------------------------------------------------------------
const admin = await usuario('qa-admin@example.test', { app_metadata: { rol: 'admin' } })
await db.exec('reset role')
const dep = (await one('select id from depositos order by nombre limit 1')).id
const unidad = (await one('select id from unidades_medida limit 1')).id
const categoria = (await one('select id from categorias limit 1')).id
const marca = (await one('select id from marcas limit 1')).id
const listaGeneral = (await one("select id from listas_precio where nombre = 'General'")).id
const clienteCF = (await one("select id from clientes where numero_documento = '30111222'")).id
const clienteRI = (await one("select id from clientes where numero_documento = '20123456786'")).id
const clienteOtro = (await one("select id from clientes where numero_documento = '33222111'")).id
const listaRI = (
  await one(
    `select tc.lista_precio_id as id from clientes c
       join tipos_cliente tc on tc.id = c.tipo_cliente_id where c.id = $1`,
    [clienteRI],
  )
).id
const efectivo = (await one("select id from medios_pago where nombre = 'Efectivo'")).id

let secuencia = 0
async function producto(precio, stock) {
  const sku = `QA-VTA-${++secuencia}`
  const id = (
    await one(
      `insert into productos(sku, nombre, unidad_medida_id, categoria_id, marca_id)
       values ($1, $1, $2, $3, $4) returning id`,
      [sku, unidad, categoria, marca],
    )
  ).id
  for (const lista of new Set([listaGeneral, listaRI].filter(Boolean))) {
    await q('insert into precios_lista(lista_precio_id, producto_id, precio) values ($1, $2, $3)', [
      lista,
      id,
      precio,
    ])
  }
  await q(
    'insert into stock_x_deposito(producto_id, deposito_id, cantidad, comprometido) values ($1, $2, $3, 0)',
    [id, dep, stock],
  )
  return id
}

const stock = async (p) =>
  one('select cantidad::float as cantidad, comprometido::float as comprometido from stock_x_deposito where producto_id = $1 and deposito_id = $2', [p, dep])
const estado = async (v) => (await one('select estado from ventas where id = $1', [v])).estado
const linea = (producto_id, cantidad, precio_unitario, extra = {}) => ({
  producto_id,
  cantidad,
  precio_unitario,
  ...extra,
})
const registrar = (items, cliente = clienteCF) =>
  one('select * from registrar_venta($1::jsonb, $2::jsonb)', [
    JSON.stringify({ deposito_id: dep, cliente_id: cliente }),
    JSON.stringify(items),
  ])
const cambiarEstado = (venta, nuevo, motivo = null) =>
  one('select * from cambiar_estado_venta($1, $2, $3)', [venta, nuevo, motivo])
const cobrar = (venta, monto) =>
  one('select * from registrar_cobro($1, $2::jsonb)', [
    venta,
    JSON.stringify([{ medio_pago_id: efectivo, monto, monto_recibido: monto }]),
  ])
const emitir = (venta, tipo, items = null) =>
  one('select * from emitir_comprobante($1, $2, $3::jsonb)', [
    venta,
    tipo,
    items ? JSON.stringify(items) : null,
  ])

// Una venta cobrada y facturada, lista para entregar o acreditar.
async function ventaFacturada(items, cliente = clienteRI) {
  const venta = await registrar(items, cliente)
  await cobrar(venta.id, num(venta.total))
  await emitir(venta.id, 'factura')
  return venta
}

// ---------------------------------------------------------------------------
// CA-01 / CA-02 / CA-03 · registro, reserva y stock insuficiente
// ---------------------------------------------------------------------------
await escenario('CA-01 persistencia atómica: venta Pendiente, correlativo, detalle e historial', async () => {
  const p = await producto(100, 10)
  const venta = await registrar([linea(p, 3, 100)])
  assert.equal(venta.estado, 'Pendiente')
  assert.equal(num(venta.total), 300)
  assert.ok(num(venta.numero) > 0)
  const detalle = await q('select cantidad::float as c, cantidad_backorder::float as b from detalle_venta where venta_id = $1', [venta.id])
  assert.deepEqual(detalle, [{ c: 3, b: 0 }])
  const historial = await q('select estado_anterior, estado_nuevo from historial_estado_venta where venta_id = $1', [venta.id])
  assert.deepEqual(historial, [{ estado_anterior: null, estado_nuevo: 'Pendiente' }])
  const siguiente = await registrar([linea(p, 1, 100)])
  assert.equal(num(siguiente.numero), num(venta.numero) + 1)
})

await escenario('CA-02 comprometer_stock sube `comprometido` y no toca la cantidad física', async () => {
  const p = await producto(100, 10)
  await registrar([linea(p, 3, 100)])
  assert.deepEqual(await stock(p), { cantidad: 10, comprometido: 3 })
})

await escenario('CA-03 stock insuficiente: error descriptivo y rollback total', async () => {
  const p = await producto(100, 10)
  const antes = num((await one('select count(*) as n from ventas')).n)
  const error = await rechaza(
    'select * from registrar_venta($1::jsonb, $2::jsonb)',
    [
      JSON.stringify({ deposito_id: dep, cliente_id: clienteCF }),
      JSON.stringify([linea(p, 99, 100)]),
    ],
    { code: 'P0001', mensaje: /STOCK_INSUFICIENTE/ },
  )
  assert.deepEqual(JSON.parse(error.detail), [{ producto_id: p, disponible: 10, solicitado: 99 }])
  assert.equal(num((await one('select count(*) as n from ventas')).n), antes)
  assert.deepEqual(await stock(p), { cantidad: 10, comprometido: 0 })
})

await escenario('validaciones: precio desactualizado, cliente bloqueado y producto repetido (H6)', async () => {
  const p = await producto(100, 10)
  await rechaza(
    'select * from registrar_venta($1::jsonb, $2::jsonb)',
    [JSON.stringify({ deposito_id: dep, cliente_id: clienteCF }), JSON.stringify([linea(p, 1, 50)])],
    { code: 'P0001', mensaje: /PRECIO_DESACTUALIZADO/ },
  )
  await one("select * from cambiar_estado_cliente($1, 'Bloqueado', 'prueba QA')", [clienteOtro])
  await rechaza(
    'select * from registrar_venta($1::jsonb, $2::jsonb)',
    [JSON.stringify({ deposito_id: dep, cliente_id: clienteOtro }), JSON.stringify([linea(p, 1, 100)])],
    { code: '23514', mensaje: /no está habilitado/ },
  )
  await rechaza(
    'select * from registrar_venta($1::jsonb, $2::jsonb)',
    [
      JSON.stringify({ deposito_id: dep, cliente_id: clienteCF }),
      JSON.stringify([linea(p, 1, 100), linea(p, 2, 100)]),
    ],
    { code: '22023', mensaje: /artículos repetidos/ },
  )
  assert.deepEqual(await stock(p), { cantidad: 10, comprometido: 0 })
})

// ---------------------------------------------------------------------------
// CA-04 · facturación y cobro
// ---------------------------------------------------------------------------
await escenario('CA-04 cobro exacto, Factura A (RI) con IVA 21% y venta Facturada', async () => {
  const p = await producto(1000, 20)
  const venta = await registrar([linea(p, 2, 1000)], clienteRI)
  await rechaza("select * from emitir_comprobante($1, 'factura')", [venta.id], {
    code: '22023',
    mensaje: /cobrada o tener medio Cuenta corriente/,
  })
  await rechaza(
    'select * from registrar_cobro($1, $2::jsonb)',
    [venta.id, JSON.stringify([{ medio_pago_id: efectivo, monto: 500, monto_recibido: 500 }])],
    { code: 'CV004', mensaje: /no coincide con el total/ },
  )
  const cobro = await cobrar(venta.id, 2000)
  assert.equal(num(cobro.total), 2000)
  const cobrado = num((await one('select sum(total) as t from cobros_venta where venta_id = $1', [venta.id])).t)
  assert.equal(num(venta.total) - cobrado, 0, 'la diferencia entre total y cobrado debe ser cero')
  const factura = await emitir(venta.id, 'factura')
  assert.equal(factura.letra, 'A')
  assert.equal(num(factura.total), 2000)
  assert.equal(num(factura.neto) + num(factura.iva), 2000)
  assert.equal(await estado(venta.id), 'Facturada')
  await rechaza('select * from registrar_cobro($1, $2::jsonb)', [venta.id, JSON.stringify([{ medio_pago_id: efectivo, monto: 2000, monto_recibido: 2000 }])], { code: 'CV003' })
  await rechaza("select * from emitir_comprobante($1, 'factura')", [venta.id], { code: '22023' })
})

await escenario('CA-04 consumidor final recibe Factura B', async () => {
  const p = await producto(500, 5)
  const venta = await registrar([linea(p, 1, 500)], clienteCF)
  await cobrar(venta.id, 500)
  assert.equal((await emitir(venta.id, 'factura')).letra, 'B')
})

// ---------------------------------------------------------------------------
// CA-05 · entrega y egreso físico
// ---------------------------------------------------------------------------
await escenario('CA-05 entrega: descuenta físico, libera comprometido y audita en movimientos_stock (H4)', async () => {
  const p = await producto(1000, 20)
  const venta = await ventaFacturada([linea(p, 2, 1000)])
  assert.deepEqual(await stock(p), { cantidad: 20, comprometido: 2 })
  const entregada = await cambiarEstado(venta.id, 'Entregada')
  assert.equal(entregada.estado, 'Entregada')
  assert.deepEqual(await stock(p), { cantidad: 18, comprometido: 0 })
  const movimiento = await one(
    `select m.observaciones, d.cantidad::float as cantidad
       from movimientos_stock m
       join detalle_movimiento d on d.movimiento_id = m.id
      where d.producto_id = $1`,
    [p],
  )
  assert.equal(movimiento.cantidad, 2)
  assert.match(movimiento.observaciones, new RegExp(`Venta #${venta.numero}\\b`))
  const historial = await q('select estado_nuevo from historial_estado_venta where venta_id = $1 order by created_at, estado_nuevo', [venta.id])
  assert.ok(historial.some((h) => h.estado_nuevo === 'Entregada'))
})

await escenario('CA-05 una venta Pendiente no se puede entregar', async () => {
  const p = await producto(500, 10)
  const venta = await registrar([linea(p, 1, 500)])
  await rechaza("select * from cambiar_estado_venta($1, 'Entregada', null)", [venta.id], {
    code: '22023',
    mensaje: /Transición no permitida/,
  })
})

await escenario('H4 la firma de 2 parámetros de egresar_comprometido (pedidos web) conserva su texto', async () => {
  const p = await producto(100, 10)
  await registrar([linea(p, 2, 100)])
  // Se ejecuta como dueño de la función: 0057 (PR #143) la deja sin permiso para authenticated.
  await db.exec('reset role')
  await q('select egresar_comprometido($1, $2::jsonb)', [dep, JSON.stringify([{ producto_id: p, cantidad: 2 }])])
  await db.exec('set role authenticated')
  const movimiento = await one(
    'select m.observaciones from movimientos_stock m join detalle_movimiento d on d.movimiento_id = m.id where d.producto_id = $1',
    [p],
  )
  assert.equal(movimiento.observaciones, 'Egreso por venta entregada')
  assert.deepEqual(await stock(p), { cantidad: 8, comprometido: 0 })
})

// ---------------------------------------------------------------------------
// CA-06 · anulación y cancelación
// ---------------------------------------------------------------------------
await escenario('CA-06 anular Pendiente libera el comprometido y exige motivo', async () => {
  const p = await producto(500, 10)
  const venta = await registrar([linea(p, 4, 500)])
  await rechaza("select * from cambiar_estado_venta($1, 'Anulada', '  ')", [venta.id], {
    code: '23514',
    mensaje: /motivo es obligatorio/,
  })
  assert.equal((await cambiarEstado(venta.id, 'Anulada', 'cliente desistió')).estado, 'Anulada')
  assert.deepEqual(await stock(p), { cantidad: 10, comprometido: 0 })
})

await escenario('CA-06 Facturada sólo se anula con Nota de Crédito total (parcial no anula)', async () => {
  const p = await producto(500, 10)
  const venta = await ventaFacturada([linea(p, 2, 500)])
  await rechaza("select * from cambiar_estado_venta($1, 'Anulada', 'x')", [venta.id], {
    code: '22023',
    mensaje: /Nota de Crédito/,
  })
  assert.equal(num((await emitir(venta.id, 'nota_credito', [{ monto: 400 }])).total), 400)
  assert.equal(await estado(venta.id), 'Facturada')
  assert.deepEqual(await stock(p), { cantidad: 10, comprometido: 2 })
  assert.equal(num((await emitir(venta.id, 'nota_credito')).total), 600)
  assert.equal(await estado(venta.id), 'Anulada')
  assert.deepEqual(await stock(p), { cantidad: 10, comprometido: 0 })
  await rechaza("select * from emitir_comprobante($1, 'nota_credito')", [venta.id], { code: '22023' })
})

await escenario('H3 una venta con cobro registrado no se anula: se indica el camino fiscal', async () => {
  const p = await producto(500, 10)
  const venta = await registrar([linea(p, 2, 500)], clienteRI)
  await cobrar(venta.id, 1000)
  await rechaza("select * from cambiar_estado_venta($1, 'Anulada', 'x')", [venta.id], {
    code: '22023',
    mensaje: /cobro registrado.*Nota de Crédito/,
  })
  assert.equal(await estado(venta.id), 'Pendiente')
  assert.deepEqual(await stock(p), { cantidad: 10, comprometido: 2 })
  await emitir(venta.id, 'factura')
  await emitir(venta.id, 'nota_credito')
  assert.equal(await estado(venta.id), 'Anulada')
  assert.deepEqual(await stock(p), { cantidad: 10, comprometido: 0 })
})

// ---------------------------------------------------------------------------
// H1 · backorder: sólo se libera / egresa lo que se reservó
// ---------------------------------------------------------------------------
await escenario('H1 anular una venta con backorder libera sólo lo comprometido', async () => {
  const p = await producto(200, 2)
  const venta = await registrar([linea(p, 5, 200, { backorder: true })])
  assert.deepEqual(await stock(p), { cantidad: 2, comprometido: 2 })
  const detalle = await one('select cantidad_backorder::float as b from detalle_venta where venta_id = $1', [venta.id])
  assert.equal(detalle.b, 3)
  await cambiarEstado(venta.id, 'Anulada', 'prueba')
  assert.deepEqual(await stock(p), { cantidad: 2, comprometido: 0 })
})

await escenario('H1 anular con backorder NO libera reservas de otras ventas', async () => {
  const p = await producto(300, 4)
  const a = await registrar([linea(p, 3, 300)])
  const b = await registrar([linea(p, 3, 300, { backorder: true })])
  assert.deepEqual(await stock(p), { cantidad: 4, comprometido: 4 })
  await cambiarEstado(b.id, 'Anulada', 'prueba')
  assert.deepEqual(await stock(p), { cantidad: 4, comprometido: 3 }, 'la venta A conserva sus 3 unidades')
  await cambiarEstado(a.id, 'Anulada', 'prueba')
  assert.deepEqual(await stock(p), { cantidad: 4, comprometido: 0 })
})

await escenario('H1 la Nota de Crédito total con backorder libera sólo lo comprometido', async () => {
  const p = await producto(100, 1)
  const venta = await registrar([linea(p, 3, 100, { backorder: true })], clienteRI)
  await cobrar(venta.id, 300)
  await emitir(venta.id, 'factura')
  await emitir(venta.id, 'nota_credito')
  assert.equal(await estado(venta.id), 'Anulada')
  assert.deepEqual(await stock(p), { cantidad: 1, comprometido: 0 })
})

await escenario('H1 no se entrega una venta con backorder pendiente (mensaje claro, stock intacto)', async () => {
  const p = await producto(100, 1)
  const venta = await ventaFacturada([linea(p, 3, 100, { backorder: true })])
  await rechaza("select * from cambiar_estado_venta($1, 'Entregada', null)", [venta.id], {
    code: '22023',
    mensaje: /backorder pendientes de reposición/,
  })
  assert.equal(await estado(venta.id), 'Facturada')
  assert.deepEqual(await stock(p), { cantidad: 1, comprometido: 1 })
})

// ---------------------------------------------------------------------------
// CA-07 · historial del cliente
// ---------------------------------------------------------------------------
await escenario('CA-07 ventas, comprobantes y cobros quedan asociados a la ficha del cliente', async () => {
  const p = await producto(250, 10)
  const venta = await ventaFacturada([linea(p, 2, 250)])
  const ventas = await q(
    "select id from ventas where cliente_id = $1 and estado <> 'Anulada'",
    [clienteRI],
  )
  assert.ok(ventas.some((v) => v.id === venta.id))
  const comprobantes = await q(
    `select c.id from comprobantes_venta c join ventas v on v.id = c.venta_id
      where v.cliente_id = $1 and c.venta_id = $2`,
    [clienteRI, venta.id],
  )
  assert.equal(comprobantes.length, 1)
  const cobros = await q(
    `select c.id from cobros_venta c join ventas v on v.id = c.venta_id
      where v.cliente_id = $1 and c.venta_id = $2`,
    [clienteRI, venta.id],
  )
  assert.equal(cobros.length, 1)
  const total = await one(
    "select sum(total)::float as t from ventas where cliente_id = $1 and estado <> 'Anulada'",
    [clienteRI],
  )
  assert.ok(total.t >= 500)
})

// ---------------------------------------------------------------------------
// Integridad y permisos
// ---------------------------------------------------------------------------
await escenario('integridad: el total de la venta coincide con la suma de sus líneas', async () => {
  const a = await producto(33.33, 100)
  const b = await producto(10.01, 100)
  const venta = await registrar([linea(a, 3, 33.33, { descuento_pct: 0 }), linea(b, 7, 10.01)])
  const suma = await one('select sum(subtotal)::float as s from detalle_venta where venta_id = $1', [venta.id])
  assert.equal(num(venta.total), suma.s)
})

await escenario('permisos: sin personal interno / sin permiso granular se rechaza con 42501', async () => {
  const p = await producto(100, 10)
  const venta = await registrar([linea(p, 1, 100)], clienteRI)
  await db.exec('reset role')
  const externo = (await one("insert into auth.users values (gen_random_uuid(), 'externo@example.test') returning id")).id
  await actuarComo(externo, {})
  await rechaza(
    'select * from registrar_venta($1::jsonb, $2::jsonb)',
    [JSON.stringify({ deposito_id: dep, cliente_id: clienteCF }), JSON.stringify([linea(p, 1, 100)])],
    { code: '42501' },
  )
  await rechaza("select * from cambiar_estado_venta($1, 'Anulada', 'x')", [venta.id], { code: '42501' })

  await usuario('solo-registra@example.test', { app_metadata: { permisos: ['ventas.registrar'] } })
  await registrar([linea(p, 1, 100)])
  await rechaza("select * from cambiar_estado_venta($1, 'Anulada', 'x')", [venta.id], {
    code: '42501',
    mensaje: /permiso para anular/,
  })
  await rechaza('select * from registrar_cobro($1, $2::jsonb)', [venta.id, '[]'], { code: '42501' })
  await actuarComo(admin, { app_metadata: { rol: 'admin' } })
})

console.log(fallos === 0 ? '\nTodos los escenarios pasaron.' : `\n${fallos} escenario(s) fallaron.`)
process.exit(fallos === 0 ? 0 : 1)
