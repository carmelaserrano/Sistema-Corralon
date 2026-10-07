// Verificación de la integración depósitos / stock / movimientos / pedidos web.
//
// Aplica las migraciones de supabase/migrations en una base PostgreSQL efímera
// (PGlite, en memoria) HASTA la 0062, arma el estado que dejó la 0053 en la
// base real (reservas de pedidos abiertos puestas en 0), corre el diagnóstico
// de solo lectura, aplica las migraciones restantes (0063+) y verifica cada
// corrección contra las RPC reales. No se conecta a Supabase.
//
// Preparación (una sola vez, desde la raíz):
//   npm install --prefix .temp/ventas-db --no-save --ignore-scripts @electric-sql/pglite
// Ejecución:
//   node scripts/probar-integracion-pedidos-web.mjs
//
// Limitaciones de la base efímera (no son defectos de esta revisión):
//   - 0027_orden_de_pago.sql usa columnas que crea la 0029 (issue #141): se
//     aplica después de la 0029, que es el orden en que quedó la base real.
//   - Supabase aporta roles, los esquemas auth/storage/cron y auth.role():
//     acá van stubs mínimos.
import { PGlite } from '../.temp/ventas-db/node_modules/@electric-sql/pglite/dist/index.js'
import { unaccent } from '../.temp/ventas-db/node_modules/@electric-sql/pglite/dist/contrib/unaccent.js'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRACIONES = join(RAIZ, 'supabase', 'migrations')
const DIAGNOSTICO = join(RAIZ, 'scripts', 'diagnostico_integracion_pedidos_web.sql')
const ULTIMA_ANTES = '0062'
const DIFERIDAS = { '0027_orden_de_pago.sql': '0029_vinculacion_notas_facturas.sql' }

const db = new PGlite({ extensions: { unaccent } })
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await q(sql, params))[0]

async function rechaza(sql, params, mensaje) {
  let error
  try {
    await q(sql, params)
  } catch (e) {
    error = e
  }
  assert.ok(error, `se esperaba un error: ${mensaje}`)
  assert.match(error.message, mensaje)
  return error
}

let fallos = 0
async function escenario(nombre, fn) {
  try {
    await fn()
    console.log(`OK:    ${nombre}`)
  } catch (error) {
    fallos += 1
    console.log(`FALLA: ${nombre}\n       ${String(error.message).split('\n').slice(0, 5).join(' ')}`)
  } finally {
    await db.exec('reset role')
  }
}

async function actuarComo(id, claims, rol = 'authenticated') {
  await db.exec('reset role')
  await q("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ''])
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)])
  await db.exec(`set role ${rol}`)
}

// ---------------------------------------------------------------------------
// Base efímera: stubs de Supabase + migraciones hasta ULTIMA_ANTES
// ---------------------------------------------------------------------------
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.role() returns text language sql as $$
    select coalesce(auth.jwt() ->> 'role', 'anon') $$;
  create schema cron;
  create table cron.job(jobid bigint, jobname text);
  create function cron.schedule(nombre text, expresion text, comando text) returns bigint
    language sql as $$ insert into cron.job values (1, nombre); select 1::bigint $$;
  create function cron.unschedule(id bigint) returns boolean language sql as $$
    delete from cron.job where jobid = id; select true $$;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean);
  create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage, cron to authenticated, anon, service_role;
  grant select on cron.job to authenticated, service_role;
  alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
  alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
  alter default privileges in schema public grant all on functions to authenticated, anon, service_role;
