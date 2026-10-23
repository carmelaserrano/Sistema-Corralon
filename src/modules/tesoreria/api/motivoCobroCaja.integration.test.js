// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 0074: el movimiento de caja de un cobro debe citar el número de la VENTA,
// no el del cobro. Se ejecuta el trigger real de la migración sobre tablas
// mínimas de prueba, sin conexión a Supabase.
const migracion = readFileSync('supabase/migrations/0074_motivo_cobro_numero_venta.sql', 'utf8')
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
let db

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${id(1)}'::uuid $$;
    create table public.ventas(id uuid primary key, numero bigint unique, origen text not null);
    create table public.cobros_venta(id uuid primary key, numero bigint unique,
      venta_id uuid references public.ventas, sesion_caja_id uuid, caja_id uuid,
      created_by uuid, created_at timestamptz default now());
    create table public.detalle_cobro(id serial primary key, cobro_id uuid references public.cobros_venta,
      medio_pago_id uuid, monto numeric, referencia text);
    create table public.movimientos_caja(id serial primary key, sesion_caja_id uuid, caja_id uuid,
      tipo text, origen text, medio_pago_id uuid, monto numeric, motivo text, comprobante text,
      venta_id uuid, created_by uuid, created_at timestamptz);
  `)
  await db.exec(migracion)
  await db.exec(`
    create trigger movimiento after insert on public.detalle_cobro for each row
      execute function public.registrar_movimiento_por_detalle_cobro();
  `)
}, 30000)
beforeEach(async () => { await db.exec('begin') })
afterEach(async () => { await db.exec('rollback') })
afterAll(async () => { await db?.close() })

async function cobrar(origen) {
  // Números distintos a propósito: venta 49, cobro 37.
  await db.exec(`
    insert into public.ventas values ('${id(7)}', 49, '${origen}');
    insert into public.cobros_venta(id, numero, venta_id, sesion_caja_id, caja_id)
      values ('${id(8)}', 37, '${id(7)}', '${id(9)}', '${id(10)}');
    insert into public.detalle_cobro(cobro_id, medio_pago_id, monto, referencia)
      values ('${id(8)}', '${id(5)}', 900, 'QA-1');
  `)
  return (await db.query('select * from public.movimientos_caja')).rows
}

describe('motivo del movimiento de caja de un cobro (0074)', () => {
  it('cita el número de la venta en un cobro de mostrador', async () => {
    const [movimiento] = await cobrar('mostrador')
    expect(movimiento).toMatchObject({
      motivo: 'Cobro de venta N.º 49',
      origen: 'venta',
      venta_id: id(7),
      sesion_caja_id: id(9),
      created_by: id(1),
    })
  })

  it('cita el número de la venta en un cobro Ecommerce', async () => {
    const [movimiento] = await cobrar('ecommerce')
    expect(movimiento).toMatchObject({
      motivo: 'Cobro Ecommerce · Venta N.º 49',
      origen: 'ecommerce',
      sesion_caja_id: null,
      created_by: null,
    })
  })
})
