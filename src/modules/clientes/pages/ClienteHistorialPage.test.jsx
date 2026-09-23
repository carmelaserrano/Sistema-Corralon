import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClienteHistorialPage from './ClienteHistorialPage'
import {
  buscarClientes,
  getHistorialCliente,
  obtenerDetalleVenta,
} from '../api/historialClienteApi'

vi.mock('../api/historialClienteApi', () => ({
  buscarClientes: vi.fn(),
  getHistorialCliente: vi.fn(),
  obtenerDetalleVenta: vi.fn(),
}))

const cliente = {
  id: 'c1',
  numero: 12,
  tipo_persona: 'fisica',
  nombre: 'Ana',
  apellido: 'Pérez',
  tipo_documento: 'DNI',
  numero_documento: '30111222',
  telefono: '3874000000',
  email: 'ana@example.com',
  estado: 'Activo',
  tipo_cliente: {
    nombre: 'Mayorista',
    lista_precio: { nombre: 'Obra' },
  },
}

const historialVacio = {
  cliente,
  totalComprado: 1500,
  ventas: [],
  comprobantes: [],
  cobros: [],
  pedidosWeb: [],
}

async function seleccionarCliente() {
  const selector = await screen.findByLabelText('Cliente')
  await waitFor(() => expect(selector).toBeEnabled())
  fireEvent.change(selector, { target: { value: 'c1' } })
  await screen.findByRole('heading', { name: 'Pérez, Ana' })
}

describe('ClienteHistorialPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buscarClientes.mockResolvedValue([cliente])
    getHistorialCliente.mockResolvedValue(historialVacio)
    obtenerDetalleVenta.mockResolvedValue([])
  })

  afterEach(cleanup)

  it('invita a seleccionar un cliente en el estado inicial', () => {
    render(<ClienteHistorialPage />)

    expect(screen.getByRole('heading', { name: 'Historial de cliente' })).toBeInTheDocument()
    expect(screen.getByText(/consultar todas sus operaciones/)).toBeInTheDocument()
    expect(getHistorialCliente).not.toHaveBeenCalled()
  })

  it('muestra cabecera, tabs y el mensaje exacto de Acopios', async () => {
    render(<ClienteHistorialPage />)
    await seleccionarCliente()

    expect(screen.getByText('DNI 30111222')).toBeInTheDocument()
    expect(screen.getByText('Mayorista')).toBeInTheDocument()
    expect(screen.getByText('Obra')).toBeInTheDocument()
    expect(screen.getByText(/1\.500,00/)).toBeInTheDocument()

    for (const nombre of ['Ventas', 'Comprobantes', 'Cobros', 'Pedidos web', 'Acopios']) {
      expect(screen.getByRole('tab', { name: nombre })).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('tab', { name: 'Acopios' }))
    expect(screen.getByText('Módulo de Acopio pendiente (E04)')).toBeInTheDocument()
  })

  it('muestra un estado vacío propio en cada pestaña de movimientos', async () => {
    render(<ClienteHistorialPage />)
    await seleccionarCliente()

    expect(screen.getByText('No hay ventas en el período')).toBeInTheDocument()

    for (const [tab, mensaje] of [
      ['Comprobantes', 'No hay comprobantes en el período'],
      ['Cobros', 'No hay cobros en el período'],
      ['Pedidos web', 'No hay pedidos web en el período'],
    ]) {
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      expect(screen.getByText(mensaje)).toBeInTheDocument()
    }
  })

  it('aplica el mismo rango global al historial completo y permite limpiarlo', async () => {
    render(<ClienteHistorialPage />)
    await seleccionarCliente()

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar fechas' }))

    await waitFor(() => {
      expect(getHistorialCliente).toHaveBeenLastCalledWith('c1', {
        desde: '2026-09-01',
        hasta: '2026-09-10',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    await waitFor(() => {
      expect(getHistorialCliente).toHaveBeenLastCalledWith('c1', { desde: '', hasta: '' })
    })
    expect(screen.getByLabelText('Desde')).toHaveValue('')
    expect(screen.getByLabelText('Hasta')).toHaveValue('')
  })

  it('abre el modal de una venta y muestra artículo, cantidad y precios', async () => {
    getHistorialCliente.mockResolvedValue({
      ...historialVacio,
      ventas: [{
        id: 'v1',
        numero: 55,
        created_at: '2026-09-05T15:00:00Z',
        total: 300,
        estado: 'Pendiente',
      }],
    })
    obtenerDetalleVenta.mockResolvedValue([{
      id: 'd1',
      cantidad: 2,
      precio_unitario: 150,
      subtotal: 300,
      producto: { nombre: 'Cemento', sku: 'ART-000001' },
    }])
    render(<ClienteHistorialPage />)
    await seleccionarCliente()

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))

    const modal = await screen.findByRole('dialog')
    expect(within(modal).getByRole('heading', { name: 'Venta #55' })).toBeInTheDocument()
    expect(await within(modal).findByText(/Cemento/)).toBeInTheDocument()
    const fila = within(modal).getByText(/Cemento/).closest('tr')
    expect(within(fila).getByText('2')).toBeInTheDocument()
    expect(within(fila).getAllByText(/300,00/)).toHaveLength(1)

    fireEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
