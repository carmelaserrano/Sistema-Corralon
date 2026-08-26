import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabaseClient'
import {
  aprobarInventarioFisico,
  cargarConteosInventario,
  enviarInventarioAprobacion,
  getInventarioFisico,
  iniciarInventarioFisico,
} from './inventarioFisicoApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}))

function crearBuilder(resultado = { data: null, error: null }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    order: vi.fn(),
  }

  for (const metodo of [
    'select',
    'eq',
    'in',
    'insert',
    'update',
    'order',
  ]) {
    builder[metodo].mockReturnValue(builder)
  }

  builder.maybeSingle.mockResolvedValue(resultado)
  builder.single.mockResolvedValue(resultado)

  builder.then = (resolve) => Promise.resolve(resultado).then(resolve)

  return builder
}

describe('inventarioFisicoApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('iniciarInventarioFisico', () => {
    it('inicia una toma y congela el stock teórico', async () => {
      const depositoBuilder = crearBuilder({
        data: { id: 'deposito-1' },
        error: null,
      })

      const abiertoBuilder = crearBuilder({
        data: null,
        error: null,
      })

      const stockBuilder = crearBuilder({
        data: [
          { producto_id: 'producto-1', cantidad: 10 },
          { producto_id: 'producto-2', cantidad: 5.5 },
        ],
        error: null,
      })

      const inventarioBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          deposito_id: 'deposito-1',
          estado: 'en_carga',
        },
        error: null,
      })

      const detalleInsertBuilder = crearBuilder({
        data: null,
        error: null,
      })

      const inventarioGetBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          deposito_id: 'deposito-1',
          estado: 'en_carga',
        },
        error: null,
      })

      const detalleGetBuilder = crearBuilder({
        data: [
          {
            producto_id: 'producto-1',
            stock_teorico: 10,
            cantidad_contada: null,
            diferencia: null,
          },
          {
            producto_id: 'producto-2',
            stock_teorico: 5.5,
            cantidad_contada: null,
            diferencia: null,
          },
        ],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(depositoBuilder)
        .mockReturnValueOnce(abiertoBuilder)
        .mockReturnValueOnce(stockBuilder)
        .mockReturnValueOnce(inventarioBuilder)
        .mockReturnValueOnce(detalleInsertBuilder)
        .mockReturnValueOnce(inventarioGetBuilder)
        .mockReturnValueOnce(detalleGetBuilder)

      const resultado = await iniciarInventarioFisico('deposito-1')

      expect(resultado.id).toBe('inventario-1')
      expect(resultado.detalle).toHaveLength(2)

      expect(detalleInsertBuilder.insert).toHaveBeenCalledWith([
        {
          inventario_fisico_id: 'inventario-1',
          producto_id: 'producto-1',
          stock_teorico: 10,
        },
        {
          inventario_fisico_id: 'inventario-1',
          producto_id: 'producto-2',
          stock_teorico: 5.5,
        },
      ])
    })

    it('rechaza un depósito inexistente con 404', async () => {
      const depositoBuilder = crearBuilder({
        data: null,
        error: null,
      })

      supabase.from.mockReturnValueOnce(depositoBuilder)

      await expect(
        iniciarInventarioFisico('deposito-inexistente'),
      ).rejects.toMatchObject({
        status: 404,
      })
    })

    it('rechaza si ya existe una toma abierta para el depósito', async () => {
      const depositoBuilder = crearBuilder({
        data: { id: 'deposito-1' },
        error: null,
      })

      const abiertoBuilder = crearBuilder({
        data: { id: 'inventario-abierto' },
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(depositoBuilder)
        .mockReturnValueOnce(abiertoBuilder)

      await expect(
        iniciarInventarioFisico('deposito-1'),
      ).rejects.toMatchObject({
        status: 409,
      })
    })

    it('rechaza un depósito sin artículos vinculados', async () => {
      const depositoBuilder = crearBuilder({
        data: { id: 'deposito-1' },
        error: null,
      })

      const abiertoBuilder = crearBuilder({
        data: null,
        error: null,
      })

      const stockBuilder = crearBuilder({
        data: [],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(depositoBuilder)
        .mockReturnValueOnce(abiertoBuilder)
        .mockReturnValueOnce(stockBuilder)

      await expect(
        iniciarInventarioFisico('deposito-1'),
      ).rejects.toMatchObject({
        status: 400,
      })
    })
  })

  describe('cargarConteosInventario', () => {
    it('carga el conteo completo de todos los artículos', async () => {
      const inventarioBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          estado: 'en_carga',
        },
        error: null,
      })

      const detalleBuilder = crearBuilder({
        data: [
          { id: 'detalle-1', producto_id: 'producto-1' },
          { id: 'detalle-2', producto_id: 'producto-2' },
        ],
        error: null,
      })

      const update1 = crearBuilder({
        data: null,
        error: null,
      })

      const update2 = crearBuilder({
        data: null,
        error: null,
      })

      const inventarioGetBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          estado: 'en_carga',
        },
        error: null,
      })

      const detalleGetBuilder = crearBuilder({
        data: [],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(inventarioBuilder)
        .mockReturnValueOnce(detalleBuilder)
        .mockReturnValueOnce(update1)
        .mockReturnValueOnce(update2)
        .mockReturnValueOnce(inventarioGetBuilder)
        .mockReturnValueOnce(detalleGetBuilder)

      await cargarConteosInventario('inventario-1', [
        {
          producto_id: 'producto-1',
          cantidad_contada: 8,
        },
        {
          producto_id: 'producto-2',
          cantidad_contada: 12.5,
        },
      ])

      expect(update1.update).toHaveBeenCalledWith({
        cantidad_contada: 8,
      })

      expect(update2.update).toHaveBeenCalledWith({
        cantidad_contada: 12.5,
      })
    })

    it('rechaza conteos incompletos', async () => {
      const inventarioBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          estado: 'en_carga',
        },
        error: null,
      })

      const detalleBuilder = crearBuilder({
        data: [
          { id: 'detalle-1', producto_id: 'producto-1' },
          { id: 'detalle-2', producto_id: 'producto-2' },
        ],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(inventarioBuilder)
        .mockReturnValueOnce(detalleBuilder)

      await expect(
        cargarConteosInventario('inventario-1', [
          {
            producto_id: 'producto-1',
            cantidad_contada: 10,
          },
        ]),
      ).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza cantidades negativas', async () => {
      const inventarioBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          estado: 'en_carga',
        },
        error: null,
      })

      const detalleBuilder = crearBuilder({
        data: [
          { id: 'detalle-1', producto_id: 'producto-1' },
        ],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(inventarioBuilder)
        .mockReturnValueOnce(detalleBuilder)

      await expect(
        cargarConteosInventario('inventario-1', [
          {
            producto_id: 'producto-1',
            cantidad_contada: -1,
          },
        ]),
      ).rejects.toMatchObject({
        status: 400,
      })
    })
  })

  describe('enviarInventarioAprobacion', () => {
    it('envía una toma completa a pendiente de aprobación', async () => {
      const inventarioBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          estado: 'en_carga',
        },
        error: null,
      })

      const detalleBuilder = crearBuilder({
        data: [
          { id: 'detalle-1', cantidad_contada: 10 },
          { id: 'detalle-2', cantidad_contada: 5 },
        ],
        error: null,
      })

      const updateBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          estado: 'pendiente_aprobacion',
        },
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(inventarioBuilder)
        .mockReturnValueOnce(detalleBuilder)
        .mockReturnValueOnce(updateBuilder)

      const resultado =
        await enviarInventarioAprobacion('inventario-1')

      expect(resultado.estado).toBe('pendiente_aprobacion')
      expect(updateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          estado: 'pendiente_aprobacion',
        }),
      )
    })

    it('no permite enviar una toma con artículos sin contar', async () => {
      const inventarioBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          estado: 'en_carga',
        },
        error: null,
      })

      const detalleBuilder = crearBuilder({
        data: [
          { id: 'detalle-1', cantidad_contada: 10 },
          { id: 'detalle-2', cantidad_contada: null },
        ],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(inventarioBuilder)
        .mockReturnValueOnce(detalleBuilder)

      await expect(
        enviarInventarioAprobacion('inventario-1'),
      ).rejects.toMatchObject({
        status: 400,
      })
    })
  })

  describe('aprobarInventarioFisico', () => {
    it('aprueba una toma pendiente sin modificar el stock', async () => {
      const inventarioBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          estado: 'pendiente_aprobacion',
        },
        error: null,
      })

      supabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'usuario-admin',
          },
        },
        error: null,
      })

      const updateBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          estado: 'aprobado',
          aprobado_by: 'usuario-admin',
        },
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(inventarioBuilder)
        .mockReturnValueOnce(updateBuilder)

      const resultado =
        await aprobarInventarioFisico('inventario-1')

      expect(resultado.estado).toBe('aprobado')
      expect(resultado.aprobado_by).toBe('usuario-admin')

      expect(supabase.from).not.toHaveBeenCalledWith(
        'stock_x_deposito',
      )
    })
  })

  describe('getInventarioFisico', () => {
    it('obtiene la cabecera y el detalle', async () => {
      const inventarioBuilder = crearBuilder({
        data: {
          id: 'inventario-1',
          estado: 'aprobado',
        },
        error: null,
      })

      const detalleBuilder = crearBuilder({
        data: [
          {
            producto_id: 'producto-1',
            stock_teorico: 10,
            cantidad_contada: 8,
            diferencia: -2,
          },
        ],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(inventarioBuilder)
        .mockReturnValueOnce(detalleBuilder)

      const resultado =
        await getInventarioFisico('inventario-1')

      expect(resultado.detalle).toEqual([
        {
          producto_id: 'producto-1',
          stock_teorico: 10,
          cantidad_contada: 8,
          diferencia: -2,
        },
      ])
    })
  })
})