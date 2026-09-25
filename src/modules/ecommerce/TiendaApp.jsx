import { useEffect, useState } from 'react'
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
import { iniciarPago } from './api/checkoutApi'
import './tienda.css'

const RUTAS = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'carrito', label: 'Carrito' },
  { id: 'checkout', label: 'Checkout' },
  { id: 'ingresar', label: 'Ingresar / Registrarme' },
  { id: 'mis-pedidos', label: 'Mis pedidos' },
  { id: 'mis-datos', label: 'Mis datos' },
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
          if ((ruta.id === 'mis-pedidos' || ruta.id === 'mis-datos') && !cliente) return null
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

function TiendaRoutes({ pagina, productoId, onNavigate, onVerProducto, onIngresarDesdeCarrito, pago, onPasarelaSimulada, onResultadoPago, onReintentarPago }) {
  if (pagina === 'catalogo') return <CatalogoPage onVerProducto={onVerProducto} />
  if (pagina === 'producto') return <ProductoDetallePage productoId={productoId} onVolver={() => onNavigate('catalogo')} />
  if (pagina === 'carrito') return <CarritoPage onFinalizar={() => onNavigate('checkout')} onIngresar={onIngresarDesdeCarrito} />
  if (pagina === 'checkout') return <CheckoutPage onPasarelaSimulada={onPasarelaSimulada} onVolverCarrito={() => onNavigate('carrito')} />
  if (pagina === 'pago-resultado') return <PagoResultadoPage pedidoId={pago.pedidoId} resultado={pago.resultado} onReintentar={onReintentarPago} onIrCatalogo={() => onNavigate('catalogo')} />
  if (pagina === 'pasarela-simulada') return <PasarelaSimuladaPage pedidoId={pago.pedidoId} onResultado={onResultadoPago} />
  if (pagina === 'registrarme') return <RegistroPage onNavigate={onNavigate} />
  if (pagina === 'ingresar') return <IngresarPage onNavigate={onNavigate} />
  if (pagina === 'mis-datos') return <MisDatosPage onNavigate={onNavigate} />
  if (pagina === 'mis-pedidos') return <MisPedidosPage />
  return <CatalogoPage onVerProducto={onVerProducto} />
}

function TiendaShell() {
  const parametros = new URLSearchParams(window.location.search)
  const retornoPago = parametros.get('pago')
  const pedidoRetornado = parametros.get('pedido') || parametros.get('external_reference')
  const [pagina, setPagina] = useState(retornoPago && pedidoRetornado ? 'pago-resultado' : 'catalogo')
  const [pago, setPago] = useState({ pedidoId: pedidoRetornado || '', resultado: retornoPago || '' })
  const [volverAlCarrito, setVolverAlCarrito] = useState(false)
  const [productoId, setProductoId] = useState(null)
  const { cliente } = useClienteWeb()

  useEffect(() => {
    if (cliente && volverAlCarrito) {
      // Después de fusionar, el cliente revisa cantidades y total antes de pagar.
      setPagina('carrito')
      setVolverAlCarrito(false)
    }
  }, [cliente, volverAlCarrito])

  function navegar(destino) {
    setVolverAlCarrito(false)
    if (destino !== 'pago-resultado') window.history.replaceState({}, '', window.location.pathname)
    setPagina(destino === 'checkout' && !cliente ? 'ingresar' : destino)
  }

  function verProducto(id) {
    setProductoId(id)
    navegar('producto')
  }

  function ingresarDesdeCarrito() {
    setVolverAlCarrito(true)
    setPagina('ingresar')
  }

  function abrirPasarelaSimulada(pedidoId) {
    setPago({ pedidoId, resultado: '' })
    setPagina('pasarela-simulada')
  }

  function mostrarResultado(pedidoId, resultado) {
    const etiqueta = resultado === 'approved' ? 'aprobado' : 'rechazado'
    setPago({ pedidoId, resultado: etiqueta })
    window.history.replaceState({}, '', `${window.location.pathname}?pago=${etiqueta}&pedido=${pedidoId}`)
    setPagina('pago-resultado')
  }

  async function reintentarPago(pedidoId) {
    if (import.meta.env.VITE_PAGO_SIMULADO === 'true') {
      abrirPasarelaSimulada(pedidoId)
      return
    }
    const preferencia = await iniciarPago(pedidoId)
    window.location.assign(preferencia.init_point)
  }

  return (
    <CarritoProvider>
      <div className="tienda-app">
        <TiendaHeader pagina={pagina} onNavigate={navegar} />
        <main className="tienda-main">
          <TiendaRoutes
            pagina={pagina}
            productoId={productoId}
            onNavigate={navegar}
            onVerProducto={verProducto}
            onIngresarDesdeCarrito={ingresarDesdeCarrito}
            pago={pago}
            onPasarelaSimulada={abrirPasarelaSimulada}
            onResultadoPago={mostrarResultado}
            onReintentarPago={reintentarPago}
          />
        </main>
      </div>
    </CarritoProvider>
  )
}

export default function TiendaApp() {
  return (
    <ClienteWebProvider>
      <TiendaShell />
    </ClienteWebProvider>
  )
}