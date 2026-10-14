import { describe, expect, it } from 'vitest'
import {
  EMISOR_CORRALON,
  generarRemitoWebPdf,
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
      pedido: { id: 'ped-2', numero: 1, total: 0 },
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
