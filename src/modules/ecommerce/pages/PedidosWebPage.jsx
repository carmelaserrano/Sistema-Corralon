import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  avanzarEstadoPedido,
  ESTADOS_PEDIDO,
  listarPedidosWeb,
  obtenerDetallePedidoBackoffice,
  puedeGestionarPedidos,
  siguientesEstados,
  suscribirPedidosWeb,
} from '../api/pedidosWebApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { EstadoPedidoBadge, LineaDeTiempoPedido } from './MisPedidosPage'


function formatearFecha(fechaIso) {
  return new Date(fechaIso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor)
}

function nombreCliente(cliente) {
  if (!cliente) return '—'
  return cliente.tipo_persona === 'juridica' ? cliente.razon_social : `${cliente.apellido}, ${cliente.nombre}`
}

// Lo abre y cierra el padre condicionalmente: cada pedido que se abre es un
// montaje nuevo, sin arrastrar el motivo ni el error del anterior (misma
// lección que ModalDetalleVenta).
function ModalDetallePedido({ pedido, puedeGestionar, onCambio, onCerrar }) {
  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(true)
  const [mostrarFormCancelar, setMostrarFormCancelar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [procesando, setProcesando] = useState(false)
  const cerrarRef = useRef(null)

  useEffect(() => {
    cerrarRef.current?.focus()
  }, [])

  // El detalle (ítems e historial) se vuelve a pedir cada vez que cambia el
  // estado del pedido, ya sea por una acción propia o por otro operador.
  useEffect(() => {
    let vigente = true
    setCargandoDetalle(true)
    obtenerDetallePedidoBackoffice(pedido.id)
      .then((resultado) => {
        if (!vigente) return
        if (!resultado) throw new Error('El pedido ya no está disponible')
        setDetalle(resultado)
      })
      .catch((err) => {
        if (vigente) setError(err.message || 'No se pudo cargar el detalle del pedido')
      })
      .finally(() => {
        if (vigente) setCargandoDetalle(false)
      })
    return () => { vigente = false }
  }, [pedido.id, pedido.estado])

  useEffect(() => {
    function manejarTecla(event) {
      if (event.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', manejarTecla)
    return () => document.removeEventListener('keydown', manejarTecla)
  }, [onCerrar])

  async function avanzar(estado, motivoCambio) {
    try {
      setProcesando(true)
      setError('')
      setAviso('')
      const actualizado = await avanzarEstadoPedido(pedido.id, estado, motivoCambio)
      setAviso(`Pedido pasado a «${estado}»`)
      setMostrarFormCancelar(false)
      setMotivo('')
      onCambio(actualizado)
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado del pedido')
    } finally {
      setProcesando(false)
    }
  }

  function confirmarCancelacion(event) {
    event.preventDefault()
    if (!motivo.trim()) {
      setError('El motivo es obligatorio para cancelar')
      return
    }
    avanzar('Cancelado', motivo)
  }

  // CA-03: solo el siguiente estado válido. Cancelar va aparte porque pide motivo.
  const pedidoCompleto = detalle?.pedido
    ? {
        ...detalle.pedido,
        ...pedido,
        cliente: detalle.pedido.cliente ?? pedido.cliente,
        domicilio: detalle.pedido.domicilio ?? pedido.domicilio,
      }
    : pedido
  const items = detalle?.items ?? []
  const historial = detalle?.historial ?? []
  const cliente = pedidoCompleto.cliente
  const domicilio = pedidoCompleto.domicilio
  const siguientes = puedeGestionar ? siguientesEstados(pedidoCompleto) : []
  const avances = siguientes.filter((estado) => estado !== 'Cancelado')
  const puedeCancelar = siguientes.includes('Cancelado')

  return (
    <div className="modal-backdrop" onMouseDown={onCerrar}>
      <section aria-labelledby="detalle-pedido-title" aria-modal="true" className="modal-panel"
        onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Pedido web</p>
            <h2 id="detalle-pedido-title">Nº {pedidoCompleto.numero} — {nombreCliente(pedidoCompleto.cliente)}</h2>
            <p>
              {formatearMoneda(pedidoCompleto.total)} · {pedidoCompleto.tipo_entrega === 'envio' ? 'Envío' : 'Retiro'} ·{' '}
              <EstadoPedidoBadge estado={pedidoCompleto.estado} />
            </p>
          </div>
          {/* padding 0 inline: `.page-canvas button[type="button"]` es más
              específica que `.page-canvas .icon-button` y le devuelve 12px
              de padding, que descentran la X. */}
          <button aria-label="Cerrar" className="icon-button" onClick={onCerrar} ref={cerrarRef} title="Cerrar" type="button"
            style={{ padding: 0 }}>
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}
        {aviso && <Feedback tone="success">{aviso}</Feedback>}

        {pedidoCompleto.estado === 'Pendiente de pago' && puedeGestionar && (
          <Feedback>El paso a «Pagado» lo confirma la pasarela de pago; no se hace a mano.</Feedback>
        )}

        {cargandoDetalle && <p className="loading-state" role="status">Cargando detalle del pedido…</p>}

        {!cargandoDetalle && detalle && (
          <>
            <section aria-labelledby="datos-pedido-title">
              <h3 id="datos-pedido-title">Datos del pedido</h3>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, margin: 0 }}>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>ID</dt>
                  <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{pedidoCompleto.id}</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Fecha</dt>
                  <dd style={{ margin: 0 }}>{formatearFecha(pedidoCompleto.created_at)}</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Modalidad de entrega</dt>
                  <dd style={{ margin: 0 }}>{pedidoCompleto.tipo_entrega === 'envio' ? 'Envío' : 'Retiro'}</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Estado</dt>
                  <dd style={{ margin: 0 }}><EstadoPedidoBadge estado={pedidoCompleto.estado} /></dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="cliente-pedido-title">
              <h3 id="cliente-pedido-title">Cliente</h3>
              <p style={{ marginBottom: 4 }}><strong>{nombreCliente(cliente)}</strong></p>
              {cliente?.numero_documento && (
                <p style={{ margin: '4px 0' }}>
                  Documento: {[cliente.tipo_documento, cliente.numero_documento].filter(Boolean).join(' ')}
                </p>
              )}
              {cliente?.telefono && <p style={{ margin: '4px 0' }}>Teléfono: {cliente.telefono}</p>}
              {cliente?.email && <p style={{ margin: '4px 0' }}>Email: {cliente.email}</p>}
            </section>

            {pedidoCompleto.tipo_entrega === 'envio' && (
              <section aria-labelledby="domicilio-pedido-title">
                <h3 id="domicilio-pedido-title">Domicilio de entrega</h3>
                {domicilio ? (
                  <address style={{ fontStyle: 'normal' }}>
                    {domicilio.alias && <strong style={{ display: 'block' }}>{domicilio.alias}</strong>}
                    <span style={{ display: 'block' }}>{domicilio.calle} {domicilio.numero}</span>
                    <span style={{ display: 'block' }}>
                      {domicilio.localidad}, {domicilio.provincia}
                      {domicilio.codigo_postal ? ` · CP ${domicilio.codigo_postal}` : ''}
                    </span>
                    {domicilio.referencias && <span style={{ display: 'block' }}>Referencias: {domicilio.referencias}</span>}
                  </address>
                ) : (
                  <Feedback tone="error">El pedido con envío no tiene un domicilio disponible.</Feedback>
                )}
              </section>
            )}

            <section aria-labelledby="articulos-pedido-title">
              <h3 id="articulos-pedido-title">Artículos</h3>
              {items.length === 0 ? (
                <p>El pedido no tiene artículos visibles.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Artículo</th>
                        <th scope="col">Cantidad</th>
                        <th scope="col">Precio unitario</th>
                        <th scope="col">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.producto?.nombre ?? 'Producto no disponible'}</strong>
                            {item.producto?.sku && <small style={{ display: 'block' }}>SKU: {item.producto.sku}</small>}
                          </td>
                          <td>{item.cantidad}</td>
                          <td>{formatearMoneda(item.precio_unitario)}</td>
                          <td>{formatearMoneda(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan="3" scope="row">Total del pedido</th>
                        <td><strong>{formatearMoneda(pedidoCompleto.total)}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {(avances.length > 0 || puedeCancelar) && !mostrarFormCancelar && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {avances.map((estado) => (
              <Button key={estado} type="button" loading={procesando} onClick={() => avanzar(estado)}>
                Pasar a «{estado}»
              </Button>
            ))}
            {puedeCancelar && (
              <Button type="button" variant="ghost" disabled={procesando}
                onClick={() => { setMostrarFormCancelar(true); setError('') }}>
                Cancelar pedido
              </Button>
            )}
          </div>
        )}

        {mostrarFormCancelar && (
          <form onSubmit={confirmarCancelacion}>
            <div>
              <label htmlFor="motivo-cancelacion">Motivo de la cancelación</label>
              <textarea id="motivo-cancelacion" value={motivo} onChange={(event) => setMotivo(event.target.value)}
                placeholder="Por qué se cancela este pedido" />
            </div>
            <p><small>Se libera el stock reservado para el pedido.</small></p>
            <div>
              <Button type="submit" loading={procesando} loadingLabel="Cancelando…">Confirmar cancelación</Button>
              <Button type="button" variant="ghost" disabled={procesando}
                onClick={() => { setMostrarFormCancelar(false); setMotivo(''); setError('') }}>
                Volver
              </Button>
            </div>
          </form>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, alignItems: 'start' }}>
          <section>
            <h3>Seguimiento</h3>
            {cargandoDetalle
              ? <p className="loading-state" role="status">Cargando historial…</p>
              : detalle
                ? <LineaDeTiempoPedido pedido={pedidoCompleto} historial={historial} />
                : <p>El seguimiento no está disponible.</p>}
          </section>
          <section>
            <h3>Historial de cambios</h3>
            {!cargandoDetalle && detalle && historial.length === 0 && <p>Este pedido no registra cambios de estado.</p>}
            {/* Lista y no tabla: las tablas de .page-canvas tienen min-width
                de 760px y en media columna del modal obligaban a scrollear. */}
            {detalle && historial.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {[...historial].reverse().map((cambio) => (
                  <li key={cambio.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-default)' }}>
                    <small style={{ display: 'block', color: 'var(--text-muted)' }}>{formatearFecha(cambio.created_at)}</small>
                    <strong style={{ fontWeight: 600 }}>
                      {cambio.estado_anterior ? `${cambio.estado_anterior} → ` : 'Alta: '}{cambio.estado_nuevo}
                    </strong>
                    {cambio.motivo && <small style={{ display: 'block' }}>Motivo: {cambio.motivo}</small>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}

export default function PedidosWebPage() {
  const [pedidos, setPedidos] = useState([])
  const [filtroEstado, setFiltroEstado] = useState('')
  // Se guarda el pedido abierto (no solo su id) para que el modal no
  // desaparezca si un refresco deja de incluirlo en la lista filtrada.
  const [pedidoAbierto, setPedidoAbierto] = useState(null)
  // Arranca en true: si falla la consulta del permiso se muestran las
  // acciones y decide la base (mismo criterio que Supervisión de ventas).
  const [puedeGestionar, setPuedeGestionar] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const ultimaConsulta = useRef(0)
  const cargarPedidosRef = useRef(null)

  useEffect(() => {
    puedeGestionarPedidos().then(setPuedeGestionar).catch(() => setPuedeGestionar(true))
  }, [])

  const cargarPedidos = useCallback(async ({ silenciosa = false } = {}) => {
    const consulta = ++ultimaConsulta.current
    if (!silenciosa) setCargando(true)
    setError('')
    try {
      const data = await listarPedidosWeb({ estado: filtroEstado || undefined })
      if (consulta === ultimaConsulta.current) setPedidos(data)
    } catch (err) {
      if (consulta !== ultimaConsulta.current) return
      if (!silenciosa) setPedidos([])
      setError(err.message || 'No se pudieron cargar los pedidos')
    } finally {
      if (consulta === ultimaConsulta.current && !silenciosa) setCargando(false)
    }
  }, [filtroEstado])

  useEffect(() => {
    void cargarPedidos()
  }, [cargarPedidos])

  useEffect(() => {
    cargarPedidosRef.current = cargarPedidos
  }, [cargarPedidos])

  // Una única suscripción por montaje: lee el filtro vigente desde el ref y
  // agrupa ráfagas de eventos en una sola consulta.
  useEffect(() => {
    let temporizador = null
    const cancelar = suscribirPedidosWeb(() => {
      clearTimeout(temporizador)
      temporizador = setTimeout(() => {
        void cargarPedidosRef.current?.({ silenciosa: true })
      }, 300)
    })
    return () => {
      clearTimeout(temporizador)
      cancelar()
    }
  }, [])

  // La base ya confirmó el cambio: se actualiza la fila sin recargar todo y
  // el modal (que recibe este mismo pedido) refleja el nuevo estado solo.
  function manejarCambio(actualizado) {
    setPedidos((actual) => actual.map((p) => (p.id === actualizado.id ? { ...p, ...actualizado } : p)))
    setPedidoAbierto((actual) => (actual?.id === actualizado.id ? { ...actual, ...actualizado } : actual))
  }

  // Si la lista trae una versión más nueva del pedido abierto (cambio de otro
  // operador) se usa esa; si ya no cumple el filtro se conserva la última.
  const pedidoSeleccionado = pedidoAbierto
    ? { ...pedidoAbierto, ...(pedidos.find((p) => p.id === pedidoAbierto.id) ?? {}) }
    : null

  const pedidosPendientes = pedidos.filter(
    (p) => p.estado === 'Pendiente' || p.estado === 'En preparación',
  ).length
  const pedidosEnTransito = pedidos.filter(
    (p) => p.estado === 'En camino' || p.estado === 'Listo para retiro',
  ).length
  const pedidosEntregados = pedidos.filter((p) => p.estado === 'Entregado').length

  return (
    <main aria-busy={cargando}>
      <PageHeader
        kicker="Módulo E-commerce"
        title="Pedidos web"
        description="Seguí los pedidos de la tienda online y avanzalos por su ciclo: preparación, retiro o envío, y entrega."
      />

      <div className="kpi-grid">
        <KpiCard
          label="Total pedidos"
          value={pedidos.length}
          tone="default"
          helperText="Registrados en la tienda"
        />
        <KpiCard
          label="En preparación"
          value={pedidosPendientes}
          tone={pedidosPendientes > 0 ? 'warning' : 'default'}
          helperText="Requieren armado de pedido"
        />
        <KpiCard
          label="Listos / En camino"
          value={pedidosEnTransito}
          tone={pedidosEnTransito > 0 ? 'info' : 'default'}
          helperText="En tránsito o listos para retiro"
        />
        <KpiCard
          label="Completados"
          value={pedidosEntregados}
          tone="success"
          helperText="Entregados al cliente"
        />
      </div>

      {!puedeGestionar && (
        <Feedback>
          Podés consultar los pedidos, pero para cambiarlos de estado necesitás el
          permiso «ecommerce.pedidos.gestionar».
        </Feedback>
      )}

      <div
        className="data-table-toolbar"
        style={{
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-4)',
          border: '1px solid var(--border-default)',
        }}
      >
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <span>Filtrar por estado:</span>
          <select
            value={filtroEstado}
            onChange={(event) => setFiltroEstado(event.target.value)}
            style={{ minHeight: '36px', padding: '0 12px' }}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_PEDIDO.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <Feedback tone="error">{error}</Feedback>}
      {cargando && <p className="loading-state" role="status">Cargando pedidos…</p>}

      {!cargando && !error && pedidos.length === 0 && (
        <EmptyState
          title="No hay pedidos"
          description={
            filtroEstado
              ? 'Probá con otro estado.'
              : 'Todavía no entraron pedidos por la tienda.'
          }
        />
      )}

      {!cargando && pedidos.length > 0 && (
        <div className="data-table-card">
          <div className="data-table-scroll-container">
            <table>
              <caption style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>
                {pedidos.length} pedidos encontrados
              </caption>
              <thead>
                <tr>
                  <th scope="col">Nº</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Entrega</th>
                  <th scope="col">Total</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((pedido) => (
                  <tr key={pedido.id}>
                    <td>
                      <code>{pedido.numero}</code>
                    </td>
                    <td>{formatearFecha(pedido.created_at)}</td>
                    <td>
                      <strong>{nombreCliente(pedido.cliente)}</strong>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px',
                          fontWeight: 600,
                          background:
                            pedido.tipo_entrega === 'envio'
                              ? 'var(--color-info-soft)'
                              : 'var(--surface-subtle)',
                          color:
                            pedido.tipo_entrega === 'envio'
                              ? 'var(--color-info)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {pedido.tipo_entrega === 'envio' ? 'Envío a domicilio' : 'Retiro en sucursal'}
                      </span>
                    </td>
                    <td>
                      <strong>{formatearMoneda(pedido.total)}</strong>
                    </td>
                    <td>
                      <EstadoPedidoBadge estado={pedido.estado} />
                    </td>
                    <td>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setPedidoAbierto(pedido)}
                      >
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pedidoSeleccionado && (
        <ModalDetallePedido
          pedido={pedidoSeleccionado}
          puedeGestionar={puedeGestionar}
          onCambio={manejarCambio}
          onCerrar={() => setPedidoAbierto(null)}
        />
      )}
    </main>
  )
}
