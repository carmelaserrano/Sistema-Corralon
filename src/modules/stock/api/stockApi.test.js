import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDepositos, getStockByDeposito } from './stockApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => resultado),
  }
  return builder
}

describe('stockApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getDepositos', () => {
    it('devuelve la lista de depósitos cuando Supabase responde sin error', async () => {
      const depositosMock = [
        { id: '1', nombre: 'Depósito Central' },
        { id: '2', nombre: 'Depósito Norte' },
      ]
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: depositosMock, error: null }),
      )

      const resultado = await getDepositos()

      expect(supabase.from).toHaveBeenCalledWith('depositos')
      expect(resultado).toEqual(depositosMock)
    })

    it('lanza el error cuando Supabase devuelve un error', async () => {
      const errorMock = { message: 'no se pudo conectar con la base' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(getDepositos()).rejects.toEqual(errorMock)
    })
  })

  describe('getStockByDeposito', () => {
    it('devuelve el stock del depósito cuando Supabase responde sin error', async () => {
      const stockMock = [
        {
          id: 'a1',
          cantidad: 10,
          updated_at: '2026-08-01T00:00:00Z',
          producto: { id: 'p1', sku: 'SKU-001', nombre: 'Cemento' },
        },
      ]
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: stockMock, error: null }),
      )

      const resultado = await getStockByDeposito('deposito-1')

      expect(supabase.from).toHaveBeenCalledWith('stock_x_deposito')
      expect(resultado).toEqual(stockMock)
    })

    it('lanza el error cuando Supabase devuelve un error', async () => {
      const errorMock = { message: 'depósito inexistente' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(getStockByDeposito('deposito-x')).rejects.toEqual(errorMock)
    })
  })
})
