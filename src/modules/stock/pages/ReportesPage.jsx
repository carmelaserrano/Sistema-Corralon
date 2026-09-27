import { useEffect, useState } from 'react'
import {
  BarChart3,
  DollarSign,
  FileSpreadsheet,
  Warehouse,
} from 'lucide-react'
import {
  descargarCsv,
  getReporteQuiebres,
  getReporteStockActual,
  getReporteValorizacion,
} from '../api/reportesApi'
import { getHistorialMovimientos } from '../api/movimientosApi'
import { getDepositos } from '../api/depositosApi'
import { getCategorias } from '../api/categoriasApi'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { useToast } from '../../../components/ui/ToastContext'

const formatoMoneda = (val) =>
  val == null
    ? '—'
    : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val)

const TIPOS_REPORTE = {
  STOCK_ACTUAL: 'stock-actual',
  MOVIMIENTOS: 'movimientos',
  QUIEBRES: 'quiebres',
  VALORIZACION: 'valorizacion',
}

const etiquetaTipo = {
  [TIPOS_REPORTE.STOCK_ACTUAL]: 'Stock actual',
  [TIPOS_REPORTE.MOVIMIENTOS]: 'Movimientos por período',
  [TIPOS_REPORTE.QUIEBRES]: 'Quiebres de stock',
  [TIPOS_REPORTE.VALORIZACION]: 'Valorización de stock',
}

const filtrosIniciales = {
  categoria_id: '',
  deposito_id: '',
  fechaDesde: '',
  fechaHasta: '',
}

// Cada reporte arma sus propias columnas para el CSV: los datos de origen
// (stock_x_deposito vs movimientos_stock) tienen formas distintas.
function columnasStock(conDisponible) {
  const columnas = [
    { titulo: 'SKU', valor: (fila) => fila.producto?.sku },
    { titulo: 'Artículo', valor: (fila) => fila.producto?.nombre },
    { titulo: 'Categoría', valor: (fila) => fila.producto?.categoria?.nombre },
    { titulo: 'Depósito', valor: (fila) => fila.deposito?.nombre },
    { titulo: 'Cantidad', valor: (fila) => fila.cantidad },
    { titulo: 'Comprometido', valor: (fila) => fila.comprometido },
  ]

  if (conDisponible) {
    columnas.push({ titulo: 'Disponible', valor: (fila) => fila.disponible })
  }

  return columnas
}

const columnasValorizacion = [
  { titulo: 'SKU', valor: (fila) => fila.producto?.sku },
  { titulo: 'Artículo', valor: (fila) => fila.producto?.nombre },
  { titulo: 'Categoría', valor: (fila) => fila.producto?.categoria?.nombre },
  { titulo: 'Depósito', valor: (fila) => fila.deposito?.nombre },
  { titulo: 'Cantidad', valor: (fila) => fila.cantidad },
  {
    titulo: 'Costo unitario (CMP)',
    valor: (fila) => fila.producto?.costo_medio_ponderado,
  },
  { titulo: 'Valor total', valor: (fila) => fila.valor_total },
]

const columnasMovimientos = [
  { titulo: 'Fecha', valor: (fila) => fila.fecha },
  { titulo: 'Tipo', valor: (fila) => fila.tipo?.nombre },
  {
    titulo: 'Artículo',
    valor: (fila) => fila.detalle?.[0]?.producto?.nombre,
  },
  { titulo: 'Cantidad', valor: (fila) => fila.detalle?.[0]?.cantidad },
  { titulo: 'Origen', valor: (fila) => fila.origen?.nombre },
  { titulo: 'Destino', valor: (fila) => fila.destino?.nombre },
  { titulo: 'Estado', valor: (fila) => fila.estado_movimiento },
]

