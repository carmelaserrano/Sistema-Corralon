import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  MapPin,
  Package,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Store,
  Truck,
} from 'lucide-react'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'
import { useCarrito } from '../context/CarritoContext'
import { useClienteWeb } from '../context/ClienteWebContext'
import { armarLineaDeTiempo, listarMisPedidos, obtenerSeguimientoPedido } from '../api/pedidosWebApi'
import { descargarRemitoWebPdf } from '../pdf/remitoWebPdf'

// Un color por estado, con los tonos de .estado-badge (mismo criterio que
// EstadoVentaBadge en Supervisión de ventas).
const TONOS_ESTADO = {
  'Pendiente de pago': 'advertencia',
  Pagado: 'principal',
  'En preparación': 'principal',
  'Listo para retirar': 'principal',
  Enviado: 'principal',
  Entregado: 'activo',
  Cancelado: 'error',
}

export function EstadoPedidoBadge({ estado }) {
  return <span className={`estado-badge estado-badge-${TONOS_ESTADO[estado] ?? 'inactivo'}`}>{estado}</span>
}

function formatearFecha(fechaIso) {
  if (!fechaIso) return '—'
  return new Date(fechaIso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0)
}

/** Línea de tiempo vertical del pedido (CA-02). */
export function LineaDeTiempoPedido({ pedido, historial }) {
  const pasos = armarLineaDeTiempo(pedido, historial)
  return (
    <ol aria-label="Seguimiento del pedido" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {pasos.map((paso, i) => {
        const cancelado = paso.estado === 'Cancelado'
        const color = cancelado ? 'var(--color-danger)' : paso.completado ? 'var(--color-success)' : 'var(--border-strong)'
        return (
          <li
            key={paso.estado}
            aria-current={paso.actual ? 'step' : undefined}
            style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 14, minHeight: 56 }}
          >
            <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  marginTop: 2,
                  borderRadius: '50%',
                  border: `2px solid ${color}`,
                  background: paso.completado ? color : 'var(--surface-panel)',
                  boxShadow: paso.actual
                    ? `0 0 0 4px ${cancelado ? 'var(--color-danger-soft)' : 'var(--color-success-soft)'}`
                    : 'none',
                }}
              />
              {i < pasos.length - 1 && (
                <span
                  style={{
                    flex: 1,
                    width: 2,
                    background: pasos[i + 1].completado ? color : 'var(--border-default)',
                  }}
                />
              )}
            </span>
            <div style={{ paddingBottom: 16, color: paso.completado ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              <strong style={{ fontWeight: paso.actual ? 700 : 500, display: 'block', fontSize: 14 }}>
                {paso.estado}
              </strong>
              <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: 12 }}>
                {paso.fecha ? formatearFecha(paso.fecha) : paso.completado ? 'Sin fecha registrada' : 'Pendiente'}
              </small>
              {paso.motivo && cancelado && (
                <small style={{ display: 'block', color: 'var(--color-danger)', marginTop: 2 }}>
                  Motivo: {paso.motivo}
                </small>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function DetallePedido({ pedidoId, cliente, onVolver, onVerProducto, onNotificar, onAbrirCarrito }) {
  const [seguimiento, setSeguimiento] = useState(undefined)
  const [error, setError] = useState('')
  const [reordenando, setReordenando] = useState(false)
  const { agregarVarios } = useCarrito()

  useEffect(() => {
    obtenerSeguimientoPedido(pedidoId)
      .then(setSeguimiento)
      .catch((err) => setError(err.message || 'No pudimos cargar el pedido'))
  }, [pedidoId])

  const volver = (
    <Button type="button" variant="ghost" icon={ArrowLeft} onClick={onVolver}>
      Volver a mis compras
    </Button>
  )

  if (error) {
    return (
      <div className="tienda-detalle-page">
        {volver}
        <Feedback tone="error">{error}</Feedback>
      </div>
    )
  }

  if (seguimiento === undefined) {
    return (
      <div className="tienda-detalle-page">
        {volver}
        <p className="loading-state" role="status" style={{ marginTop: 24 }}>
          Cargando datos del pedido…
        </p>
      </div>
    )
  }

  if (seguimiento === null) {
    return (
      <div className="tienda-detalle-page">
        {volver}
        <EmptyState
          title="Pedido no encontrado"
          description="Este pedido no existe o no pertenece a tu cuenta vinculada."
        />
      </div>
    )
  }

  const { pedido, items, historial } = seguimiento
  const esEnvio = pedido.tipo_entrega === 'envio'

  async function handleReordenar() {
    if (!items.length) return
    setReordenando(true)
    try {
      const itemsParaCarrito = items
        .filter((it) => it.producto?.id)
        .map((it) => ({ productoId: it.producto.id, cantidad: it.cantidad }))
      await agregarVarios(itemsParaCarrito)
      onNotificar?.({
        mensaje: '¡Materiales cargados al carrito con éxito!',
        productoNombre: `Pedido #${pedido.numero}`,
      })
      onAbrirCarrito?.()
    } catch (err) {
      setError(err.message || 'No se pudieron agregar los artículos al carrito')
    } finally {
      setReordenando(false)
    }
  }

  function handleDescargarPdf() {
    descargarRemitoWebPdf({
      pedido,
      items,
      cliente,
    })
  }

  // Contenido explicativo del banner según estado
  const bannerMensajes = {
    'Pendiente de pago': {
      titulo: 'Pedido generado · Pendiente de pago',
      texto: 'Tu pedido está reservado por 60 minutos esperando la acreditación del pago.',
      icono: Clock,
      clase: 'is-pendiente-de-pago',
    },
    Pagado: {
      titulo: 'Pago confirmado · En cola de armado',
      texto: 'Acreditamos tu pago. El equipo de depósito y acopio fue notificado para preparar los materiales.',
      icono: CheckCircle2,
      clase: 'is-pagado',
    },
    'En preparación': {
      titulo: 'En preparación en corralón',
      texto: 'Nuestros operarios están armando los bultos y pallets en el sector de carga pesada.',
      icono: Package,
      clase: 'is-preparacion',
    },
    'Listo para retirar': {
      titulo: '¡Listo para retirar!',
      texto: 'Tus materiales ya están acopiados en el sector de Carga Pesada. Podés pasar a retirar con tu DNI y número de pedido.',
      icono: Store,
      clase: 'is-listo-para-retirar',
    },
    Enviado: {
      titulo: 'En camino a tu obra',
      texto: 'El camión con hidrogrúa salió hacia la dirección indicada. Por favor garantizá el despeje del acceso para la descarga.',
      icono: Truck,
      clase: 'is-enviado',
    },
    Entregado: {
      titulo: 'Materiales entregados en obra / sucursal',
      texto: 'La entrega fue completada con conformidad. ¡Gracias por confiar en Corralón Carmela Serrano!',
      icono: ShieldCheck,
      clase: 'is-entregado',
    },
    Cancelado: {
      titulo: 'Pedido cancelado',
      texto: 'Este pedido fue cancelado. Si realizaste un pago, el reembolso será gestionado por administración.',
      icono: AlertCircle,
      clase: 'is-cancelado',
    },
  }

  const banner = bannerMensajes[pedido.estado] || bannerMensajes['Pagado']
  const IconoBanner = banner.icono

  return (
    <div className="tienda-detalle-page">
      <div className="tienda-detalle-top-bar">
        {volver}
        <div className="tienda-detalle-top-actions">
          <Button
            type="button"
            variant="ghost"
            icon={Download}
            onClick={handleDescargarPdf}
            title="Descargar Remito Web en PDF"
          >
            Descargar Remito PDF
          </Button>
          <Button
            type="button"
            variant="primary"
            icon={RotateCcw}
            loading={reordenando}
            loadingLabel="Cargando al carrito…"
            onClick={handleReordenar}
            title="Volver a comprar todos los productos de este pedido"
          >
            Volver a comprar
          </Button>
        </div>
      </div>

      <div className={`tienda-detalle-banner ${banner.clase}`}>
        <IconoBanner size={28} className="tienda-detalle-banner-icon" />
        <div className="tienda-detalle-banner-info">
          <strong>{banner.titulo}</strong>
          <p>{banner.texto}</p>
        </div>
      </div>

      <div className="tienda-detalle-grid">
        {/* COLUMNA IZQUIERDA: SEGUIMIENTO Y LOGÍSTICA */}
        <div className="tienda-detalle-col">
          {/* Caja Seguimiento */}
          <div className="tienda-detalle-box">
            <h2>
              <PackageCheck size={20} aria-hidden="true" />
              Seguimiento del Pedido Nº {pedido.numero}
            </h2>
            <div style={{ marginTop: 16 }}>
              <LineaDeTiempoPedido pedido={pedido} historial={historial} />
            </div>
          </div>

          {/* Caja Logística / Entrega */}
          <div className="tienda-detalle-box">
            <h2>
              {esEnvio ? <Truck size={20} aria-hidden="true" /> : <Store size={20} aria-hidden="true" />}
              {esEnvio ? 'Datos de entrega en obra' : 'Punto de retiro en corralón'}
            </h2>

            <div className="tienda-entrega-detalle-card">
              {esEnvio ? (
                <>
                  <div className="tienda-entrega-item">
                    <MapPin size={18} className="tienda-entrega-item-icon" />
                    <div className="tienda-entrega-item-text">
                      <strong>Dirección de destino:</strong>
                      <p>
                        {pedido.domicilio
                          ? `${pedido.domicilio.calle} ${pedido.domicilio.numero}, ${pedido.domicilio.localidad} (${pedido.domicilio.provincia || 'Salta'})`
                          : 'Dirección coordinada con logística de obra'}
                      </p>
                    </div>
                  </div>

                  {pedido.domicilio?.referencias && (
                    <div className="tienda-entrega-item">
                      <Truck size={18} className="tienda-entrega-item-icon" />
                      <div className="tienda-entrega-item-text">
                        <strong>Indicaciones para camión / hidrogrúa:</strong>
                        <p>{pedido.domicilio.referencias}</p>
                      </div>
                    </div>
                  )}

                  <div className="tienda-entrega-item">
                    <ShieldCheck size={18} className="tienda-entrega-item-icon" />
                    <div className="tienda-entrega-item-text">
                      <strong>Logística pesada propia:</strong>
                      <p>Transporte en camión grúa habilitado para descarga de pallets en vereda u obra.</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="tienda-entrega-item">
                    <Store size={18} className="tienda-entrega-item-icon" />
                    <div className="tienda-entrega-item-text">
                      <strong>Sucursal Casa Central:</strong>
                      <p>Av. Entre Ríos 1450, Salta Capital, Salta.</p>
                    </div>
                  </div>

                  <div className="tienda-entrega-item">
                    <Clock size={18} className="tienda-entrega-item-icon" />
                    <div className="tienda-entrega-item-text">
                      <strong>Horarios del sector de carga pesada:</strong>
                      <p>Lunes a Viernes de 8:00 a 18:00 hs · Sábados de 8:00 a 13:00 hs.</p>
                    </div>
                  </div>

                  <div className="tienda-entrega-item">
                    <PackageCheck size={18} className="tienda-entrega-item-icon" />
                    <div className="tienda-entrega-item-text">
                      <strong>Requisitos para retirar:</strong>
                      <p>Presentarse con DNI del titular y el Nº de Pedido: <strong>{pedido.numero}</strong>.</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: RESUMEN DE ARTÍCULOS Y TOTALES */}
        <div className="tienda-detalle-col">
          <div className="tienda-detalle-box">
            <h3>
              <Package size={18} aria-hidden="true" />
              Artículos del pedido ({items.length})
            </h3>

            <div className="tienda-articulos-lista">
              {items.map((item) => {
                const nombre = item.producto?.nombre || 'Artículo'
                const sku = item.producto?.sku
                return (
                  <div key={item.id} className="tienda-articulo-fila">
                    <div className="tienda-articulo-info">
                      <span
                        className="tienda-articulo-nombre"
                        style={{ cursor: item.producto?.id && onVerProducto ? 'pointer' : 'default' }}
                        onClick={() => item.producto?.id && onVerProducto?.(item.producto.id)}
                      >
                        {nombre}
                      </span>
                      <span className="tienda-articulo-meta">
                        {sku ? `[${sku}] · ` : ''}
                        {item.cantidad} un. x {formatearMoneda(item.precio_unitario)}
                      </span>
                    </div>
                    <span className="tienda-articulo-subtotal">
                      {formatearMoneda(item.subtotal)}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="tienda-detalle-totales">
              <div className="tienda-detalle-totales-fila">
                <span>Subtotal materiales:</span>
                <span>{formatearMoneda(pedido.total)}</span>
              </div>
              <div className="tienda-detalle-totales-fila">
                <span>Logística / Entrega:</span>
                <span>{esEnvio ? 'Bonificado' : 'Sin cargo'}</span>
              </div>
              <div className="tienda-detalle-totales-fila is-total">
                <span>Total pagado:</span>
                <strong>{formatearMoneda(pedido.total)}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              <Button
                type="button"
                variant="primary"
                icon={RotateCcw}
                loading={reordenando}
                loadingLabel="Cargando al carrito…"
                onClick={handleReordenar}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Volver a comprar pedido
              </Button>
              <Button
                type="button"
                variant="secondary"
                icon={Download}
                onClick={handleDescargarPdf}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Descargar Remito PDF
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MisPedidosPage({ onNavigate, onVerProducto, onNotificar, onAbrirCarrito }) {
  const { cliente, cargando: cargandoCliente } = useClienteWeb()
  const { agregarVarios } = useCarrito()
  const [pedidos, setPedidos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [pedidoAbierto, setPedidoAbierto] = useState(null)
  const [reordenandoId, setReordenandoId] = useState(null)
  const [descargandoId, setDescargandoId] = useState(null)

  useEffect(() => {
    if (!cliente) return
    setCargando(true)
    setError('')
    listarMisPedidos(cliente.id)
      .then(setPedidos)
      .catch((err) => setError(err.message || 'No pudimos cargar tus pedidos'))
      .finally(() => setCargando(false))
  }, [cliente, pedidoAbierto])

  async function handleReordenarDesdeLista(pedido) {
    setReordenandoId(pedido.id)
    try {
      const data = await obtenerSeguimientoPedido(pedido.id)
      if (data?.items?.length) {
        const itemsParaCarrito = data.items
          .filter((it) => it.producto?.id)
          .map((it) => ({ productoId: it.producto.id, cantidad: it.cantidad }))
        await agregarVarios(itemsParaCarrito)
        onNotificar?.({
          mensaje: '¡Productos agregados al carrito!',
          productoNombre: `Pedido #${pedido.numero}`,
        })
        onAbrirCarrito?.()
      }
    } catch (err) {
      setError(err.message || 'No se pudieron agregar los artículos al carrito')
    } finally {
      setReordenandoId(null)
    }
  }

  async function handleDescargarPdfDesdeLista(pedido) {
    setDescargandoId(pedido.id)
    try {
      const data = await obtenerSeguimientoPedido(pedido.id)
      if (data) {
        descargarRemitoWebPdf({
          pedido: data.pedido,
          items: data.items,
          cliente,
        })
      }
    } catch (err) {
      setError(err.message || 'No se pudo generar el comprobante PDF')
    } finally {
      setDescargandoId(null)
    }
  }

  if (cargandoCliente) {
    return (
      <section className="tienda-pedidos-page">
        <p className="loading-state" role="status">
          Cargando tus compras…
        </p>
      </section>
    )
  }

  if (!cliente) {
    return (
      <section className="tienda-pedidos-page">
        <EmptyState
          title="Ingresá para ver tus compras y pedidos"
          description="Iniciá sesión para realizar el seguimiento en vivo de tus pedidos de materiales y descargar tus remitos."
        />
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <Button type="button" variant="primary" onClick={() => onNavigate?.('ingresar')}>
            Iniciar Sesión
          </Button>
        </div>
      </section>
    )
  }

  if (pedidoAbierto) {
    return (
      <DetallePedido
        pedidoId={pedidoAbierto}
        cliente={cliente}
        onVolver={() => setPedidoAbierto(null)}
        onVerProducto={onVerProducto}
        onNotificar={onNotificar}
        onAbrirCarrito={onAbrirCarrito}
      />
    )
  }

  return (
    <section className="tienda-pedidos-page" aria-labelledby="titulo-mis-pedidos">
      <div className="tienda-pedidos-header">
        <h1 id="titulo-mis-pedidos">
          <Package size={28} aria-hidden="true" />
          Mis Compras y Pedidos Web
        </h1>
        <p>
          Seguí tus entregas de materiales en tiempo real, descargá tus remitos oficiales o volvé a comprar con 1 clic.
        </p>
      </div>

      {error && <Feedback tone="error">{error}</Feedback>}
      {cargando && <p className="loading-state" role="status">Cargando tus pedidos…</p>}

      {!cargando && !error && pedidos.length === 0 && (
        <EmptyState
          title="Todavía no realizaste ningún pedido"
          description="Explorá nuestro catálogo con stock en Salta para hacer tu primera compra de materiales."
        />
      )}

      {!cargando && pedidos.length > 0 && (
        <div className="tienda-pedidos-lista">
          {pedidos.map((pedido) => {
            const esEnvio = pedido.tipo_entrega === 'envio'
            const esReordenando = reordenandoId === pedido.id
            const esDescargando = descargandoId === pedido.id

            return (
              <article key={pedido.id} className="tienda-pedido-card">
                <div className="tienda-pedido-card-header">
                  <div className="tienda-pedido-meta">
                    <span className="tienda-pedido-num">Pedido Nº {pedido.numero}</span>
                    <span className="tienda-pedido-fecha">
                      <Calendar size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                      {formatearFecha(pedido.created_at)}
                    </span>
                    <span className="tienda-pedido-tipo-badge">
                      {esEnvio ? <Truck size={13} /> : <Store size={13} />}
                      {esEnvio ? 'Envío a obra' : 'Retiro en sucursal'}
                    </span>
                  </div>
                  <EstadoPedidoBadge estado={pedido.estado} />
                </div>

                <div className="tienda-pedido-card-body">
                  <div className="tienda-pedido-preview-items">
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Modalidad: <strong>{esEnvio ? 'Camión grúa a obra' : 'Carga pesada en sucursal'}</strong>
                    </span>
                  </div>

                  <div className="tienda-pedido-card-total-box">
                    <span className="tienda-pedido-card-total-label">Total del pedido</span>
                    <span className="tienda-pedido-card-total">
                      {formatearMoneda(pedido.total)}
                    </span>
                  </div>
                </div>

                <div className="tienda-pedido-card-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    icon={PackageCheck}
                    onClick={() => setPedidoAbierto(pedido.id)}
                    aria-label={`Ver seguimiento del pedido ${pedido.numero}`}
                  >
                    Ver detalle y seguimiento
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    icon={RotateCcw}
                    loading={esReordenando}
                    loadingLabel="Cargando…"
                    onClick={() => handleReordenarDesdeLista(pedido)}
                    title="Volver a comprar estos materiales"
                  >
                    Volver a comprar
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    icon={Download}
                    loading={esDescargando}
                    loadingLabel="Generando…"
                    onClick={() => handleDescargarPdfDesdeLista(pedido)}
                    title="Descargar comprobante en PDF"
                  >
                    Remito PDF
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
