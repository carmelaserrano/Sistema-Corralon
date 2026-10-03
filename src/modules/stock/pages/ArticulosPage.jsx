import { useEffect, useState } from 'react'
import { CheckCircle2, Download, Package, PackageX, Tags } from 'lucide-react'
import Papa from 'papaparse'
import {
  createArticulo,
  getArticulos,
  setEstadoArticulo,
  updateArticulo,
} from '../api/articulosApi'
import { getCategorias } from '../api/categoriasApi'
import { getMarcas } from '../api/marcasApi'
import { getUnidadesMedida } from '../api/unidadesMedidaApi'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { useToast } from '../../../components/ui/ToastContext'


const TAMANIO_PAGINA = 10

const articuloInicial = {
  nombre: '',
  descripcion: '',
  categoria_id: '',
  marca_id: '',
  unidad_medida_id: '',
  codigo_barras: '',
}

const filtrosIniciales = {
  search: '',
  categoria_id: '',
  marca_id: '',
  estado: '',
}

// La base guarda 'activo' / 'inactivo'; la historia los muestra con
// mayúscula inicial.
function mostrarEstado(estadoProducto) {
  return estadoProducto === 'activo' ? 'Activo' : 'Inactivo'
}

// Sólo se ofrecen catálogos activos (CA-03). La excepción es el valor que
// el artículo ya tiene: si quedó apuntando a algo que después se desactivó,
// se muestra igual para que el campo no aparezca vacío.
function opcionesPara(lista, idSeleccionado) {
  return lista.filter((item) => item.activo || item.id === idSeleccionado)
}

