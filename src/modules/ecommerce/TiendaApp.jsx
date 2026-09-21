import { useState } from 'react'
import { ShoppingCart, Store } from 'lucide-react'
import { CarritoProvider, useCarrito } from './context/CarritoContext'
import { ClienteWebProvider, useClienteWeb } from './context/ClienteWebContext'
import CatalogoPage from './pages/CatalogoPage'
import ProductoDetallePage from './pages/ProductoDetallePage'
import CarritoPage from './pages/CarritoPage'
import CheckoutPage from './pages/CheckoutPage'
import PagoResultadoPage from './pages/PagoResultadoPage'
import PasarelaSimuladaPage from './pages/PasarelaSimuladaPage'
import RegistroPage from './pages/RegistroPage'
import IngresarPage from './pages/IngresarPage'
import MisDatosPage from './pages/MisDatosPage'
import MisPedidosPage from './pages/MisPedidosPage'

const RUTAS = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'carrito', label: 'Carrito' },
  { id: 'checkout', label: 'Checkout' },
  { id: 'ingresar', label: 'Ingresar / Registrarme' },
  { id: 'mis-pedidos', label: 'Mis pedidos' },
]

function TiendaHeader({ pagina, onNavigate }) {
  const { cantidadTotal } = useCarrito()
  const { cliente } = useClienteWeb()

  return (
    <header className="tienda-header">
      <div className="tienda-brand">
        <Store size={20} aria-hidden="true" />
        <strong>Corralón — Tienda online</strong>
      </div>
      <nav className="tienda-nav">
        {RUTAS.map((ruta) => {
          if (ruta.id === 'ingresar' && cliente) return null
          if (ruta.id === 'mis-pedidos' && !cliente) return null
          return (
            <button
              key={ruta.id}
              type="button"
              className={pagina === ruta.id ? 'is-active' : ''}
              onClick={() => onNavigate(ruta.id)}
            >
              {ruta.id === 'carrito' && <ShoppingCart size={16} aria-hidden="true" />}
              {ruta.label}
              {ruta.id === 'carrito' && cantidadTotal > 0 && (
                <span className="tienda-cart-badge">{cantidadTotal}</span>
              )}
            </button>
          )
        })}
        {cliente && (
          <span className="tienda-cliente">Hola, {cliente.nombre || cliente.razon_social}</span>
        )}
      </nav>
    </header>
  )
}

function TiendaRoutes({ pagina, onNavigate }) {
  if (pagina === 'catalogo') return <CatalogoPage />
  if (pagina === 'producto') return <ProductoDetallePage />
  if (pagina === 'carrito') return <CarritoPage onFinalizar={() => onNavigate('checkout')} />
  if (pagina === 'checkout') return <CheckoutPage />
  if (pagina === 'pago-resultado') return <PagoResultadoPage />
  if (pagina === 'pasarela-simulada') return <PasarelaSimuladaPage />
  if (pagina === 'registrarme') return <RegistroPage />
  if (pagina === 'ingresar') return <IngresarPage />
  if (pagina === 'mis-datos') return <MisDatosPage />
  if (pagina === 'mis-pedidos') return <MisPedidosPage />
  return <CatalogoPage />
}

function TiendaShell() {
  const [pagina, setPagina] = useState('catalogo')

  return (
    <div className="tienda-app">
      <TiendaHeader pagina={pagina} onNavigate={setPagina} />
      <main className="tienda-main">
        <TiendaRoutes pagina={pagina} onNavigate={setPagina} />
      </main>
    </div>
  )
}

export default function TiendaApp() {
  return (
    <ClienteWebProvider>
      <CarritoProvider>
        <TiendaShell />
      </CarritoProvider>
    </ClienteWebProvider>
  )
}
