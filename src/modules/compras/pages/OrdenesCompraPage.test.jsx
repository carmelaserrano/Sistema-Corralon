import '@testing-library/jest-dom'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import OrdenesCompraPage from './OrdenesCompraPage'
import * as api from '../api/ordenesCompraApi'

vi.mock('../api/ordenesCompraApi', () => ({
  getOrdenesCompra: vi.fn(), getOrdenCompraById: vi.fn(),
  puedeCrearOrdenes: vi.fn(), puedeCancelarOrdenes: vi.fn(),
  createOrdenCompra: vi.fn(), cancelarOrdenCompra: vi.fn(),
}))
vi.mock('../../proveedores/api/proveedoresApi', () => ({ getProveedores: vi.fn().mockResolvedValue([]), CONDICIONES_PAGO: [] }))
vi.mock('../../stock/api/depositosApi', () => ({ getDepositos: vi.fn().mockResolvedValue([]) }))
vi.mock('../../stock/api/articulosApi', () => ({ getArticulos: vi.fn().mockResolvedValue({ articulos: [] }) }))
const orden = { id: 'oc1', numero: 1, estado: 'parcialmente_recibida', total: 100 }
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  api.getOrdenesCompra.mockResolvedValue({ ordenes: [orden], totalPaginas: 2 })
  api.puedeCrearOrdenes.mockResolvedValue(false)
  api.puedeCancelarOrdenes.mockResolvedValue(false)
})

it('muestra los cuatro estados con indicadores distintos', async () => {
  api.getOrdenesCompra.mockResolvedValue({ ordenes: ['pendiente', 'parcialmente_recibida', 'recibida', 'cancelada'].map((estado, id) => ({ ...orden, id, estado })), totalPaginas: 1 })
  render(<OrdenesCompraPage />)
  const tabla = await screen.findByRole('table')
  const badges = ['Pendiente', 'Parcial', 'Recibida', 'Cancelada'].map(label => within(tabla).getByText(label))
  expect(new Set(badges.map(b => b.className)).size).toBe(4)
})

it('consulta el filtro en servidor y vuelve a la primera página', async () => {
  render(<OrdenesCompraPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Siguiente' }))
  await waitFor(() => expect(api.getOrdenesCompra).toHaveBeenLastCalledWith({ estado: '', page: 2 }))
  fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'recibida' } })
  await waitFor(() => expect(api.getOrdenesCompra).toHaveBeenLastCalledWith({ estado: 'recibida', page: 1 }))
})

it('muestra error, permite reintentar y diferencia el resultado vacío', async () => {
  api.getOrdenesCompra.mockRejectedValueOnce(new Error('Sin conexión'))
  render(<OrdenesCompraPage />)
  expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
  expect(screen.queryByText('No hay órdenes de compra')).not.toBeInTheDocument()
  api.getOrdenesCompra.mockResolvedValue({ ordenes: [], totalPaginas: 1 })
  fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'cancelada' } })
  expect(await screen.findByText('No hay órdenes con el estado seleccionado.')).toBeInTheDocument()
  expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument()
})

it('muestra cantidades por renglón y refresca el listado al volver del detalle', async () => {
  api.getOrdenCompraById.mockResolvedValue({ ...orden, detalles: [{ id: 'd1', cantidad: 10, cantidad_recibida: 4, precio_unitario: 10, subtotal: 100, producto: { nombre: 'Cemento' } }] })
  render(<OrdenesCompraPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }))
  const row = (await screen.findByText('Cemento')).closest('tr')
  expect(within(row).getAllByRole('cell').slice(2, 5).map(c => c.textContent)).toEqual(['10', '4', '6'])
  api.getOrdenesCompra.mockResolvedValue({ ordenes: [{ ...orden, estado: 'recibida' }], totalPaginas: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
  await waitFor(() => expect(within(screen.getByRole('table')).getByText('Recibida')).toBeInTheDocument())
})
