import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  PERMISO_FACTURAR,
  PERMISO_ANULAR,
  determinarLetraComprobante,
  calcularDesgloseIva,
  emitirComprobante,
  obtenerComprobante,
  listarComprobantesPorVenta,
  descargarComprobantePdf,
  puedeFacturarVentas,
  puedeAnularVentas,
} from './comprobantesApi'
import { supabase } from '../../../lib/supabaseClient'
import * as comprobantePdfModule from '../pdf/comprobantePdf'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

function errorPg(codigo, mensaje) {
  return { code: codigo, message: mensaje }
}

const comprobanteEjemplo = {
  id: 'comp-1',
  venta_id: 'v-1',
  tipo_comprobante: 'factura',
  letra: 'B',
  numero: 1,
  punto_venta_id: 'pv-1',
  neto: 826.45,
  iva: 173.55,
  total: 1000,
  cae: 'HOMOLOGACIÓN',
  cae_vencimiento: '2026-10-03',
  estado: 'Emitido',
  punto_venta: { id: 'pv-1', numero: '0001', nombre: 'Casa Central' },
  venta: {
    id: 'v-1',
    numero: 10,
    total: 1000,
    cliente: { id: 'c-1', nombre: 'Juan', apellido: 'Pérez', condicion_iva: { nombre: 'Consumidor Final' } },
    detalle_venta: [],
  },
}

