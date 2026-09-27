import { useEffect, useState } from 'react'
import {
  Building2,
  Clock,
  LogOut,
  Package,
  Phone,
  ShoppingCart,
  Store,
  Truck,
  User,
} from 'lucide-react'
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
import TiendaFooter from './components/TiendaFooter'
import TiendaToast from './components/TiendaToast'
import TiendaCartDrawer from './components/TiendaCartDrawer'
import { iniciarPago } from './api/checkoutApi'
import './tienda.css'

const monedaHeader = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

function TiendaHeader({ pagina, onNavigate, onAbrirCarrito }) {
  const { cantidadTotal, total } = useCarrito()
  const { cliente, salir } = useClienteWeb()

  return (
    <header className="tienda-header-container">
      {/* Top bar de servicios y atención */}
      <div className="tienda-topbar">
        <div className="tienda-topbar-inner">
          <div className="tienda-topbar-left">
            <span className="tienda-topbar-item">
              <Truck size={14} aria-hidden="true" />
              <span>Envíos a obra en 24/48hs · Retiro en corralón sin cargo</span>
            </span>
          </div>
          <div className="tienda-topbar-right">
            <span className="tienda-topbar-item">
              <Phone size={14} aria-hidden="true" />
              <span>(387) 456-7890</span>
            </span>
            <span className="tienda-topbar-sep">•</span>
            <span className="tienda-topbar-item">
              <Clock size={14} aria-hidden="true" />
              <span>Lun a Vie 8-18 · Sáb 8-13</span>
            </span>
          </div>
        </div>
      </div>

      {/* Header Principal */}
      <div className="tienda-header-main">
        <div
          className="tienda-brand"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate('catalogo')}
          onKeyDown={(e) => e.key === 'Enter' && onNavigate('catalogo')}
        >
          <div className="tienda-brand-logo">
            <Building2 size={24} aria-hidden="true" />
          </div>
          <div className="tienda-brand-text">
            <strong>Corralón del Sur</strong>
            <span className="tienda-brand-sub">Tienda de Materiales</span>
          </div>
        </div>

        <nav className="tienda-nav" aria-label="Navegación de la tienda">
          <button
            type="button"
            className={`tienda-nav-link ${pagina === 'catalogo' ? 'is-active' : ''}`}
            onClick={() => onNavigate('catalogo')}
          >
            <Store size={16} aria-hidden="true" />
            <span>Catálogo</span>
          </button>

          {cliente ? (
            <div className="tienda-user-group">
              <button
                type="button"
                className={`tienda-nav-link ${pagina === 'mis-pedidos' ? 'is-active' : ''}`}
                onClick={() => onNavigate('mis-pedidos')}
              >
                <Package size={16} aria-hidden="true" />
                <span>Mis Pedidos</span>
              </button>

              <button
                type="button"
                className={`tienda-nav-link ${pagina === 'mis-datos' ? 'is-active' : ''}`}
                onClick={() => onNavigate('mis-datos')}
              >
                <User size={16} aria-hidden="true" />
                <span>Mis Datos</span>
              </button>

              <div className="tienda-user-badge">
                <span className="tienda-user-avatar">
                  {(cliente.nombre?.[0] || cliente.razon_social?.[0] || 'C').toUpperCase()}
                </span>
                <span className="tienda-user-name" title={cliente.nombre || cliente.razon_social}>
                  {cliente.nombre
                    ? `${cliente.nombre} ${cliente.apellido || ''}`.trim()
                    : cliente.razon_social}
                </span>
              </div>

              <button
                type="button"
                className="tienda-nav-btn-logout"
                title="Cerrar sesión"
                onClick={async () => {
                  await salir()
                  onNavigate('catalogo')
                }}
              >
                <LogOut size={16} aria-hidden="true" />
                <span>Salir</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`tienda-nav-link tienda-nav-btn-login ${
                pagina === 'ingresar' || pagina === 'registrarme' ? 'is-active' : ''
              }`}
              onClick={() => onNavigate('ingresar')}
            >
              <User size={16} aria-hidden="true" />
              <span>Ingresar / Registrarme</span>
            </button>
          )}

          <button
            type="button"
            className={`tienda-cart-btn ${pagina === 'carrito' ? 'is-active' : ''}`}
            onClick={() => {
              if (pagina === 'checkout') {
                onNavigate('carrito')
              } else {
                onAbrirCarrito?.()
              }
            }}
            aria-label={`Carrito de compras, ${cantidadTotal} productos`}
          >
            <div className="tienda-cart-icon-wrap">
              <ShoppingCart size={18} aria-hidden="true" />
              {cantidadTotal > 0 && <span className="tienda-cart-badge">{cantidadTotal}</span>}
            </div>
            <div className="tienda-cart-info">
              <span className="tienda-cart-label">Carrito</span>
              {cantidadTotal > 0 && (
                <span className="tienda-cart-total">{monedaHeader.format(total)}</span>
              )}
            </div>
          </button>
        </nav>
      </div>
    </header>
  )
}