function ReportesPage() {
  const toast = useToast()
  const [categorias, setCategorias] = useState([])
  const [depositos, setDepositos] = useState([])
  const [tipoReporte, setTipoReporte] = useState(TIPOS_REPORTE.STOCK_ACTUAL)
  const [filtros, setFiltros] = useState(filtrosIniciales)
  const [filas, setFilas] = useState([])
  const [valorTotalGeneral, setValorTotalGeneral] = useState(null)
  const [generando, setGenerando] = useState(false)
  const [seGenero, setSeGenero] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getCategorias(), getDepositos()])
      .then(([categoriasData, depositosData]) => {
        setCategorias(categoriasData)
        setDepositos(depositosData)
      })
      .catch((err) => setError(err.message || 'No se pudieron cargar los filtros'))
  }, [])

  function manejarCambioTipo(event) {
    setTipoReporte(event.target.value)
    setFilas([])
    setValorTotalGeneral(null)
    setSeGenero(false)
    setError('')
  }

  function manejarCambioFiltro(event) {
    const { name, value } = event.target

    setFiltros((actual) => ({
      ...actual,
      [name]: value,
    }))
  }

  async function generarReporte(event) {
    event.preventDefault()

    try {
      setError('')
      setGenerando(true)
      setValorTotalGeneral(null)

      if (tipoReporte === TIPOS_REPORTE.STOCK_ACTUAL) {
        const data = await getReporteStockActual({
          categoria_id: filtros.categoria_id,
          deposito_id: filtros.deposito_id,
        })
        setFilas(data)
        toast.success(`Reporte de "${etiquetaTipo[tipoReporte]}" generado (${data.length} registros)`)
      } else if (tipoReporte === TIPOS_REPORTE.QUIEBRES) {
        const data = await getReporteQuiebres({
          categoria_id: filtros.categoria_id,
          deposito_id: filtros.deposito_id,
        })
        setFilas(data)
        toast.success(`Reporte de "${etiquetaTipo[tipoReporte]}" generado (${data.length} registros)`)
      } else if (tipoReporte === TIPOS_REPORTE.VALORIZACION) {
        const { filas: data, valorTotalGeneral: total } =
          await getReporteValorizacion({
            categoria_id: filtros.categoria_id,
            deposito_id: filtros.deposito_id,
          })
        setFilas(data)
        setValorTotalGeneral(total)
        toast.success(`Reporte de "${etiquetaTipo[tipoReporte]}" generado (${data.length} registros)`)
      } else {
        const resultado = await getHistorialMovimientos({
          fechaDesde: filtros.fechaDesde,
          fechaHasta: filtros.fechaHasta,
          pageSize: 500,
        })
        setFilas(resultado.movimientos)
        toast.success(`Reporte de "${etiquetaTipo[tipoReporte]}" generado (${resultado.movimientos.length} registros)`)
      }

      setSeGenero(true)
    } catch (err) {
      setError(err.message || 'No se pudo generar el reporte')
    } finally {
      setGenerando(false)
    }
  }

  function exportarCsv() {
    const nombreArchivo = `reporte-${tipoReporte}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`

    if (tipoReporte === TIPOS_REPORTE.STOCK_ACTUAL) {
      descargarCsv(nombreArchivo, columnasStock(true), filas)
    } else if (tipoReporte === TIPOS_REPORTE.QUIEBRES) {
      descargarCsv(nombreArchivo, columnasStock(false), filas)
    } else if (tipoReporte === TIPOS_REPORTE.VALORIZACION) {
      descargarCsv(nombreArchivo, columnasValorizacion, filas)
    } else {
      descargarCsv(nombreArchivo, columnasMovimientos, filas)
    }
    toast.success('Reporte exportado a CSV')
  }

  const esReporteDeStock =
    tipoReporte === TIPOS_REPORTE.STOCK_ACTUAL ||
    tipoReporte === TIPOS_REPORTE.QUIEBRES ||
    tipoReporte === TIPOS_REPORTE.VALORIZACION

  return (
    <main>
      <PageHeader
        breadcrumbs={[{ label: 'Stock', to: '/#/stock' }, { label: 'Reportes' }]}
        kicker="Stock e Inventario"
        title="Reportes de stock"
        description="Generación de informes de existencias, quiebres de reposición, valorización de inventario e historial de movimientos."
      />

      <div className="kpi-grid">
        <KpiCard
          label="Reporte activo"
          value={etiquetaTipo[tipoReporte]}
          icon={FileSpreadsheet}
          tone="brand"
          helperText="Configuración elegida"
        />
        <KpiCard
          label="Registros obtenidos"
          value={seGenero ? filas.length : '—'}
          icon={BarChart3}
          tone={seGenero ? 'success' : 'neutral'}
          helperText={seGenero ? 'Filas procesadas' : 'Pendiente de generación'}
        />
        {tipoReporte === TIPOS_REPORTE.VALORIZACION ? (
          <KpiCard
            label="Valor total general"
            value={valorTotalGeneral != null ? formatoMoneda(valorTotalGeneral) : '—'}
            icon={DollarSign}
            tone="success"
            helperText="Valuación CMP consolidada"
          />
        ) : (
          <KpiCard
            label="Depósitos alcanzados"
            value={
              filtros.deposito_id
                ? (depositos.find((d) => d.id === filtros.deposito_id)?.nombre ?? '1 depósito')
                : `${depositos.length} depósitos`
            }
            icon={Warehouse}
            tone="info"
            helperText="Alcance del reporte"
          />
        )}
      </div>

      {error && <p role="alert">{error}</p>}

      <section>
        <form onSubmit={generarReporte}>
          <div>
            <label htmlFor="tipoReporte">Tipo de reporte</label>
            <select
              id="tipoReporte"
              value={tipoReporte}
              onChange={manejarCambioTipo}
            >
              {Object.values(TIPOS_REPORTE).map((tipo) => (
                <option key={tipo} value={tipo}>
                  {etiquetaTipo[tipo]}
                </option>
              ))}
            </select>
          </div>

          {esReporteDeStock && (
            <>
              <div>
                <label htmlFor="categoria_id">Categoría</label>
                <select
                  id="categoria_id"
                  name="categoria_id"
                  value={filtros.categoria_id}
                  onChange={manejarCambioFiltro}
                >
                  <option value="">Todas</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="deposito_id">Depósito</label>
                <select
                  id="deposito_id"
                  name="deposito_id"
                  value={filtros.deposito_id}
                  onChange={manejarCambioFiltro}
                >
                  <option value="">Todos</option>
                  {depositos.map((deposito) => (
                    <option key={deposito.id} value={deposito.id}>
                      {deposito.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {tipoReporte === TIPOS_REPORTE.MOVIMIENTOS && (
            <>
              <div>
                <label htmlFor="fechaDesde">Desde</label>
                <input
                  id="fechaDesde"
                  name="fechaDesde"
                  type="date"
                  value={filtros.fechaDesde}
                  onChange={manejarCambioFiltro}
                />
              </div>

              <div>
                <label htmlFor="fechaHasta">Hasta</label>
                <input
                  id="fechaHasta"
                  name="fechaHasta"
                  type="date"
                  value={filtros.fechaHasta}
                  onChange={manejarCambioFiltro}
                />
              </div>
            </>
          )}

          <button type="submit" disabled={generando}>
            {generando ? 'Generando...' : 'Generar reporte'}
          </button>

          <button
            type="button"
            onClick={exportarCsv}
            disabled={!seGenero || filas.length === 0}
          >
            Exportar CSV
          </button>
        </form>
      </section>

      <section>
        <h2>{etiquetaTipo[tipoReporte]}</h2>

        {!seGenero ? (
          <p>Elegí los filtros y generá el reporte.</p>
        ) : filas.length === 0 ? (
          <p>No se encontraron datos para los filtros seleccionados.</p>
        ) : tipoReporte === TIPOS_REPORTE.MOVIMIENTOS ? (
          <div className="data-table-card">
            <div className="data-table-scroll-container">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Artículo</th>
                    <th>Cantidad</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((movimiento) => (
                    <tr key={movimiento.id}>
                      <td>{new Date(movimiento.fecha).toLocaleString('es-AR')}</td>
                      <td>{movimiento.tipo?.nombre || '-'}</td>
                      <td>{movimiento.detalle?.[0]?.producto?.nombre || '-'}</td>
                      <td>{movimiento.detalle?.[0]?.cantidad ?? '-'}</td>
                      <td>{movimiento.origen?.nombre || '-'}</td>
                      <td>{movimiento.destino?.nombre || '-'}</td>
                      <td>{movimiento.estado_movimiento || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            <div className="data-table-card">
              <div className="data-table-scroll-container">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Artículo</th>
                      <th>Categoría</th>
                      <th>Depósito</th>
                      <th>Cantidad</th>
                      {tipoReporte === TIPOS_REPORTE.VALORIZACION ? (
                        <>
                          <th>Costo unitario (CMP)</th>
                          <th>Valor total</th>
                        </>
                      ) : (
                        <>
                          <th>Comprometido</th>
                          {tipoReporte === TIPOS_REPORTE.STOCK_ACTUAL && (
                            <th>Disponible</th>
                          )}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((fila) => (
                      <tr key={fila.id}>
                        <td>{fila.producto?.sku}</td>
                        <td>{fila.producto?.nombre}</td>
                        <td>{fila.producto?.categoria?.nombre || '-'}</td>
                        <td>{fila.deposito?.nombre || '-'}</td>
                        <td>{fila.cantidad}</td>
                        {tipoReporte === TIPOS_REPORTE.VALORIZACION ? (
                          <>
                            <td>{fila.producto?.costo_medio_ponderado}</td>
                            <td>{fila.valor_total}</td>
                          </>
                        ) : (
                          <>
                            <td>{fila.comprometido}</td>
                            {tipoReporte === TIPOS_REPORTE.STOCK_ACTUAL && (
                              <td>{fila.disponible}</td>
                            )}
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {tipoReporte === TIPOS_REPORTE.VALORIZACION && (
              <p>
                <strong>Valor total general: {valorTotalGeneral}</strong>
              </p>
            )}
          </>
        )}
      </section>
    </main>
  )
}

export default ReportesPage