`)
try {
  await db.exec('create publication supabase_realtime')
} catch {
  // PGlite sin replicación lógica.
}

const todas = readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()
const orden = []
for (const archivo of todas) {
  if (DIFERIDAS[archivo]) continue
  orden.push(archivo)
  for (const [diferida, despues] of Object.entries(DIFERIDAS)) {
    if (archivo === despues) orden.push(diferida)
  }
}

async function aplicar(archivos) {
  for (const archivo of archivos) {
    const sql = readFileSync(join(MIGRACIONES, archivo), 'utf8').replace(
      /create extension if not exists "?(pgcrypto|pg_cron)"?;/gi,
      '',
    )
    try {
      await db.exec(sql)
    } catch (error) {
      if (archivo.startsWith('0058_')) {
        await db.exec('rollback')
        continue // publicación de Realtime: no aplica en PGlite
      }
      console.error(`ERROR: la migración ${archivo} no se pudo aplicar: ${error.message}`)
      process.exit(1)
    }
  }
}

const antes = orden.filter((f) => f.slice(0, 4) <= ULTIMA_ANTES)
const nuevas = orden.filter((f) => f.slice(0, 4) > ULTIMA_ANTES)
await aplicar(antes)
console.log(`OK:    migraciones aplicadas hasta ${ULTIMA_ANTES} (${antes.length})`)

// ---------------------------------------------------------------------------
// Datos: operador interno, cliente web, productos en el depósito e-commerce
// ---------------------------------------------------------------------------
const depEcommerce = (
  await one("select (valor->>'deposito_id')::uuid as id from parametros_ventas where clave = 'deposito_ecommerce'")
).id
const otroDeposito = (await one('select id from depositos where id <> $1 order by nombre limit 1', [depEcommerce])).id
const unidad = (await one('select id from unidades_medida limit 1')).id
const listaGeneral = (await one("select id from listas_precio where nombre = 'General'")).id
const categoria = (await one('select id from categorias limit 1')).id
const marca = (await one('select id from marcas limit 1')).id

const operador = randomUUID()
await q('insert into auth.users values ($1, $2)', [operador, 'qa-operador@example.test'])
await q('insert into usuarios_internos(usuario_id, nombre) values ($1, $2)', [operador, 'QA operador'])
const claimsOperador = { app_metadata: { rol: 'admin' } }

let secuenciaCliente = 0
async function clienteWeb() {
  const usuario = randomUUID()
  secuenciaCliente += 1
  await q('insert into auth.users values ($1, $2)', [usuario, `qa-web-${secuenciaCliente}@example.test`])
  const cliente = (
    await one(
      `insert into clientes (tipo_persona, nombre, apellido, tipo_documento, numero_documento,
                             condicion_iva_id, tipo_cliente_id, email, telefono, usuario_web_id)
       select 'fisica', 'QA', 'Web ' || $2::text, 'DNI', $3::text,
              (select id from condiciones_iva where nombre = 'Consumidor Final'),
              (select id from tipos_cliente order by nombre limit 1),
              $4::text, '3874000000', $1::uuid
       returning id`,
      [usuario, secuenciaCliente, String(40000000 + secuenciaCliente), `qa-web-${secuenciaCliente}@example.test`],
    )
  ).id
  const domicilio = (
    await one(
      `insert into domicilios_cliente (cliente_id, alias, calle, numero, localidad, provincia)
       values ($1, 'Casa', 'Belgrano', '100', 'Salta', 'Salta') returning id`,
      [cliente],
    )
  ).id
  return { usuario, cliente, domicilio }
}

let secuenciaProducto = 0
async function producto(stock, deposito = depEcommerce) {
  const sku = `QA-INT-${++secuenciaProducto}`
  const id = (
    await one(
      `insert into productos (sku, nombre, unidad_medida_id, categoria_id, marca_id, publicado_web)
       values ($1, $1, $2, $3, $4, true) returning id`,
      [sku, unidad, categoria, marca],
    )
  ).id
  await q('insert into precios_lista (lista_precio_id, producto_id, precio) values ($1, $2, 1000)', [listaGeneral, id])
  await q('insert into stock_x_deposito (producto_id, deposito_id, cantidad) values ($1, $2, $3)', [id, deposito, stock])
  return id
}

async function pedidoWeb(cli, items, { tipo = 'retiro' } = {}) {
  await db.exec('reset role')
  const carrito = (
    await one(
      `insert into carritos (cliente_id) values ($1)
       on conflict (cliente_id) do update set updated_at = now() returning id`,
      [cli.cliente],
    )
  ).id
  await q('delete from items_carrito where carrito_id = $1', [carrito])
  for (const [producto_id, cantidad] of items) {
    await q('insert into items_carrito (carrito_id, producto_id, cantidad) values ($1, $2, $3)', [carrito, producto_id, cantidad])
  }
  await actuarComo(cli.usuario, { role: 'authenticated' })
  const pedido = (
    await one('select crear_pedido_web($1::jsonb) as p', [
      JSON.stringify({
        checkout_id: randomUUID(),
        tipo_entrega: tipo,
        domicilio_id: tipo === 'envio' ? cli.domicilio : null,
      }),
    ])
  ).p
  await db.exec('reset role')
  return pedido
}

const stock = (p, d = depEcommerce) =>
  one(
    'select cantidad::float as cantidad, comprometido::float as comprometido from stock_x_deposito where producto_id = $1 and deposito_id = $2',
    [p, d],
  )
const avanzar = async (pedido, estado, motivo = null) => {
  await actuarComo(operador, claimsOperador)
  return one('select * from avanzar_estado_pedido($1, $2, $3)', [pedido, estado, motivo])
}
const pagar = async (pedido, referencia, estado = 'approved') => {
  await actuarComo(null, { role: 'service_role' }, 'service_role')
  return (await one('select confirmar_pago_pedido($1, $2, $3) as p', [pedido, referencia, estado])).p
}

async function diagnostico() {
  await db.exec('reset role')
  const sql = readFileSync(DIAGNOSTICO, 'utf8')
    .replace(/begin transaction read only;/i, '')
    .replace(/commit;\s*$/i, '')
  const filas = await q(sql)
  return Object.fromEntries(filas.map((c) => [c.control.split(' ')[0], c]))
}

// MOSTRAR_DIAGNOSTICO=1 imprime el resumen de controles con hallazgos.
async function mostrarDiagnostico(titulo) {
  if (!process.env.MOSTRAR_DIAGNOSTICO) return
  console.log(`
