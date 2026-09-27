import { useEffect, useState } from 'react'
import {
  createCategoria,
  deleteCategoria,
  getCategorias,
  updateCategoria,
} from '../api/categoriasApi'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { useToast } from '../../../components/ui/ToastContext'
import Papa from 'papaparse'
import { Tags, CheckCircle2, XCircle, Search, Download } from 'lucide-react'

const categoriaInicial = {
  nombre: '',
  activo: true,
}

function CategoriasPage() {
  const { showToast } = useToast()
  const [categorias, setCategorias] = useState([])
  const [form, setForm] = useState(categoriaInicial)
  const [editandoId, setEditandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)

  async function cargarCategorias(search = busqueda) {
    try {
      setLoading(true)
      setError('')

      const data = await getCategorias({ search })
      setCategorias(data)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las categorías')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarCategorias('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function manejarCambio(event) {
    const { name, value, type, checked } = event.target

    setForm((actual) => ({
      ...actual,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function limpiarFormulario() {
    setForm(categoriaInicial)
    setEditandoId(null)
    setError('')
  }

  function comenzarEdicion(categoria) {
    setForm({ nombre: categoria.nombre, activo: categoria.activo })
    setEditandoId(categoria.id)
    setError('')
    setAviso('')
  }

  async function guardarCategoria(event) {
    event.preventDefault()

    try {
      setError('')
      setAviso('')

      if (editandoId) {
        await updateCategoria(editandoId, form)
        setAviso('Categoría actualizada')
        showToast({ message: 'Categoría actualizada exitosamente', tone: 'success' })
      } else {
        const creada = await createCategoria(form)
        setAviso(`Categoría "${creada.nombre}" creada`)
        showToast({ message: `Categoría "${creada.nombre}" creada exitosamente`, tone: 'success' })
      }

      limpiarFormulario()
      await cargarCategorias()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la categoría')
      showToast({ message: err.message || 'Error al guardar la categoría', tone: 'danger' })
    }
  }

  async function eliminarCategoria(categoria) {
    const confirmado = window.confirm(
      `¿Seguro que querés eliminar "${categoria.nombre}"?`,
    )

    if (!confirmado) return

    try {
      setError('')
      setAviso('')
      await deleteCategoria(categoria.id)
      setAviso(`Categoría "${categoria.nombre}" eliminada`)
      showToast({ message: `Categoría "${categoria.nombre}" eliminada`, tone: 'info' })
      await cargarCategorias()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la categoría')
      showToast({ message: err.message || 'Error al eliminar la categoría', tone: 'danger' })
    }
  }

  function buscar(event) {
    event.preventDefault()
    cargarCategorias()
  }

  function exportarCsv() {
    if (categorias.length === 0) {
      showToast({ message: 'No hay categorías para exportar', tone: 'warning' })
      return
    }
    const datosCsv = categorias.map((c) => ({
      Nombre: c.nombre || '',
      Estado: c.activo ? 'Activa' : 'Inactiva',
    }))
    const csv = Papa.unparse(datosCsv)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.setAttribute('download', `categorias_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    URL.revokeObjectURL(url)
    showToast({ message: 'Categorías exportadas en CSV', tone: 'success' })
  }

  const activasCount = categorias.filter((c) => c.activo).length
  const inactivasCount = categorias.filter((c) => !c.activo).length

  return (
    <main>
      <PageHeader
        title="Gestión de categorías"
        kicker="Módulo Stock"
        description="Estructura de categorización de artículos y materiales del corralón."
        actions={[
          {
            label: 'Exportar CSV',
            icon: Download,
            onClick: exportarCsv,
            variant: 'secondary',
            disabled: categorias.length === 0,
          },
        ]}
      />

      <div className="kpi-grid">
        <KpiCard
          label="Total categorías"
          value={categorias.length}
          icon={Tags}
          tone="brand"
          helperText="En catálogo"
        />
        <KpiCard
          label="Categorías activas"
          value={activasCount}
          icon={CheckCircle2}
          tone="success"
          helperText="Disponibles en artículos"
        />
        <KpiCard
          label="Inactivas"
          value={inactivasCount}
          icon={XCircle}
          tone="neutral"
          helperText="Deshabilitadas"
        />
        <KpiCard
          label="Búsqueda"
          value={busqueda ? `Filtro: "${busqueda}"` : 'Todas'}
          icon={Search}
          tone="info"
          helperText="Estado del listado"
        />
      </div>

      {error && <p role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      <form onSubmit={guardarCategoria}>
        <h2>{editandoId ? 'Editar categoría' : 'Nueva categoría'}</h2>

        <label>
          Nombre
          <input
            name="nombre"
            value={form.nombre}
            onChange={manejarCambio}
            placeholder="Cementos"
          />
        </label>

        <label>
          <input
            type="checkbox"
            name="activo"
            checked={form.activo}
            onChange={manejarCambio}
          />
          Activa
        </label>

        <button type="submit">{editandoId ? 'Guardar' : 'Crear'}</button>

        {editandoId && (
          <button type="button" onClick={limpiarFormulario}>
            Cancelar
          </button>
        )}
      </form>

      <form onSubmit={buscar}>
        <label>
          Buscar
          <input
            name="busqueda"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Nombre de la categoría"
          />
        </label>
        <button type="submit">Buscar</button>
      </form>

      {loading && <p>Cargando categorías...</p>}

      {!loading && categorias.length === 0 && (
        <p>No hay categorías para mostrar.</p>
      )}

      {!loading && categorias.length > 0 && (
        <div className="data-table-card">
          <div className="data-table-scroll-container">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((categoria) => (
                  <tr key={categoria.id}>
                    <td>{categoria.nombre}</td>
                    <td>{categoria.activo ? 'Activa' : 'Inactiva'}</td>
                    <td>
                      <button type="button" onClick={() => comenzarEdicion(categoria)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminarCategoria(categoria)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}

export default CategoriasPage
