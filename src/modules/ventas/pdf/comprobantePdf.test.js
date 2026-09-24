import { describe, it, expect } from 'vitest'
import { generarComprobantePdf, exportarComprobantePdf, EMISOR_DEFAULT } from './comprobantePdf'

const ventaFacturaA = {
  id: 'v-1',
  numero: 42,
  total: 12100,
  cliente: {
    id: 'c-1',
    tipo_persona: 'juridica',
    razon_social: 'Constructora Andes SRL',
    tipo_documento: 'CUIT',
    numero_documento: '30123456789',
    condicion_iva: { nombre: 'Responsable Inscripto' },
    domicilios: [{ calle: 'Av. Libertador', numero: '500', localidad: 'Salta' }],
  },
  detalle_venta: [
    {
      id: 'dv-1',
      cantidad: 10,
      precio_unitario: 1000,
      descuento_pct: 0,
      subtotal: 10000,
      producto: { sku: 'C01', nombre: 'Bolsa de Cemento Loma Negra 50kg' },
    },
    {
      id: 'dv-2',
      cantidad: 2,
      precio_unitario: 1050,
      descuento_pct: 0,
      subtotal: 2100,
      producto: { sku: 'A02', nombre: 'Arena fina m3' },
    },
  ],
}

const comprobanteFacturaA = {
  id: 'comp-1',
  tipo_comprobante: 'factura',
  letra: 'A',
  numero: 1,
  neto: 10000,
  iva: 2100,
  total: 12100,
  cae: 'HOMOLOGACIÓN',
  cae_vencimiento: '2026-10-05',
  punto_venta: { numero: '0001', nombre: 'Casa Central' },
  fecha_emision: '2026-09-23T15:00:00Z',
}

const ventaFacturaB = {
  id: 'v-2',
  numero: 43,
  total: 2420,
  cliente: {
    id: 'c-2',
    tipo_persona: 'fisica',
    nombre: 'Juan',
    apellido: 'Pérez',
    tipo_documento: 'DNI',
    numero_documento: '30111222',
    condicion_iva: { nombre: 'Consumidor Final' },
  },
  detalle_venta: [
    {
      id: 'dv-3',
      cantidad: 2,
      precio_unitario: 1210,
      descuento_pct: 0,
      subtotal: 2420,
      producto: { sku: 'P01', nombre: 'Pintura Látex 4L' },
    },
  ],
}

const comprobanteFacturaB = {
  id: 'comp-2',
  tipo_comprobante: 'factura',
  letra: 'B',
  numero: 2,
  neto: 2000,
  iva: 420,
  total: 2420,
  cae: 'HOMOLOGACIÓN',
  cae_vencimiento: '2026-10-05',
  punto_venta: { numero: '0001', nombre: 'Casa Central' },
  fecha_emision: '2026-09-23T15:30:00Z',
}

describe('comprobantePdf (CA-04)', () => {
  describe('generarComprobantePdf', () => {
    it('genera un documento jsPDF para Factura A con cliente Responsable Inscripto', () => {
      const doc = generarComprobantePdf({
        comprobante: comprobanteFacturaA,
        venta: ventaFacturaA,
      })

      expect(doc).toBeDefined()
      expect(typeof doc.output).toBe('function')
    })

    it('genera un documento jsPDF para Factura B con cliente Consumidor Final', () => {
      const doc = generarComprobantePdf({
        comprobante: comprobanteFacturaB,
        venta: ventaFacturaB,
      })

      expect(doc).toBeDefined()
      expect(typeof doc.output).toBe('function')
    })

    it('soporta generación de Nota de Crédito', () => {
      const doc = generarComprobantePdf({
        comprobante: {
          ...comprobanteFacturaB,
          tipo_comprobante: 'nota_credito',
          numero: 1,
        },
        venta: ventaFacturaB,
      })

      expect(doc).toBeDefined()
    })

    it('maneja venta sin artículos registrados sin romper la generación', () => {
      const doc = generarComprobantePdf({
        comprobante: comprobanteFacturaB,
        venta: { ...ventaFacturaB, detalle_venta: [] },
      })

      expect(doc).toBeDefined()
    })

    it('respeta datos personalizados del emisor', () => {
      const emisorCustom = {
        ...EMISOR_DEFAULT,
        razonSocial: 'Corralón Sucursal Norte S.A.',
      }

      const doc = generarComprobantePdf({
        comprobante: comprobanteFacturaA,
        venta: ventaFacturaA,
        emisor: emisorCustom,
      })

      expect(doc).toBeDefined()
    })
  })

  describe('exportarComprobantePdf', () => {
    it('devuelve un Blob del archivo PDF generado', () => {
      const blob = exportarComprobantePdf({
        comprobante: comprobanteFacturaA,
        venta: ventaFacturaA,
        guardar: false,
      })

      expect(blob).toBeInstanceOf(Blob)
    })

    // El guardado (doc.save) se prueba en comprobantePdf.contenido.test.js con
    // un jsPDF falso: `save` es una propiedad de cada instancia y no se puede
    // espiar sobre la librería real.
  })
})
