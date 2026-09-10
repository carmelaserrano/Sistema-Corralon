import '@testing-library/jest-dom'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import OrdenesCompraPage from './OrdenesCompraPage'
import * as api from '../api/ordenesCompraApi'
import { getProveedores } from '../../proveedores/api/proveedoresApi'

vi.mock('../api/ordenesCompraApi', () => ({
  getHistorialOC: vi.fn(), getDetalleHistorialOC: vi.fn(),
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
  api.getHistorialOC.mockResolvedValue({ ordenes: [orden], totalPaginas: 2, total: 21, importeTotal: 900 })
  api.puedeCrearOrdenes.mockResolvedValue(false)
  api.puedeCancelarOrdenes.mockResolvedValue(false)
})

it('combina proveedor, fechas, estado y orden; limpiar elimina los filtros', async () => {
  getProveedores.mockResolvedValue([{ id: 'p1', razon_social: 'Proveedor histórico' }])
  render(<OrdenesCompraPage />)
  await screen.findByText('Proveedor histórico')
  fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: 'p1' } })
  fireEvent.change(screen.getByLabelText('Creada desde'), { target: { value: '2026-09-01' } })
  fireEvent.change(screen.getByLabelText('Creada hasta'), { target: { value: '2026-09-10' } })
  fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'recibida' } })
  fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'total' } })
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'true' } })
  await waitFor(() => expect(api.getHistorialOC).toHaveBeenLastCalledWith({ proveedorId: 'p1', fechaDesde: '2026-09-01', fechaHasta: '2026-09-10', estado: 'recibida', orden: 'total', ascendente: true, page: 1 }))
  fireEvent.click(screen.getByText('Limpiar filtros'))
  await waitFor(() => expect(api.getHistorialOC).toHaveBeenLastCalledWith(expect.objectContaining({ proveedorId: '', fechaDesde: '', fechaHasta: '', estado: '', page: 1 })))
})

it('muestra el total global y abre recepciones, facturas y notas desde la fila', async () => {
  const nota = { letra: 'A', sucursal: '0001', numero: '00000002', fecha: '2026-09-10', importe: 20, estado: 'aplicada' }
  api.getDetalleHistorialOC.mockResolvedValue({ ...orden, detalles: [], recepciones: [{ id: 'r1', numero: 45, estado_recepcion: 'confirmada' }], facturas: [{ id: 'f1', letra: 'A', sucursal: '0001', numero: '00000001', estado: 'pendiente', importe_total: 100, imputaciones: [
    { id: 'i1', importe_imputado: 10, nota: { ...nota, tipo: 'CREDITO' } },
    { id: 'i2', importe_imputado: 20, nota: { ...nota, tipo: 'DEBITO' } },
  ] }] })
  render(<OrdenesCompraPage />)
  expect(await screen.findByText(/21 registros/)).toHaveTextContent('excluye canceladas')
  expect(screen.getByText(/21 registros/)).toHaveTextContent('900,00')
  fireEvent.click(screen.getByText('#1'))
  expect(await screen.findByText('#45')).toBeInTheDocument()
  expect(screen.getByText('Factura A 0001-00000001')).toBeInTheDocument()
  expect(screen.getByText('Nota de Crédito')).toBeInTheDocument()
  expect(screen.getByText('Nota de Débito')).toBeInTheDocument()
})

it('muestra los cuatro estados con indicadores distintos', async () => {
  api.getHistorialOC.mockResolvedValue({ ordenes: ['pendiente', 'parcialmente_recibida', 'recibida', 'cancelada'].map((estado, id) => ({ ...orden, id, estado })), totalPaginas: 1 })
  render(<OrdenesCompraPage />)
  const tabla = await screen.findByRole('table')
  const badges = ['Pendiente', 'Parcial', 'Recibida', 'Cancelada'].map(label => within(tabla).getByText(label))
  expect(new Set(badges.map(b => b.className)).size).toBe(4)
})

it('consulta el filtro en servidor y vuelve a la primera página', async () => {
  render(<OrdenesCompraPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Siguiente' }))
  await waitFor(() => expect(api.getHistorialOC).toHaveBeenLastCalledWith(expect.objectContaining({ estado: '', page: 2 })))
  fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'recibida' } })
  await waitFor(() => expect(api.getHistorialOC).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'recibida', page: 1 })))
})

it('muestra error, permite reintentar y diferencia el resultado vacío', async () => {
  api.getHistorialOC.mockRejectedValueOnce(new Error('Sin conexión'))
  render(<OrdenesCompraPage />)
  expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
  expect(screen.queryByText('No hay órdenes de compra')).not.toBeInTheDocument()
  api.getHistorialOC.mockResolvedValue({ ordenes: [], totalPaginas: 1 })
  fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'cancelada' } })
  expect(await screen.findByText('No hay órdenes que coincidan con los filtros aplicados.')).toBeInTheDocument()
  expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument()
})

it('muestra cantidades por renglón y refresca el listado al volver del detalle', async () => {
  api.getDetalleHistorialOC.mockResolvedValue({ ...orden, detalles: [{ id: 'd1', cantidad: 10, cantidad_recibida: 4, precio_unitario: 10, subtotal: 100, producto: { nombre: 'Cemento' } }] })
  render(<OrdenesCompraPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }))
  const row = (await screen.findByText('Cemento')).closest('tr')
  expect(within(row).getAllByRole('cell').slice(2, 5).map(c => c.textContent)).toEqual(['10', '4', '6'])
  api.getHistorialOC.mockResolvedValue({ ordenes: [{ ...orden, estado: 'recibida' }], totalPaginas: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
  await waitFor(() => expect(within(screen.getByRole('table')).getByText('Recibida')).toBeInTheDocument())
})
