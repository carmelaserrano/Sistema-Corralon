import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PasarelaSimuladaPage from './PasarelaSimuladaPage'
import { obtenerPedido, resolverPagoSimulado } from '../api/checkoutApi'
const { vaciar } = vi.hoisted(() => ({ vaciar: vi.fn() }))
vi.mock('../api/checkoutApi', () => ({ obtenerPedido: vi.fn(), resolverPagoSimulado: vi.fn() }))
vi.mock('../context/CarritoContext', () => ({ useCarrito: () => ({ vaciar }) }))
const pedido = { id: 'p1', numero: 42, total: 2500, estado: 'Pendiente de pago', tipo_entrega: 'retiro' }
beforeEach(() => { vi.resetAllMocks(); obtenerPedido.mockResolvedValue(pedido); resolverPagoSimulado.mockResolvedValue({ ...pedido, estado: 'Pagado', pago_estado: 'approved' }) })
afterEach(cleanup)
it('muestra total autoritativo, procesa una sola vez, confirma y navega', async () => {
  const navegar = vi.fn()
  render(<PasarelaSimuladaPage pedidoId="p1" onNavigate={navegar} />)
  const pagar = await screen.findByRole('button', { name: 'Pagar' })
  expect(screen.getByText('$ 2.500,00')).toBeInTheDocument()
  fireEvent.click(pagar); fireEvent.click(pagar)
  expect(screen.getByText('Procesando pago...')).toBeInTheDocument()
  expect(resolverPagoSimulado).toHaveBeenCalledTimes(1)
  expect(resolverPagoSimulado).toHaveBeenCalledWith('p1', 'approved')
  await screen.findByText('Pago aprobado')
  expect(screen.getByText('#42')).toBeInTheDocument()
  expect(vaciar).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('Mis pedidos')); expect(navegar).toHaveBeenLastCalledWith('mis-pedidos')
  fireEvent.click(screen.getByText('Volver a la tienda')); expect(navegar).toHaveBeenLastCalledWith('catalogo')
})
it('permite reintentar un rechazo sin vaciar el carrito', async () => {
  resolverPagoSimulado.mockResolvedValue({ ...pedido, pago_estado: 'rejected' })
  render(<PasarelaSimuladaPage pedidoId="p1" />)
  fireEvent.click(await screen.findByText('Simular rechazo'))
  await screen.findByText(/Pago rechazado de forma simulada/)
  expect(vaciar).not.toHaveBeenCalled()
  expect(screen.getByText('Pagar')).toBeEnabled()
})
it('no muestra aprobación cuando falla la confirmación interna', async () => {
  resolverPagoSimulado.mockRejectedValue(new Error('El pedido venció'))
  render(<PasarelaSimuladaPage pedidoId="p1" />)
  fireEvent.click(await screen.findByText('Pagar'))
  await screen.findByText('El pedido venció')
  expect(screen.queryByText('Pago aprobado')).not.toBeInTheDocument()
})
it('mantiene aprobación aunque falle la sincronización visual del carrito', async () => {
  vaciar.mockRejectedValue(new Error('Sin conexión'))
  render(<PasarelaSimuladaPage pedidoId="p1" />)
  fireEvent.click(await screen.findByText('Pagar'))
  await screen.findByText('Pago aprobado')
  await waitFor(() => expect(vaciar).toHaveBeenCalled())
  expect(screen.queryByText('Pagar')).not.toBeInTheDocument()
})