--- Diagnóstico ${titulo} ---`)
  for (const c of Object.values(await diagnostico())) {
    if (c.cantidad > 0 && c.severidad !== 'info') {
      console.log(`  [${c.severidad}] ${c.control}: ${c.cantidad}`)
    }
  }
  console.log('')
}

const cliA = await clienteWeb()
const cliB = await clienteWeb()

// ---------------------------------------------------------------------------
// Estado previo: lo que dejó la 0053 en la base real
// ---------------------------------------------------------------------------
const prodReset = await producto(10)
const prodVencido = await producto(10)
const prodSano = await producto(10)

const pedidoReset = await pedidoWeb(cliA, [[prodReset, 2]])
const pedidoVencidoRoto = await pedidoWeb(cliB, [[prodVencido, 3]])
const pedidoVencidoSano = await pedidoWeb(cliA, [[prodSano, 1]])

// 0053: `on conflict do update set comprometido = 0` sobre el depósito e-commerce.
await q('update stock_x_deposito set comprometido = 0 where producto_id in ($1, $2)', [prodReset, prodVencido])
await q("update pedidos_web set vence_at = now() - interval '1 hour' where id in ($1, $2)", [
  pedidoVencidoRoto.id,
  pedidoVencidoSano.id,
])

// Seed de 0033 en la base real: pedidos insertados directo, sin checkout ni historial.
const pedidoSeed = (
  await one(
    `insert into pedidos_web (cliente_id, deposito_id, tipo_entrega, estado, total, referencia_pago)
     values ($1, $2, 'retiro', 'Pagado', 1000, 'HOMOLOGACIÓN-QA') returning id`,
    [cliB.cliente, depEcommerce],
  )
).id
await q('insert into detalle_pedido_web (pedido_id, producto_id, cantidad, precio_unitario) values ($1, $2, 1, 1000)', [
  pedidoSeed,
  prodSano,
])

await escenario('ANTES · el diagnóstico detecta reservas borradas (S1) y pedidos vencidos', async () => {
  const d = await diagnostico()
  assert.ok(d.P5.cantidad >= 1, `P5 = ${d.P5.cantidad}`)
  assert.ok(d.S1.cantidad >= 2, `S1 = ${d.S1.cantidad}`)
  assert.ok(d.P8.cantidad >= 2, `P8 = ${d.P8.cantidad}`)
  assert.ok(Object.keys(d).length >= 25, 'el diagnóstico devuelve todos los controles')
})

await escenario('ANTES · un pedido sin reserva frena el cron para TODOS los vencidos (H2)', async () => {
  await rechaza('select cancelar_pedidos_web_vencidos()', [], /No se pudo liberar la reserva/)
  const estado = (await one('select estado from pedidos_web where id = $1', [pedidoVencidoSano.id])).estado
  assert.equal(estado, 'Pendiente de pago', 'el pedido sano tampoco se canceló')
})

await escenario('ANTES · cancelar un pedido cuya reserva se borró falla (H1)', async () => {
  await actuarComo(operador, claimsOperador)
  await rechaza('select avanzar_estado_pedido($1, $2, $3)', [pedidoReset.id, 'Cancelado', 'QA'], /comprometido_nonneg|violates/)
})

await mostrarDiagnostico('antes de la corrección')

if (nuevas.length === 0) {
  console.log('AVISO: no hay migraciones posteriores a la 0062: se omiten las verificaciones de la corrección')
  process.exit(fallos ? 1 : 0)
}

// ---------------------------------------------------------------------------
// Corrección
// ---------------------------------------------------------------------------
await aplicar(nuevas)
console.log(`OK:    migraciones nuevas aplicadas: ${nuevas.join(', ')}`)
await mostrarDiagnostico('después de aplicar la corrección')

await escenario('DESPUÉS · la 0063 recalculó comprometido y dejó bitácora (H1)', async () => {
  assert.deepEqual(await stock(prodReset), { cantidad: 10, comprometido: 2 })
  assert.deepEqual(await stock(prodVencido), { cantidad: 10, comprometido: 3 })
  const bitacora = await q('select * from ajustes_comprometido_stock where producto_id in ($1, $2)', [prodReset, prodVencido])
  assert.equal(bitacora.length, 2)
  const d = await diagnostico()
  assert.equal(d.S1.cantidad, 0, JSON.stringify(d.S1.muestra))
  assert.equal((await q('select * from v_control_comprometido')).length, 0)
})

await escenario('DESPUÉS · pedidos sin historial reciben su fila de alta y se validan las cantidades enteras', async () => {
  const historial = await q('select estado_anterior, estado_nuevo, motivo from historial_estado_pedido where pedido_id = $1', [pedidoSeed])
  assert.equal(historial.length, 1)
  assert.equal(historial[0].estado_anterior, null)
  assert.equal(historial[0].estado_nuevo, 'Pagado')
  assert.match(historial[0].motivo, /reconstruido/)
  const pendientes = await q(
    "select conname from pg_constraint where not convalidated and conname in ('detalle_pedido_web_cantidad_entera', 'items_carrito_cantidad_entera')",
  )
  assert.deepEqual(pendientes, [])
})

await escenario('DESPUÉS · el cron cancela los vencidos y libera la reserva', async () => {
  assert.equal((await one('select cancelar_pedidos_web_vencidos() as n')).n, 2)
  assert.deepEqual(await stock(prodVencido), { cantidad: 10, comprometido: 0 })
  assert.deepEqual(await stock(prodSano), { cantidad: 10, comprometido: 0 })
})

await escenario('DESPUÉS · un pedido roto ya no frena al resto del lote (H2)', async () => {
  const roto = await pedidoWeb(cliA, [[prodVencido, 1]])
  const sano = await pedidoWeb(cliB, [[prodSano, 1]])
  await q('update stock_x_deposito set comprometido = 0 where producto_id = $1', [prodVencido])
  await q("update pedidos_web set vence_at = now() - interval '1 hour' where id in ($1, $2)", [roto.id, sano.id])
  assert.equal((await one('select cancelar_pedidos_web_vencidos() as n')).n, 1)
  assert.equal((await one('select estado from pedidos_web where id = $1', [sano.id])).estado, 'Cancelado')
  assert.equal((await one('select estado from pedidos_web where id = $1', [roto.id])).estado, 'Pendiente de pago')
  // Se corrige con la reconciliación y el próximo ciclo lo cancela.
  await one('select reconciliar_comprometido_stock($1)', ['QA'])
  assert.equal((await one('select cancelar_pedidos_web_vencidos() as n')).n, 1)
})

await escenario('DESPUÉS · cancelar a mano libera la reserva del pedido', async () => {
  await avanzar(pedidoReset.id, 'Cancelado', 'QA: cliente desistió')
  assert.deepEqual(await stock(prodReset), { cantidad: 10, comprometido: 0 })
})

await escenario('DESPUÉS · la entrega egresa stock con referencia al pedido (H3)', async () => {
  const pedido = await pedidoWeb(cliA, [[prodSano, 4]], { tipo: 'envio' })
  await pagar(pedido.id, `MP-${pedido.numero}`)
  await avanzar(pedido.id, 'En preparación')
  await avanzar(pedido.id, 'Enviado')
  await avanzar(pedido.id, 'Entregado')
  assert.deepEqual(await stock(prodSano), { cantidad: 6, comprometido: 0 })
  const mov = await one(
    `select m.observaciones, tm.codigo, m.deposito_origen_id, dm.cantidad::float as cantidad
       from movimientos_stock m
       join tipos_movimiento tm on tm.id = m.tipo_movimiento_id
       join detalle_movimiento dm on dm.movimiento_id = m.id
      where m.observaciones = $1`,
    [`Pedido web #${pedido.numero}`],
  )
  assert.ok(mov, 'existe el movimiento con la referencia del pedido')
  assert.equal(mov.codigo, 'egreso')
  assert.equal(mov.deposito_origen_id, depEcommerce)
  assert.equal(mov.cantidad, 4)
})