function ArticulosPage() {
  const [articulos, setArticulos] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)

  const [categorias, setCategorias] = useState([])
  const [marcas, setMarcas] = useState([])
  const [unidades, setUnidades] = useState([])

  const [form, setForm] = useState(articuloInicial)
  const [editandoId, setEditandoId] = useState(null)
  const [filtros, setFiltros] = useState(filtrosIniciales)

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  function exportarCsv() {
    if (!articulos || articulos.length === 0) {
      toast?.info?.('No hay artículos para exportar con los filtros actuales.')
      return
    }

    try {
      const data = articulos.map((a) => ({
        SKU: a.sku,
        Nombre: a.nombre,
        Categoria: a.categoria?.nombre || '',
        Marca: a.marca?.nombre || '',
        Unidad: a.unidad_medida?.abreviatura || '',
        CodigoBarras: a.codigo_barras || '',
        Estado: mostrarEstado(a.estado_producto),
      }))

      const csv = Papa.unparse(data)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `articulos_pag_${pagina}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast?.success?.('Catálogo de artículos exportado con éxito a CSV.')
    } catch {
      toast?.error?.('Ocurrió un error al exportar los artículos.')
    }
  }


  async function cargarCatalogos() {
    const [cats, mars, unis] = await Promise.all([
      getCategorias(),
      getMarcas(),
      getUnidadesMedida(),
    ])

    setCategorias(cats)
    setMarcas(mars)
    setUnidades(unis)
  }

  async function cargarArticulos(page = pagina, filtrosActuales = filtros) {
    try {
      setLoading(true)
      setError('')

      const resultado = await getArticulos({
        ...filtrosActuales,
        page,
        pageSize: TAMANIO_PAGINA,
      })

      setArticulos(resultado.articulos)
      setTotal(resultado.total)
      setTotalPaginas(resultado.totalPaginas)
      setPagina(resultado.page)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los artículos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarCatalogos().catch((err) =>
      setError(err.message || 'No se pudieron cargar los catálogos'),
    )
    cargarArticulos(1, filtrosIniciales)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function manejarCambio(event) {
    const { name, value } = event.target
    setForm((actual) => ({ ...actual, [name]: value }))
  }

  function manejarFiltro(event) {
    const { name, value } = event.target
    setFiltros((actual) => ({ ...actual, [name]: value }))
  }

  function limpiarFormulario() {
    setForm(articuloInicial)
    setEditandoId(null)
    setError('')
  }

  function comenzarEdicion(articulo) {
    setForm({
      nombre: articulo.nombre,
      descripcion: articulo.descripcion ?? '',
      categoria_id: articulo.categoria?.id ?? '',
      marca_id: articulo.marca?.id ?? '',
      unidad_medida_id: articulo.unidad_medida?.id ?? '',
      codigo_barras: articulo.codigo_barras ?? '',
    })
    setEditandoId(articulo.id)
    setError('')
    setAviso('')
  }

  async function guardarArticulo(event) {
    event.preventDefault()

    try {
      setError('')
      setAviso('')

      if (editandoId) {
        await updateArticulo(editandoId, form)
        setAviso('Artículo actualizado')
      } else {
        const creado = await createArticulo(form)
        setAviso(`Artículo "${creado.nombre}" creado con SKU ${creado.sku}`)
      }

      limpiarFormulario()
      await cargarArticulos()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el artículo')
    }
  }

  async function cambiarEstado(articulo) {
    const nuevoEstado =
      articulo.estado_producto === 'activo' ? 'inactivo' : 'activo'

    try {
      setError('')
      setAviso('')
      await setEstadoArticulo(articulo.id, nuevoEstado)
      setAviso(`Artículo "${articulo.nombre}" ahora está ${nuevoEstado}`)
      await cargarArticulos()
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado del artículo')
    }
  }

  function aplicarFiltros(event) {
    event.preventDefault()
    cargarArticulos(1)
  }

  function limpiarFiltros() {
    setFiltros(filtrosIniciales)
    cargarArticulos(1, filtrosIniciales)
  }

  return (
    <main>
      <PageHeader
        kicker="Módulo Stock"
        title="Catálogo de artículos"
        description="Gestión maestra de productos, categorización, marcas, unidades de medida y códigos de barras."
        actions={
          <Button
            type="button"
            variant="ghost"
            icon={Download}
            onClick={exportarCsv}
            disabled={loading || articulos.length === 0}
            title="Exportar artículos en pantalla a CSV"
          >
            Exportar CSV
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard
          label="Total en catálogo"
          value={total}
          icon={Package}
          tone="brand"
          helperText="Artículos registrados"
        />
        <KpiCard
          label="Activos en pantalla"
          value={articulos.filter((a) => a.estado_producto === 'activo').length}
          icon={CheckCircle2}
          tone="success"
          helperText="Habilitados para venta y compras"
        />
        <KpiCard
          label="Inactivos en pantalla"
          value={articulos.filter((a) => a.estado_producto === 'inactivo').length}
          icon={PackageX}
          tone="warning"
          helperText="Desactivados temporalmente"
        />
        <KpiCard
          label="Categorías disponibles"
          value={categorias.length}
          icon={Tags}
          tone="info"
          helperText="Rubros de clasificación"
        />
      </div>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}

      <form onSubmit={guardarArticulo}>
        <h2>{editandoId ? 'Editar artículo' : 'Nuevo artículo'}</h2>

        <label>
          Nombre
          <input
            name="nombre"
            value={form.nombre}
            onChange={manejarCambio}
            placeholder="Cemento Portland x50kg"
          />
        </label>

        <label>
          Categoría
          <select
            name="categoria_id"
            value={form.categoria_id}
            onChange={manejarCambio}
          >
            <option value="">Seleccioná una categoría</option>
            {opcionesPara(categorias, form.categoria_id).map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
                {categoria.activo ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </label>

        <label>
          Marca
          <select name="marca_id" value={form.marca_id} onChange={manejarCambio}>
            <option value="">Seleccioná una marca</option>
            {opcionesPara(marcas, form.marca_id).map((marca) => (
              <option key={marca.id} value={marca.id}>
                {marca.nombre}
                {marca.activo ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </label>

        <label>
          Unidad de medida
          <select
            name="unidad_medida_id"
            value={form.unidad_medida_id}
            onChange={manejarCambio}
          >
            <option value="">Seleccioná una unidad</option>
            {opcionesPara(unidades, form.unidad_medida_id).map((unidad) => (
              <option key={unidad.id} value={unidad.id}>
                {unidad.nombre} ({unidad.abreviatura})
                {unidad.activo ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </label>

        <label>
          Código de barras
          <input
            name="codigo_barras"
            value={form.codigo_barras}
            onChange={manejarCambio}
            placeholder="7791234567890"
          />
        </label>

        <label>
          Descripción
          <input
            name="descripcion"
            value={form.descripcion}
            onChange={manejarCambio}
            placeholder="Opcional"
          />
        </label>

        <button type="submit">{editandoId ? 'Guardar' : 'Crear'}</button>

        {editandoId && (
          <button type="button" onClick={limpiarFormulario}>
            Cancelar
          </button>
        )}
      </form>

      <form onSubmit={aplicarFiltros}>
        <h2>Buscar y filtrar</h2>

        <label>
          Buscar
          <input
            name="search"
            value={filtros.search}
            onChange={manejarFiltro}
            placeholder="Nombre, SKU o código de barras"
          />
        </label>

        <label>
          Categoría
          <select
            name="categoria_id"
            value={filtros.categoria_id}
            onChange={manejarFiltro}
          >
            <option value="">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </label>

        <label>
          Marca
          <select
            name="marca_id"
            value={filtros.marca_id}
            onChange={manejarFiltro}
          >
            <option value="">Todas</option>
            {marcas.map((marca) => (
              <option key={marca.id} value={marca.id}>
                {marca.nombre}
              </option>
            ))}
          </select>
        </label>

        <label>
          Estado
          <select name="estado" value={filtros.estado} onChange={manejarFiltro}>
            <option value="">Todos</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </label>

        <button type="submit">Filtrar</button>
        <button type="button" onClick={limpiarFiltros}>
          Limpiar
        </button>
      </form>

      {loading && <p>Cargando artículos...</p>}

      {!loading && articulos.length === 0 && (
        <p>No hay artículos para mostrar.</p>
      )}

      {!loading && articulos.length > 0 && (
        <div className="data-table-card">
          <div className="data-table-scroll-container">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Marca</th>
                  <th>Unidad</th>
                  <th>Código de barras</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {articulos.map((articulo) => (
                  <tr key={articulo.id}>
                    <td>
                      <code>{articulo.sku}</code>
                    </td>
                    <td>
                      <strong>{articulo.nombre}</strong>
                    </td>
                    <td>{articulo.categoria?.nombre || '—'}</td>
                    <td>{articulo.marca?.nombre || '—'}</td>
                    <td>{articulo.unidad_medida?.abreviatura || '—'}</td>
                    <td>{articulo.codigo_barras ?? '—'}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px',
                          fontWeight: 700,
                          background:
                            articulo.estado_producto === 'activo'
                              ? 'var(--color-success-soft)'
                              : 'var(--color-neutral-200)',
                          color:
                            articulo.estado_producto === 'activo'
                              ? 'var(--color-success)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {mostrarEstado(articulo.estado_producto)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => comenzarEdicion(articulo)}
                      >
                        Editar
                      </button>
                      <button type="button" onClick={() => cambiarEstado(articulo)}>
                        {articulo.estado_producto === 'activo'
                          ? 'Desactivar'
                          : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="data-table-footer">
            <p style={{ margin: 0 }}>
              {total} artículo(s) · página {pagina} de {totalPaginas}
            </p>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="pagination-btn"
                disabled={pagina <= 1}
                onClick={() => cargarArticulos(pagina - 1)}
              >
                Anterior
              </button>
              <button
                type="button"
                className="pagination-btn"
                disabled={pagina >= totalPaginas}
                onClick={() => cargarArticulos(pagina + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default ArticulosPage
