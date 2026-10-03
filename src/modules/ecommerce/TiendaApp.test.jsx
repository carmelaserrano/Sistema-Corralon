import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TiendaShell } from './TiendaApp'
import { useClienteWeb } from './context/ClienteWebContext'
import { useCarrito } from './context/CarritoContext'

vi.mock('./context/ClienteWebContext', () => ({
  ClienteWebProvider: ({ children }) => children,
  useClienteWeb: vi.fn(),
}))
vi.mock('./context/CarritoContext', () => ({
  CarritoProvider: ({ children }) => children,
  useCarrito: vi.fn(),
}))
vi.mock('./pages/CatalogoPage', () => ({ default: () => <p>CATÁLOGO</p> }))
vi.mock('./pages/ProductoDetallePage', () => ({ default: () => <p>PRODUCTO</p> }))
vi.mock('./pages/CarritoPage', () => ({
  default: ({ onIngresar }) => (
    <div>
      <p>CARRITO COMPLETO</p>
      <button type="button" onClick={onIngresar}>Ingresar desde carrito</button>
    </div>
  ),
}))
vi.mock('./pages/CheckoutPage', () => ({ default: () => <p>CHECKOUT</p> }))
vi.mock('./pages/PagoResultadoPage', () => ({ default: () => <p>RESULTADO</p> }))
vi.mock('./pages/PasarelaSimuladaPage', () => ({ default: () => <p>PASARELA</p> }))
vi.mock('./pages/RegistroPage', () => ({ default: () => <p>REGISTRO</p> }))
vi.mock('./pages/IngresarPage', () => ({ default: () => <p>LOGIN</p> }))
vi.mock('./pages/MisDatosPage', () => ({ default: () => <p>MIS DATOS</p> }))
vi.mock('./pages/MisPedidosPage', () => ({ default: () => <p>MIS PEDIDOS</p> }))
vi.mock('./components/TiendaFooter', () => ({ default: () => null }))
vi.mock('./components/TiendaToast', () => ({ default: () => null }))
vi.mock('./components/TiendaCartDrawer', () => ({
  default: ({ abierto, onIrCheckout, onIrCarritoCompleto }) => abierto ? (
    <div>
      <button type="button" onClick={onIrCheckout}>Checkout desde drawer</button>
      <button type="button" onClick={onIrCarritoCompleto}>Carrito desde drawer</button>
    </div>
  ) : null,
}))
vi.mock('./api/checkoutApi', () => ({ iniciarPago: vi.fn() }))

let clienteActual

function autenticar() {
  clienteActual = { id: 'cliente-1', nombre: 'Ana', apellido: 'Pérez' }
}

describe('TiendaApp retorno post-login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clienteActual = null
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    useClienteWeb.mockImplementation(() => ({ cliente: clienteActual, salir: vi.fn() }))
    useCarrito.mockReturnValue({ cantidadTotal: 1, total: 1250 })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('retoma el checkout después de autenticar al visitante que llegó desde el drawer', async () => {
    const vista = render(<TiendaShell />)
    fireEvent.click(screen.getByRole('button', { name: /Carrito de compras/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Checkout desde drawer' }))
    expect(screen.getByText('LOGIN')).toBeInTheDocument()

    autenticar()
    vista.rerender(<TiendaShell />)

    expect(await screen.findByText('CHECKOUT')).toBeInTheDocument()
  })

  it('retoma el carrito completo después del login solicitado desde esa pantalla', async () => {
    const vista = render(<TiendaShell />)
    fireEvent.click(screen.getByRole('button', { name: /Carrito de compras/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Carrito desde drawer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar desde carrito' }))
    expect(screen.getByText('LOGIN')).toBeInTheDocument()

    autenticar()
    vista.rerender(<TiendaShell />)

    expect(await screen.findByText('CARRITO COMPLETO')).toBeInTheDocument()
  })

  it('no redirige al checkout cuando el login se inició manualmente desde la cabecera', async () => {
    const vista = render(<TiendaShell />)
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar / Registrarme' }))
    expect(screen.getByText('LOGIN')).toBeInTheDocument()

    autenticar()
    vista.rerender(<TiendaShell />)

    await waitFor(() => expect(screen.getByText('LOGIN')).toBeInTheDocument())
    expect(screen.queryByText('CHECKOUT')).not.toBeInTheDocument()
  })
})
