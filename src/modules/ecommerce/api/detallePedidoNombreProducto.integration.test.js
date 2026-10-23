// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// 0075: el detalle del pedido web guarda nombre y SKU del producto, para que
// el cliente (que no lee productos) los vea en Mis pedidos y en el comprobante.
// Se ejecuta la migración real sobre tablas mínimas de prueba.
const migracion = readFileSync('supabase/migrations/0075_detalle_pedido_web_nombre_producto.sql', 'utf8')
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
let db
const detalle = async () => (await db.query('select producto_id, producto_nombre, producto_sku from public.detalle_pedido_web order by cantidad')).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create table public.productos(id uuid primary key, sku text not null, nombre text not null);
    create table public.detalle_pedido_web(id serial primary key, pedido_id uuid, producto_id uuid references public.productos,
      cantidad numeric not null, precio_unitario numeric(14,2) not null,
      subtotal numeric(14,2) generated always as (cantidad * precio_unitario) stored);
    insert into public.productos values ('${id(1)}', 'COR-LAD-001', 'Ladrillo cerámico hueco'),
                                        ('${id(2)}', 'CEM-01', 'Cemento Portland');
    -- Pedido viejo, anterior a la migración: se completa con el backfill.
    insert into public.detalle_pedido_web(producto_id, cantidad, precio_unitario) values ('${id(1)}', 1, 560);
  `)
  await db.exec(migracion)
}, 30000)
afterAll(async () => { await db?.close() })

describe('nombre y SKU del producto en detalle_pedido_web (0075)', () => {
  it('completa los pedidos existentes con el backfill', async () => {
    expect((await detalle())[0]).toMatchObject({ producto_nombre: 'Ladrillo cerámico hueco', producto_sku: 'COR-LAD-001' })
  })

  it('completa las altas nuevas con el trigger y conserva la foto aunque el producto cambie', async () => {
    await db.exec(`insert into public.detalle_pedido_web(producto_id, cantidad, precio_unitario) values ('${id(2)}', 2, 900)`)
    await db.exec(`update public.productos set nombre = 'Cemento renombrado' where id = '${id(2)}'`)
    expect((await detalle())[1]).toMatchObject({ producto_nombre: 'Cemento Portland', producto_sku: 'CEM-01' })
  })

  it('se puede volver a aplicar sin errores', async () => {
    await expect(db.exec(migracion)).resolves.toBeDefined()
  })
})
