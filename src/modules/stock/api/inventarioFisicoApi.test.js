import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabaseClient'
import {
  aprobarInventarioFisico,
  cargarConteosInventario,
  enviarInventarioAprobacion,
  getInventarioFisico,
  iniciarInventarioFisico,
  puedeAjustarInventario,
  aplicarAjustesInventarioFisico,
} from './inventarioFisicoApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
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
    vi.resetAllMocks()
  })

  describe('iniciarInventarioFisico', () => {
    it('inicia una toma y congela el stock teórico mediante RPC', async () => {
      supabase.rpc.mockResolvedValue({
        data: 'inventario-1',
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
        .mockReturnValueOnce(inventarioGetBuilder)
        .mockReturnValueOnce(detalleGetBuilder)

      const resultado = await iniciarInventarioFisico('deposito-1')

      expect(supabase.rpc).toHaveBeenCalledWith(
        'iniciar_inventario_fisico',
        {
          p_deposito_id: 'deposito-1',
        },
      )

      expect(resultado.id).toBe('inventario-1')
      expect(resultado.detalle).toHaveLength(2)

      expect(supabase.from).not.toHaveBeenCalledWith(
        'stock_x_deposito',
      )
    })

    it('rechaza un depósito inexistente con 404', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0002',
          message: 'El depósito no existe',
        },
      })

      await expect(
        iniciarInventarioFisico('deposito-inexistente'),
      ).rejects.toMatchObject({
        status: 404,
      })
    })

    it('rechaza si ya existe una toma abierta para el depósito', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message: 'Ya existe una toma de inventario abierta para ese depósito',
        },
      })

      await expect(
        iniciarInventarioFisico('deposito-1'),
      ).rejects.toMatchObject({
        status: 409,
      })
    })

    it('rechaza un depósito sin artículos vinculados', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message:
            'El depósito no tiene artículos vinculados para inventariar',
        },
      })

      await expect(
        iniciarInventarioFisico('deposito-1'),
      ).rejects.toMatchObject({
        status: 400,
      })
    })
  })

  describe('cargarConteosInventario', () => {
    it('carga el conteo completo de todos los artículos mediante RPC', async () => {
      const conteos = [
        {
          producto_id: 'producto-1',
          cantidad_contada: 8,
        },
        {
          producto_id: 'producto-2',
          cantidad_contada: 12.5,
        },
      ]

      supabase.rpc.mockResolvedValue({
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
        data: [
          {
            producto_id: 'producto-1',
            stock_teorico: 10,
            cantidad_contada: 8,
            diferencia: -2,
          },
          {
            producto_id: 'producto-2',
            stock_teorico: 5.5,
            cantidad_contada: 12.5,
            diferencia: 7,
          },
        ],
        error: null,
      })

      supabase.from
        .mockReturnValueOnce(inventarioGetBuilder)
        .mockReturnValueOnce(detalleGetBuilder)

      const resultado = await cargarConteosInventario(
        'inventario-1',
        conteos,
      )

      expect(supabase.rpc).toHaveBeenCalledWith(
        'cargar_conteos_inventario',
        {
          p_inventario_id: 'inventario-1',
          p_conteos: conteos,
        },
      )

      expect(resultado.detalle).toHaveLength(2)
      expect(resultado.detalle[0].diferencia).toBe(-2)
      expect(resultado.detalle[1].diferencia).toBe(7)
    })

    it('rechaza conteos incompletos', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message:
            'Debe informarse el conteo de todos los artículos de la toma',
        },
      })

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
      supabase.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message:
            'Las cantidades contadas deben informarse y no pueden ser negativas',
        },
      })

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

      expect(inventarioBuilder.select.mock.calls[0][0]).toContain(
        'ajustes_aplicados_at',
      )
      expect(inventarioBuilder.select.mock.calls[0][0]).toContain(
        'ajustes_aplicados_by',
      )
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

  describe('ajustes de inventario', () => {
    it('consulta si el usuario tiene permiso para ajustar', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      await expect(puedeAjustarInventario()).resolves.toBe(true)

      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'Ajuste de inventario',
      })
    })

    it('aplica los ajustes de una toma aprobada mediante RPC', async () => {
      supabase.rpc.mockResolvedValue({ data: 2, error: null })

      await expect(
        aplicarAjustesInventarioFisico('inventario-1', {
          categoria: 'conteo_fisico',
          motivo: 'Diferencia detectada en el conteo',
        }),
      ).resolves.toBe(2)

      expect(supabase.rpc).toHaveBeenCalledWith(
        'aplicar_ajustes_inventario_fisico',
        {
          p_inventario_id: 'inventario-1',
          p_categoria: 'conteo_fisico',
          p_motivo: 'Diferencia detectada en el conteo',
        },
      )
    })

    it('rechaza aplicar ajustes sin motivo antes de llamar a Supabase', async () => {
      await expect(
        aplicarAjustesInventarioFisico('inventario-1', { motivo: ' ' }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'El motivo del ajuste es obligatorio',
      })

      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('traduce a conflicto el stock insuficiente detectado al confirmar', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'MV004',
          message: 'La cantidad supera el disponible del deposito origen',
        },
      })

      await expect(
        aplicarAjustesInventarioFisico('inventario-1', {
          motivo: 'Diferencia de conteo',
        }),
      ).rejects.toMatchObject({ status: 409 })
    })
  })
})