await escenario('DESPUÉS · liberar/egresar sin fila de stock falla en vez de pasar en silencio (H4)', async () => {
  const sinFila = await producto(5, otroDeposito)
  await db.exec('reset role')
  await q("select set_config('request.jwt.claim.sub', $1, false)", [operador])
  const items = JSON.stringify([{ producto_id: sinFila, cantidad: 1 }])
  await rechaza('select liberar_stock($1, $2::jsonb)', [depEcommerce, items], /RESERVA_INCONSISTENTE/)
  await rechaza('select egresar_comprometido($1, $2::jsonb, $3)', [depEcommerce, items, 'QA'], /RESERVA_INCONSISTENTE/)
  const huerfanos = await one(
    "select count(*)::int as n from movimientos_stock where observaciones = 'QA'",
  )
  assert.equal(huerfanos.n, 0, 'el movimiento del egreso fallido se revirtió')
})

await escenario('DESPUÉS · pago aprobado sobre un pedido cancelado queda registrado para reembolso (H5)', async () => {
  const pedido = await pedidoWeb(cliB, [[prodSano, 1]])
  await avanzar(pedido.id, 'Cancelado', 'QA: vencido a mano')
  const p = await pagar(pedido.id, 'MP-TARDIO')
  assert.equal(p.estado, 'Cancelado', 'el pedido no se reabre')
  assert.equal(p.pago_estado, 'approved')
  assert.equal(p.referencia_pago, 'MP-TARDIO')
  assert.match(p.pago_motivo, /reembolso/)
  // Idempotente: una segunda notificación no cambia nada.
  const otra = await pagar(pedido.id, 'MP-OTRO')
  assert.equal(otra.referencia_pago, 'MP-TARDIO')
  const d = await diagnostico()
  assert.ok(d.P9.cantidad >= 1, 'aparece en el control P9')
  assert.deepEqual(await stock(prodSano), { cantidad: 6, comprometido: 0 }, 'no se vuelve a reservar stock')
})

