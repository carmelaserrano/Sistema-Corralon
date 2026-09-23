import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  anularVenta,
  getHistorialEstadoVenta,
  listarVentasSupervision,
  marcarEntregada,
  puedeAnularVentas,
  puedeEntregarVentas,
} from '../api/estadosVentaApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

const ESTADOS_VENTA = ['Pendiente', 'Facturada', 'Entregada', 'Anulada']

// CA-01: mismo criterio que EstadoClienteBadge — un color por estado, no
// sólo texto. Facturada reutiliza el tono "info" (en curso, no es ni un
// éxito ni una alerta); el resto ya tenía un tono claro por su semántica.
const TONOS_ESTADO = {
  Pendiente: 'advertencia',
  Facturada: 'principal',
  Entregada: 'activo',
  Anulada: 'error',
}

function EstadoVentaBadge({ estado }) {
  const tono = TONOS_ESTADO[estado] ?? 'inactivo'
  return <span className={`estado-badge estado-badge-${tono}`}>{estado}</span>
}

function nombreCliente(cliente) {
  if (!cliente) return '—'
  return cliente.tipo_persona === 'juridica'
    ? cliente.razon_social
    : `${cliente.apellido}, ${cliente.nombre}`
}

function formatearFecha(fechaIso) {
  return new Date(fechaIso).toLocaleString('es-AR')
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor)
}

