import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMovimientoMultiarticulo,
  getTiposMovimiento,
  getHistorialMovimientos,
  getHistorialArticuloDeposito,
} from './movimientosApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

// Las funciones de la migración 0006 se llaman con .rpc(...).single()
function mockRpc(resultado) {
  const builder = { single: vi.fn(() => resultado) }
  supabase.rpc.mockReturnValue(builder)
  return builder
}

describe('movimientosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('envía todos los artículos a la RPC multiartículo', async () => {
    mockRpc({ data: { id: 'mov-multi', estado_movimiento: 'confirmado' }, error: null })

    await createMovimientoMultiarticulo({
      tipo: 'egreso',
      deposito_id: 'dep-1',
      comprobante: 'REM-1',
      items: [
        { producto_id: 'art-1', cantidad: 10 },
        { producto_id: 'art-2', cantidad: '5' },
      ],
    })

    expect(supabase.rpc).toHaveBeenCalledWith('crear_movimiento_multiarticulo', {
      p_tipo: 'egreso',
      p_deposito_id: 'dep-1',
      p_items: [
        { producto_id: 'art-1', cantidad: 10 },
        { producto_id: 'art-2', cantidad: 5 },
      ],
      p_deposito_destino_id: null,
      p_comprobante: 'REM-1',
      p_observaciones: null,
    })
  })

  it('rechaza un movimiento multiartículo sin renglones', async () => {
    await expect(createMovimientoMultiarticulo({
      tipo: 'ingreso', deposito_id: 'dep-1', items: [],
    })).rejects.toMatchObject({ status: 400 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza cantidades decimales en un movimiento multiartículo', async () => {
    await expect(createMovimientoMultiarticulo({
      tipo: 'ingreso', deposito_id: 'dep-1',
      items: [{ producto_id: 'art-1', cantidad: 1.01 }],
    })).rejects.toMatchObject({ status: 400 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  // --- Consultas ---

  it('traduce a 409 el stock insuficiente al confirmar el movimiento', async () => {
    mockRpc({ data: null, error: { code: 'MV004', message: 'Stock insuficiente' } })

    await expect(createMovimientoMultiarticulo({
      tipo: 'egreso', deposito_id: 'dep-1',
      items: [{ producto_id: 'art-1', cantidad: 10 }],
    })).rejects.toMatchObject({ status: 409, message: 'Stock insuficiente' })
  })

  it.each(['', 'dep-1'])('rechaza una transferencia con destino inválido: %s', async (destino) => {
    await expect(createMovimientoMultiarticulo({
      tipo: 'transferencia', deposito_id: 'dep-1', deposito_destino_id: destino,
      items: [{ producto_id: 'art-1', cantidad: 10 }],
    })).rejects.toMatchObject({ status: 400 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('obtiene los tipos de movimiento', async () => {
    const resultado = {
      data: [
        { id: '1', nombre: 'Egreso', codigo: 'egreso' },
        { id: '2', nombre: 'Ingreso', codigo: 'ingreso' },
      ],
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      order: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await getTiposMovimiento()

    expect(supabase.from).toHaveBeenCalledWith('tipos_movimiento')
    expect(data).toEqual(resultado.data)
  })

  // --- Historial de movimientos (US-STK-10) ---

  it('consulta el historial paginado ordenado por fecha descendente', async () => {
    const resultado = {
      data: [
        {
          id: 'mov-10',
          fecha: '2026-08-27T15:30:00.000Z',
          created_by: 'usuario-uuid',
        },
      ],
      count: 21,
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await getHistorialMovimientos({
      page: 2,
      pageSize: 10,
    })

    expect(supabase.from).toHaveBeenCalledWith('movimientos_stock')

    expect(builder.order).toHaveBeenCalledWith('fecha', {
      ascending: false,
    })

    expect(builder.range).toHaveBeenCalledWith(10, 19)

    expect(data).toMatchObject({
      movimientos: resultado.data,
      total: 21,
      page: 2,
      pageSize: 10,
      totalPaginas: 3,
    })
  })

  it('aplica los filtros opcionales del historial', async () => {
    const resultado = {
      data: [],
      count: 0,
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    await getHistorialMovimientos({
      articuloId: 'art-1',
      tipoId: 'tipo-1',
      fechaDesde: '2026-08-01',
      fechaHasta: '2026-08-27',
      depositoOrigenId: 'dep-1',
      depositoDestinoId: 'dep-2',
    })

    expect(builder.eq).toHaveBeenCalledWith(
      'detalle.producto_id',
      'art-1',
    )

    expect(builder.eq).toHaveBeenCalledWith(
      'tipo_movimiento_id',
      'tipo-1',
    )

    expect(builder.eq).toHaveBeenCalledWith(
      'deposito_origen_id',
      'dep-1',
    )

    expect(builder.eq).toHaveBeenCalledWith(
      'deposito_destino_id',
      'dep-2',
    )

    expect(builder.gte).toHaveBeenCalled()
    expect(builder.lte).toHaveBeenCalled()
  })

  it('no aplica filtros cuando el historial se consulta completo', async () => {
    const resultado = {
      data: [],
      count: 0,
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    await getHistorialMovimientos()

    expect(builder.eq).not.toHaveBeenCalled()
    expect(builder.gte).not.toHaveBeenCalled()
    expect(builder.lte).not.toHaveBeenCalled()

    expect(builder.range).toHaveBeenCalledWith(
      0,
      9,
    )
  })

  // --- CORR-04: historial por artículo desde Stock ---

  it('consulta el historial de un artículo en un depósito con la RPC dedicada', async () => {
    const articuloId = '11111111-1111-4111-8111-111111111111'
    const depositoId = '22222222-2222-4222-8222-222222222222'
    const resultado = {
      data: [
        {
          movimiento_id: 'mov-1',
          tipo: 'Ingreso',
          cantidad: 10,
          stock_resultante: 10,
        },
      ],
      error: null,
    }

    supabase.rpc.mockResolvedValue(resultado)

    await expect(getHistorialArticuloDeposito({
      articuloId,
      depositoId,
    })).resolves.toEqual(resultado.data)

    expect(supabase.rpc).toHaveBeenCalledWith(
      'consultar_historial_articulo_deposito',
      {
        p_producto_id: articuloId,
        p_deposito_id: depositoId,
      },
    )
  })

  it('valida artículo y depósito antes de consultar el historial puntual', async () => {
    await expect(getHistorialArticuloDeposito({
      articuloId: 'sin-formato',
      depositoId: '22222222-2222-4222-8222-222222222222',
    })).rejects.toMatchObject({ status: 400 })

    await expect(getHistorialArticuloDeposito({
      articuloId: '11111111-1111-4111-8111-111111111111',
      depositoId: '',
    })).rejects.toMatchObject({ status: 400 })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
