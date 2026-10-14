import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PasarelaSimuladaPage from './PasarelaSimuladaPage'
import { formatearNumeroTarjeta, formatearVencimiento, validarTarjeta } from '../pagoSimulado'
import { obtenerPedido, resolverPagoSimulado } from '../api/checkoutApi'
const { vaciar } = vi.hoisted(() => ({ vaciar: vi.fn() }))
vi.mock('../api/checkoutApi', () => ({ obtenerPedido: vi.fn(), resolverPagoSimulado: vi.fn() }))
vi.mock('../context/CarritoContext', () => ({ useCarrito: () => ({ vaciar }) }))
const pedido = { id: 'p1', numero: 42, total: 2500, estado: 'Pendiente de pago', tipo_entrega: 'retiro' }
beforeEach(() => { vi.resetAllMocks(); obtenerPedido.mockResolvedValue(pedido); resolverPagoSimulado.mockResolvedValue({ ...pedido, estado: 'Pagado', pago_estado: 'approved' }) })
afterEach(cleanup)

async function completarTarjeta({ numero = '4242424242424242', titular = 'Ana Pérez', vencimiento = '1230', cvv = '123' } = {}) {
  fireEvent.change(await screen.findByLabelText('Número de tarjeta'), { target: { value: numero } })
  fireEvent.change(screen.getByLabelText('Nombre del titular'), { target: { value: titular } })
  fireEvent.change(screen.getByLabelText('Vencimiento'), { target: { value: vencimiento } })
  fireEvent.change(screen.getByLabelText('Código de seguridad'), { target: { value: cvv } })
}
const botonPagar = () => screen.getByRole('button', { name: /Pagar/ })

it('muestra total autoritativo, procesa una sola vez, confirma y navega', async () => {
  const navegar = vi.fn()
  render(<PasarelaSimuladaPage pedidoId="p1" onNavigate={navegar} />)
  await completarTarjeta()
  expect(screen.getAllByText('$ 2.500,00').length).toBeGreaterThan(0)
  const pagar = botonPagar()
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

it('la tarjeta 0000 0000 0000 0000 se rechaza y permite reintentar sin vaciar el carrito', async () => {
  resolverPagoSimulado.mockResolvedValue({ ...pedido, pago_estado: 'rejected' })
  render(<PasarelaSimuladaPage pedidoId="p1" />)
  await completarTarjeta({ numero: '0000000000000000' })
  fireEvent.click(botonPagar())
  expect(resolverPagoSimulado).toHaveBeenCalledWith('p1', 'rejected')
  await screen.findByText(/Pago rechazado. Podés volver a intentar/)
  expect(vaciar).not.toHaveBeenCalled()
  expect(botonPagar()).toBeEnabled()
  // Se conserva la tarjeta pero se vuelve a pedir el código de seguridad.
  expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('0000 0000 0000 0000')
  expect(screen.getByLabelText('Código de seguridad')).toHaveValue('')
})

it('no envía el pago si faltan datos de la tarjeta', async () => {
  render(<PasarelaSimuladaPage pedidoId="p1" />)
  await screen.findByLabelText('Número de tarjeta')
  fireEvent.click(botonPagar())
  expect(screen.getByText('Ingresá los 16 dígitos de la tarjeta')).toBeInTheDocument()
  expect(screen.getByText('Ingresá el nombre como figura en la tarjeta')).toBeInTheDocument()
  expect(screen.getByText('Usá el formato MM/AA')).toBeInTheDocument()
  expect(screen.getByText('El código tiene 3 o 4 dígitos')).toBeInTheDocument()
  expect(resolverPagoSimulado).not.toHaveBeenCalled()
})

it('agrupa el número de a cuatro dígitos mientras se escribe', async () => {
  render(<PasarelaSimuladaPage pedidoId="p1" />)
  const numero = await screen.findByLabelText('Número de tarjeta')
  fireEvent.change(numero, { target: { value: '4242abc42424242 42424242' } })
  expect(numero).toHaveValue('4242 4242 4242 4242')
})

it('no muestra aprobación cuando falla la confirmación interna', async () => {
  resolverPagoSimulado.mockRejectedValue(new Error('El pedido venció'))
  render(<PasarelaSimuladaPage pedidoId="p1" />)
  await completarTarjeta()
  fireEvent.click(botonPagar())
  await screen.findByText('El pedido venció')
  expect(screen.queryByText('Pago aprobado')).not.toBeInTheDocument()
})

it('mantiene aprobación aunque falle la sincronización visual del carrito', async () => {
  vaciar.mockRejectedValue(new Error('Sin conexión'))
  render(<PasarelaSimuladaPage pedidoId="p1" />)
  await completarTarjeta()
  fireEvent.click(botonPagar())
  await screen.findByText('Pago aprobado')
  await waitFor(() => expect(vaciar).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: /Pagar/ })).not.toBeInTheDocument()
})

describe('validación de la tarjeta', () => {
  const hoy = new Date(2026, 9, 14)
  const valida = { numero: '4242 4242 4242 4242', titular: 'Ana Pérez', vencimiento: '12/30', cvv: '123' }

  it('acepta una tarjeta completa y vigente', () => {
    expect(validarTarjeta(valida, hoy)).toEqual({})
  })

  it('rechaza una tarjeta vencida y vale hasta el último día del mes', () => {
    expect(validarTarjeta({ ...valida, vencimiento: '09/26' }, hoy).vencimiento).toBe('La tarjeta está vencida')
    expect(validarTarjeta({ ...valida, vencimiento: '10/26' }, hoy)).toEqual({})
  })

  it('rechaza un mes inexistente', () => {
    expect(validarTarjeta({ ...valida, vencimiento: '13/30' }, hoy).vencimiento).toBe('Usá el formato MM/AA')
  })

  it('formatea número y vencimiento', () => {
    expect(formatearNumeroTarjeta('42424242424242429999')).toBe('4242 4242 4242 4242')
    expect(formatearVencimiento('1230')).toBe('12/30')
    expect(formatearVencimiento('1')).toBe('1')
  })
})
