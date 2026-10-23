// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// PostgreSQL real embebido, sin conexión ni credenciales de Supabase.
// Las tablas, RPCs y triggers bajo prueba se extraen de las migraciones del repo.
const migration = (name) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8')
const base = migration('0033_base_sprint3')
const caja = migration('0062_gestion_cajas_y_sesiones')
const cierreCaja = migration('0076_cierre_caja_sin_diferencias')
function table(sql, name) {
  return sql.match(new RegExp(`create table (?:if not exists )?public\\.${name} \\([\\s\\S]*?\\n\\);`))[0]
}
function fn(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  if (start < 0) throw new Error(`No existe ${name}`)
  return sql.slice(start, sql.indexOf('$$;', start) + 3)
}
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
let db
const efectivo = (monto = 121) => [{ medio_pago_id: id(5), monto, monto_recibido: monto + 10 }]
const cobrar = (detalle = efectivo(), venta = id(7)) => db.query('select * from public.registrar_cobro($1, $2)', [venta, JSON.stringify(detalle)])
const rows = async (tabla) => (await db.query(`select * from public.${tabla}`)).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select '${id(1)}'::uuid $$;
    create function public.usuario_tiene_permiso(text) returns boolean language sql as $$
      select $1 is distinct from current_setting('test.denied', true) $$;
    create table public.usuarios_internos(usuario_id uuid primary key references auth.users);
    create table public.depositos(id uuid primary key);
    create table public.condiciones_iva(id uuid primary key, nombre text);
    create table public.clientes(id uuid primary key, condicion_iva_id uuid references condiciones_iva,
      habilita_cta_cte boolean default false, limite_credito numeric default 0);
    create table public.medios_pago(id uuid primary key, nombre text, activo boolean default true);
    create function public.fn_saldo_cta_cte_cliente(uuid) returns numeric language sql as $$ select 0::numeric $$;
  `)
  for (const name of ['puntos_venta', 'numeracion_comprobantes', 'ventas', 'historial_estado_venta', 'comprobantes_venta', 'cobros_venta', 'detalle_cobro']) {
    await db.exec(table(base, name))
  }
  await db.exec('alter table puntos_venta add column deposito_id uuid references depositos;')
  for (const name of ['cajas', 'sesiones_caja', 'movimientos_caja']) await db.exec(table(caja, name))
  await db.exec('alter table cobros_venta add column sesion_caja_id uuid references sesiones_caja; create unique index on cobros_venta(venta_id);')
  await db.exec("create unique index on comprobantes_venta(venta_id) where tipo_comprobante = 'factura' and estado = 'Emitido';")
  await db.exec(fn(base, 'siguiente_numero_comprobante'))
  await db.exec(fn(migration('0065_puntos_venta_por_sucursal'), 'emitir_comprobante'))
  await db.exec(fn(migration('0039_estados_venta'), 'fn_facturar_venta_automatico'))
  await db.exec(fn(caja, 'asociar_sesion_caja_a_cobro'))
  await db.exec(fn(caja, 'registrar_movimiento_por_detalle_cobro'))
  await db.exec(fn(cierreCaja, 'cerrar_caja'))
  await db.exec(`
    create trigger factura after insert on comprobantes_venta for each row
      when (new.tipo_comprobante = 'factura') execute function fn_facturar_venta_automatico();
    create trigger caja before insert on cobros_venta for each row execute function asociar_sesion_caja_a_cobro();
    create trigger movimiento after insert on detalle_cobro for each row execute function registrar_movimiento_por_detalle_cobro();
  `)
  await db.exec(migration('0070_cobro_facturacion_automatica'))
  await db.exec(`
    insert into auth.users values ('${id(1)}');
    insert into usuarios_internos values ('${id(1)}');
    insert into depositos values ('${id(2)}');
    insert into condiciones_iva values ('${id(3)}', 'Consumidor Final');
    insert into clientes(id, condicion_iva_id) values ('${id(4)}', '${id(3)}');
    insert into medios_pago(id, nombre) values ('${id(5)}', 'Efectivo'), ('${id(6)}', 'Transferencia');
    insert into puntos_venta(id, numero, nombre, deposito_id) values ('${id(8)}', '0001', 'Central', '${id(2)}');
    insert into cajas(id, nombre, punto_venta_id) values ('${id(9)}', 'Caja', '${id(8)}');
    insert into sesiones_caja(id, caja_id, usuario_id, saldo_inicial) values ('${id(10)}', '${id(9)}', '${id(1)}', 0);
    insert into ventas(id, deposito_id, cliente_id, total) values ('${id(7)}', '${id(2)}', '${id(4)}', 121);
  `)
}, 30000)
beforeEach(async () => { await db.exec('begin') })
afterEach(async () => { await db.exec('rollback') })
afterAll(async () => { await db?.close() })

describe('cobro y facturación en una transacción', () => {
  it('emite factura B asociada a la venta, conserva caja/efectivo/vuelto e historial y permite consultar después', async () => {
    const { rows: resultado } = await cobrar()
    expect(resultado[0]).toMatchObject({ venta_id: id(7), cobrada: true, estado_venta: 'Facturada' })
    expect(await rows('comprobantes_venta')).toEqual([expect.objectContaining({ venta_id: id(7), letra: 'B', numero: 1, total: '121.00', estado: 'Emitido', punto_venta_id: id(8) })])
    expect((await rows('cobros_venta'))[0].sesion_caja_id).toBe(id(10))
    expect((await rows('detalle_cobro'))[0]).toMatchObject({ medio_pago_id: id(5), vuelto: '10.00' })
    expect((await rows('movimientos_caja'))[0]).toMatchObject({ sesion_caja_id: id(10), venta_id: id(7), medio_pago_id: id(5), monto: '121.00' })
    expect((await rows('historial_estado_venta'))[0]).toMatchObject({ venta_id: id(7), estado_nuevo: 'Facturada', usuario_id: id(1) })
  })

  it('no deja factura ni cobro ante pago parcial', async () => {
    await db.exec('savepoint intento')
    await expect(cobrar(efectivo(100))).rejects.toMatchObject({ code: 'CV004' })
    await db.exec('rollback to savepoint intento')
    expect(await rows('comprobantes_venta')).toHaveLength(0)
    expect(await rows('cobros_venta')).toHaveLength(0)
  })

  it('revierte cobro, detalle y caja si falla la emisión', async () => {
    await db.exec('update puntos_venta set activo = false; savepoint intento')
    await expect(cobrar()).rejects.toMatchObject({ code: '22023' })
    await db.exec('rollback to savepoint intento')
    for (const tabla of ['cobros_venta', 'detalle_cobro', 'movimientos_caja', 'comprobantes_venta', 'historial_estado_venta', 'numeracion_comprobantes']) expect(await rows(tabla)).toHaveLength(0)
    expect((await rows('ventas'))[0].estado).toBe('Pendiente')
  })

  it('rechaza reintentos sin duplicar cobro, factura o número', async () => {
    await cobrar()
    await db.exec('savepoint reintento')
    await expect(cobrar()).rejects.toMatchObject({ code: 'CV003' })
    await db.exec('rollback to savepoint reintento')
    expect(await rows('cobros_venta')).toHaveLength(1)
    expect(await rows('comprobantes_venta')).toHaveLength(1)
    expect((await rows('numeracion_comprobantes'))[0].ultimo_numero).toBe(1)
  })

  it('revierte también la numeración si falla un trigger posterior a insertar la factura', async () => {
    await db.exec(`create function falla_fiscal() returns trigger language plpgsql as $$ begin raise exception 'Fallo fiscal'; end $$;
      create trigger z_falla after insert on comprobantes_venta for each row execute function falla_fiscal(); savepoint intento`)
    await expect(cobrar()).rejects.toThrow('Fallo fiscal')
    await db.exec('rollback to savepoint intento')
    for (const tabla of ['cobros_venta', 'detalle_cobro', 'movimientos_caja', 'comprobantes_venta', 'historial_estado_venta', 'numeracion_comprobantes']) expect(await rows(tabla)).toHaveLength(0)
    expect((await rows('ventas'))[0].estado).toBe('Pendiente')
  })

  it('factura el total financiado por cuenta corriente conservando el medio', async () => {
    await db.exec(`update clientes set habilita_cta_cte = true; insert into medios_pago(id, nombre) values ('${id(12)}', 'Cuenta corriente')`)
    await cobrar([{ medio_pago_id: id(12), monto: 121 }])
    expect((await rows('comprobantes_venta'))[0].total).toBe('121.00')
    expect((await rows('detalle_cobro'))[0].medio_pago_id).toBe(id(12))
  })

  it('conserva la letra A y medios combinados sin afectar otra venta', async () => {
    await db.exec(`update condiciones_iva set nombre = 'Responsable Inscripto'; insert into ventas(id, deposito_id, cliente_id, total) values ('${id(11)}', '${id(2)}', '${id(4)}', 121)`)
    await cobrar([{ medio_pago_id: id(5), monto: 21, monto_recibido: 21 }, { medio_pago_id: id(6), monto: 100, referencia: 'TRX-123' }])
    expect((await rows('comprobantes_venta'))[0]).toMatchObject({ letra: 'A', venta_id: id(7) })
    expect(await rows('movimientos_caja')).toHaveLength(2)
    expect((await db.query('select estado from ventas where id = $1', [id(11)])).rows[0].estado).toBe('Pendiente')
  })

  it('rechaza cobrar sin caja abierta', async () => {
    await db.exec('delete from sesiones_caja; savepoint intento')
    await expect(cobrar()).rejects.toMatchObject({ code: 'CV008' })
    await db.exec('rollback to savepoint intento')
    expect(await rows('comprobantes_venta')).toHaveLength(0)
    expect(await rows('cobros_venta')).toHaveLength(0)
  })

  it('mantiene abierta la caja con diferencia y la cierra al coincidir el efectivo', async () => {
    await db.exec(`
      update sesiones_caja set saldo_inicial = 1000;
      insert into movimientos_caja (
        sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo, comprobante, created_by
      ) values
        ('${id(10)}', 'ingreso', 'manual', '${id(5)}', 100, 'Venta 1', 'V-1', '${id(1)}'),
        ('${id(10)}', 'ingreso', 'manual', '${id(5)}', 200, 'Venta 2', 'V-2', '${id(1)}'),
        ('${id(10)}', 'ingreso', 'manual', '${id(6)}', 500, 'Transferencia', 'T-1', '${id(1)}');
      savepoint cierre_descuadrado;
    `)

    await expect(
      db.query('select * from public.cerrar_caja($1, $2)', [id(10), 1299]),
    ).rejects.toMatchObject({ code: 'CX004' })
    await db.exec('rollback to savepoint cierre_descuadrado')
    expect((await rows('sesiones_caja'))[0]).toMatchObject({ estado: 'abierta', monto_declarado: null })

    const resultado = await db.query(
      'select * from public.cerrar_caja($1, $2)',
      [id(10), 1300],
    )
    expect(resultado.rows[0]).toMatchObject({
      estado: 'cerrada',
      monto_declarado: '1300.00',
      saldo_teorico: '1300.00',
      diferencia: '0.00',
    })
  })

  it('no permite omitir el permiso de facturación', async () => {
    await db.query("select set_config('test.denied', 'ventas.facturar', true)")
    await expect(cobrar()).rejects.toMatchObject({ code: '42501' })
  })
})
