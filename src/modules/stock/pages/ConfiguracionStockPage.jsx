import { useEffect, useState } from 'react'
import {
  Sliders,
  Package,
  Warehouse,
  AlertTriangle,
  Download,
  RotateCcw,
} from 'lucide-react'
import Papa from 'papaparse'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { useToast } from '../../../components/ui/ToastContext'
import {
  createConfiguracionStock,
  getConfiguracionesStock,
  updateConfiguracionStock,
} from '../api/configuracionStockApi'
import { getArticulos } from '../api/articulosApi'
import { getDepositos } from '../api/depositosApi'

const configuracionInicial = {
  articulo_id: '',
  deposito_id: '',
  stock_minimo: '',
  stock_maximo: '',
}

function ConfiguracionStockPage() {
  const toast = useToast()
  const [configuraciones, setConfiguraciones] = useState([])
  const [articulos, setArticulos] = useState([])
  const [depositos, setDepositos] = useState([])

  const [form, setForm] = useState(configuracionInicial)
  const [editandoId, setEditandoId] = useState(null)

  const [filtroDeposito, setFiltroDeposito] = useState('')
  const [filtroArticulo, setFiltroArticulo] = useState('')

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)

  async function cargarCatalogos() {
    const [resultadoArticulos, depositosData] = await Promise.all([
      getArticulos({
        estado: 'activo',
        page: 1,
        pageSize: 1000,
      }),
      getDepositos(),
    ])

    setArticulos(resultadoArticulos.articulos)
    setDepositos(depositosData)
  }

  async function cargarConfiguraciones({
    deposito_id = filtroDeposito,
    articulo_id = filtroArticulo,
  } = {}) {
    try {
      setLoading(true)
      setError('')

      const data = await getConfiguracionesStock({
        deposito_id,
        articulo_id,
      })

      setConfiguraciones(data)
    } catch (err) {
      setError(
        err.message || 'No se pudieron cargar las configuraciones de stock',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarCatalogos().catch((err) =>
      setError(err.message || 'No se pudieron cargar artículos y depósitos'),
    )

    cargarConfiguraciones({
      deposito_id: '',
      articulo_id: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function manejarCambio(event) {
    const { name, value } = event.target

    setForm((actual) => ({
      ...actual,
      [name]: value,
    }))
  }

  function limpiarFormulario() {
    setForm(configuracionInicial)
    setEditandoId(null)
    setError('')
  }

  function comenzarEdicion(configuracion) {
    setForm({
      articulo_id: configuracion.producto_id,
      deposito_id: configuracion.deposito_id,
      stock_minimo: configuracion.min_stock,
      stock_maximo: configuracion.max_stock,
    })

    setEditandoId(configuracion.id)
    setError('')
    setAviso('')
  }

  async function guardarConfiguracion(event) {
    event.preventDefault()

    try {
      setError('')
      setAviso('')

      if (editandoId) {
        await updateConfiguracionStock(editandoId, form)
        setAviso('Configuración de stock actualizada')
        toast?.success?.('Configuración de stock actualizada')
      } else {
        await createConfiguracionStock(form)
        setAviso('Configuración de stock creada')
        toast?.success?.('Configuración de stock creada')
      }

      limpiarFormulario()
      await cargarConfiguraciones()
    } catch (err) {
      const msg = err.message || 'No se pudo guardar la configuración de stock'
      setError(msg)
      toast?.error?.(msg)
    }
  }

  function aplicarFiltros(event) {
    event.preventDefault()

    cargarConfiguraciones({
      deposito_id: filtroDeposito,
      articulo_id: filtroArticulo,
    })
  }

  function limpiarFiltros() {
    setFiltroDeposito('')
    setFiltroArticulo('')

    cargarConfiguraciones({
      deposito_id: '',
      articulo_id: '',
    })
  }

  function exportarCsv() {
    if (!configuraciones || configuraciones.length === 0) {
      toast?.info?.('No hay configuraciones para exportar')
      return
    }

    const filas = configuraciones.map((c) => ({
      Articulo: c.producto?.nombre || '',
      SKU: c.producto?.sku || '',
      Deposito: c.deposito?.nombre || '',
      StockActual: c.stock_actual ?? 'Sin stock registrado',
      StockMinimo: c.min_stock ?? '',
      StockMaximo: c.max_stock ?? '',
      Estado: c.estado_stock || '',
    }))

    const csv = Papa.unparse(filas)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `configuracion_stock_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast?.success?.('Configuraciones exportadas a CSV')
  }

  const totalConfiguraciones = configuraciones.length
  const articulosConfigurados = new Set(
    configuraciones.map((c) => c.producto_id || c.articulo_id).filter(Boolean),
  ).size
  const depositosConfigurados = new Set(
    configuraciones.map((c) => c.deposito_id).filter(Boolean),
  ).size
  const enAlerta = configuraciones.filter(
    (c) =>
      c.estado_stock &&
      (c.estado_stock.toLowerCase().includes('bajo') ||
        c.estado_stock.toLowerCase().includes('crítico') ||
        c.estado_stock.toLowerCase().includes('critico')),
  ).length

  return (
    <main className="page-canvas">
      <PageHeader
        title="Configuración de stock por depósito"
        breadcrumbs={[
          { label: 'Stock', to: '/#/stock' },
          { label: 'Configuración' },
        ]}
        description="Define y ajusta los umbrales mínimos y máximos de existencias para cada artículo según el depósito físico."
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="button button-outline"
              onClick={exportarCsv}
              disabled={configuraciones.length === 0}
            >
              <Download size={16} />
              Exportar CSV
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => cargarConfiguraciones()}
              disabled={loading}
              title="Recargar datos"
            >
              <RotateCcw size={16} />
              Recargar
            </button>
          </div>
        }
      />

      {error && <p role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
        <KpiCard
          label="Total Configuraciones"
          value={totalConfiguraciones}
          icon={Sliders}
          tone="brand"
          helperText="Reglas de umbrales activas"
        />
        <KpiCard
          label="Artículos con Regla"
          value={articulosConfigurados}
          icon={Package}
          tone="info"
          helperText="Productos con min/max definidos"
        />
        <KpiCard
          label="Depósitos Configurados"
          value={depositosConfigurados}
          icon={Warehouse}
          tone="success"
          helperText="Ubicaciones con control"
        />
        <KpiCard
          label="En Umbral Crítico / Bajo"
          value={enAlerta}
          icon={AlertTriangle}
          tone={enAlerta > 0 ? 'warning' : 'neutral'}
          helperText="Requieren reposición urgente"
        />
      </div>

      <section>
        <h2>
          {editandoId
            ? 'Editar configuración de stock'
            : 'Nueva configuración de stock'}
        </h2>

        <form onSubmit={guardarConfiguracion}>
          <div>
            <label htmlFor="articulo_id">Artículo</label>

            <select
              id="articulo_id"
              name="articulo_id"
              value={form.articulo_id}
              onChange={manejarCambio}
              disabled={Boolean(editandoId)}
              required
            >
              <option value="">Seleccionar artículo...</option>

              {articulos.map((articulo) => (
                <option key={articulo.id} value={articulo.id}>
                  {articulo.sku} - {articulo.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="deposito_id">Depósito</label>

            <select
              id="deposito_id"
              name="deposito_id"
              value={form.deposito_id}
              onChange={manejarCambio}
              disabled={Boolean(editandoId)}
              required
            >
              <option value="">Seleccionar depósito...</option>

              {depositos.map((deposito) => (
                <option key={deposito.id} value={deposito.id}>
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="stock_minimo">Stock mínimo</label>

            <input
              id="stock_minimo"
              name="stock_minimo"
              type="number"
              min="0"
              value={form.stock_minimo}
              onChange={manejarCambio}
              required
            />
          </div>

          <div>
            <label htmlFor="stock_maximo">Stock máximo</label>

            <input
              id="stock_maximo"
              name="stock_maximo"
              type="number"
              min="0"
              value={form.stock_maximo}
              onChange={manejarCambio}
              required
            />
          </div>

          <button type="submit">
            {editandoId ? 'Guardar cambios' : 'Crear configuración'}
          </button>

          {editandoId && (
            <button type="button" onClick={limpiarFormulario}>
              Cancelar
            </button>
          )}
        </form>
      </section>

      <section>
        <h2>Buscar y filtrar</h2>

        <form onSubmit={aplicarFiltros}>
          <label>
            Depósito
            <select
              value={filtroDeposito}
              onChange={(event) => setFiltroDeposito(event.target.value)}
            >
              <option value="">Todos</option>

              {depositos.map((deposito) => (
                <option key={deposito.id} value={deposito.id}>
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </label>

          <label>
            Artículo
            <select
              value={filtroArticulo}
              onChange={(event) => setFiltroArticulo(event.target.value)}
            >
              <option value="">Todos</option>

              {articulos.map((articulo) => (
                <option key={articulo.id} value={articulo.id}>
                  {articulo.sku} - {articulo.nombre}
                </option>
              ))}
            </select>
          </label>

          <button type="submit">Filtrar</button>

          <button type="button" onClick={limpiarFiltros}>
            Limpiar
          </button>
        </form>
      </section>

      <section>
        <h2>Configuraciones registradas</h2>

        {loading && <p>Cargando configuraciones...</p>}

        {!loading && configuraciones.length === 0 && (
          <p>No hay configuraciones registradas.</p>
        )}

        {!loading && configuraciones.length > 0 && (
          <div className="data-table-card">
            <div className="data-table-scroll-container">
              <table>
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Depósito</th>
                    <th>Stock actual</th>
                    <th>Stock mínimo</th>
                    <th>Stock máximo</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {configuraciones.map((configuracion) => (
                    <tr key={configuracion.id}>
                      <td>
                        {configuracion.producto?.sku
                          ? `${configuracion.producto.sku} - ${configuracion.producto.nombre}`
                          : configuracion.producto?.nombre || '-'}
                      </td>

                      <td>{configuracion.deposito?.nombre || '-'}</td>

                      <td>
                        {configuracion.stock_actual === null
                          ? 'Sin stock registrado'
                          : configuracion.stock_actual}
                      </td>

                      <td>{configuracion.min_stock}</td>
                      <td>{configuracion.max_stock}</td>

                      <td>{configuracion.estado_stock}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => comenzarEdicion(configuracion)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default ConfiguracionStockPage