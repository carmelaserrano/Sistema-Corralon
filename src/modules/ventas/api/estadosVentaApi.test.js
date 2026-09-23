import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  PERMISO_ANULAR,
  PERMISO_ENTREGAR,
  anularVenta,
  getHistorialEstadoVenta,
  listarVentasSupervision,
  marcarEntregada,
  puedeAnularVentas,
  puedeEntregarVentas,
} from './estadosVentaApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

// Imita el query builder de supabase-js: cada filtro devuelve el mismo
// builder, y el builder es "thenable" para poder await-earlo directo, o
// terminar en .single().
function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

function errorPg(codigo, mensaje) {
  return { code: codigo, message: mensaje }
}

const ventaPendiente = {
  id: 'v1', numero: 1, estado: 'Pendiente', total: 1000, observaciones: null,
  created_at: '2026-01-15T10:00:00Z',
  cliente: { id: 'c1', tipo_persona: 'fisica', nombre: 'Ana', apellido: 'Gómez', razon_social: null },
}

describe('estadosVentaApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constantes', () => {
    it('los nombres de permiso son los de 0031', () => {
      expect(PERMISO_ENTREGAR).toBe('ventas.entregar')
      expect(PERMISO_ANULAR).toBe('ventas.anular')
    })
  })

  describe('listarVentasSupervision (CA-01)', () => {
    it('sin filtros, no aplica ningún filtro extra', async () => {
      const builder = crearQueryBuilder({ data: [ventaPendiente], error: null })
      supabase.from.mockReturnValue(builder)

      const ventas = await listarVentasSupervision()

      expect(supabase.from).toHaveBeenCalledWith('ventas')
      expect(builder.eq).not.toHaveBeenCalled()
      expect(builder.gte).not.toHaveBeenCalled()
      expect(builder.lt).not.toHaveBeenCalled()
      expect(ventas).toEqual([ventaPendiente])
    })

    it('trae el cliente embebido, con los campos para armar el nombre', async () => {
      const builder = crearQueryBuilder({ data: [ventaPendiente], error: null })
      supabase.from.mockReturnValue(builder)

      await listarVentasSupervision()

      expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('cliente:clientes'))
    })

    it('filtra por estado cuando se lo pasan', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await listarVentasSupervision({ estado: 'Facturada' })

      expect(builder.eq).toHaveBeenCalledWith('estado', 'Facturada')
    })

    it('"desde" filtra desde el inicio de ese día', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await listarVentasSupervision({ desde: '2026-01-10' })

      expect(builder.gte).toHaveBeenCalledWith('created_at', '2026-01-10T00:00:00')
    })

    it('"hasta" incluye el día completo, no solo la medianoche', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await listarVentasSupervision({ hasta: '2026-01-10' })

      // Sin esto, una venta cargada el 10 a las 15hs quedaría afuera del
      // filtro "hasta 2026-01-10": se compara contra el inicio del día
      // siguiente, no contra la medianoche de ese mismo día.
      const [, valor] = builder.lt.mock.calls[0]
      expect(new Date(valor).toISOString().slice(0, 10)).toBe('2026-01-11')
    })

    it('desde y hasta se pueden combinar', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await listarVentasSupervision({ estado: 'Anulada', desde: '2026-01-01', hasta: '2026-01-31' })

      expect(builder.eq).toHaveBeenCalledWith('estado', 'Anulada')
      expect(builder.gte).toHaveBeenCalledWith('created_at', '2026-01-01T00:00:00')
      expect(builder.lt).toHaveBeenCalled()
    })

    it('ordena por fecha, de la más reciente a la más antigua', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await listarVentasSupervision()

      expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('propaga el error de la consulta', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ data: null, error: new Error('sin conexión') }))
      await expect(listarVentasSupervision()).rejects.toThrow('sin conexión')
    })
  })

  describe('getHistorialEstadoVenta (CA-06)', () => {
    it('trae el historial ordenado del más nuevo al más viejo', async () => {
      const historial = [
        { id: 'h2', estado_anterior: 'Facturada', estado_nuevo: 'Entregada', motivo: null, usuario_id: 'u1', created_at: '2026-01-16T10:00:00Z' },
        { id: 'h1', estado_anterior: 'Pendiente', estado_nuevo: 'Facturada', motivo: 'Factura emitida', usuario_id: 'u2', created_at: '2026-01-15T10:00:00Z' },
      ]
      const builder = crearQueryBuilder({ data: historial, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await getHistorialEstadoVenta('v1')

      expect(supabase.from).toHaveBeenCalledWith('historial_estado_venta')
      expect(builder.eq).toHaveBeenCalledWith('venta_id', 'v1')
      expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(resultado).toEqual(historial)
    })

    it('propaga el error', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ data: null, error: new Error('boom') }))
      await expect(getHistorialEstadoVenta('v1')).rejects.toThrow('boom')
    })
  })

  describe('marcarEntregada (CA-03)', () => {
    it('llama a cambiar_estado_venta con Entregada, sin motivo', async () => {
      supabase.rpc.mockReturnValue(
        crearQueryBuilder({ data: { id: 'v1', estado: 'Entregada' }, error: null }),
      )

      const venta = await marcarEntregada('v1')

      expect(supabase.rpc).toHaveBeenCalledWith('cambiar_estado_venta', {
        p_venta: 'v1',
        p_estado_nuevo: 'Entregada',
      })
      expect(venta.estado).toBe('Entregada')
    })

    it('sin el permiso ventas.entregar, da un mensaje claro (403)', async () => {
      supabase.rpc.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: errorPg('42501', 'No tenés permiso para marcar ventas como entregadas'),
        }),
      )

      try {
        await marcarEntregada('v1')
        throw new Error('no debería llegar acá')
      } catch (err) {
        expect(err.status).toBe(403)
        expect(err.message).toBe('No tenés permiso para marcar ventas como entregadas')
      }
    })

    it('si la venta no está Facturada, la transición se rechaza (409)', async () => {
      supabase.rpc.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: errorPg('22023', 'Transición no permitida: Pendiente → Entregada'),
        }),
      )

      try {
        await marcarEntregada('v1')
        throw new Error('no debería llegar acá')
      } catch (err) {
        expect(err.status).toBe(409)
        expect(err.message).toContain('Transición no permitida')
        expect(err.requiereNotaCredito).toBeUndefined()
      }
    })
  })

  describe('anularVenta (CA-04 / CA-05)', () => {
    it('exige motivo antes de ir a la red', async () => {
      await expect(anularVenta('v1', '')).rejects.toThrow(/motivo es obligatorio/)
      await expect(anularVenta('v1', '   ')).rejects.toThrow(/motivo es obligatorio/)
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('llama a cambiar_estado_venta con Anulada y el motivo (recortado)', async () => {
      supabase.rpc.mockReturnValue(
        crearQueryBuilder({ data: { id: 'v1', estado: 'Anulada' }, error: null }),
      )

      const venta = await anularVenta('v1', '  el cliente se arrepintió  ')

      expect(supabase.rpc).toHaveBeenCalledWith('cambiar_estado_venta', {
        p_venta: 'v1',
        p_estado_nuevo: 'Anulada',
        p_motivo: 'el cliente se arrepintió',
      })
      expect(venta.estado).toBe('Anulada')
    })

    it('CA-04: motivo rechazado por la base (23514) también da un mensaje de campo', async () => {
      supabase.rpc.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: errorPg('23514', 'El motivo es obligatorio para anular una venta'),
        }),
      )

      try {
        await anularVenta('v1', 'algo')
        throw new Error('no debería llegar acá')
      } catch (err) {
        expect(err.campo).toBe('motivo')
      }
    })

    it('un CHECK de la base que no reconoce da un mensaje genérico, no el texto crudo', async () => {
      supabase.rpc.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: errorPg('23514', 'violates check constraint "otra_regla_futura"'),
        }),
      )
      await expect(anularVenta('v1', 'algo')).rejects.toThrow(
        /no cumplen una validación del sistema/,
      )
    })

    it('CA-05: anular una Facturada marca el error con requiereNotaCredito', async () => {
      supabase.rpc.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: errorPg(
            '22023',
            'Una venta facturada no se puede anular directamente: generá una Nota de Crédito por el total',
          ),
        }),
      )

      try {
        await anularVenta('v1', 'motivo')
        throw new Error('no debería llegar acá')
      } catch (err) {
        expect(err.requiereNotaCredito).toBe(true)
        expect(err.status).toBe(409)
        expect(err.message).toContain('Nota de Crédito')
      }
    })

    it('otra transición inválida (CA-07) no lleva la marca de Nota de Crédito', async () => {
      supabase.rpc.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: errorPg('22023', 'Transición no permitida: Entregada → Pendiente'),
        }),
      )

      try {
        await anularVenta('v1', 'motivo')
        throw new Error('no debería llegar acá')
      } catch (err) {
        expect(err.requiereNotaCredito).toBeUndefined()
      }
    })

    it('sin el permiso ventas.anular, da un mensaje claro (403)', async () => {
      supabase.rpc.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorPg('42501', 'No tenés permiso para anular ventas') }),
      )

      try {
        await anularVenta('v1', 'motivo')
        throw new Error('no debería llegar acá')
      } catch (err) {
        expect(err.status).toBe(403)
      }
    })

    it('un error inesperado se propaga tal cual', async () => {
      supabase.rpc.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorPg('99999', 'algo raro') }),
      )
      await expect(anularVenta('v1', 'motivo')).rejects.toMatchObject({ code: '99999' })
    })
  })

  describe('puedeEntregarVentas / puedeAnularVentas', () => {
    it('puedeEntregarVentas consulta ventas.entregar', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })
      await expect(puedeEntregarVentas()).resolves.toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', { p_nombre: 'ventas.entregar' })
    })

    it('puedeAnularVentas consulta ventas.anular', async () => {
      supabase.rpc.mockResolvedValue({ data: false, error: null })
      await expect(puedeAnularVentas()).resolves.toBe(false)
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', { p_nombre: 'ventas.anular' })
    })

    it('propagan el error', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: new Error('boom') })
      await expect(puedeEntregarVentas()).rejects.toThrow('boom')
      await expect(puedeAnularVentas()).rejects.toThrow('boom')
    })
  })
})
