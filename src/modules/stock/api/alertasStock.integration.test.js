// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { afterAll, beforeAll, expect, it } from 'vitest'

// Aplica la cadena real de migraciones con datos cargados antes de 0077, para
// probar también la puesta al día, y usa las RPC reales de ventas y pedidos web.
const DIR = 'supabase/migrations'
const ALERTAS = '0077_alertas_stock_automaticas.sql'
// 0027 y 0059 no se pueden aplicar desde cero (issue #141) y no afectan stock.
const OMITIBLES = new Set(['0027_orden_de_pago.sql', '0059_proteger_comprobantes_cerrados.sql'])

let db
let deposito
let admin
let cliente
let usuarioWeb
let unidad
let categoria
let marca
let secuencia = 0
const previos = {}

const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await q(sql, params))[0]

async function actuarComo(id) {
  await db.exec('reset role')
  await q("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await q("select set_config('request.jwt.claims', '{}', false)")
  await db.exec('set role authenticated')
}

async function aplicar(archivo) {
  const sql = readFileSync(`${DIR}/${archivo}`, 'utf8')
    .replace(/create extension if not exists "?(pgcrypto|pg_cron)"?;/gi, '')
  try {
    await db.exec(sql)
  } catch (error) {
    if (!OMITIBLES.has(archivo)) throw new Error(`${archivo}: ${error.message}`)
    await db.exec('rollback')
  }
}

async function producto({ stock, comprometido = 0, minimo }) {
  const sku = `QA-ALE-${++secuencia}`
  const { id } = await one(
    `insert into productos(sku, nombre, unidad_medida_id, categoria_id, marca_id, publicado_web)
     values ($1, $1, $2, $3, $4, true) returning id`,
    [sku, unidad, categoria, marca],
  )
  await q(
    'insert into precios_lista(lista_precio_id, producto_id, precio) select l.id, $1, 100 from listas_precio l',
    [id],
  )
  if (stock !== undefined) {
    await q(
      'insert into stock_x_deposito(producto_id, deposito_id, cantidad, comprometido) values ($1, $2, $3, $4)',
      [id, deposito, stock, comprometido],
    )
  }
  if (minimo !== undefined) {
    await q('insert into configuracion_stock(producto_id, deposito_id, min_stock, max_stock) values ($1, $2, $3, 1000)', [id, deposito, minimo])
  }
  return id
}

const alertas = (id) =>
  q(
    `select estado, stock_disponible::float as disponible, stock_minimo::float as minimo, atendida_by
       from alertas_stock where producto_id = $1 and deposito_id = $2 order by generada_en`,
    [id, deposito],
  )
const activas = async (id) => (await alertas(id)).filter((a) => a.estado === 'activa')
const moverStock = (id, cantidad, comprometido) =>
  q('update stock_x_deposito set cantidad = $2, comprometido = $3 where producto_id = $1 and deposito_id = $4', [id, cantidad, comprometido, deposito])
const venta = (id, cantidad) =>
  one('select * from registrar_venta($1::jsonb, $2::jsonb)', [
    JSON.stringify({ deposito_id: deposito, cliente_id: cliente }),
    JSON.stringify([{ producto_id: id, cantidad, precio_unitario: 100 }]),
  ])

beforeAll(async () => {
  db = new PGlite({ extensions: { unaccent } })
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
  try { await db.exec('create publication supabase_realtime') } catch { /* sin replicación lógica */ }

  const archivos = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const archivo of archivos.filter((f) => f < ALERTAS)) await aplicar(archivo)

  deposito = (await one("select (valor->>'deposito_id')::uuid as id from parametros_ventas where clave = 'deposito_ecommerce'")).id
  unidad = (await one('select id from unidades_medida limit 1')).id
  categoria = (await one('select id from categorias limit 1')).id
  marca = (await one('select id from marcas limit 1')).id

  admin = randomUUID()
  await q('insert into auth.users values ($1, $2)', [admin, 'qa-admin@example.test'])
  await q(
    "insert into usuarios_internos(usuario_id, nombre, rol_id) values ($1, 'QA', (select id from roles where nombre = 'Administrador'))",
    [admin],
  )
  usuarioWeb = randomUUID()
  await q('insert into auth.users values ($1, $2)', [usuarioWeb, 'qa-web@example.test'])
  cliente = (await one(
    `insert into clientes (tipo_persona, nombre, apellido, tipo_documento, numero_documento,
                           condicion_iva_id, tipo_cliente_id, email, telefono, usuario_web_id)
     select 'fisica', 'QA', 'Web', 'DNI', '40000001',
            (select id from condiciones_iva where nombre = 'Consumidor Final'),
            (select id from tipos_cliente order by nombre limit 1),
            'qa-web@example.test', '3874000000', $1::uuid
     returning id`,
    [usuarioWeb],
  )).id

  // Situaciones previas a 0077 que la puesta al día tiene que resolver.
  previos.bajo = await producto({ stock: 5, minimo: 7 })
  previos.bien = await producto({ stock: 50, minimo: 7 })
  previos.sinFila = await producto({ minimo: 7 })
  previos.repuesto = await producto({ stock: 50, minimo: 7 })
  await q('insert into alertas_stock(producto_id, deposito_id, stock_disponible, stock_minimo) values ($1, $2, 1, 7)', [previos.repuesto, deposito])
  previos.stock = await one('select sum(cantidad)::float as cantidad, sum(comprometido)::float as comprometido from stock_x_deposito')

  await aplicar(ALERTAS)
}, 180000)

afterAll(async () => { await db?.close() })

