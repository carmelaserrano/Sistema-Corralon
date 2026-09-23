import { beforeEach, describe, expect, it, vi } from 'vitest'

// jsPDF falso: registra lo que se imprime para poder verificar el CONTENIDO
// del comprobante (textos, fechas), no solo que "se generó algo". El resto de
// comprobantePdf.test.js usa la librería real.
const { impresos, guardados } = vi.hoisted(() => ({ impresos: [], guardados: [] }))

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor() {
      this.save = (nombre) => guardados.push(nombre)
    }
    setLineWidth() {}
    setDrawColor() {}
    setFillColor() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    rect() {}
    line() {}
    addPage() {}
    text(valor) {
      impresos.push(String(valor))
    }
    // Simula el corte por ancho: líneas de a 40 caracteres.
    splitTextToSize(texto) {
      const lineas = []
      for (let i = 0; i < texto.length; i += 40) lineas.push(texto.slice(i, i + 40))
      return lineas.length > 0 ? lineas : ['']
    }
    output() {
      return new Blob(['pdf'])
    }
  },
}))

const { exportarComprobantePdf, generarComprobantePdf } = await import('./comprobantePdf')

const venta = {
  total: 500,
  cliente: {
    tipo_persona: 'juridica',
    razon_social: 'Constructora Andes SRL',
    tipo_documento: 'CUIT',
    numero_documento: '20123456786',
    condicion_iva: { nombre: 'Responsable Inscripto' },
  },
  detalle_venta: [
    {
      cantidad: 2,
      precio_unitario: 100,
      descuento_pct: 0,
      subtotal: 200,
      producto: { sku: 'CEM001', nombre: 'Cemento Portland' },
    },
  ],
}

const comprobante = {
  tipo_comprobante: 'factura',
  letra: 'A',
  numero: 5,
  neto: 413.22,
  iva: 86.78,
  total: 500,
  cae: 'HOMOLOGACIÓN',
  cae_vencimiento: '2026-10-03',
  fecha_emision: '2026-09-23T15:30:00-03:00',
  punto_venta: { numero: '0001' },
}

describe('comprobantePdf: contenido impreso', () => {
  beforeEach(() => {
    impresos.length = 0
    guardados.length = 0
    vi.unstubAllEnvs()
  })

  describe('vencimiento del CAE', () => {
    it('imprime el día guardado, sin correrlo un día atrás', () => {
      generarComprobantePdf({ comprobante, venta })

      // Guardado 2026-10-03: antes salía 2/10/2026 (medianoche UTC = día anterior en UTC-3).
      expect(impresos).toContain('Fecha de Vto. de CAE: 3/10/2026')
    })

    it('no se corre de día en la zona horaria de Argentina', () => {
      vi.stubEnv('TZ', 'America/Argentina/Salta')

      generarComprobantePdf({ comprobante, venta })

      expect(impresos).toContain('Fecha de Vto. de CAE: 3/10/2026')
    })

    it('tampoco se corre en zonas horarias al este de UTC', () => {
      vi.stubEnv('TZ', 'Asia/Tokyo')

      generarComprobantePdf({ comprobante: { ...comprobante, cae_vencimiento: '2026-10-01' }, venta })

      expect(impresos).toContain('Fecha de Vto. de CAE: 1/10/2026')
    })

    it('sin vencimiento cargado muestra un guion, no la fecha de hoy', () => {
      generarComprobantePdf({ comprobante: { ...comprobante, cae_vencimiento: null }, venta })

      expect(impresos).toContain('Fecha de Vto. de CAE: —')
    })
  })

  describe('renglones de artículos', () => {
    it('muestra el SKU del producto como código', () => {
      generarComprobantePdf({ comprobante, venta })

      expect(impresos).toContain('[CEM001] Cemento Portland')
    })

    it('un nombre largo se corta con "…" y no a mitad de un límite fijo de caracteres', () => {
      const largo = {
        ...venta,
        detalle_venta: [
          { ...venta.detalle_venta[0], producto: { sku: 'X', nombre: 'Cemento Portland de alta resistencia inicial x 50 kilos' } },
        ],
      }

      generarComprobantePdf({ comprobante, venta: largo })

      const renglon = impresos.find((t) => t.startsWith('[X] Cemento'))
      expect(renglon.endsWith('…')).toBe(true)
    })

    it('un nombre corto se imprime completo, sin "…"', () => {
      generarComprobantePdf({ comprobante, venta })

      expect(impresos.some((t) => t.endsWith('…'))).toBe(false)
    })
  })

  describe('datos del cliente', () => {
    it('el documento aparece una sola vez rotulado (no "Doc / CUIT: CUIT: …")', () => {
      generarComprobantePdf({ comprobante, venta })

      expect(impresos).toContain('Documento:')
      expect(impresos).toContain('CUIT: 20123456786')
      expect(impresos).not.toContain('Doc / CUIT:')
    })
  })

  describe('exportarComprobantePdf: guardado', () => {
    it('con guardar=true descarga el archivo con el nombre del comprobante', () => {
      exportarComprobantePdf({ comprobante, venta, guardar: true })

      expect(guardados).toEqual(['factura_A_5.pdf'])
    })

    it('con guardar=false solo devuelve el Blob, sin descargar', () => {
      const blob = exportarComprobantePdf({ comprobante, venta, guardar: false })

      expect(blob).toBeInstanceOf(Blob)
      expect(guardados).toEqual([])
    })
  })
})
