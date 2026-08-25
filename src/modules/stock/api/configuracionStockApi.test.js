import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createConfiguracionStock,
  getConfiguracionesStock,
  updateConfiguracionStock,
} from './configuracionStockApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(resultado)),
    maybeSingle: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }

  return builder
}

const configuracionValida = {
  articulo_id: 'articulo-1',
  deposito_id: 'deposito-1',
  stock_minimo: 20,
  stock_maximo: 200,
}

describe('configuracionStockApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getConfiguracionesStock', () => {
    it('obtiene las configuraciones con stock actual y sin alerta', async () => {
      const configuraciones = [
        {
          id: 'config-1',
          producto_id: 'articulo-1',
          deposito_id: 'deposito-1',
          min_stock: 20,
          max_stock: 200,
        },
      ]

      const builderConfiguraciones = crearQueryBuilder({
        data: configuraciones,
        error: null,
      })

      const builderStock = crearQueryBuilder({
        data: [
          {
            producto_id: 'articulo-1',
            deposito_id: 'deposito-1',
            cantidad: 50,
          },
        ],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(builderConfiguraciones)
        .mockReturnValueOnce(builderStock)

      const resultado = await getConfiguracionesStock()

      expect(supabase.from).toHaveBeenNthCalledWith(
        1,
        'configuracion_stock',
      )
      expect(supabase.from).toHaveBeenNthCalledWith(
        2,
        'stock_x_deposito',
      )

      expect(resultado).toEqual([
        {
          ...configuraciones[0],
          stock_actual: 50,
          estado_stock: 'Normal',
        },
      ])
    })

    it('marca alerta cuando el stock actual está por debajo del mínimo', async () => {
      const configuraciones = [
        {
          id: 'config-1',
          producto_id: 'articulo-1',
          deposito_id: 'deposito-1',
          min_stock: 20,
          max_stock: 200,
        },
      ]

      const builderConfiguraciones = crearQueryBuilder({
        data: configuraciones,
        error: null,
      })

      const builderStock = crearQueryBuilder({
        data: [
          {
            producto_id: 'articulo-1',
            deposito_id: 'deposito-1',
            cantidad: 8,
          },
        ],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(builderConfiguraciones)
        .mockReturnValueOnce(builderStock)

      const resultado = await getConfiguracionesStock()

      expect(resultado[0].stock_actual).toBe(8)
      expect(resultado[0].estado_stock).toBe('Stock bajo')
    })

    it('no genera alerta si no existe stock para ese artículo y depósito', async () => {
      const configuraciones = [
        {
          id: 'config-1',
          producto_id: 'articulo-1',
          deposito_id: 'deposito-1',
          min_stock: 20,
          max_stock: 200,
        },
      ]

      const builderConfiguraciones = crearQueryBuilder({
        data: configuraciones,
        error: null,
      })

      const builderStock = crearQueryBuilder({
        data: [],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(builderConfiguraciones)
        .mockReturnValueOnce(builderStock)

      const resultado = await getConfiguracionesStock()

      expect(resultado[0].stock_actual).toBeNull()
      expect(resultado[0].estado_stock).toBe('Sin stock registrado')
    })

    it('filtra por depósito y artículo', async () => {
      const builder = crearQueryBuilder({
        data: [],
        error: null,
      })

      supabase.from.mockReturnValue(builder)

      await getConfiguracionesStock({
        deposito_id: 'deposito-1',
        articulo_id: 'articulo-1',
      })

      expect(builder.eq).toHaveBeenCalledWith(
        'deposito_id',
        'deposito-1',
      )

      expect(builder.eq).toHaveBeenCalledWith(
        'producto_id',
        'articulo-1',
      )
    })
  })

  describe('createConfiguracionStock', () => {
    it('crea una configuración correctamente', async () => {
      const builderArticulo = crearQueryBuilder({
        data: { id: 'articulo-1' },
        error: null,
      })

      const builderDeposito = crearQueryBuilder({
        data: { id: 'deposito-1' },
        error: null,
      })

      const configuracionCreada = {
        id: 'config-1',
        producto_id: 'articulo-1',
        deposito_id: 'deposito-1',
        min_stock: 20,
        max_stock: 200,
      }

      const builderInsert = crearQueryBuilder({
        data: configuracionCreada,
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(builderArticulo)
        .mockReturnValueOnce(builderDeposito)
        .mockReturnValueOnce(builderInsert)

      const resultado = await createConfiguracionStock(configuracionValida)

      expect(builderInsert.insert).toHaveBeenCalledWith({
        producto_id: 'articulo-1',
        deposito_id: 'deposito-1',
        min_stock: 20,
        max_stock: 200,
      })

      expect(resultado).toEqual(configuracionCreada)
    })

    it('rechaza valores negativos con 400', async () => {
      await expect(
        createConfiguracionStock({
          ...configuracionValida,
          stock_minimo: -1,
        }),
      ).rejects.toMatchObject({
        status: 400,
      })

      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza cuando mínimo es mayor que máximo con 400', async () => {
      await expect(
        createConfiguracionStock({
          ...configuracionValida,
          stock_minimo: 300,
          stock_maximo: 200,
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'El stock mínimo no puede ser mayor al stock máximo',
      })

      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza cuando falta stock máximo', async () => {
      await expect(
        createConfiguracionStock({
          ...configuracionValida,
          stock_maximo: '',
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'El stock máximo es obligatorio',
      })
    })

    it('rechaza con 404 cuando el artículo no existe', async () => {
      const builderArticulo = crearQueryBuilder({
        data: null,
        error: null,
      })

      supabase.from.mockReturnValue(builderArticulo)

      await expect(
        createConfiguracionStock(configuracionValida),
      ).rejects.toMatchObject({
        status: 404,
        message: 'El artículo no existe',
      })
    })

    it('rechaza con 404 cuando el depósito no existe', async () => {
      const builderArticulo = crearQueryBuilder({
        data: { id: 'articulo-1' },
        error: null,
      })

      const builderDeposito = crearQueryBuilder({
        data: null,
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(builderArticulo)
        .mockReturnValueOnce(builderDeposito)

      await expect(
        createConfiguracionStock(configuracionValida),
      ).rejects.toMatchObject({
        status: 404,
        message: 'El depósito no existe',
      })
    })

    it('convierte configuración duplicada en error 409', async () => {
      const builderArticulo = crearQueryBuilder({
        data: { id: 'articulo-1' },
        error: null,
      })

      const builderDeposito = crearQueryBuilder({
        data: { id: 'deposito-1' },
        error: null,
      })

      const builderInsert = crearQueryBuilder({
        data: null,
        error: { code: '23505' },
      })

      supabase.from
        .mockReturnValueOnce(builderArticulo)
        .mockReturnValueOnce(builderDeposito)
        .mockReturnValueOnce(builderInsert)

      await expect(
        createConfiguracionStock(configuracionValida),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Ya existe una configuración para ese artículo y depósito',
      })
    })
  })

  describe('updateConfiguracionStock', () => {
    it('actualiza solamente mínimo y máximo', async () => {
      const builderExistente = crearQueryBuilder({
        data: {
          id: 'config-1',
          producto_id: 'articulo-1',
          deposito_id: 'deposito-1',
        },
        error: null,
      })

      const actualizado = {
        id: 'config-1',
        producto_id: 'articulo-1',
        deposito_id: 'deposito-1',
        min_stock: 30,
        max_stock: 250,
      }

      const builderUpdate = crearQueryBuilder({
        data: actualizado,
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(builderExistente)
        .mockReturnValueOnce(builderUpdate)

      const resultado = await updateConfiguracionStock('config-1', {
        ...configuracionValida,
        stock_minimo: 30,
        stock_maximo: 250,
      })

      expect(builderUpdate.update).toHaveBeenCalledWith({
        min_stock: 30,
        max_stock: 250,
      })

      expect(resultado).toEqual(actualizado)
    })

    it('rechaza con 404 cuando la configuración no existe', async () => {
      const builderExistente = crearQueryBuilder({
        data: null,
        error: null,
      })

      supabase.from.mockReturnValue(builderExistente)

      await expect(
        updateConfiguracionStock(
          'config-inexistente',
          configuracionValida,
        ),
      ).rejects.toMatchObject({
        status: 404,
        message: 'La configuración no existe',
      })
    })
  })
})