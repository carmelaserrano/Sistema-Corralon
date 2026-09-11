import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { getHistorialArticuloDeposito } from '../api/movimientosApi'
import EmptyState from '../../../components/ui/EmptyState'

function formatearFecha(fecha) {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleString('es-AR')
}

function formatearCantidad(valor) {
  const numero = Number(valor ?? 0)
  return Number.isInteger(numero) ? String(numero) : numero.toLocaleString('es-AR')
}

export default function HistorialArticuloModal({
  articulo,
  depositoId,
  depositoNombre,
  onCerrar,
}) {
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const cerrarRef = useRef(null)

  useEffect(() => {
    cerrarRef.current?.focus()
  }, [])

  useEffect(() => {
    function manejarTecla(event) {
      if (event.key === 'Escape') onCerrar()
    }

    document.addEventListener('keydown', manejarTecla)
    return () => document.removeEventListener('keydown', manejarTecla)
  }, [onCerrar])

  useEffect(() => {
    let cancelado = false

    async function cargarHistorial() {
      try {
        setLoading(true)
        setError('')
        const data = await getHistorialArticuloDeposito({
          articuloId: articulo.id,
          depositoId,
        })

        if (!cancelado) setMovimientos(data)
      } catch (err) {
        if (!cancelado) {
          setError(err.message || 'No se pudo cargar el historial del artículo')
        }
      } finally {
        if (!cancelado) setLoading(false)
      }
    }

    cargarHistorial()

    return () => {
      cancelado = true
    }
  }, [articulo.id, depositoId])

  return (
    <div className="modal-backdrop" onMouseDown={onCerrar}>
      <section
        aria-labelledby="historial-articulo-title"
        aria-modal="true"
        className="modal-panel historial-articulo-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Historial por artículo</p>
            <h2 id="historial-articulo-title">{articulo.sku} - {articulo.nombre}</h2>
            <p>
              Depósito: <strong>{depositoNombre || '-'}</strong>
            </p>
          </div>
          <button
            aria-label="Cerrar historial"
            className="icon-button"
            onClick={onCerrar}
            ref={cerrarRef}
            title="Cerrar historial"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        {error && <p className="feedback feedback-error" role="alert">{error}</p>}
        {loading && <p className="loading-state">Cargando historial...</p>}

        {!loading && !error && movimientos.length === 0 && (
          <EmptyState
            description="Este artículo todavía no tiene ingresos ni egresos confirmados en el depósito seleccionado."
            title="Sin movimientos registrados"
          />
        )}

        {!loading && !error && movimientos.length > 0 && (
          <div className="historial-articulo-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Depósito</th>
                  <th>Cantidad</th>
                  <th>Stock resultante</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((movimiento) => (
                  <tr key={`${movimiento.movimiento_id}-${movimiento.detalle_id}`}>
                    <td>{formatearFecha(movimiento.fecha)}</td>
                    <td>{movimiento.tipo}</td>
                    <td>{movimiento.deposito_nombre || depositoNombre || '-'}</td>
                    <td>{formatearCantidad(movimiento.cantidad)}</td>
                    <td>{formatearCantidad(movimiento.stock_resultante)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
