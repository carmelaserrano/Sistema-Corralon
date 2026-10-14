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
vi.mock('./pages/SobreNosotrosPage', () => ({ default: () => <p>SOBRE NOSOTROS</p> }))
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
let salirActual

function autenticar() {
  clienteActual = { id: 'cliente-1', nombre: 'Ana', apellido: 'Pérez' }
}

describe('TiendaApp retorno post-login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clienteActual = null
    salirActual = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    useClienteWeb.mockImplementation(() => ({ cliente: clienteActual, salir: salirActual }))
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

  it('abre las opciones de cuenta desde el nombre y permite ir a Mi cuenta', () => {
    autenticar()
    render(<TiendaShell />)

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }))

    fireEvent.click(screen.getByRole('button', { name: 'Mi cuenta' }))

    expect(screen.getByText('MIS DATOS')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mi cuenta' })).not.toBeInTheDocument()
  })

  it('permite cerrar sesión desde el menú de cuenta', async () => {
    autenticar()
    render(<TiendaShell />)

    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    await waitFor(() => expect(salirActual).toHaveBeenCalledOnce())
    expect(screen.getByText('CATÁLOGO')).toBeInTheDocument()
  })

  it('permite abrir Sobre nosotros desde la navegación para visitantes y clientes', () => {
    const vista = render(<TiendaShell />)
    fireEvent.click(screen.getByRole('button', { name: 'Sobre nosotros' }))
    expect(screen.getByText('SOBRE NOSOTROS')).toBeInTheDocument()

    autenticar()
    vista.rerender(<TiendaShell />)
    fireEvent.click(screen.getByRole('button', { name: 'Sobre nosotros' }))

    expect(screen.getByText('SOBRE NOSOTROS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sobre nosotros' })).toHaveAttribute('aria-current', 'page')
  })
})
