import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabaseClient'
import {
  buscarClientes,
  crearRangoFechas,
  getHistorialCliente,
  listarCobrosCliente,
  listarComprobantesCliente,
  listarPedidosWebCliente,
  listarVentasCliente,
  obtenerDetalleVenta,
  obtenerResumenCliente,
  obtenerTotalComprado,
} from './historialClienteApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}))

function crearQueryBuilder(resultado = { data: [], error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

describe('historialClienteApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockReset()
  })

  it('busca clientes por nombre, razón social, apellido o documento', async () => {
    const clientes = [{ id: 'c1', nombre: 'Ana', apellido: 'Pérez' }]
    const builder = crearQueryBuilder({ data: clientes, error: null })
    supabase.from.mockReturnValue(builder)

    await expect(buscarClientes('  Ana  ')).resolves.toEqual(clientes)

    expect(supabase.from).toHaveBeenCalledWith('clientes')
    expect(builder.or).toHaveBeenCalledWith(expect.stringContaining('nombre.ilike.%Ana%'))
    expect(builder.limit).toHaveBeenCalledWith(20)
  })

  it('lista clientes recientes sin aplicar OR cuando la búsqueda está vacía', async () => {
    const builder = crearQueryBuilder({ data: null, error: null })
    supabase.from.mockReturnValue(builder)

    await expect(buscarClientes()).resolves.toEqual([])
    expect(builder.or).not.toHaveBeenCalled()
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('obtiene la cabecera con tipo, lista de precios y total comprado', async () => {
    const cliente = {
      id: 'c1',
      tipo_cliente: { nombre: 'Mayorista', lista_precio: { nombre: 'Obra' } },
    }
    const clienteBuilder = crearQueryBuilder({ data: cliente, error: null })
    const ventasBuilder = crearQueryBuilder({
      data: [{ total: '100.50' }, { total: '49.50' }],
      error: null,
    })
    supabase.from
      .mockReturnValueOnce(clienteBuilder)
      .mockReturnValueOnce(ventasBuilder)

    await expect(obtenerResumenCliente('c1')).resolves.toEqual({
      cliente,
      totalComprado: 150,
    })
    expect(clienteBuilder.eq).toHaveBeenCalledWith('id', 'c1')
    expect(clienteBuilder.single).toHaveBeenCalled()
  })

  it('calcula el total persistido y excluye ventas anuladas', async () => {
    const builder = crearQueryBuilder({
      data: [{ total: 1200 }, { total: '800.25' }, { total: null }],
      error: null,
    })
    supabase.from.mockReturnValue(builder)

    await expect(obtenerTotalComprado('c1')).resolves.toBe(2000.25)
    expect(builder.eq).toHaveBeenCalledWith('cliente_id', 'c1')
    expect(builder.neq).toHaveBeenCalledWith('estado', 'Anulada')
  })

  it('lista las ventas del cliente', async () => {
    const ventas = [{ id: 'v1', numero: 15, total: 300, estado: 'Pendiente' }]
    const builder = crearQueryBuilder({ data: ventas, error: null })
    supabase.from.mockReturnValue(builder)

    await expect(listarVentasCliente('c1')).resolves.toEqual(ventas)
    expect(supabase.from).toHaveBeenCalledWith('ventas')
    expect(builder.eq).toHaveBeenCalledWith('cliente_id', 'c1')
  })

  it('lista comprobantes enlazados por la venta del cliente', async () => {
    const comprobantes = [{ id: 'f1', numero: 42, tipo_comprobante: 'factura' }]
    const builder = crearQueryBuilder({ data: comprobantes, error: null })
    supabase.from.mockReturnValue(builder)

    await expect(listarComprobantesCliente('c1')).resolves.toEqual(comprobantes)
    expect(supabase.from).toHaveBeenCalledWith('comprobantes_venta')
    expect(builder.select.mock.calls[0][0]).toContain('ventas!inner')
    expect(builder.eq).toHaveBeenCalledWith('venta.cliente_id', 'c1')
  })

  it('lista cobros enlazados por la venta del cliente', async () => {
    const cobros = [{ id: 'co1', numero: 8, total: 700 }]
    const builder = crearQueryBuilder({ data: cobros, error: null })
    supabase.from.mockReturnValue(builder)

    await expect(listarCobrosCliente('c1')).resolves.toEqual(cobros)
    expect(supabase.from).toHaveBeenCalledWith('cobros_venta')
    expect(builder.eq).toHaveBeenCalledWith('venta.cliente_id', 'c1')
  })

  it('lista pedidos web por cliente', async () => {
    const pedidos = [{ id: 'p1', numero: 3, total: 250, estado: 'Pagado' }]
    const builder = crearQueryBuilder({ data: pedidos, error: null })
    supabase.from.mockReturnValue(builder)

    await expect(listarPedidosWebCliente('c1')).resolves.toEqual(pedidos)
    expect(supabase.from).toHaveBeenCalledWith('pedidos_web')
    expect(builder.eq).toHaveBeenCalledWith('cliente_id', 'c1')
  })

  it('obtiene el detalle de venta con producto, cantidad, precio y subtotal', async () => {
    const detalle = [{
      id: 'd1',
      cantidad: 2,
      precio_unitario: 50,
      subtotal: 100,
      producto: { id: 'a1', sku: 'ART-1', nombre: 'Cemento' },
    }]
    const builder = crearQueryBuilder({ data: detalle, error: null })
    supabase.from.mockReturnValue(builder)

    await expect(obtenerDetalleVenta('v1')).resolves.toEqual(detalle)
    expect(supabase.from).toHaveBeenCalledWith('detalle_venta')
    expect(builder.select.mock.calls[0][0]).toContain('producto:productos')
    expect(builder.eq).toHaveBeenCalledWith('venta_id', 'v1')
  })

  it('devuelve arrays vacíos para un cliente sin movimientos', async () => {
    const cliente = { id: 'c1', nombre: 'Ana' }
    supabase.from
      .mockReturnValueOnce(crearQueryBuilder({ data: cliente, error: null }))
      .mockReturnValueOnce(crearQueryBuilder({ data: null, error: null }))
      .mockReturnValueOnce(crearQueryBuilder({ data: null, error: null }))
      .mockReturnValueOnce(crearQueryBuilder({ data: null, error: null }))
      .mockReturnValueOnce(crearQueryBuilder({ data: null, error: null }))
      .mockReturnValueOnce(crearQueryBuilder({ data: null, error: null }))

    await expect(getHistorialCliente('c1')).resolves.toMatchObject({
      cliente,
      totalComprado: 0,
      ventas: [],
      comprobantes: [],
      cobros: [],
      pedidosWeb: [],
    })
  })

  it('aplica desde inclusivo y hasta como límite exclusivo del día siguiente', async () => {
    const builders = Array.from({ length: 4 }, () => crearQueryBuilder())
    supabase.from
      .mockReturnValueOnce(builders[0])
      .mockReturnValueOnce(builders[1])
      .mockReturnValueOnce(builders[2])
      .mockReturnValueOnce(builders[3])
    const filtros = { desde: '2026-09-01', hasta: '2026-09-10' }
    const rango = crearRangoFechas(filtros)

    await listarVentasCliente('c1', filtros)
    await listarComprobantesCliente('c1', filtros)
    await listarCobrosCliente('c1', filtros)
    await listarPedidosWebCliente('c1', filtros)

    expect(builders[0].gte).toHaveBeenCalledWith('created_at', rango.desdeIso)
    expect(builders[0].lt).toHaveBeenCalledWith('created_at', rango.hastaExclusivoIso)
    expect(builders[1].gte).toHaveBeenCalledWith('fecha_emision', rango.desdeIso)
    expect(builders[1].lt).toHaveBeenCalledWith('fecha_emision', rango.hastaExclusivoIso)
    expect(builders[2].gte).toHaveBeenCalledWith('created_at', rango.desdeIso)
    expect(builders[3].lt).toHaveBeenCalledWith('created_at', rango.hastaExclusivoIso)
    expect(rango.hastaExclusivoIso).not.toContain('2026-09-10T')
  })

  it('la consulta de ventas devuelve solamente lo que Supabase filtró en el rango', async () => {
    const dentroDelRango = [{ id: 'v-dentro', created_at: '2026-09-05T12:00:00Z' }]
    const builder = crearQueryBuilder({ data: dentroDelRango, error: null })
    supabase.from.mockReturnValue(builder)

    const resultado = await listarVentasCliente('c1', {
      desde: '2026-09-01',
      hasta: '2026-09-10',
    })

    expect(resultado).toEqual(dentroDelRango)
    expect(resultado).not.toContainEqual(expect.objectContaining({ id: 'v-fuera' }))
  })

  it('rechaza un rango invertido antes de consultar movimientos', async () => {
    const builder = crearQueryBuilder()
    supabase.from.mockReturnValue(builder)

    await expect(
      listarVentasCliente('c1', { desde: '2026-09-11', hasta: '2026-09-10' }),
    ).rejects.toThrow('posterior')
    expect(builder.order).not.toHaveBeenCalled()
  })

  it('propaga el error de Supabase sin reemplazarlo', async () => {
    const error = { code: '42501', message: 'Acceso denegado' }
    supabase.from.mockReturnValue(crearQueryBuilder({ data: null, error }))

    await expect(listarPedidosWebCliente('c1')).rejects.toEqual(error)
  })
})