// Modal de detalle de una venta (CA-06): historial de estados + las
// acciones que correspondan según el estado actual. Lo abre y cierra el
// padre condicionalmente (no `if (!abierto) return null` adentro): así cada
// venta que se abre es un montaje nuevo, sin arrastrar el formulario de
// anulación ni el error de la venta anterior (misma lección del panel de
// domicilios de Clientes).
function ModalDetalleVenta({ venta, puedeEntregar, puedeAnular, onCambio, onCerrar }) {
  const [historial, setHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(true)
  const [mostrarFormAnular, setMostrarFormAnular] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [procesando, setProcesando] = useState(false)
  const cerrarRef = useRef(null)

  async function cargarHistorial() {
    try {
      setCargandoHistorial(true)
      const data = await getHistorialEstadoVenta(venta.id)
      setHistorial(data)
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

  async function entregar() {
    try {
      setProcesando(true)
      setError('')
      setAviso('')
      const actualizada = await marcarEntregada(venta.id)
      setAviso('Venta marcada como entregada')
      onCambio(actualizada)
      await cargarHistorial()
    } catch (err) {
      setError(err.message || 'No se pudo marcar la venta como entregada')
    } finally {
      setProcesando(false)
    }
  }

  async function confirmarAnulacion(event) {
    event.preventDefault()

    if (!motivo.trim()) {
      setError('El motivo es obligatorio para anular')
      return
    }

    try {
      setProcesando(true)
      setError('')
      setAviso('')
      const actualizada = await anularVenta(venta.id, motivo)
      setAviso('Venta anulada')
      setMostrarFormAnular(false)
      setMotivo('')
      onCambio(actualizada)
      await cargarHistorial()
    } catch (err) {
      // CA-05: si hace falta una Nota de Crédito, el mensaje de la API ya lo
      // explica ("generá una Nota de Crédito por el total"); no hay una
      // acción para generarla desde acá todavía.
      setError(err.message || 'No se pudo anular la venta')
    } finally {
      setProcesando(false)
    }
  }

  // CA-03/CA-04: qué se puede hacer según el estado actual. Entregada y
  // Anulada son finales: ninguna acción para ellas.
  const puedeMarcarEntregada = venta.estado === 'Facturada' && puedeEntregar
  const puedeOfrecerAnular =
    (venta.estado === 'Pendiente' || venta.estado === 'Facturada') && puedeAnular

  return (
    <div className="modal-backdrop" onMouseDown={onCerrar}>
      <section
        aria-labelledby="detalle-venta-title"
        aria-modal="true"
        className="modal-panel"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Venta</p>
            <h2 id="detalle-venta-title">
              Nº {venta.numero} — {nombreCliente(venta.cliente)}
            </h2>
            <p>
              {formatearMoneda(venta.total)} · <EstadoVentaBadge estado={venta.estado} />
            </p>
          </div>
          <button
            aria-label="Cerrar"
            className="icon-button"
            onClick={onCerrar}
            ref={cerrarRef}
            title="Cerrar"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}
        {aviso && <Feedback tone="success">{aviso}</Feedback>}

        {(puedeMarcarEntregada || puedeOfrecerAnular) && !mostrarFormAnular && (
          <div>
            {puedeMarcarEntregada && (
              <Button type="button" onClick={entregar} loading={procesando}>
                Marcar entregada
              </Button>
            )}
            {puedeOfrecerAnular && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMostrarFormAnular(true)
                  setError('')
                }}
                disabled={procesando}
              >
                Anular
              </Button>
            )}
          </div>
        )}

        {mostrarFormAnular && (
          <form onSubmit={confirmarAnulacion}>
            <div>
              <label htmlFor="motivo-anulacion">Motivo de la anulación</label>
              <textarea
                id="motivo-anulacion"
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Por qué se anula esta venta"
              />
            </div>
            <div>
              <Button type="submit" loading={procesando} loadingLabel="Anulando…">
                Confirmar anulación
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMostrarFormAnular(false)
                  setMotivo('')
                  setError('')
                }}
                disabled={procesando}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        <h3>Historial de estados</h3>

        {cargandoHistorial && (
          <p className="loading-state" role="status">
            Cargando historial…
          </p>
        )}

        {!cargandoHistorial && historial.length === 0 && (
          <p>Esta venta no registra cambios de estado.</p>
        )}

        {!cargandoHistorial && historial.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Anterior</th>
                <th>Nuevo</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((cambio) => (
                <tr key={cambio.id}>
                  <td>{formatearFecha(cambio.created_at)}</td>
                  <td>{cambio.estado_anterior ?? '—'}</td>
                  <td>{cambio.estado_nuevo}</td>
                  <td>{cambio.motivo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function SupervisionVentasPage() {
  const [ventas, setVentas] = useState([])

  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  const [ventaSeleccionadaId, setVentaSeleccionadaId] = useState(null)

  // Arrancan en true: si falla la consulta del permiso, es preferible dejar
  // las acciones a la vista y que la RLS/la función rechacen, antes que
  // afirmarle al usuario que no tiene un permiso que quizá sí tiene (mismo
  // criterio que en clientesApi/descuentosApi).
  const [puedeEntregar, setPuedeEntregar] = useState(true)
  const [puedeAnular, setPuedeAnular] = useState(true)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function cargarVentas(filtros) {
    try {
      setLoading(true)
      setError('')
      const data = await listarVentasSupervision(filtros)
      setVentas(data)
    } catch (err) {
      setVentas([])
      setError(err.message || 'No se pudieron cargar las ventas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.all([puedeEntregarVentas(), puedeAnularVentas()])
      .then(([entregar, anular]) => {
        setPuedeEntregar(entregar)
        setPuedeAnular(anular)
      })
      .catch(() => {
        setPuedeEntregar(true)
        setPuedeAnular(true)
      })

    cargarVentas({})
  }, [])

  function filtrosActuales() {
    return {
      estado: filtroEstado || undefined,
      desde: filtroDesde || undefined,
      hasta: filtroHasta || undefined,
    }
  }

  function aplicarFiltros(event) {
    event.preventDefault()
    cargarVentas(filtrosActuales())
  }

  function limpiarFiltros() {
    setFiltroEstado('')
    setFiltroDesde('')
    setFiltroHasta('')
    cargarVentas({})
  }

  // El cambio ya viene confirmado por la base: se actualiza la fila en el
  // listado sin recargar todo, y el modal (que recibe esta misma venta como
  // prop) refleja el nuevo estado solo.
  function manejarCambio(ventaActualizada) {
    setVentas((actual) =>
      actual.map((v) => (v.id === ventaActualizada.id ? { ...v, ...ventaActualizada } : v)),
    )
  }

  const ventaSeleccionada = ventaSeleccionadaId
    ? (ventas.find((v) => v.id === ventaSeleccionadaId) ?? null)
    : null

  return (
    <main>
      <h1>Supervisión de ventas</h1>

      {error && <Feedback tone="error">{error}</Feedback>}

      <section>
        <h2>Filtros</h2>

        <form onSubmit={aplicarFiltros}>
          <div>
            <label htmlFor="filtro-estado">Estado</label>
            <select
              id="filtro-estado"
              value={filtroEstado}
              onChange={(event) => setFiltroEstado(event.target.value)}
            >
              <option value="">Todos</option>
              {ESTADOS_VENTA.map((estado) => (
                <option key={estado} value={estado}>
                  {estado}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filtro-desde">Desde</label>
            <input
              id="filtro-desde"
              type="date"
              value={filtroDesde}
              onChange={(event) => setFiltroDesde(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="filtro-hasta">Hasta</label>
            <input
              id="filtro-hasta"
              type="date"
              value={filtroHasta}
              onChange={(event) => setFiltroHasta(event.target.value)}
            />
          </div>

          <div>
            <Button type="submit">Filtrar</Button>
            <Button type="button" variant="ghost" onClick={limpiarFiltros}>
              Limpiar
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2>
          Ventas
          {!loading && !error && ` (${ventas.length})`}
        </h2>

        {loading && (
          <p className="loading-state" role="status">
            Cargando ventas…
          </p>
        )}

        {!loading && !error && ventas.length === 0 && (
          <EmptyState
            title="No hay ventas para estos filtros"
            description="Probá cambiar el estado o el rango de fechas."
          />
        )}

        {!loading && !error && ventas.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((venta) => (
                <tr key={venta.id}>
                  <td>{venta.numero}</td>
                  <td>{formatearFecha(venta.created_at)}</td>
                  <td>{nombreCliente(venta.cliente)}</td>
                  <td>{formatearMoneda(venta.total)}</td>
                  <td>
                    <EstadoVentaBadge estado={venta.estado} />
                  </td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setVentaSeleccionadaId(venta.id)}
                    >
                      Ver detalle
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {ventaSeleccionada && (
        <ModalDetalleVenta
          venta={ventaSeleccionada}
          puedeEntregar={puedeEntregar}
          puedeAnular={puedeAnular}
          onCambio={manejarCambio}
          onCerrar={() => setVentaSeleccionadaId(null)}
        />
      )}
    </main>
  )
}

export default SupervisionVentasPage
