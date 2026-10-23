import { describe, expect, it } from 'vitest'
import {
  EMISOR_CORRALON,
  generarRemitoWebPdf,
  tieneComprobanteCompra,
} from './remitoWebPdf'
import { DATOS_COMERCIALES } from '../datosComerciales'

const pedidoEjemplo = {
  id: 'ped-1',
  numero: 105,
  estado: 'Pagado',
  total: 45000,
  tipo_entrega: 'envio',
  created_at: '2026-09-27T10:30:00Z',
  domicilio: {
    calle: 'Av. Reyes Católicos',
    numero: '1230',
    localidad: 'Salta Capital',
    provincia: 'Salta',
    referencias: 'Dejar sobre vereda, portón negro',
  },
}

const itemsEjemplo = [
  {
    id: 'it-1',
    cantidad: 15,
    precio_unitario: 2000,
    subtotal: 30000,
    producto: { id: 'p1', sku: 'CEM-01', nombre: 'Cemento Portland 50kg' },
  },
  {
    id: 'it-2',
    cantidad: 5,
    precio_unitario: 3000,
    subtotal: 15000,
    producto: { id: 'p2', sku: 'CAL-02', nombre: 'Cal Hidráulica Milagro 25kg' },
  },
]

const clienteEjemplo = {
  id: 'cli-1',
  nombre: 'Juan',
  apellido: 'Gómez',
  tipo_documento: 'DNI',
  numero_documento: '32123456',
  telefono: '3874112233',
  email: 'juangomez@ejemplo.com',
}

describe('remitoWebPdf', () => {
  it.each([
    ['mock:ped-1', 'Tarjeta'],
    ['mock:tarjeta:ped-1', 'Tarjeta'],
    ['mock:mercado_pago:ped-1', 'Mercado Pago'],
    ['mock:transferencia:ped-1', 'Transferencia bancaria'],
    ['externa-123', 'No informado'],
  ])('incluye el medio persistido de %s al descargar después', (referencia_pago, nombre) => {
    const salida = generarRemitoWebPdf({ pedido: { ...pedidoEjemplo, referencia_pago } }).output()
    expect(salida).toContain(`Medio de pago: ${nombre}`)
    expect(salida).not.toContain('pago simulado')
  })
  it('usa pagado_at, pedido, cliente, productos, cantidades, precios y total pagado', () => {
    const pedido = { ...pedidoEjemplo, pagado_at: '2026-10-19T15:45:00Z', referencia_pago: 'mock:ped-1' }
    const salida = generarRemitoWebPdf({ pedido, items: itemsEjemplo, cliente: clienteEjemplo }).output()
    for (const texto of ['COMPROBANTE DE COMPRA WEB', '000105', '19/10/26, 12:45', '32123456', 'Cemento Portland 50kg', '(15)', '2.000,00', '30.000,00', '45.000,00', 'TOTAL PAGADO', 'Aprobado', 'mock:ped-1']) {
      expect(salida).toContain(texto)
    }
    expect(salida).not.toContain('CONFORMIDAD DE RECEPCI')
  })

  it('usa el nombre y SKU guardados en el detalle cuando el cliente web no puede leer productos', () => {
    // Para el cliente web, RLS deja el join producto:productos en null (0075).
    const items = [{ id: 'it-1', cantidad: 1, precio_unitario: 560, subtotal: 560, producto: null,
      producto_nombre: 'Ladrillo cerámico hueco 8x18x33 (4 tubos)', producto_sku: 'COR-LAD-001' }]
    const salida = generarRemitoWebPdf({ pedido: pedidoEjemplo, items }).output()
    expect(salida).toContain('[COR-LAD-001] Ladrillo cer')
    expect(salida).not.toContain('Material de construcci')
  })

  it.each(['Pendiente de pago', 'Cancelado'])('rechaza generar PDF para %s sin pago', (estado) => {
    const pedido = { ...pedidoEjemplo, estado, pago_estado: 'rejected' }
    expect(tieneComprobanteCompra(pedido)).toBe(false)
    expect(() => generarRemitoWebPdf({ pedido })).toThrow('El pedido no tiene un pago aprobado')
  })

  it('conserva comprobante cuando un pedido pagado avanza o se cancela después', () => {
    expect(tieneComprobanteCompra({ estado: 'En preparación' })).toBe(true)
    expect(tieneComprobanteCompra({ estado: 'Cancelado', pagado_at: '2026-10-19T15:45:00Z' })).toBe(true)
  })
  it('usa la marca Corralón Norte e incluye el logo en el PDF', () => {
    const doc = generarRemitoWebPdf({
      pedido: pedidoEjemplo,
      items: itemsEjemplo,
      cliente: clienteEjemplo,
    })

    expect(EMISOR_CORRALON.razonSocial).toBe('Corralón Norte')
    expect(doc.output()).toContain('/Subtype /Image')
  })

  it('usa los datos comerciales unificados de la tienda', () => {
    expect(EMISOR_CORRALON.domicilio).toBe('Caseros 850, Salta Capital, Salta')
    expect(EMISOR_CORRALON.telefono).toContain(DATOS_COMERCIALES.telefono)
    expect(EMISOR_CORRALON.email).toBe(DATOS_COMERCIALES.email)
  })

  it('genera un documento jsPDF con datos completos de envío', () => {
    const doc = generarRemitoWebPdf({
      pedido: pedidoEjemplo,
      items: itemsEjemplo,
      cliente: clienteEjemplo,
    })

    expect(doc).toBeDefined()
    expect(typeof doc.save).toBe('function')
  })

  it('genera un documento jsPDF para pedido con retiro en sucursal', () => {
    const doc = generarRemitoWebPdf({
      pedido: {
        ...pedidoEjemplo,
        tipo_entrega: 'retiro',
        domicilio: null,
      },
      items: itemsEjemplo,
      cliente: clienteEjemplo,
    })

    expect(doc).toBeDefined()
  })

  it('soporta pedidos sin artículos o con cliente vacío sin fallar', () => {
    const doc = generarRemitoWebPdf({
      pedido: { id: 'ped-2', numero: 1, total: 0, estado: 'Pagado' },
      items: [],
      cliente: {},
    })

    expect(doc).toBeDefined()
  })

  it('permite sobrescribir el emisor comercial', () => {
    const doc = generarRemitoWebPdf({
      pedido: pedidoEjemplo,
      items: itemsEjemplo,
      cliente: clienteEjemplo,
      emisor: {
        ...EMISOR_CORRALON,
        razonSocial: 'Corralón Sucursal San Lorenzo',
      },
    })

    expect(doc).toBeDefined()
  })
})
