import { useEffect, useState } from 'react'
import { ArrowLeft, Package } from 'lucide-react'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'
import { useClienteWeb } from '../context/ClienteWebContext'
import { armarLineaDeTiempo, listarMisPedidos, obtenerSeguimientoPedido } from '../api/pedidosWebApi'

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
  return new Date(fechaIso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor)
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
          <li key={paso.estado} aria-current={paso.actual ? 'step' : undefined}
            style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 12, minHeight: 56 }}>
            <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{
                width: 14, height: 14, marginTop: 3, borderRadius: '50%', border: `2px solid ${color}`,
                background: paso.completado ? color : 'var(--surface-panel)',
                boxShadow: paso.actual ? `0 0 0 4px ${cancelado ? 'var(--color-danger-soft)' : 'var(--color-success-soft)'}` : 'none',
              }} />
              {i < pasos.length - 1 && <span style={{ flex: 1, width: 2, background: pasos[i + 1].completado ? color : 'var(--border-default)' }} />}
            </span>
            <div style={{ paddingBottom: 16, color: paso.completado ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              <strong style={{ fontWeight: paso.actual ? 700 : 500 }}>{paso.estado}</strong>
              <small style={{ display: 'block', color: 'var(--text-muted)' }}>
                {paso.fecha ? formatearFecha(paso.fecha) : paso.completado ? 'Sin fecha registrada' : 'Pendiente'}
              </small>
              {paso.motivo && cancelado && <small style={{ display: 'block' }}>Motivo: {paso.motivo}</small>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function DetallePedido({ pedidoId, onVolver }) {
  const [seguimiento, setSeguimiento] = useState(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    obtenerSeguimientoPedido(pedidoId)
      .then(setSeguimiento)
      .catch((err) => setError(err.message || 'No pudimos cargar el pedido'))
  }, [pedidoId])

  const volver = (
    <Button type="button" variant="ghost" icon={ArrowLeft} onClick={onVolver}>Volver a mis pedidos</Button>
  )

  if (error) return <>{volver}<Feedback tone="error">{error}</Feedback></>
  if (seguimiento === undefined) return <>{volver}<p className="loading-state" role="status">Cargando pedido…</p></>
  // CA-05: la RLS no devuelve pedidos de otro cliente; se ve igual que uno inexistente.
  if (seguimiento === null) {
    return <>{volver}<EmptyState title="Pedido no encontrado" description="Este pedido no existe o no pertenece a tu cuenta." /></>
  }

  const { pedido, items, historial } = seguimiento
  return (
    <>
      {volver}
      <h2>Pedido Nº {pedido.numero}</h2>
      <p>
        {formatearFecha(pedido.created_at)} · {pedido.tipo_entrega === 'envio' ? 'Envío a domicilio' : 'Retiro en sucursal'} ·{' '}
        <EstadoPedidoBadge estado={pedido.estado} />
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, alignItems: 'start' }}>
        <section aria-labelledby="titulo-seguimiento">
          <h3 id="titulo-seguimiento">Seguimiento</h3>
          <LineaDeTiempoPedido pedido={pedido} historial={historial} />
        </section>
        <section aria-labelledby="titulo-items">
          <h3 id="titulo-items">Artículos</h3>
          <table>
            <thead><tr><th scope="col">Artículo</th><th scope="col">Cant.</th><th scope="col">Subtotal</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.producto?.nombre ?? '—'}</td>
                  <td>{item.cantidad}</td>
                  <td>{formatearMoneda(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th scope="row" colSpan={2}>Total</th><td><strong>{formatearMoneda(pedido.total)}</strong></td></tr></tfoot>
          </table>
        </section>
      </div>
    </>
  )
}

export default function MisPedidosPage() {
  const { cliente, cargando: cargandoCliente } = useClienteWeb()
  const [pedidos, setPedidos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [pedidoAbierto, setPedidoAbierto] = useState(null)

  useEffect(() => {
    if (!cliente) return
    setCargando(true)
    setError('')
    listarMisPedidos(cliente.id)
      .then(setPedidos)
      .catch((err) => setError(err.message || 'No pudimos cargar tus pedidos'))
      .finally(() => setCargando(false))
  }, [cliente, pedidoAbierto])

  const contenedor = { maxWidth: 900, margin: '24px auto', padding: '0 16px' }

  if (cargandoCliente) {
    return <section style={contenedor}><p className="loading-state" role="status">Cargando…</p></section>
  }
  if (!cliente) {
    return (
      <section style={contenedor}>
        <EmptyState title="Ingresá para ver tus pedidos" description="Tus compras aparecen acá cuando iniciás sesión con tu cuenta." />
      </section>
    )
  }

  return (
    <section aria-labelledby="titulo-mis-pedidos" style={contenedor}>
      <h1 id="titulo-mis-pedidos"><Package size={26} aria-hidden="true" /> Mis pedidos</h1>

      {pedidoAbierto ? (
        <DetallePedido pedidoId={pedidoAbierto} onVolver={() => setPedidoAbierto(null)} />
      ) : (
        <>
          {error && <Feedback tone="error">{error}</Feedback>}
          {cargando && <p className="loading-state" role="status">Cargando tus pedidos…</p>}
          {!cargando && !error && pedidos.length === 0 && (
            <EmptyState title="Todavía no hiciste pedidos" description="Cuando compres en la tienda, vas a poder seguir cada pedido desde acá." />
          )}
          {!cargando && pedidos.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th scope="col">Nº</th>
                  <th scope="col">Fecha</th>
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
                    <td>{formatearMoneda(pedido.total)}</td>
                    <td><EstadoPedidoBadge estado={pedido.estado} /></td>
                    <td>
                      <Button type="button" variant="ghost" onClick={() => setPedidoAbierto(pedido.id)}
                        aria-label={`Ver seguimiento del pedido ${pedido.numero}`}>
                        Ver seguimiento
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}