function TiendaRoutes({
  pagina,
  productoId,
  onNavigate,
  onVerProducto,
  onIngresarDesdeCarrito,
  pago,
  onPasarelaSimulada,
  onResultadoPago,
  onReintentarPago,
  onNotificar,
  onAbrirCarrito,
}) {
  if (pagina === 'catalogo') {
    return <CatalogoPage onVerProducto={onVerProducto} onNotificar={onNotificar} />
  }
  if (pagina === 'producto') {
    return (
      <ProductoDetallePage
        productoId={productoId}
        onVolver={() => onNavigate('catalogo')}
      />
    )
  }
  if (pagina === 'carrito') {
    return (
      <CarritoPage
        onFinalizar={() => onNavigate('checkout')}
        onIngresar={onIngresarDesdeCarrito}
      />
    )
  }
  if (pagina === 'checkout') {
    return (
      <CheckoutPage
        onPasarelaSimulada={onPasarelaSimulada}
        onVolverCarrito={() => onNavigate('carrito')}
      />
    )
  }
  if (pagina === 'pago-resultado') {
    return (
      <PagoResultadoPage
        pedidoId={pago.pedidoId}
        resultado={pago.resultado}
        onReintentar={onReintentarPago}
        onIrCatalogo={() => onNavigate('catalogo')}
      />
    )
  }
  if (pagina === 'pasarela-simulada') {
    return (
      <PasarelaSimuladaPage
        pedidoId={pago.pedidoId}
        onResultado={onResultadoPago}
      />
    )
  }
  if (pagina === 'registrarme') return <RegistroPage onNavigate={onNavigate} />
  if (pagina === 'ingresar') return <IngresarPage onNavigate={onNavigate} />
  if (pagina === 'mis-datos') return <MisDatosPage onNavigate={onNavigate} />
  if (pagina === 'mis-pedidos') {
    return (
      <MisPedidosPage
        onNavigate={onNavigate}
        onVerProducto={onVerProducto}
        onNotificar={onNotificar}
        onAbrirCarrito={onAbrirCarrito}
      />
    )
  }
  return <CatalogoPage onVerProducto={onVerProducto} onNotificar={onNotificar} />
}

function TiendaShell() {
  const parametros = new URLSearchParams(window.location.search)
  const retornoPago = parametros.get('pago')
  const pedidoRetornado = parametros.get('pedido') || parametros.get('external_reference')
  const [pagina, setPagina] = useState(
    retornoPago && pedidoRetornado ? 'pago-resultado' : 'catalogo',
  )
  const [pago, setPago] = useState({
    pedidoId: pedidoRetornado || '',
    resultado: retornoPago || '',
  })
  const [volverAlCarrito, setVolverAlCarrito] = useState(false)
  const [productoId, setProductoId] = useState(null)
  const [toast, setToast] = useState(null)
  const [drawerAbierto, setDrawerAbierto] = useState(false)
  const { cliente } = useClienteWeb()

  useEffect(() => {
    if (cliente && volverAlCarrito) {
      setPagina('carrito')
      setVolverAlCarrito(false)
    }
  }, [cliente, volverAlCarrito])

  function navegar(destino) {
    setVolverAlCarrito(false)
    if (destino !== 'pago-resultado') {
      window.history.replaceState({}, '', window.location.pathname)
    }
    setPagina(destino === 'checkout' && !cliente ? 'ingresar' : destino)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}?pago=${etiqueta}&pedido=${pedidoId}`,
    )
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

  function notificar({ mensaje, productoNombre }) {
    setToast({ mensaje, productoNombre })
  }

  return (
    <CarritoProvider>
      <div className="tienda-app">
        <TiendaHeader
          pagina={pagina}
          onNavigate={navegar}
          onAbrirCarrito={() => setDrawerAbierto(true)}
        />
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
            onNotificar={notificar}
            onAbrirCarrito={() => setDrawerAbierto(true)}
          />
        </main>
        <TiendaFooter onNavigate={navegar} />

        {/* Slide-over Mini-Carrito Drawer */}
        <TiendaCartDrawer
          abierto={drawerAbierto}
          onCerrar={() => setDrawerAbierto(false)}
          onIrCheckout={() => navegar('checkout')}
          onIrCarritoCompleto={() => navegar('carrito')}
        />

        {/* Notificación Toast */}
        {toast && (
          <TiendaToast
            mensaje={toast.mensaje}
            productoNombre={toast.productoNombre}
            onVerCarrito={() => {
              setToast(null)
              setDrawerAbierto(true)
            }}
            onCerrar={() => setToast(null)}
          />
        )}
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