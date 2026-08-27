import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getDepositos,
  getStockByDeposito,
  getStockDisponibles,
  subscribeToStockChanges,
} from './stockApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
  },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => resultado),
  }
  return builder
}

function crearQueryBuilderConRange(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => ({ ...builder, range: vi.fn(() => resultado) })),
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

      const resultado = await getStockByDeposito('11111111-1111-4111-8111-111111111111')

      expect(supabase.from).toHaveBeenCalledWith('stock_x_deposito')
      expect(resultado).toEqual([
        {
          id: 'a1',
          cantidad: 10,
          comprometido: 4,
          updated_at: '2026-08-01T00:00:00Z',
          producto: { id: 'p1', sku: 'SKU-001', nombre: 'Cemento' },
          fisico: 10,
          comprometido: 4,
          disponible: 6,
        },
      ])
    })

    it('lanza el error cuando Supabase devuelve un error', async () => {
      const errorMock = { message: 'depósito inexistente' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(
        getStockByDeposito('11111111-1111-4111-8111-111111111111'),
      ).rejects.toEqual(errorMock)
    })

    it('rechaza IDs de depósito con formato inválido', async () => {
      await expect(getStockByDeposito('deposito-x')).rejects.toMatchObject({
        status: 400,
      })
    })
  })

  describe('getStockDisponibles', () => {
    it('devuelve stock paginado y calcula disponible como físico menos comprometido', async () => {
      const stockMock = [
        {
          cantidad: 120,
          comprometido: 15,
          updated_at: '2026-08-01T00:00:00Z',
          producto: {
            id: '22222222-2222-4222-8222-222222222222',
            sku: 'SKU-020',
            nombre: 'Cemento Portland x50kg',
          },
          deposito: {
            id: '11111111-1111-4111-8111-111111111111',
            nombre: 'Depósito A',
          },
        },
      ]
      // Primer mock: búsqueda en tabla productos
      const productosMock = [
        { id: '22222222-2222-4222-8222-222222222222' },
      ]

      supabase.from
        .mockReturnValueOnce(
          crearQueryBuilderConRange({ data: stockMock, error: null, count: 1 }),
        )
        .mockReturnValueOnce(crearQueryBuilder({ data: productosMock, error: null }))

      const resultado = await getStockDisponibles({
        articulo_id: '22222222-2222-4222-8222-222222222222',
        deposito_id: '11111111-1111-4111-8111-111111111111',
        search: 'cemento',
        page: 1,
        pageSize: 20,
      })

      expect(resultado.total).toBe(1)
      expect(resultado.items[0]).toMatchObject({
        articulo_id: '22222222-2222-4222-8222-222222222222',
        articulo_nombre: 'Cemento Portland x50kg',
        deposito_id: '11111111-1111-4111-8111-111111111111',
        deposito_nombre: 'Depósito A',
        fisico: 120,
        comprometido: 15,
        disponible: 105,
      })
    })

    it('rechaza IDs con formato inválido', async () => {
      await expect(
        getStockDisponibles({
          articulo_id: 'no-es-uuid',
          deposito_id: '11111111-1111-4111-8111-111111111111',
        }),
      ).rejects.toMatchObject({ status: 400 })
    })
  })

  describe('subscribeToStockChanges', () => {
    it('crea una suscripción con los filtros de artículo y depósito', () => {
      const callback = vi.fn()
      const canal = { on: vi.fn().mockReturnThis(), subscribe: vi.fn() }
      supabase.channel.mockReturnValue(canal)

      subscribeToStockChanges({
        articulo_id: '22222222-2222-4222-8222-222222222222',
        deposito_id: '11111111-1111-4111-8111-111111111111',
        onChange: callback,
      })

      expect(supabase.channel).toHaveBeenCalled()
      expect(canal.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'stock_x_deposito',
          filter: 'producto_id=eq.22222222-2222-4222-8222-222222222222 and deposito_id=eq.11111111-1111-4111-8111-111111111111',
        }),
        expect.any(Function),
      )
      expect(canal.subscribe).toHaveBeenCalledTimes(1)
    })
  })
})