await escenario('DESPUÉS · un pago aprobado en tiempo sigue funcionando igual', async () => {
  const pedido = await pedidoWeb(cliA, [[prodSano, 1]])
  const p = await pagar(pedido.id, 'MP-OK')
  assert.equal(p.estado, 'Pagado')
  assert.ok(p.pagado_at)
  const repetido = await pagar(pedido.id, 'MP-OK', 'rejected')
  assert.equal(repetido.estado, 'Pagado', 'una notificación tardía no degrada el pedido')
})

await escenario('DESPUÉS · el depósito de e-commerce no se puede borrar ni apuntar a la nada (H6)', async () => {
  await rechaza('delete from depositos where id = $1', [depEcommerce], /despacha los pedidos de la tienda web/)
  await rechaza(
    "update parametros_ventas set valor = jsonb_build_object('deposito_id', $1::text) where clave = 'deposito_ecommerce'",
    [randomUUID()],
    /depósito existente/,
  )
  await rechaza(
    "update parametros_ventas set valor = '{\"deposito_id\": \"no-es-uuid\"}' where clave = 'deposito_ecommerce'",
    [],
    /depósito existente/,
  )
  // Cambiarlo a otro depósito válido sí se puede.
  await q("update parametros_ventas set valor = jsonb_build_object('deposito_id', $1::uuid) where clave = 'deposito_ecommerce'", [otroDeposito])
  await q("update parametros_ventas set valor = jsonb_build_object('deposito_id', $1::uuid) where clave = 'deposito_ecommerce'", [depEcommerce])
})

