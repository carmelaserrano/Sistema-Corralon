import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Boxes, CheckCircle2, Download, History, PackageMinus } from 'lucide-react'
import Papa from 'papaparse'
import {
  getDepositos,
  getStockDisponibles,
  subscribeToStockChanges,
} from '../api/stockApi'
import HistorialArticuloModal from './HistorialArticuloModal'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import Button from '../../../components/ui/Button'
import { useToast } from '../../../components/ui/ToastContext'

const STOCK_POR_PAGINA = 50

export default function StockPage() {
  const [depositos, setDepositos] = useState([])
  const [depositoId, setDepositoId] = useState('')
  const [search, setSearch] = useState('')
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [versionStock, setVersionStock] = useState(0)
  const [stock, setStock] = useState([])
  const [articuloHistorial, setArticuloHistorial] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const ultimaSolicitudRef = useRef(0)
  const toast = useToast()

  useEffect(() => {
    getDepositos()
      .then((data) => {
        setDepositos(data)
        if (data.length > 0) setDepositoId(data[0].id)
      })
      .catch((err) => setError(err.message || 'No se pudieron cargar los depósitos'))
  }, [])

  useEffect(() => {
    if (!depositoId) return

    const numeroSolicitud = ++ultimaSolicitudRef.current

    async function cargarStock() {
      setLoading(true)
      setError(null)

      try {
        const respuesta = await getStockDisponibles({
          deposito_id: depositoId,
          search,
          page: pagina,
          pageSize: STOCK_POR_PAGINA,
        })

        if (numeroSolicitud !== ultimaSolicitudRef.current) return

        setStock(respuesta.items)
        setTotal(respuesta.total)

        const ultimaPagina = Math.max(
          1,
          Math.ceil(respuesta.total / STOCK_POR_PAGINA),
        )
        if (pagina > ultimaPagina) setPagina(ultimaPagina)
      } catch (err) {
        if (numeroSolicitud !== ultimaSolicitudRef.current) return
        setError(err.message || 'No se pudo consultar el stock')
      } finally {
        if (numeroSolicitud === ultimaSolicitudRef.current) setLoading(false)
      }
    }

    cargarStock()

    return () => {
      if (numeroSolicitud === ultimaSolicitudRef.current) {
        ultimaSolicitudRef.current += 1
      }
    }
  }, [depositoId, pagina, search, versionStock])

  useEffect(() => {
    if (!depositoId) return

    const canal = subscribeToStockChanges({
      deposito_id: depositoId,
      onChange: () => {
        setVersionStock((version) => version + 1)
      },
    })

    return () => {
      canal?.unsubscribe?.()
    }
  }, [depositoId])

  const totalPaginas = Math.max(1, Math.ceil(total / STOCK_POR_PAGINA))
  const depositoSeleccionado = depositos.find((deposito) => deposito.id === depositoId)

  function abrirHistorial(row) {
    setArticuloHistorial({
      id: row.articulo_id ?? row.producto?.id,
      nombre: row.articulo_nombre ?? row.producto?.nombre,
      sku: row.articulo_sku ?? row.producto?.sku,
    })
  }

  function exportarCsv() {
    if (!stock || stock.length === 0) {
      toast.info('No hay registros de stock para exportar.')
      return
    }

    try {
      const data = stock.map((row) => ({
        SKU: row.articulo_sku ?? row.producto?.sku ?? '',
        Producto: row.articulo_nombre ?? row.producto?.nombre ?? '',
        Categoria: row.producto?.categoria?.nombre ?? '',
        Marca: row.producto?.marca?.nombre ?? '',
        Fisico: row.fisico,
        Comprometido: row.comprometido,
        Disponible: row.disponible,
        Unidad: row.producto?.unidad_medida?.abreviatura ?? '',
      }))

      const csv = Papa.unparse(data)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const nombreDeposito = (depositoSeleccionado?.nombre || 'deposito').toLowerCase().replace(/\s+/g, '_')
      link.setAttribute('href', url)
      link.setAttribute('download', `stock_${nombreDeposito}_pag_${pagina}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Archivo CSV descargado con éxito.')
    } catch {
      toast.error('Ocurrió un error al generar el archivo CSV.')
    }
  }

  const itemsConDisponibilidad = stock.filter((s) => Number(s.disponible) > 0).length
  const itemsComprometidos = stock.filter((s) => Number(s.comprometido) > 0).length
  const itemsAgotados = stock.filter((s) => Number(s.disponible) <= 0).length

  return (
    <div>
      <PageHeader
        kicker="Módulo Stock"
        title="Stock por depósito"
        description="Consulta de existencia física, stock comprometido por reservas y disponibilidad inmediata en tiempo real."
        actions={
          <Button
            type="button"
            variant="ghost"
            icon={Download}
            onClick={exportarCsv}
            disabled={loading || stock.length === 0}
            title="Descargar listado actual en formato CSV"
          >
            Exportar CSV
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard
          label="Artículos totales"
          value={total}
          icon={Boxes}
          tone="brand"
          helperText={`En depósito: ${depositoSeleccionado?.nombre || '—'}`}
        />
        <KpiCard
          label="Con stock disponible"
          value={itemsConDisponibilidad}
          icon={CheckCircle2}
          tone="success"
          helperText="Disponibilidad inmediata para venta"
        />
        <KpiCard
          label="Con reservas comprometidas"
          value={itemsComprometidos}
          icon={AlertTriangle}
          tone="warning"
          helperText="Mercadería retenida en pedidos u órdenes"
        />
        <KpiCard
          label="Sin disponibilidad"
          value={itemsAgotados}
          icon={PackageMinus}
          tone={itemsAgotados > 0 ? 'danger' : 'default'}
          helperText="Artículos agotados o en reposición"
        />
      </div>

      <div
        className="data-table-toolbar"
        style={{
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-4)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px' }}>
            <span>Depósito:</span>
            <select
              value={depositoId}
              onChange={(e) => {
                setDepositoId(e.target.value)
                setPagina(1)
              }}
              style={{ minHeight: '36px', padding: '0 12px' }}
            >
              {depositos.map((deposito) => (
                <option key={deposito.id} value={deposito.id}>
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px' }}>
            <span>Buscar producto:</span>
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPagina(1)
              }}
              placeholder="SKU o nombre"
              style={{ minHeight: '36px', padding: '0 12px', minWidth: '240px' }}
            />
          </label>
        </div>
      </div>

      {error && <p className="feedback feedback-error">{error}</p>}
      {loading && <p className="loading-state">Cargando...</p>}

      <div className="data-table-card">
        <div className="data-table-scroll-container">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Marca</th>
                <th>Físico</th>
                <th>Comprometido</th>
                <th>Disponible</th>
                <th>Unidad</th>
                <th>Historial</th>
              </tr>
            </thead>
            <tbody>
              {stock.length === 0 && !loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    No se encontraron artículos para el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                stock.map((row) => (
                  <tr key={row.articulo_id ?? row.producto?.id ?? row.id}>
                    <td>
                      <code style={{ fontWeight: 700 }}>{row.articulo_sku ?? row.producto?.sku}</code>
                    </td>
                    <td>
                      <strong>{row.articulo_nombre ?? row.producto?.nombre}</strong>
                    </td>
                    <td>{row.producto?.categoria?.nombre || '—'}</td>
                    <td>{row.producto?.marca?.nombre || '—'}</td>
                    <td>{row.fisico}</td>
                    <td>
                      {Number(row.comprometido) > 0 ? (
                        <span style={{ color: 'var(--color-brand-hover)', fontWeight: 600 }}>
                          {row.comprometido}
                        </span>
                      ) : (
                        row.comprometido
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontWeight: 700,
                          background:
                            Number(row.disponible) > 0
                              ? 'var(--color-success-soft)'
                              : 'var(--color-danger-soft)',
                          color:
                            Number(row.disponible) > 0
                              ? 'var(--color-success)'
                              : 'var(--color-danger)',
                        }}
                      >
                        {row.disponible}
                      </span>
                    </td>
                    <td>{row.producto?.unidad_medida?.abreviatura || '—'}</td>
                    <td>
                      <button
                        aria-label={`Ver historial de ${row.articulo_nombre ?? row.producto?.nombre}`}
                        className="icon-button"
                        disabled={!depositoId || !(row.articulo_id ?? row.producto?.id)}
                        onClick={() => abrirHistorial(row)}
                        title="Ver historial"
                        type="button"
                      >
                        <History aria-hidden="true" size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="data-table-footer">
          <nav aria-label="Paginación de stock" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'space-between' }}>
            <button
              type="button"
              className="pagination-btn"
              disabled={pagina === 1}
              onClick={() => setPagina((actual) => Math.max(1, actual - 1))}
            >
              Anterior
            </button>

            <span>
              Página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong> ({total} productos)
            </span>

            <button
              type="button"
              className="pagination-btn"
              disabled={pagina >= totalPaginas}
              onClick={() =>
                setPagina((actual) => Math.min(totalPaginas, actual + 1))
              }
            >
              Siguiente
            </button>
          </nav>
        </div>
      </div>

      {articuloHistorial && (
        <HistorialArticuloModal
          articulo={articuloHistorial}
          depositoId={depositoId}
          depositoNombre={depositoSeleccionado?.nombre}
          onCerrar={() => setArticuloHistorial(null)}
        />
      )}
    </div>
  )
}
