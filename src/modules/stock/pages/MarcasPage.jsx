import { useEffect, useState } from 'react'
import {
  createMarca,
  deleteMarca,
  getMarcas,
  updateMarca,
} from '../api/marcasApi'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { useToast } from '../../../components/ui/ToastContext'
import Papa from 'papaparse'
import { Award, CheckCircle2, XCircle, Search, Download } from 'lucide-react'

const marcaInicial = {
  nombre: '',
  activo: true,
}

function MarcasPage() {
  const { showToast } = useToast()
  const [marcas, setMarcas] = useState([])
  const [form, setForm] = useState(marcaInicial)
  const [editandoId, setEditandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)

  async function cargarMarcas(search = busqueda) {
    try {
      setLoading(true)
      setError('')

      const data = await getMarcas({ search })
      setMarcas(data)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las marcas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarMarcas('')
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
    setForm(marcaInicial)
    setEditandoId(null)
    setError('')
  }

  function comenzarEdicion(marca) {
    setForm({ nombre: marca.nombre, activo: marca.activo })
    setEditandoId(marca.id)
    setError('')
    setAviso('')
  }

  async function guardarMarca(event) {
    event.preventDefault()

    try {
      setError('')
      setAviso('')

      if (editandoId) {
        await updateMarca(editandoId, form)
        setAviso('Marca actualizada')
        showToast({ message: 'Marca actualizada exitosamente', tone: 'success' })
      } else {
        const creada = await createMarca(form)
        setAviso(`Marca "${creada.nombre}" creada`)
        showToast({ message: `Marca "${creada.nombre}" creada exitosamente`, tone: 'success' })
      }

      limpiarFormulario()
      await cargarMarcas()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la marca')
      showToast({ message: err.message || 'Error al guardar la marca', tone: 'danger' })
    }
  }

  async function eliminarMarca(marca) {
    const confirmado = window.confirm(
      `¿Seguro que querés eliminar "${marca.nombre}"?`,
    )

    if (!confirmado) return

    try {
      setError('')
      setAviso('')
      await deleteMarca(marca.id)
      setAviso(`Marca "${marca.nombre}" eliminada`)
      showToast({ message: `Marca "${marca.nombre}" eliminada`, tone: 'info' })
      await cargarMarcas()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la marca')
      showToast({ message: err.message || 'Error al eliminar la marca', tone: 'danger' })
    }
  }

  function buscar(event) {
    event.preventDefault()
    cargarMarcas()
  }

  function exportarCsv() {
    if (marcas.length === 0) {
      showToast({ message: 'No hay marcas para exportar', tone: 'warning' })
      return
    }
    const datosCsv = marcas.map((m) => ({
      Nombre: m.nombre || '',
      Estado: m.activo ? 'Activa' : 'Inactiva',
    }))
    const csv = Papa.unparse(datosCsv)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.setAttribute('download', `marcas_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    URL.revokeObjectURL(url)
    showToast({ message: 'Marcas exportadas en CSV', tone: 'success' })
  }

  const activasCount = marcas.filter((m) => m.activo).length
  const inactivasCount = marcas.filter((m) => !m.activo).length

  return (
    <main>
      <PageHeader
        title="Gestión de marcas"
        kicker="Módulo Stock"
        description="Registro de fabricantes y marcas comerciales de productos comercializados."
        actions={[
          {
            label: 'Exportar CSV',
            icon: Download,
            onClick: exportarCsv,
            variant: 'secondary',
            disabled: marcas.length === 0,
          },
        ]}
      />

      <div className="kpi-grid">
        <KpiCard
          label="Total marcas"
          value={marcas.length}
          icon={Award}
          tone="brand"
          helperText="En catálogo"
        />
        <KpiCard
          label="Marcas activas"
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

      <form onSubmit={guardarMarca}>
        <h2>{editandoId ? 'Editar marca' : 'Nueva marca'}</h2>

        <label>
          Nombre
          <input
            name="nombre"
            value={form.nombre}
            onChange={manejarCambio}
            placeholder="Loma Negra"
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
            placeholder="Nombre de la marca"
          />
        </label>
        <button type="submit">Buscar</button>
      </form>

      {loading && <p>Cargando marcas...</p>}

      {!loading && marcas.length === 0 && <p>No hay marcas para mostrar.</p>}

      {!loading && marcas.length > 0 && (
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
                {marcas.map((marca) => (
                  <tr key={marca.id}>
                    <td>{marca.nombre}</td>
                    <td>{marca.activo ? 'Activa' : 'Inactiva'}</td>
                    <td>
                      <button type="button" onClick={() => comenzarEdicion(marca)}>
                        Editar
                      </button>
                      <button type="button" onClick={() => eliminarMarca(marca)}>
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

export default MarcasPage
