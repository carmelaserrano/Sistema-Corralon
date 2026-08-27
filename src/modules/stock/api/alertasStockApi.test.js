import { beforeEach, describe, expect, it, vi } from 'vitest'
import { atenderAlertaStock, getAlertasStock } from './alertasStockApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

// atender_alerta_stock se llama con .rpc(...).single(), igual que
// confirmar_movimiento en movimientosApi.js.
function mockRpc(resultado) {
  const builder = { single: vi.fn(() => resultado) }
  supabase.rpc.mockReturnValue(builder)
  return builder
}

describe('alertasStockApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Consulta (TC-STK-15-01, TC-STK-15-03) ---

  it('lista las alertas activas', async () => {
    const resultado = {
      data: [
        {
          id: 'alerta-1',
          producto_id: 'art-1',
          deposito_id: 'dep-1',
          stock_disponible: 19,
          stock_minimo: 20,
          estado: 'activa',
          generada_en: '2026-08-27T12:00:00.000Z',
        },
      ],
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await getAlertasStock({ estado: 'activa' })

    expect(supabase.from).toHaveBeenCalledWith('alertas_stock')
    expect(builder.eq).toHaveBeenCalledWith('estado', 'activa')
    expect(builder.order).toHaveBeenCalledWith('generada_en', {
      ascending: false,
    })
    expect(data).toEqual(resultado.data)
  })

  it('lista todas las alertas cuando no se filtra por estado', async () => {
    const resultado = { data: [], error: null }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    await getAlertasStock()

    expect(builder.eq).not.toHaveBeenCalled()
  })

  // --- Atender (TC-STK-15-04, TC-STK-15-05) ---

  it('atiende una alerta activa', async () => {
    const resultado = {
      data: {
        id: 'alerta-1',
        estado: 'atendida',
      },
      error: null,
    }

    mockRpc(resultado)

    const data = await atenderAlertaStock('alerta-1')

    expect(supabase.rpc).toHaveBeenCalledWith('atender_alerta_stock', {
      p_alerta_id: 'alerta-1',
    })
    expect(data).toEqual(resultado.data)
  })

  it('rechaza atender sin id', async () => {
    await expect(atenderAlertaStock('')).rejects.toMatchObject({
      status: 400,
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('traduce a 409 una alerta ya atendida', async () => {
    mockRpc({
      data: null,
      error: {
        code: 'AL002',
        message: 'La alerta ya fue atendida',
      },
    })

    await expect(atenderAlertaStock('alerta-1')).rejects.toMatchObject({
      status: 409,
      message: 'La alerta ya fue atendida',
    })
  })

  it('traduce a 404 una alerta inexistente', async () => {
    mockRpc({
      data: null,
      error: {
        code: 'AL001',
        message: 'La alerta no existe',
      },
    })

    await expect(atenderAlertaStock('alerta-1')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('reenvia sin traducir los errores desconocidos', async () => {
    const error = {
      code: '42P01',
      message: 'relation does not exist',
    }

    mockRpc({ data: null, error })

    await expect(atenderAlertaStock('alerta-1')).rejects.toEqual(error)
  })
})
