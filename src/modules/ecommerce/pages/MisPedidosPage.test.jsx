import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MisPedidosPage from './MisPedidosPage'
import { listarMisPedidos, obtenerSeguimientoPedido } from '../api/pedidosWebApi'
import { descargarRemitoWebPdf } from '../pdf/remitoWebPdf'

const { cliente } = vi.hoisted(() => ({ cliente: { id: 'c1', nombre: 'Ana', numero_documento: '12345678' } }))
vi.mock('../context/ClienteWebContext', () => ({ useClienteWeb: () => ({ cliente, cargando: false }) }))
vi.mock('../context/CarritoContext', () => ({ useCarrito: () => ({ agregarVarios: vi.fn() }) }))
vi.mock('../api/pedidosWebApi', () => ({ listarMisPedidos: vi.fn(), obtenerSeguimientoPedido: vi.fn(), armarLineaDeTiempo: () => [] }))
vi.mock('../pdf/remitoWebPdf', async (original) => ({ ...await original(), descargarRemitoWebPdf: vi.fn() }))

const pedido = { id: 'p1', numero: 42, estado: 'Pagado', pagado_at: '2026-10-19T12:00:00Z', total: 2500, tipo_entrega: 'retiro' }
const items = [{ id: 'i1', cantidad: 2, precio_unitario: 1250, subtotal: 2500, producto: { id: 'prod1', nombre: 'Cemento' } }]
beforeEach(() => {
  vi.clearAllMocks()
  listarMisPedidos.mockResolvedValue([pedido])
  obtenerSeguimientoPedido.mockResolvedValue({ pedido, items, historial: [] })
})
afterEach(cleanup)

it('descarga el comprobante correcto desde la lista', async () => {
  render(<MisPedidosPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Descargar comprobante' }))
  await waitFor(() => expect(descargarRemitoWebPdf).toHaveBeenCalledWith({ pedido, items, cliente }))
  expect(obtenerSeguimientoPedido).toHaveBeenCalledWith('p1')
})

it.each(['mercado_pago', 'transferencia'])('recupera el medio %s desde Mis pedidos para descarga posterior', async (medio) => {
  const pagado = { ...pedido, referencia_pago: `mock:${medio}:p1` }
  listarMisPedidos.mockResolvedValue([pagado])
  obtenerSeguimientoPedido.mockResolvedValue({ pedido: pagado, items, historial: [] })
  render(<MisPedidosPage />)
  const nombre = medio === 'mercado_pago' ? 'Mercado Pago' : 'Transferencia bancaria'
  await screen.findByText(`Medio de pago: ${nombre}`)
  fireEvent.click(screen.getByRole('button', { name: 'Descargar comprobante' }))
  await waitFor(() => expect(descargarRemitoWebPdf).toHaveBeenCalledWith({ pedido: pagado, items, cliente }))
  fireEvent.click(screen.getByRole('button', { name: 'Ver seguimiento del pedido 42' }))
  await screen.findByText('Cemento')
  expect(screen.getAllByText(`Medio de pago: ${nombre}`).length).toBeGreaterThan(0)
})

it('permite descargar posteriormente desde el detalle con productos y total', async () => {
  render(<MisPedidosPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Ver seguimiento del pedido 42' }))
  await screen.findByText('Cemento')
  fireEvent.click(screen.getAllByRole('button', { name: 'Descargar comprobante' })[0])
  expect(descargarRemitoWebPdf).toHaveBeenCalledWith({ pedido, items, cliente })
})

it.each(['Pendiente de pago', 'Cancelado'])('oculta comprobantes de %s nunca pagado en lista y detalle', async (estado) => {
  const impago = { ...pedido, estado, pagado_at: null, pago_estado: 'rejected' }
  listarMisPedidos.mockResolvedValue([impago])
  obtenerSeguimientoPedido.mockResolvedValue({ pedido: impago, items, historial: [] })
  render(<MisPedidosPage />)
  const detalle = await screen.findByRole('button', { name: 'Ver seguimiento del pedido 42' })
  expect(screen.queryByRole('button', { name: 'Descargar comprobante' })).not.toBeInTheDocument()
  fireEvent.click(detalle)
  await screen.findByText('Cemento')
  expect(screen.queryByRole('button', { name: 'Descargar comprobante' })).not.toBeInTheDocument()
  expect(descargarRemitoWebPdf).not.toHaveBeenCalled()
})
