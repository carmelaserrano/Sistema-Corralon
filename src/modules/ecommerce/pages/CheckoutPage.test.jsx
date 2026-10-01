import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CheckoutPage from './CheckoutPage'
import { useCarrito } from '../context/CarritoContext'
import { useClienteWeb } from '../context/ClienteWebContext'
import { crearPedidoWeb } from '../api/checkoutApi'
import { listarDomicilios } from '../../clientes/api/domiciliosApi'

vi.mock('../context/CarritoContext', () => ({ useCarrito: vi.fn() }))
vi.mock('../context/ClienteWebContext', () => ({ useClienteWeb: vi.fn() }))
vi.mock('../api/checkoutApi', () => ({
  crearPedidoWeb: vi.fn(),
  iniciarPago: vi.fn(),
}))
vi.mock('../../clientes/api/domiciliosApi', () => ({
  actualizarDomicilio: vi.fn(),
  crearDomicilio: vi.fn(),
  listarDomicilios: vi.fn(),
}))
vi.mock('./CatalogoPage', () => ({
  ImagenProducto: ({ nombre }) => <span>{nombre}</span>,
}))

const item = {
  productoId: 'producto-1',
  nombre: 'Cemento',
  cantidad: 2,
  precioUnitario: 1250,
  subtotal: 2500,
  imagenUrl: null,
}

const domicilio = {
  id: 'domicilio-1',
  alias: 'Obra Centro',
  calle: 'Caseros',
  numero: '850',
  localidad: 'Salta Capital',
  provincia: 'Salta',
  codigo_postal: '4400',
  referencias: '',
  es_principal: true,
}

describe('CheckoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_PAGO_SIMULADO', 'true')
    useClienteWeb.mockReturnValue({ cliente: { id: 'cliente-1' } })
    useCarrito.mockReturnValue({ items: [item], total: 2500 })
    listarDomicilios.mockResolvedValue([domicilio])
    crearPedidoWeb.mockResolvedValue({ id: 'pedido-1' })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  it('crea un pedido con retiro sin exigir domicilio', async () => {
    const onPasarelaSimulada = vi.fn()
    render(<CheckoutPage onPasarelaSimulada={onPasarelaSimulada} onVolverCarrito={vi.fn()} />)

    expect(screen.getByRole('radio', { name: /Retiro en sucursal/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido y pagar' }))

    await waitFor(() => expect(crearPedidoWeb).toHaveBeenCalledWith(expect.objectContaining({
      checkoutId: expect.any(String),
      tipoEntrega: 'retiro',
    })))
    expect(onPasarelaSimulada).toHaveBeenCalledWith('pedido-1')
  })

  it('crea un pedido con envío usando el domicilio seleccionado', async () => {
    render(<CheckoutPage onPasarelaSimulada={vi.fn()} onVolverCarrito={vi.fn()} />)
    await waitFor(() => expect(listarDomicilios).toHaveBeenCalledWith('cliente-1'))

    fireEvent.click(screen.getByRole('radio', { name: /Envío a obra/ }))
    await screen.findByText('Obra Centro')
    expect(screen.getByRole('radio', { name: /Caseros 850/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido y pagar' }))

    await waitFor(() => expect(crearPedidoWeb).toHaveBeenCalledWith(expect.objectContaining({
      tipoEntrega: 'envio',
      domicilioId: 'domicilio-1',
    })))
  })

  it('bloquea el envío cuando no hay domicilio seleccionado', async () => {
    listarDomicilios.mockResolvedValue([])
    render(<CheckoutPage onPasarelaSimulada={vi.fn()} onVolverCarrito={vi.fn()} />)
    await waitFor(() => expect(listarDomicilios).toHaveBeenCalledWith('cliente-1'))

    fireEvent.click(screen.getByRole('radio', { name: /Envío a obra/ }))

    expect(screen.getByRole('button', { name: 'Confirmar pedido y pagar' })).toBeDisabled()
    expect(crearPedidoWeb).not.toHaveBeenCalled()
  })

  it('muestra precio unitario, subtotal y total desde el contrato del carrito', () => {
    render(<CheckoutPage onPasarelaSimulada={vi.fn()} onVolverCarrito={vi.fn()} />)

    const resumenItem = screen.getAllByText('Cemento')[0].closest('li')
    expect(resumenItem).toHaveTextContent('2 × $ 1.250,00')
    expect(resumenItem).toHaveTextContent('$ 2.500,00')
    const resumen = screen.getByRole('complementary')
    expect(within(resumen).getByText('Total a pagar:').parentElement).toHaveTextContent('$ 2.500,00')
    expect(within(resumen).queryByText(/NaN/)).not.toBeInTheDocument()
  })
})
