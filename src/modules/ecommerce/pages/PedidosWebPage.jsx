import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  avanzarEstadoPedido,
  ESTADOS_PEDIDO,
  listarHistorialPedido,
  listarPedidosWeb,
  puedeGestionarPedidos,
  siguientesEstados,
} from '../api/pedidosWebApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'
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
  const [historial, setHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(true)
  const [mostrarFormCancelar, setMostrarFormCancelar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [procesando, setProcesando] = useState(false)
  const cerrarRef = useRef(null)

  async function cargarHistorial() {
    try {
      setCargandoHistorial(true)
      setHistorial(await listarHistorialPedido(pedido.id))
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial')
    } finally {
      setCargandoHistorial(false)
    }
  }

  useEffect(() => {
    cerrarRef.current?.focus()
    cargarHistorial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      await cargarHistorial()
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
  const siguientes = puedeGestionar ? siguientesEstados(pedido) : []
  const avances = siguientes.filter((estado) => estado !== 'Cancelado')
  const puedeCancelar = siguientes.includes('Cancelado')

  return (
    <div className="modal-backdrop" onMouseDown={onCerrar}>
      <section aria-labelledby="detalle-pedido-title" aria-modal="true" className="modal-panel"
        onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Pedido web</p>
            <h2 id="detalle-pedido-title">Nº {pedido.numero} — {nombreCliente(pedido.cliente)}</h2>
            <p>
              {formatearMoneda(pedido.total)} · {pedido.tipo_entrega === 'envio' ? 'Envío' : 'Retiro'} ·{' '}
              <EstadoPedidoBadge estado={pedido.estado} />
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

        {pedido.estado === 'Pendiente de pago' && puedeGestionar && (
          <Feedback>El paso a «Pagado» lo confirma la pasarela de pago; no se hace a mano.</Feedback>
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
            {cargandoHistorial
              ? <p className="loading-state" role="status">Cargando historial…</p>
              : <LineaDeTiempoPedido pedido={pedido} historial={historial} />}
          </section>
          <section>
            <h3>Historial de cambios</h3>
            {!cargandoHistorial && historial.length === 0 && <p>Este pedido no registra cambios de estado.</p>}
            {/* Lista y no tabla: las tablas de .page-canvas tienen min-width
                de 760px y en media columna del modal obligaban a scrollear. */}
            {historial.length > 0 && (
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
  const [pedidoSeleccionadoId, setPedidoSeleccionadoId] = useState(null)
  // Arranca en true: si falla la consulta del permiso se muestran las
  // acciones y decide la base (mismo criterio que Supervisión de ventas).
  const [puedeGestionar, setPuedeGestionar] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const ultimaConsulta = useRef(0)

  useEffect(() => {
    puedeGestionarPedidos().then(setPuedeGestionar).catch(() => setPuedeGestionar(true))
  }, [])

  useEffect(() => {
    const consulta = ++ultimaConsulta.current
    setCargando(true)
    setError('')
    listarPedidosWeb({ estado: filtroEstado || undefined })
      .then((data) => { if (consulta === ultimaConsulta.current) setPedidos(data) })
      .catch((err) => {
        if (consulta !== ultimaConsulta.current) return
        setPedidos([])
        setError(err.message || 'No se pudieron cargar los pedidos')
      })
      .finally(() => { if (consulta === ultimaConsulta.current) setCargando(false) })
  }, [filtroEstado])

  // La base ya confirmó el cambio: se actualiza la fila sin recargar todo y
  // el modal (que recibe este mismo pedido) refleja el nuevo estado solo.
  function manejarCambio(actualizado) {
    setPedidos((actual) => actual.map((p) => (p.id === actualizado.id ? { ...p, ...actualizado } : p)))
  }

  const pedidoSeleccionado = pedidoSeleccionadoId ? (pedidos.find((p) => p.id === pedidoSeleccionadoId) ?? null) : null

  return (
    <main aria-busy={cargando}>
      <h1>Pedidos web</h1>
      <p>Seguí los pedidos de la tienda online y avanzalos por su ciclo: preparación, retiro o envío, y entrega.</p>

      {!puedeGestionar && (
        <Feedback>Podés consultar los pedidos, pero para cambiarlos de estado necesitás el permiso «ecommerce.pedidos.gestionar».</Feedback>
      )}

      <label style={{ display: 'grid', gap: 4, maxWidth: 280 }}>
        Estado
        <select value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value)}>
          <option value="">Todos</option>
          {ESTADOS_PEDIDO.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
        </select>
      </label>

      {error && <Feedback tone="error">{error}</Feedback>}
      {cargando && <p className="loading-state" role="status">Cargando pedidos…</p>}

      {!cargando && !error && pedidos.length === 0 && (
        <EmptyState title="No hay pedidos" description={filtroEstado ? 'Probá con otro estado.' : 'Todavía no entraron pedidos por la tienda.'} />
      )}

      {!cargando && pedidos.length > 0 && (
        <table>
          <caption style={{ textAlign: 'left' }}>{pedidos.length} pedidos</caption>
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
                <td>{pedido.numero}</td>
                <td>{formatearFecha(pedido.created_at)}</td>
                <td>{nombreCliente(pedido.cliente)}</td>
                <td>{pedido.tipo_entrega === 'envio' ? 'Envío' : 'Retiro'}</td>
                <td>{formatearMoneda(pedido.total)}</td>
                <td><EstadoPedidoBadge estado={pedido.estado} /></td>
                <td>
                  <Button type="button" variant="ghost" onClick={() => setPedidoSeleccionadoId(pedido.id)}>Ver detalle</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pedidoSeleccionado && (
        <ModalDetallePedido
          pedido={pedidoSeleccionado}
          puedeGestionar={puedeGestionar}
          onCambio={manejarCambio}
          onCerrar={() => setPedidoSeleccionadoId(null)}
        />
      )}
    </main>
  )
}
