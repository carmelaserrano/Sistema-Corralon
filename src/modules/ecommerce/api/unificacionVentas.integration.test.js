// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

// Ejecuta 0072 completa sobre tablas y RPC de las migraciones anteriores,
// incluidos sus triggers de inmutabilidad y registros históricos.
const migration = name => readFileSync(`supabase/migrations/${name}.sql`, 'utf8')
const base = migration('0033_base_sprint3')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const table = (sql, name) => sql.match(new RegExp(`create table (?:if not exists )?public\\.${name} \\([\\s\\S]*?\\n\\);`))[0]
function fn(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  if (start < 0) throw new Error(`No existe ${name}`)
  return sql.slice(start, sql.indexOf('$$;', start) + 3)
}
let db
const query = async (sql, params = []) => (await db.query(sql, params)).rows
const pagar = (medio = 'tarjeta', estado = 'approved') => query(
  'select public.confirmar_pago_mock($1::uuid, $2::text, $3::text)', [id(21), estado, medio],
)
const efectivo = monto => JSON.stringify([{ medio_pago_id: id(5), monto, monto_recibido: monto }])
async function debeFallar(action, message) {
  await db.exec('savepoint intento')
  await expect(action()).rejects.toThrow(message)
  await db.exec('rollback to savepoint intento')
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select current_setting('test.uid')::uuid $$;
    create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
    create function public.usuario_tiene_permiso(text) returns boolean language sql as $$
      select current_setting('test.internal') = 'true' and $1 is distinct from current_setting('test.denied', true) $$;
    create function public.es_usuario_interno() returns boolean language sql as $$ select current_setting('test.internal') = 'true' $$;
    create table public.permisos(nombre text primary key);
    create table public.usuarios_internos(usuario_id uuid primary key references auth.users, activo boolean default true, nombre text);
    create table public.depositos(id uuid primary key, nombre text);
    create table public.productos(id uuid primary key);
    create table public.condiciones_iva(id uuid primary key, nombre text);
    create table public.clientes(id uuid primary key, condicion_iva_id uuid references condiciones_iva,
      habilita_cta_cte boolean default false, limite_credito numeric default 0,
      usuario_web_id uuid, estado text default 'Activo', nombre text, apellido text, razon_social text);
    create table public.domicilios_cliente(id uuid primary key);
    create table public.medios_pago(id uuid primary key, nombre text, activo boolean default true);
    create function public.fn_saldo_cta_cte_cliente(uuid) returns numeric language sql as $$ select 0::numeric $$;
    create table public.stock_x_deposito(producto_id uuid, deposito_id uuid, cantidad numeric check(cantidad >= 0),
      comprometido numeric check(comprometido >= 0), updated_at timestamptz default now());
    create table public.tipos_movimiento(id uuid primary key, codigo text);
    create table public.movimientos_stock(id uuid primary key default gen_random_uuid(), tipo_movimiento_id uuid,
      deposito_origen_id uuid, estado_movimiento text, observaciones text);
    create table public.detalle_movimiento(movimiento_id uuid, producto_id uuid, cantidad numeric);
    select set_config('test.uid', '${id(1)}', false), set_config('test.internal', 'true', false);
  `)
  for (const name of ['parametros_ventas', 'autorizaciones_descuento', 'puntos_venta', 'numeracion_comprobantes',
    'ventas', 'detalle_venta', 'historial_estado_venta', 'comprobantes_venta', 'cobros_venta', 'detalle_cobro',
    'carritos', 'items_carrito', 'pedidos_web', 'detalle_pedido_web', 'historial_estado_pedido']) {
    await db.exec(table(base, name))
  }
  await db.exec(`alter table puntos_venta add column deposito_id uuid references depositos;
    alter table pedidos_web add column checkout_id uuid, add column preferencia_pago_id text,
      add column ultimo_pago_referencia text, add column pago_estado text, add column pago_motivo text,
      add column vence_at timestamptz, add column pagado_at timestamptz, add column cancelado_at timestamptz;
    create unique index on comprobantes_venta(venta_id) where tipo_comprobante = 'factura' and estado = 'Emitido';
  `)
  await db.exec(migration('0041_cobro_ventas'))
  await db.exec(migration('0062_gestion_cajas_y_sesiones'))
  await db.exec('alter table cajas add constraint chk_caja_cajero_asignado check (usuario_asignado_id is not null) not valid')
  for (const name of ['recibos_cobranza_cliente', 'detalle_medio_recibo', 'imputacion_recibo_venta']) {
    await db.exec(table(migration('0061_cuenta_corriente_clientes'), name))
  }
  await db.exec(migration('0067_recibos_cobranza_en_caja'))
  for (const [file, names] of [
    ['0033_base_sprint3', ['siguiente_numero_comprobante', 'liberar_stock']],
    ['0039_estados_venta', ['fn_facturar_venta_automatico', 'transicion_venta_permitida']],
    ['0051_estados_pedido_web', ['transicion_pedido_permitida']],
    ['0060_integridad_ciclo_ventas', ['egresar_comprometido', 'fn_anular_venta_por_nota_credito']],
    ['0063_integridad_depositos_pedidos_web', ['avanzar_estado_pedido']],
    ['0065_puntos_venta_por_sucursal', ['emitir_comprobante']],
    ['0068_informe_ingresos', ['informe_inicio_periodo', 'informe_fin_periodo']],
  ]) for (const name of names) await db.exec(fn(migration(file), name))
  await db.exec(`
    create trigger factura after insert on comprobantes_venta for each row
      when (new.tipo_comprobante = 'factura') execute function fn_facturar_venta_automatico();
    create trigger nota_credito after insert on comprobantes_venta for each row
      when (new.tipo_comprobante = 'nota_credito') execute function fn_anular_venta_por_nota_credito();
    alter table ventas enable row level security;
    alter table detalle_venta enable row level security;
    create policy ventas_select_interno on ventas for select to authenticated using (es_usuario_interno());
    create policy detalle_venta_select_interno on detalle_venta for select to authenticated using (es_usuario_interno());
    grant select, insert, update, delete on ventas, detalle_venta to authenticated;
    grant usage on schema auth to authenticated;
    grant usage on all sequences in schema public to authenticated;
  `)
  for (const name of ['0066_pago_mock', '0070_cobro_facturacion_automatica', '0071_medios_pago_mock']) await db.exec(migration(name))
  await db.exec(`
    insert into auth.users values ('${id(1)}');
    insert into usuarios_internos(usuario_id) values ('${id(1)}');
    insert into depositos values ('${id(2)}', 'Central');
    insert into condiciones_iva values ('${id(3)}', 'Consumidor Final');
    insert into clientes(id, condicion_iva_id, usuario_web_id) values ('${id(4)}', '${id(3)}', '${id(1)}');
    insert into medios_pago(id, nombre) values ('${id(5)}', 'Efectivo'), ('${id(6)}', 'Tarjeta de crédito'),
      ('${id(12)}', 'Mercado Pago'), ('${id(13)}', 'Transferencia bancaria');
    insert into puntos_venta(id, numero, nombre, deposito_id) values ('${id(8)}', '0001', 'Central', '${id(2)}');
    insert into cajas(id, nombre, punto_venta_id, usuario_asignado_id) values ('${id(9)}', 'Mostrador', '${id(8)}', '${id(1)}');
    insert into sesiones_caja(id, caja_id, usuario_id, saldo_inicial) values ('${id(10)}', '${id(9)}', '${id(1)}', 0);
    insert into ventas(id, deposito_id, cliente_id, total) values ('${id(7)}', '${id(2)}', '${id(4)}', 121);
    select public.registrar_cobro('${id(7)}', '${efectivo(121)}'::jsonb);
    insert into productos values ('${id(11)}');
    insert into stock_x_deposito(producto_id, deposito_id, cantidad, comprometido) values ('${id(11)}', '${id(2)}', 100, 4);
    insert into tipos_movimiento values ('${id(30)}', 'egreso');
    insert into parametros_ventas(clave, valor) values ('deposito_ecommerce', '{"deposito_id":"${id(2)}"}');
    insert into pedidos_web(id, cliente_id, deposito_id, tipo_entrega, total, estado, pagado_at, pago_estado, referencia_pago, checkout_id, vence_at)
      values ('${id(20)}', '${id(4)}', '${id(2)}', 'retiro', 242, 'Pagado', '2026-01-10T15:00:00Z', 'approved', 'mock:${id(20)}', '${id(20)}', null),
             ('${id(21)}', '${id(4)}', '${id(2)}', 'retiro', 242, 'Pendiente de pago', null, null, null, '${id(21)}', now() + interval '1 hour');
    insert into detalle_pedido_web(pedido_id, producto_id, cantidad, precio_unitario)
      values ('${id(20)}', '${id(11)}', 2, 121), ('${id(21)}', '${id(11)}', 2, 121);
    insert into carritos(id, cliente_id) values ('${id(22)}', '${id(4)}');
    insert into items_carrito(carrito_id, producto_id, cantidad) values ('${id(22)}', '${id(11)}', 2);
  `)
  await db.exec(migration('0072_unificacion_ventas_ecommerce'))
}, 30000)
beforeEach(async () => { await db.exec('begin') })
afterEach(async () => { await db.exec('rollback') })
afterAll(async () => { await db?.close() })

it('migra históricos conservando cajas físicas, importes, fecha, pedido y stock', async () => {
  expect(await query('select caja_id from cobros_venta where venta_id = $1', [id(7)])).toEqual([{ caja_id: id(9) }])
  expect(await query('select caja_id from ventas where id = $1', [id(7)])).toEqual([{ caja_id: id(9) }])
  expect(await query('select caja_id from movimientos_caja where origen = $1', ['venta'])).toEqual([{ caja_id: id(9) }])
  const [venta] = await query("select v.*, c.tipo_caja from ventas v join cajas c on c.id=v.caja_id where origen='ecommerce'")
  expect(venta).toMatchObject({ pedido_web_id: id(20), vendedor_id: null, tipo_caja: 'ecommerce', total: '242.00' })
  expect(venta.created_at.toISOString()).toBe('2026-01-10T15:00:00.000Z')
  expect(await query('select cantidad,comprometido from stock_x_deposito')).toEqual([{ cantidad: '100', comprometido: '4' }])
  expect(await query('select * from movimientos_stock')).toHaveLength(0)
  expect(await query('select * from pedidos_web')).toHaveLength(2)
  expect(await query('select * from ventas')).toHaveLength(2)
})

it.each([['tarjeta', id(6)], ['mercado_pago', id(12)], ['transferencia', id(13)]])('pago %s sin sesión: una venta, un cobro y un ingreso aun con reintentos', async (medio, medioId) => {
  await query('select cerrar_caja($1,0)', [id(10)])
  await db.exec("select set_config('test.internal', 'false', true); set local role authenticated")
  await pagar(medio)
  await pagar('tarjeta')
  await db.exec('reset role')
  const [venta] = await query('select * from ventas where pedido_web_id=$1', [id(21)])
  expect(venta).toMatchObject({ origen: 'ecommerce', vendedor_id: null, total: '242.00' })
  const cobros = await query('select * from cobros_venta where venta_id=$1', [venta.id])
  expect(cobros).toHaveLength(1)
  expect(cobros[0]).toMatchObject({ sesion_caja_id: null, created_by: null, caja_id: venta.caja_id })
  expect(await query('select medio_pago_id from detalle_cobro where cobro_id=$1', [cobros[0].id])).toEqual([{ medio_pago_id: medioId }])
  expect(await query('select origen,caja_id,sesion_caja_id,created_by,monto from movimientos_caja where venta_id=$1', [venta.id]))
    .toEqual([{ origen: 'ecommerce', caja_id: venta.caja_id, sesion_caja_id: null, created_by: null, monto: '242.00' }])
  expect(await query('select * from items_carrito')).toHaveLength(0)
  expect(await query('select cantidad,comprometido from stock_x_deposito')).toEqual([{ cantidad: '100', comprometido: '4' }])
})

it('reprocesar un histórico no duplica ventas, cobros ni movimientos', async () => {
  await query('select fn_registrar_venta_desde_pedido_web($1)', [id(20)])
  expect(await query("select * from ventas where origen='ecommerce'")).toHaveLength(1)
  expect(await query('select * from cobros_venta')).toHaveLength(2)
  expect(await query('select * from movimientos_caja')).toHaveLength(2)
})

it.each(['rejected', 'pending'])('un pago %s no crea una venta ni vacía el carrito', async estado => {
  await query('select pago_interno.confirmar_pago_pedido($1,\'pago-no-aprobado\',$2)', [id(21), estado])
  expect(await query('select * from ventas where pedido_web_id=$1', [id(21)])).toHaveLength(0)
  expect(await query('select * from items_carrito')).toHaveLength(1)
})

it('pago aprobado tardío de pedido cancelado queda para reembolso, sin venta', async () => {
  await query("update pedidos_web set estado='Cancelado' where id=$1", [id(21)])
  await query("select pago_interno.confirmar_pago_pedido($1, 'pago-tardio', 'approved')", [id(21)])
  expect(await query('select * from ventas where pedido_web_id=$1', [id(21)])).toHaveLength(0)
  expect((await query('select pagado_at,pago_motivo from pedidos_web where id=$1', [id(21)]))[0])
    .toMatchObject({ pagado_at: null, pago_motivo: expect.stringContaining('reembolso') })
})

it('un error contable revierte también el pago y conserva el carrito', async () => {
  await query('update medios_pago set activo=false where id=$1', [id(6)])
  await debeFallar(() => pagar(), 'No está configurado el medio de pago activo')
  expect((await query('select estado,pagado_at from pedidos_web where id=$1', [id(21)]))[0])
    .toEqual({ estado: 'Pendiente de pago', pagado_at: null })
  expect(await query('select * from ventas where pedido_web_id=$1', [id(21)])).toHaveLength(0)
  expect(await query('select * from items_carrito')).toHaveLength(1)
})

it('mostrador sigue cobrando y facturando en su caja', async () => {
  await query('insert into ventas(id,deposito_id,cliente_id,total) values ($1,$2,$3,121)', [id(23), id(2), id(4)])
  await query('select registrar_cobro($1,$2::jsonb)', [id(23), efectivo(121)])
  expect((await query('select origen,estado,caja_id from ventas where id=$1', [id(23)]))[0])
    .toEqual({ origen: 'mostrador', estado: 'Facturada', caja_id: id(9) })
  expect(await query('select * from comprobantes_venta where venta_id=$1', [id(23)])).toHaveLength(1)
  expect((await query('select origen,caja_id,sesion_caja_id from movimientos_caja where venta_id=$1', [id(23)]))[0])
    .toEqual({ origen: 'venta', caja_id: id(9), sesion_caja_id: id(10) })
})

it.each(['ingreso', 'egreso'])('movimiento manual de %s deriva caja desde la sesión', async tipo => {
  const [row] = await query('select (registrar_movimiento_caja($1,$2,10,\'Ajuste\',\'REC-1\')).*', [tipo, id(5)])
  expect(row).toMatchObject({ caja_id: id(9), sesion_caja_id: id(10), origen: 'manual', tipo })
})

it('recibo de cuenta corriente conserva el ingreso en la caja física', async () => {
  await query('select registrar_recibo_cobranza($1,current_date,$2::jsonb)', [id(4), efectivo(50)])
  expect((await query("select caja_id,sesion_caja_id,monto from movimientos_caja where origen='cobranza'"))[0])
    .toEqual({ caja_id: id(9), sesion_caja_id: id(10), monto: '50.00' })
})

it('informe cuenta el histórico y el pago nuevo una sola vez', async () => {
  await pagar('mercado_pago')
  const [row] = await query("select sum(monto) as total from informe_ingresos('2020-01-01','2099-01-01','total') where fuente='tienda'")
  expect(row.total).toBe('484.00')
})

it('entrega web descuenta stock una vez y bloquea la entrega desde ventas', async () => {
  await pagar()
  for (const estado of ['En preparación', 'Listo para retirar', 'Entregado']) {
    await query('select avanzar_estado_pedido($1,$2)', [id(21), estado])
  }
  expect(await query('select cantidad,comprometido from stock_x_deposito')).toEqual([{ cantidad: '98', comprometido: '2' }])
  expect(await query('select * from movimientos_stock')).toHaveLength(1)
  const [venta] = await query('select id from ventas where pedido_web_id=$1', [id(21)])
  await debeFallar(() => query("select cambiar_estado_venta($1,'Entregada')", [venta.id]), 'pedidos web')
  await debeFallar(() => query("select avanzar_estado_pedido($1,'Entregado')", [id(21)]), 'Transición no permitida')
  expect(await query('select * from movimientos_stock')).toHaveLength(1)
})

it('nota de crédito web no libera por segunda vez la reserva del pedido', async () => {
  const [venta] = await query('select id from ventas where pedido_web_id=$1', [id(20)])
  await query("select emitir_comprobante($1,'factura')", [venta.id])
  await query("select emitir_comprobante($1,'nota_credito')", [venta.id])
  expect(await query('select comprometido from stock_x_deposito')).toEqual([{ comprometido: '4' }])
  await query("select avanzar_estado_pedido($1,'Cancelado','Cancelación de prueba')", [id(20)])
  expect(await query('select comprometido from stock_x_deposito')).toEqual([{ comprometido: '2' }])
})

it('mantiene las protecciones contra modificar cobros y movimientos', async () => {
  await debeFallar(() => query('update cobros_venta set total=1'), 'inmutables')
  await debeFallar(() => query('delete from movimientos_caja'), 'inmutables')
  expect(await query("select tgenabled from pg_trigger where tgname in ('trg_cobros_venta_inmutables','trg_movimientos_caja_inmutables')"))
    .toEqual([{ tgenabled: 'O' }, { tgenabled: 'O' }])
})

it('el cliente no puede invocar helpers internos ni editar ventas o la caja Ecommerce', async () => {
  const [acl] = await query(`select
    has_function_privilege('authenticated','fn_registrar_venta_desde_pedido_web(uuid)','execute') as helper,
    has_function_privilege('anon','confirmar_pago_mock(uuid,text,text)','execute') as anon_pago`)
  expect(acl).toEqual({ helper: false, anon_pago: false })
  await db.exec('set local role authenticated')
  expect(await query("update cajas set activa=false where tipo_caja='ecommerce' returning id")).toHaveLength(0)
  expect(await query("update ventas set total=1 where origen='ecommerce' returning id")).toHaveLength(0)
  await debeFallar(() => query('select fn_registrar_venta_desde_pedido_web($1)', [id(20)]), 'permission denied')
  await db.exec("select set_config('test.internal','false',true)")
  expect(await query('select * from ventas')).toHaveLength(0)
  await db.exec('reset role')
})
