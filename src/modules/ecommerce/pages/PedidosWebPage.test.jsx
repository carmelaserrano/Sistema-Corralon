import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PedidosWebPage from './PedidosWebPage'
import {
  armarLineaDeTiempo,
  listarPedidosWeb,
  obtenerDetallePedidoBackoffice,
  puedeGestionarPedidos,
  siguientesEstados,
} from '../api/pedidosWebApi'

vi.mock('../api/pedidosWebApi', () => ({
  avanzarEstadoPedido: vi.fn(),
  armarLineaDeTiempo: vi.fn(),
  ESTADOS_PEDIDO: [
    'Pendiente de pago',
    'Pagado',
    'En preparación',
    'Listo para retirar',
    'Enviado',
    'Entregado',
    'Cancelado',
  ],
  listarMisPedidos: vi.fn(),
  listarPedidosWeb: vi.fn(),
  obtenerDetallePedidoBackoffice: vi.fn(),
  obtenerSeguimientoPedido: vi.fn(),
  puedeGestionarPedidos: vi.fn(),
  siguientesEstados: vi.fn(),
}))

const pedidoLista = {
  id: 'pedido-1',
  numero: 42,
  estado: 'Pagado',
  total: 2500,
  tipo_entrega: 'envio',
  created_at: '2026-09-30T14:30:00Z',
  cliente: {
    id: 'cliente-1',
    tipo_persona: 'fisica',
    nombre: 'Ana',
    apellido: 'Pérez',
    razon_social: null,
  },
}

const detalleEnvio = {
  pedido: {
    ...pedidoLista,
    cliente: {
      ...pedidoLista.cliente,
      tipo_documento: 'DNI',
      numero_documento: '30111222',
      telefono: '3874000000',
      email: 'ana@example.com',
    },
    domicilio: {
      id: 'domicilio-1',
      alias: 'Obra Tres Cerritos',
      calle: 'Av. Tavella',
      numero: '1200',
      localidad: 'Salta',
      provincia: 'Salta',
      codigo_postal: '4400',
      referencias: 'Portón verde',
    },
  },
  items: [{
    id: 'item-1',
    cantidad: 2,
    precio_unitario: 1250,
    subtotal: 2500,
    producto: { id: 'producto-1', nombre: 'Cemento', sku: 'CEM-001' },
  }],
  historial: [{
    id: 'historial-1',
    estado_anterior: 'Pendiente de pago',
    estado_nuevo: 'Pagado',
    motivo: null,
    created_at: '2026-09-30T14:35:00Z',
  }],
}

async function abrirDetalle() {
  render(<PedidosWebPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }))
  return screen.findByRole('dialog')
}

describe('PedidosWebPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarPedidosWeb.mockResolvedValue([pedidoLista])
    obtenerDetallePedidoBackoffice.mockResolvedValue(detalleEnvio)
    puedeGestionarPedidos.mockResolvedValue(false)
    siguientesEstados.mockReturnValue([])
    armarLineaDeTiempo.mockImplementation((pedido) => [{
      estado: pedido.estado,
      fecha: pedido.created_at,
      motivo: null,
      completado: true,
      actual: true,
    }])
  })

  afterEach(cleanup)

  it('muestra toda la información operativa de un pedido con envío', async () => {
    const modal = await abrirDetalle()

    await waitFor(() => expect(obtenerDetallePedidoBackoffice).toHaveBeenCalledWith('pedido-1'))
    expect(await within(modal).findByRole('heading', { name: 'Nº 42 — Pérez, Ana' })).toBeInTheDocument()
    expect(within(modal).getByText('pedido-1')).toBeInTheDocument()
    expect(within(modal).getByText('Documento: DNI 30111222')).toBeInTheDocument()
    expect(within(modal).getByText('Teléfono: 3874000000')).toBeInTheDocument()
    expect(within(modal).getByText('Email: ana@example.com')).toBeInTheDocument()
    expect(within(modal).getByRole('heading', { name: 'Domicilio de entrega' })).toBeInTheDocument()
    expect(within(modal).getByText('Av. Tavella 1200')).toBeInTheDocument()
    expect(within(modal).getByText(/Salta, Salta.*CP 4400/)).toBeInTheDocument()
    expect(within(modal).getByText('Referencias: Portón verde')).toBeInTheDocument()

    const filaArticulo = within(modal).getByText('Cemento').closest('tr')
    expect(filaArticulo).toHaveTextContent('CEM-001')
    expect(filaArticulo).toHaveTextContent('2')
    expect(filaArticulo).toHaveTextContent('1.250,00')
    expect(filaArticulo).toHaveTextContent('2.500,00')
    expect(within(modal).getByText('Pendiente de pago → Pagado')).toBeInTheDocument()
  })

  it('no muestra un domicilio para un pedido con retiro', async () => {
    listarPedidosWeb.mockResolvedValue([{ ...pedidoLista, tipo_entrega: 'retiro' }])
    obtenerDetallePedidoBackoffice.mockResolvedValue({
      ...detalleEnvio,
      pedido: {
        ...detalleEnvio.pedido,
        tipo_entrega: 'retiro',
        domicilio: {
          ...detalleEnvio.pedido.domicilio,
          calle: 'Dirección que no debe mostrarse',
        },
      },
    })

    const modal = await abrirDetalle()
    await within(modal).findByText('Documento: DNI 30111222')

    expect(within(modal).getAllByText('Retiro').length).toBeGreaterThan(0)
    expect(within(modal).queryByRole('heading', { name: 'Domicilio de entrega' })).not.toBeInTheDocument()
    expect(within(modal).queryByText(/Dirección que no debe mostrarse/)).not.toBeInTheDocument()
  })
})
