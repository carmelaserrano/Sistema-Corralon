import { useEffect, useState } from 'react'
import { listarVentas } from '../api/consultaVentasApi'
import VentaDetalle from './VentaDetalle'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

const ESTADOS_VENTA = ['Pendiente', 'Facturada', 'Entregada', 'Anulada']

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
  if (!cliente) return 'Consumidor Final'
  return cliente.tipo_persona === 'juridica'
    ? cliente.razon_social
    : `${cliente.apellido || ''} ${cliente.nombre || ''}`.trim() || 'Consumidor Final'
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(valor || 0)
}

function formatearFecha(fechaIso) {
  if (!fechaIso) return '—'
  return new Date(fechaIso).toLocaleString('es-AR')
}

function formatearComprobanteNumero(pv, numero) {
  const pvStr = String(pv?.numero || pv || '1').padStart(4, '0')
  const numStr = String(numero || 0).padStart(8, '0')
  return `${pvStr}-${numStr}`
}

export default function VentasPage() {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [busqueda, setBusqueda] = useState('')

  // Modal de detalle
  const [ventaSeleccionadaId, setVentaSeleccionadaId] = useState(null)

  async function cargarVentas(filtros) {
    try {
      setLoading(true)
      setError('')
      const data = await listarVentas(filtros)
      setVentas(data)
    } catch (err) {
      setVentas([])
      setError(err.message || 'No se pudieron cargar las ventas')
    } finally {
      setLoading(false)
    }
  }

  function filtrosActuales() {
    return {
      estado: filtroEstado || undefined,
      desde: filtroDesde || undefined,
      hasta: filtroHasta || undefined,
    }
  }

  useEffect(() => {
    cargarVentas({})
  }, [])

  function aplicarFiltros(e) {
    e.preventDefault()
    cargarVentas(filtrosActuales())
  }

  function limpiarFiltros() {
    setFiltroEstado('')
    setFiltroDesde('')
    setFiltroHasta('')
    setBusqueda('')
    cargarVentas({})
  }

  const ventasFiltradas = ventas.filter((v) => {
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    const numVenta = String(v.numero || '')
    const nomCli = nombreCliente(v.cliente).toLowerCase()
    const docCli = String(v.cliente?.numero_documento || '')
    return numVenta.includes(q) || nomCli.includes(q) || docCli.includes(q)
  })

  return (
    <main>
      <h1>Ventas y Facturación</h1>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Emisión de facturas A y B, notas de crédito y exportación de comprobantes PDF.
      </p>

      {error && <Feedback tone="error">{error}</Feedback>}

      {/* FORMULARIO DE FILTROS */}
      <form onSubmit={aplicarFiltros} className="filter-bar" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="filtro-estado" style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
              Estado
            </label>
            <select
              id="filtro-estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="">Todos los estados</option>
              {ESTADOS_VENTA.map((est) => (
                <option key={est} value={est}>
                  {est}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filtro-desde" style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
              Desde
            </label>
            <input
              id="filtro-desde"
              type="date"
              value={filtroDesde}
              onChange={(e) => setFiltroDesde(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="filtro-hasta" style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
              Hasta
            </label>
            <input
              id="filtro-hasta"
              type="date"
              value={filtroHasta}
              onChange={(e) => setFiltroHasta(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="filtro-busqueda" style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
              Buscar (Nº o Cliente)
            </label>
            <input
              id="filtro-busqueda"
              type="text"
              placeholder="Ej: 42 o Andes"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button type="submit">Filtrar</Button>
            <Button type="button" variant="ghost" onClick={limpiarFiltros}>
              Limpiar
            </Button>
          </div>
        </div>
      </form>

      {/* LISTADO DE VENTAS */}
      {loading && (
        <p className="loading-state" role="status">
          Cargando ventas…
        </p>
      )}

      {!loading && ventasFiltradas.length === 0 && (
        <EmptyState
          title="No se encontraron ventas"
          description="Probá ajustando los filtros de fecha, estado o búsqueda."
        />
      )}

      {!loading && ventasFiltradas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Nº Venta</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Condición IVA</th>
                <th>Estado</th>
                <th>Cobro</th>
                <th>Comprobantes</th>
                <th>Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.map((venta) => {
                const totalCobrado = (venta.cobros ?? []).reduce(
                  (acc, c) => acc + Number(c.total || 0),
                  0,
                )
                const tieneCtaCte = (venta.cobros ?? []).some((c) =>
                  (c.detalle ?? []).some((d) => d.medio_pago?.nombre === 'Cuenta corriente'),
                )
                const cobrada = totalCobrado >= Number(venta.total || 0)

                return (
                  <tr key={venta.id}>
                    <td><strong>#{venta.numero}</strong></td>
                    <td>{formatearFecha(venta.created_at)}</td>
                    <td>
                      <div>{nombreCliente(venta.cliente)}</div>
                      <small style={{ color: 'var(--text-secondary)' }}>
                        {venta.cliente?.tipo_documento || 'Doc'}: {venta.cliente?.numero_documento || '—'}
                      </small>
                    </td>
                    <td>{venta.cliente?.condicion_iva?.nombre || 'Consumidor Final'}</td>
                    <td><EstadoVentaBadge estado={venta.estado} /></td>
                    <td>
                      {cobrada ? (
                        <span style={{ color: 'var(--color-success, #2e7d32)', fontSize: '13px' }}>Cobrada</span>
                      ) : tieneCtaCte ? (
                        <span style={{ color: 'var(--color-info, #1565c0)', fontSize: '13px' }}>Cuenta corriente</span>
                      ) : (
                        <span style={{ color: 'var(--color-warning, #d84315)', fontSize: '13px' }}>Pendiente</span>
                      )}
                    </td>
                    <td>
                      {(venta.comprobantes ?? []).length === 0 ? (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Sin emitir</span>
                      ) : (
                        <div>
                          {(venta.comprobantes ?? []).map((c) => (
                            <div key={c.id} style={{ fontSize: '12px' }}>
                              {c.tipo_comprobante === 'factura'
                                ? 'Factura'
                                : c.tipo_comprobante === 'nota_credito'
                                  ? 'NC'
                                  : 'ND'}{' '}
                              {c.letra} {formatearComprobanteNumero(c.punto_venta, c.numero)}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td><strong>{formatearMoneda(venta.total)}</strong></td>
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DETALLE DE VENTA */}
      {ventaSeleccionadaId && (
        <VentaDetalle
          ventaId={ventaSeleccionadaId}
          onCerrar={() => setVentaSeleccionadaId(null)}
          onComprobanteEmitido={() => cargarVentas(filtrosActuales())}
        />
      )}
    </main>
  )
}