describe('comprobantesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constantes y permisos', () => {
    it('los nombres de permiso coinciden con el contrato del sistema', () => {
      expect(PERMISO_FACTURAR).toBe('ventas.facturar')
      expect(PERMISO_ANULAR).toBe('ventas.anular')
    })
  })

  describe('determinarLetraComprobante (CA-02)', () => {
    it('asigna Letra A si el cliente es Responsable Inscripto', () => {
      expect(determinarLetraComprobante('Responsable Inscripto')).toBe('A')
      expect(determinarLetraComprobante('responsable inscripto')).toBe('A')
      expect(determinarLetraComprobante('RI')).toBe('A')
      expect(determinarLetraComprobante('  Responsable Inscripto  ')).toBe('A')
    })

    it('asigna Letra B para Consumidor Final, Monotributo, Exento u otros', () => {
      expect(determinarLetraComprobante('Consumidor Final')).toBe('B')
      expect(determinarLetraComprobante('Monotributo')).toBe('B')
      expect(determinarLetraComprobante('Exento')).toBe('B')
      expect(determinarLetraComprobante(null)).toBe('B')
      expect(determinarLetraComprobante(undefined)).toBe('B')
    })
  })

  describe('calcularDesgloseIva (CA-03)', () => {
    it('desglosa neto e IVA 21% de forma que neto + iva sea exactamente el total', () => {
      const { neto, iva, total } = calcularDesgloseIva(1000)
      expect(total).toBe(1000)
      expect(neto).toBe(826.45)
      expect(iva).toBe(173.55)
      expect(Number((neto + iva).toFixed(2))).toBe(1000)
    })

    it('maneja valores 0 o nulos', () => {
      expect(calcularDesgloseIva(0)).toEqual({ total: 0, neto: 0, iva: 0 })
      expect(calcularDesgloseIva(null)).toEqual({ total: 0, neto: 0, iva: 0 })
    })
  })

  describe('emitirComprobante (CA-01, CA-03, CA-05, CA-06, CA-07)', () => {
    it('exige ventaId', async () => {
      await expect(emitirComprobante(null)).rejects.toThrow('El ID de la venta es obligatorio')
    })

    it('rechaza tipos de comprobante desconocidos', async () => {
      await expect(emitirComprobante('v-1', 'ticket_x')).rejects.toThrow('Tipo de comprobante inválido')
    })

    it('emite una factura exitosamente llamando al RPC emitir_comprobante', async () => {
      const builder = {
        single: vi.fn(() => Promise.resolve({ data: comprobanteEjemplo, error: null })),
      }
      supabase.rpc.mockReturnValue(builder)

      const resultado = await emitirComprobante('v-1', 'factura')

      expect(supabase.rpc).toHaveBeenCalledWith('emitir_comprobante', {
        p_venta: 'v-1',
        p_tipo: 'factura',
        p_items: null,
      })
      expect(resultado).toEqual(comprobanteEjemplo)
    })

    it('emite una nota de crédito con items parciales', async () => {
      const items = [{ producto_id: 'p-1', cantidad: 2 }]
      const builder = {
        single: vi.fn(() => Promise.resolve({ data: { ...comprobanteEjemplo, tipo_comprobante: 'nota_credito' }, error: null })),
      }
      supabase.rpc.mockReturnValue(builder)

      const resultado = await emitirComprobante('v-1', 'nota_credito', items)

      expect(supabase.rpc).toHaveBeenCalledWith('emitir_comprobante', {
        p_venta: 'v-1',
        p_tipo: 'nota_credito',
        p_items: items,
      })
      expect(resultado.tipo_comprobante).toBe('nota_credito')
    })

    it('mapea error de permisos (42501) a status 403', async () => {
      const error = errorPg('42501', 'No tenés permiso para emitir facturas')
      const builder = { single: vi.fn(() => Promise.resolve({ data: null, error })) }
      supabase.rpc.mockReturnValue(builder)

      await expect(emitirComprobante('v-1', 'factura')).rejects.toMatchObject({
        status: 403,
        message: 'No tenés permiso para emitir facturas',
      })
    })

    it('mapea transiciones o reglas inválidas (22023) a status 409', async () => {
      const error = errorPg('22023', 'La venta debe estar cobrada o tener medio Cuenta corriente')
      const builder = { single: vi.fn(() => Promise.resolve({ data: null, error })) }
      supabase.rpc.mockReturnValue(builder)

      await expect(emitirComprobante('v-1', 'factura')).rejects.toMatchObject({
        status: 409,
        message: 'La venta debe estar cobrada o tener medio Cuenta corriente',
      })
    })

    it('propaga errores genéricos no reconocidos', async () => {
      const error = errorPg('99999', 'Error de conexión inesperado')
      const builder = { single: vi.fn(() => Promise.resolve({ data: null, error })) }
      supabase.rpc.mockReturnValue(builder)

      await expect(emitirComprobante('v-1', 'factura')).rejects.toMatchObject({
        message: 'Error de conexión inesperado',
      })
    })
  })

  describe('obtenerComprobante y listarComprobantesPorVenta', () => {
    it('obtenerComprobante exige ID', async () => {
      await expect(obtenerComprobante(null)).rejects.toThrow('El ID del comprobante es obligatorio')
    })

    it('obtenerComprobante busca por ID con relaciones', async () => {
      const builder = crearQueryBuilder({ data: comprobanteEjemplo, error: null })
      supabase.from.mockReturnValue(builder)

      const data = await obtenerComprobante('comp-1')
      expect(supabase.from).toHaveBeenCalledWith('comprobantes_venta')
      expect(builder.eq).toHaveBeenCalledWith('id', 'comp-1')
      expect(data).toEqual(comprobanteEjemplo)
    })

    it('listarComprobantesPorVenta devuelve vacío si no hay ventaId', async () => {
      const data = await listarComprobantesPorVenta(null)
      expect(data).toEqual([])
    })

    it('listarComprobantesPorVenta consulta comprobantes de la venta ordenados por fecha', async () => {
      const builder = crearQueryBuilder({ data: [comprobanteEjemplo], error: null })
      supabase.from.mockReturnValue(builder)

      const data = await listarComprobantesPorVenta('v-1')
      expect(supabase.from).toHaveBeenCalledWith('comprobantes_venta')
      expect(builder.eq).toHaveBeenCalledWith('venta_id', 'v-1')
      expect(data).toEqual([comprobanteEjemplo])
    })
  })

  describe('descargarComprobantePdf (CA-04)', () => {
    it('obtiene el comprobante y llama a exportarComprobantePdf', async () => {
      const builder = crearQueryBuilder({ data: comprobanteEjemplo, error: null })
      supabase.from.mockReturnValue(builder)

      const spyExportar = vi.spyOn(comprobantePdfModule, 'exportarComprobantePdf').mockReturnValue(new Blob())

      const blob = await descargarComprobantePdf('comp-1', true)

      expect(spyExportar).toHaveBeenCalledWith({
        comprobante: comprobanteEjemplo,
        venta: comprobanteEjemplo.venta,
        guardar: true,
      })
      expect(blob).toBeInstanceOf(Blob)
    })

    it('lanza 404 si el comprobante no existe', async () => {
      const builder = crearQueryBuilder({ data: null, error: null })
      supabase.from.mockReturnValue(builder)

      await expect(descargarComprobantePdf('no-existe')).rejects.toMatchObject({
        status: 404,
        message: 'Comprobante no encontrado',
      })
    })
  })

  describe('puedeFacturarVentas y puedeAnularVentas', () => {
    it('puedeFacturarVentas consulta el permiso ventas.facturar', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })
      const res = await puedeFacturarVentas()
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: PERMISO_FACTURAR,
      })
      expect(res).toBe(true)
    })

    it('puedeAnularVentas consulta el permiso ventas.anular', async () => {
      supabase.rpc.mockResolvedValue({ data: false, error: null })
      const res = await puedeAnularVentas()
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: PERMISO_ANULAR,
      })
      expect(res).toBe(false)
    })
  })
})