await escenario('DESPUÉS · constraints de pedidos web (H7)', async () => {
  const base = await one('select * from pedidos_web where checkout_id is not null limit 1')
  await rechaza(
    `insert into pedidos_web (cliente_id, deposito_id, tipo_entrega, total) values ($1, $2, 'envio', 1)`,
    [base.cliente_id, depEcommerce],
    /chk_pedido_web_domicilio_entrega/,
  )
  await rechaza(
    `insert into pedidos_web (cliente_id, deposito_id, tipo_entrega, domicilio_id, total) values ($1, $2, 'envio', $3, 1)`,
    [cliA.cliente, depEcommerce, cliB.domicilio],
    /fk_pedido_web_domicilio_cliente/,
  )
  await rechaza(
    'insert into detalle_pedido_web (pedido_id, producto_id, cantidad, precio_unitario) select pedido_id, producto_id, 1, 1 from detalle_pedido_web limit 1',
    [],
    /ux_detalle_pedido_web_producto/,
  )
})

await escenario('DESPUÉS · los clientes web siguen sin acceso a stock ni a las primitivas', async () => {
  await actuarComo(cliA.usuario, { role: 'authenticated' })
  assert.equal((await q('select * from stock_x_deposito')).length, 0)
  assert.equal((await q('select * from v_control_comprometido')).length, 0)
  assert.equal((await q('select * from ajustes_comprometido_stock')).length, 0)
  await rechaza('select reconciliar_comprometido_stock($1)', ['x'], /permission denied/)
  await rechaza('select liberar_stock($1, $2::jsonb)', [depEcommerce, '[]'], /permission denied/)
})

await escenario('DESPUÉS · el diagnóstico final no tiene errores de reservas, pedidos ni relaciones', async () => {
  const d = await diagnostico()
  for (const control of ['D1', 'S1', 'S2', 'S3', 'M1', 'M2', 'P3', 'P5', 'P8', 'P10', 'R2']) {
    assert.equal(d[control].cantidad, 0, `${d[control].control}: ${JSON.stringify(d[control].muestra)}`)
  }
})

console.log(fallos ? `\n${fallos} escenario(s) con falla` : '\nTodos los escenarios OK')
process.exit(fallos ? 1 : 0)