it('la puesta al día crea las alertas que faltaban, cierra las viejas y no toca el stock', async () => {
  expect(await activas(previos.bajo)).toMatchObject([{ disponible: 5, minimo: 7 }])
  expect(await alertas(previos.bien)).toEqual([])
  expect(await activas(previos.sinFila)).toMatchObject([{ disponible: 0, minimo: 7 }])
  expect(await alertas(previos.repuesto)).toMatchObject([{ estado: 'atendida', atendida_by: null }])
  expect(await one('select sum(cantidad)::float as cantidad, sum(comprometido)::float as comprometido from stock_x_deposito')).toEqual(previos.stock)
})

it('una venta de mostrador que reserva stock genera la alerta', async () => {
  const id = await producto({ stock: 10, minimo: 5 })
  await actuarComo(admin)
  await venta(id, 7)
  await db.exec('reset role')
  expect(await activas(id)).toMatchObject([{ disponible: 3, minimo: 5 }])
  expect(await one('select cantidad::float, comprometido::float from stock_x_deposito where producto_id = $1', [id]))
    .toEqual({ cantidad: 10, comprometido: 7 })
})

it('anular la venta libera la reserva y cierra sola la alerta', async () => {
  const id = await producto({ stock: 10, minimo: 5 })
  await actuarComo(admin)
  const { id: ventaId } = await venta(id, 7)
  await q("select * from cambiar_estado_venta($1, 'Anulada', 'Prueba')", [ventaId])
  await db.exec('reset role')
  expect(await activas(id)).toEqual([])
  expect(await alertas(id)).toMatchObject([{ estado: 'atendida', atendida_by: null }])
})

it('una compra de la tienda que reserva stock genera la alerta', async () => {
  const id = await producto({ stock: 10, minimo: 5 })
  const { id: carrito } = await one(
    `insert into carritos (cliente_id) values ($1)
     on conflict (cliente_id) do update set updated_at = now() returning id`,
    [cliente],
  )
  await q('delete from items_carrito where carrito_id = $1', [carrito])
  await q('insert into items_carrito (carrito_id, producto_id, cantidad) values ($1, $2, 8)', [carrito, id])
  await actuarComo(usuarioWeb)
  await q('select crear_pedido_web($1::jsonb)', [JSON.stringify({ checkout_id: randomUUID(), tipo_entrega: 'retiro', domicilio_id: null })])
  await db.exec('reset role')
  expect(await activas(id)).toMatchObject([{ disponible: 2, minimo: 5 }])
})

it('quedar justo en el mínimo no alerta; por debajo sí, una sola vez, con el valor al día', async () => {
  const id = await producto({ stock: 10, minimo: 5 })
  await moverStock(id, 5, 0)
  expect(await alertas(id)).toEqual([])
  await moverStock(id, 4, 0)
  await moverStock(id, 2, 0)
  expect(await alertas(id)).toMatchObject([{ estado: 'activa', disponible: 2, minimo: 5 }])
})

it('una alerta atendida no reaparece hasta reponer y volver a cruzar', async () => {
  const id = await producto({ stock: 10, minimo: 5 })
  await moverStock(id, 3, 0)
  const { id: alerta } = await one("select id from alertas_stock where producto_id = $1 and estado = 'activa'", [id])
  await actuarComo(admin)
  await q('select * from atender_alerta_stock($1)', [alerta])
  await db.exec('reset role')

  await moverStock(id, 2, 0)
  await moverStock(id, 1, 0)
  await q('update configuracion_stock set min_stock = 6 where producto_id = $1', [id])
  expect(await activas(id)).toEqual([])

  await moverStock(id, 10, 0)
  await moverStock(id, 4, 0)
  expect(await activas(id)).toMatchObject([{ disponible: 4, minimo: 6 }])
  expect(await alertas(id)).toHaveLength(2)
})

it('cargar o cambiar un mínimo evalúa el stock actual', async () => {
  const id = await producto({ stock: 5 })
  await q('insert into configuracion_stock(producto_id, deposito_id, min_stock, max_stock) values ($1, $2, 3, 1000)', [id, deposito])
  expect(await alertas(id)).toEqual([])

  await q('update configuracion_stock set min_stock = 7 where producto_id = $1', [id])
  expect(await activas(id)).toMatchObject([{ disponible: 5, minimo: 7 }])

  await q('update configuracion_stock set min_stock = 2 where producto_id = $1', [id])
  expect(await activas(id)).toEqual([])
})

it('un egreso manual confirmado genera una sola alerta y una reposición la cierra', async () => {
  const id = await producto({ stock: 10, minimo: 5 })
  const items = JSON.stringify([{ producto_id: id, cantidad: 7 }])
  await actuarComo(admin)
  await q('select * from crear_movimiento_multiarticulo($1, $2, $3::jsonb)', ['egreso', deposito, items])
  await db.exec('reset role')
  expect(await alertas(id)).toMatchObject([{ estado: 'activa', disponible: 3, minimo: 5 }])

  await actuarComo(admin)
  await q('select * from crear_movimiento_multiarticulo($1, $2, $3::jsonb)', ['ingreso', deposito, items])
  await db.exec('reset role')
  expect(await activas(id)).toEqual([])
})

it('sin mínimo cargado nunca alerta', async () => {
  const id = await producto({ stock: 10 })
  await moverStock(id, 0, 0)
  expect(await alertas(id)).toEqual([])
})

it('un usuario no puede llamar a las funciones internas de alertas', async () => {
  const permisos = await one(`select
    has_function_privilege('authenticated', 'fn_evaluar_alerta_stock(uuid,uuid,numeric,numeric,boolean)', 'execute') as evaluar,
    has_function_privilege('authenticated', 'fn_alerta_por_cambio_de_stock()', 'execute') as stock,
    has_function_privilege('authenticated', 'fn_alerta_por_cambio_de_minimo()', 'execute') as minimo`)
  expect(permisos).toEqual({ evaluar: false, stock: false, minimo: false })
})
