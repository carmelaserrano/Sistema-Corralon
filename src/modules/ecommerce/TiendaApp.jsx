import { useEffect, useRef, useState } from 'react'
import LogoCasco from '../../components/ui/LogoCasco'
import {
  ChevronDown,
  Clock,
  MapPin,
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
import { DATOS_COMERCIALES } from './datosComerciales'
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
import SobreNosotrosPage from './pages/SobreNosotrosPage'
import TiendaFooter from './components/TiendaFooter'
import TiendaToast from './components/TiendaToast'
import TiendaCartDrawer from './components/TiendaCartDrawer'
import './tienda.css'

const monedaHeader = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

function TiendaHeader({ pagina, onNavigate, onAbrirCarrito }) {
  const { cantidadTotal, total } = useCarrito()
  const { cliente, salir } = useClienteWeb()
  const [menuCuentaAbierto, setMenuCuentaAbierto] = useState(false)
  const menuCuentaRef = useRef(null)
  const botonCuentaRef = useRef(null)

  useEffect(() => {
    if (!menuCuentaAbierto) return undefined

    function cerrarAlHacerClickAfuera(event) {
      if (!menuCuentaRef.current?.contains(event.target)) {
        setMenuCuentaAbierto(false)
      }
    }

    function cerrarConEscape(event) {
      if (event.key === 'Escape') {
        setMenuCuentaAbierto(false)
        botonCuentaRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', cerrarAlHacerClickAfuera)
    document.addEventListener('keydown', cerrarConEscape)
    return () => {
      document.removeEventListener('mousedown', cerrarAlHacerClickAfuera)
      document.removeEventListener('keydown', cerrarConEscape)
    }
  }, [menuCuentaAbierto])

  useEffect(() => {
    setMenuCuentaAbierto(false)
  }, [pagina])

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
              <span>{DATOS_COMERCIALES.telefono}</span>
            </span>
            <span className="tienda-topbar-sep">•</span>
            <span className="tienda-topbar-item">
              <Clock size={14} aria-hidden="true" />
              <span>Lun a Vie 8-18 · Sáb 8-13</span>
            </span>
          </div>
        </div>
      </div>

      {/* Header principal: marca · navegación · cuenta y carrito, alineados
          al mismo ancho que el contenido de la página. */}
      <div className="tienda-header-main">
        <div className="tienda-header-inner">
          <div
            className="tienda-brand"
            role="button"
            tabIndex={0}
            aria-label="Corralón Norte, ir al catálogo"
            onClick={() => onNavigate('catalogo')}
            onKeyDown={(e) => e.key === 'Enter' && onNavigate('catalogo')}
          >
            <div className="tienda-brand-logo">
              <LogoCasco size={38} />
            </div>
            <div className="tienda-brand-text">
              <strong className="marca-nombre">
                Corralón <span>Norte</span>
              </strong>
              <span className="tienda-brand-sub">Tienda de Materiales</span>
            </div>
          </div>

          <nav className="tienda-nav" aria-label="Navegación de la tienda">
            <button
              type="button"
              className={`tienda-nav-link ${pagina === 'catalogo' || pagina === 'producto' ? 'is-active' : ''}`}
              aria-current={pagina === 'catalogo' ? 'page' : undefined}
              onClick={() => onNavigate('catalogo')}
            >
              <Store size={16} aria-hidden="true" />
              <span>Catálogo</span>
            </button>
            <button
              type="button"
              className={`tienda-nav-link ${pagina === 'sobre-nosotros' ? 'is-active' : ''}`}
              aria-current={pagina === 'sobre-nosotros' ? 'page' : undefined}
              onClick={() => onNavigate('sobre-nosotros')}
            >
              <MapPin size={16} aria-hidden="true" />
              <span>Sobre nosotros</span>
            </button>
            {cliente && (
              <button
                type="button"
                className={`tienda-nav-link ${pagina === 'mis-pedidos' ? 'is-active' : ''}`}
                aria-current={pagina === 'mis-pedidos' ? 'page' : undefined}
                onClick={() => onNavigate('mis-pedidos')}
              >
                <Package size={16} aria-hidden="true" />
                <span>Mis Pedidos</span>
              </button>
            )}
          </nav>

          <div className="tienda-header-acciones">
            {cliente ? (
              <div className="tienda-cuenta" ref={menuCuentaRef}>
                <button
                  ref={botonCuentaRef}
                  type="button"
                  className={`tienda-cuenta-btn ${pagina === 'mis-datos' ? 'is-active' : ''}`}
                  onClick={() => setMenuCuentaAbierto((abierto) => !abierto)}
                  aria-label="Menú de cuenta"
                  aria-haspopup="true"
                  aria-expanded={menuCuentaAbierto}
                  aria-controls="tienda-menu-cuenta"
                  title="Opciones de cuenta"
                >
                  <span className="tienda-user-avatar" aria-hidden="true">
                    {(cliente.nombre?.[0] || cliente.razon_social?.[0] || 'C').toUpperCase()}
                  </span>
                  <span className="tienda-cuenta-texto">
                    <small>Hola,</small>
                    <strong>
                      {cliente.nombre
                        ? `${cliente.nombre} ${cliente.apellido || ''}`.trim()
                        : cliente.razon_social}
                    </strong>
                  </span>
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
                {menuCuentaAbierto && (
                  <div className="tienda-menu-cuenta" id="tienda-menu-cuenta">
                    <button
                      type="button"
                      className="tienda-menu-cuenta-item"
                      onClick={() => {
                        setMenuCuentaAbierto(false)
                        onNavigate('mis-datos')
                      }}
                    >
                      <User size={16} aria-hidden="true" />
                      <span>Mi cuenta</span>
                    </button>
                    <button
                      type="button"
                      className="tienda-menu-cuenta-item"
                      onClick={async () => {
                        setMenuCuentaAbierto(false)
                        await salir()
                        onNavigate('catalogo')
                      }}
                    >
                      <LogOut size={16} aria-hidden="true" />
                      <span>Cerrar sesión</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className={`tienda-cuenta-btn ${
                  pagina === 'ingresar' || pagina === 'registrarme' ? 'is-active' : ''
                }`}
                aria-label="Ingresar / Registrarme"
                onClick={() => onNavigate('ingresar')}
              >
                <span className="tienda-cuenta-icono" aria-hidden="true">
                  <User size={18} />
                </span>
                <span className="tienda-cuenta-texto">
                  <small>Mi cuenta</small>
                  <strong>Ingresar</strong>
                </span>
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
                <ShoppingCart size={19} aria-hidden="true" />
                {cantidadTotal > 0 && <span className="tienda-cart-badge">{cantidadTotal}</span>}
              </div>
              <div className="tienda-cart-info">
                <span className="tienda-cart-label">Carrito</span>
                <span className="tienda-cart-total">
                  {cantidadTotal > 0 ? monedaHeader.format(total) : 'Vacío'}
                </span>
              </div>
            </button>
          </div>
        </div>
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
        onNavigate={onNavigate}
      />
    )
  }
  if (pagina === 'registrarme') return <RegistroPage onNavigate={onNavigate} />
  if (pagina === 'ingresar') return <IngresarPage onNavigate={onNavigate} />
  if (pagina === 'mis-datos') return <MisDatosPage onNavigate={onNavigate} />
  if (pagina === 'sobre-nosotros') return <SobreNosotrosPage />
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

function TiendaContenido() {
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
  const [destinoPostIngreso, setDestinoPostIngreso] = useState(null)
  const [productoId, setProductoId] = useState(null)
  const [toast, setToast] = useState(null)
  const [drawerAbierto, setDrawerAbierto] = useState(false)
  const { cliente } = useClienteWeb()

  useEffect(() => {
    if (cliente && destinoPostIngreso && pagina !== 'registrarme') {
      setPagina(destinoPostIngreso)
      setDestinoPostIngreso(null)
    }
  }, [cliente, destinoPostIngreso, pagina])

  function navegar(destino) {
    const requiereIngreso = destino === 'checkout' && !cliente
    const mantieneRetornoAuth = destinoPostIngreso
      && ['ingresar', 'registrarme'].includes(pagina)
      && ['ingresar', 'registrarme'].includes(destino)
    if (requiereIngreso) setDestinoPostIngreso('checkout')
    else if (!mantieneRetornoAuth) setDestinoPostIngreso(null)
    if (destino !== 'pago-resultado') {
      window.history.replaceState({}, '', window.location.pathname)
    }
    setPagina(requiereIngreso ? 'ingresar' : destino)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function verProducto(id) {
    setProductoId(id)
    navegar('producto')
  }

  function ingresarDesdeCarrito() {
    setDestinoPostIngreso('carrito')
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
    abrirPasarelaSimulada(pedidoId)
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

export function TiendaShell() {
  return (
    <ClienteWebProvider>
      <TiendaContenido />
    </ClienteWebProvider>
  )
}

export default function TiendaApp() {
  return <TiendaShell />
}
