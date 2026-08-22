import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCategorias, getProductosDestacados } from './inicioApi'
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
    gt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => resultado),
  }
  return builder
}

describe('inicioApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCategorias', () => {
    it('devuelve la lista de categorías cuando Supabase responde sin error', async () => {
      const categoriasMock = [
        { id: '1', nombre: 'Cemento y áridos' },
        { id: '2', nombre: 'Ladrillos y bloques' },
      ]
      const builder = {
        select: vi.fn(() => builder),
        order: vi.fn(() => ({ data: categoriasMock, error: null })),
      }
      supabase.from.mockReturnValue(builder)

      const resultado = await getCategorias()

      expect(supabase.from).toHaveBeenCalledWith('categorias')
      expect(resultado).toEqual(categoriasMock)
    })

    it('lanza el error cuando Supabase devuelve un error', async () => {
      const errorMock = { message: 'no se pudo conectar con la base' }
      const builder = {
        select: vi.fn(() => builder),
        order: vi.fn(() => ({ data: null, error: errorMock })),
      }
      supabase.from.mockReturnValue(builder)

      await expect(getCategorias()).rejects.toEqual(errorMock)
    })
  })

  describe('getProductosDestacados', () => {
    it('devuelve los productos con stock del depósito cuando Supabase responde sin error', async () => {
      const productosMock = [
        {
          id: 'a1',
          cantidad: 10,
          updated_at: '2026-08-01T00:00:00Z',
          producto: { id: 'p1', sku: 'SKU-001', nombre: 'Cemento Portland x 50kg' },
        },
      ]
      supabase.from.mockReturnValue(crearQueryBuilder({ data: productosMock, error: null }))

      const resultado = await getProductosDestacados('deposito-1', 3)

      expect(supabase.from).toHaveBeenCalledWith('stock_x_deposito')
      expect(resultado).toEqual(productosMock)
    })

    it('lanza el error cuando Supabase devuelve un error', async () => {
      const errorMock = { message: 'depósito inexistente' }
      supabase.from.mockReturnValue(crearQueryBuilder({ data: null, error: errorMock }))

      await expect(getProductosDestacados('deposito-x')).rejects.toEqual(errorMock)
    })
  })
})
