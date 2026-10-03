import { useEffect, useState } from 'react'
import {
  createUnidadMedida,
  getUnidadesMedida,
  setEstadoUnidadMedida,
  updateUnidadMedida,
} from '../api/unidadesMedidaApi'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { useToast } from '../../../components/ui/ToastContext'
import Papa from 'papaparse'
import { Scale, CheckCircle2, XCircle, Layers, Download } from 'lucide-react'

const unidadInicial = {
  nombre: '',
  abreviatura: '',
  factor_conversion: 1,
  unidad_base_id: '',
  activo: true,
}

function UnidadesMedidaPage() {
  const { showToast } = useToast()
  const [unidades, setUnidades] = useState([])
  const [todas, setTodas] = useState([])
  const [form, setForm] = useState(unidadInicial)
  const [editandoId, setEditandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)

  async function cargarUnidades(search = busqueda) {
    try {
      setLoading(true)
      setError('')

      const [lista, completa] = await Promise.all([
        getUnidadesMedida({ search }),
        getUnidadesMedida(),
      ])

      setUnidades(lista)
      setTodas(completa)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las unidades de medida')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarUnidades('')
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
    setForm(unidadInicial)
    setEditandoId(null)
    setError('')
  }

  function comenzarEdicion(unidad) {
    setForm({
      nombre: unidad.nombre,
      abreviatura: unidad.abreviatura,
      factor_conversion: unidad.factor_conversion,
      unidad_base_id: unidad.unidad_base_id ?? '',
      activo: unidad.activo,
    })
    setEditandoId(unidad.id)
    setError('')
    setAviso('')
  }

  async function guardarUnidad(event) {
    event.preventDefault()

    try {
      setError('')
      setAviso('')

      if (editandoId) {
        await updateUnidadMedida(editandoId, form)
        setAviso('Unidad de medida actualizada')
        showToast({ message: 'Unidad de medida actualizada exitosamente', tone: 'success' })
      } else {
        const creada = await createUnidadMedida(form)
        setAviso(`Unidad "${creada.nombre}" creada`)
        showToast({ message: `Unidad "${creada.nombre}" creada exitosamente`, tone: 'success' })
      }

      limpiarFormulario()
      await cargarUnidades()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la unidad de medida')
      showToast({ message: err.message || 'Error al guardar la unidad de medida', tone: 'danger' })
    }
  }

  async function cambiarEstado(unidad) {
    try {
      setError('')
      setAviso('')
      await setEstadoUnidadMedida(unidad.id, !unidad.activo)
      const nuevoEstado = unidad.activo ? 'desactivada' : 'activada'
      setAviso(`Unidad "${unidad.nombre}" ${nuevoEstado}`)
      showToast({ message: `Unidad "${unidad.nombre}" ${nuevoEstado}`, tone: 'info' })
      await cargarUnidades()
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado de la unidad')
      showToast({ message: err.message || 'Error al cambiar estado', tone: 'danger' })
    }
  }

  function buscar(event) {
    event.preventDefault()
    cargarUnidades()
  }

  function nombreDeUnidadBase(unidadBaseId) {
    if (!unidadBaseId) return '—'
    return todas.find((unidad) => unidad.id === unidadBaseId)?.nombre ?? '—'
  }

  // Sólo se ofrecen unidades activas como base (US-STK-04, CA-03), y nunca
  // la unidad que se está editando, para que no se referencie a sí misma.
  const opcionesDeBase = todas.filter(
    (unidad) => unidad.activo && unidad.id !== editandoId,
  )

  function exportarCsv() {
    if (unidades.length === 0) {
      showToast({ message: 'No hay unidades de medida para exportar', tone: 'warning' })
      return
    }
    const datosCsv = unidades.map((u) => ({
      Nombre: u.nombre || '',
      Abreviatura: u.abreviatura || '',
      Factor: u.factor_conversion ?? 1,
      'Unidad base': nombreDeUnidadBase(u.unidad_base_id),
      Estado: u.activo ? 'Activa' : 'Inactiva',
    }))
    const csv = Papa.unparse(datosCsv)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.setAttribute('download', `unidades_medida_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    URL.revokeObjectURL(url)
    showToast({ message: 'Unidades de medida exportadas en CSV', tone: 'success' })
  }

  const activasCount = unidades.filter((u) => u.activo).length
  const inactivasCount = unidades.filter((u) => !u.activo).length
  const unidadesBaseCount = unidades.filter((u) => !u.unidad_base_id).length

  return (
    <main>
      <PageHeader
        title="Gestión de unidades de medida"
        kicker="Módulo Stock"
        description="Unidades métricas, factores de conversión y equivalencias para artículos del corralón."
        actions={[
          {
            label: 'Exportar CSV',
            icon: Download,
            onClick: exportarCsv,
            variant: 'secondary',
            disabled: unidades.length === 0,
          },
        ]}
      />

      <div className="kpi-grid">
        <KpiCard
          label="Total unidades"
          value={unidades.length}
          icon={Scale}
          tone="brand"
          helperText="En catálogo"
        />
        <KpiCard
          label="Unidades activas"
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
          label="Unidades base"
          value={unidadesBaseCount}
          icon={Layers}
          tone="info"
          helperText="Referencias principales"
        />
      </div>

      {error && <p role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      <form onSubmit={guardarUnidad}>
        <h2>{editandoId ? 'Editar unidad' : 'Nueva unidad'}</h2>

        <label>
          Nombre
          <input
            name="nombre"
            value={form.nombre}
            onChange={manejarCambio}
            placeholder="Bolsa"
          />
        </label>

        <label>
          Abreviatura
          <input
            name="abreviatura"
            value={form.abreviatura}
            onChange={manejarCambio}
            placeholder="bol"
          />
        </label>

        <label>
          Factor de conversión
          <input
            name="factor_conversion"
            type="number"
            step="any"
            value={form.factor_conversion}
            onChange={manejarCambio}
          />
        </label>

        <label>
          Unidad base
          <select
            name="unidad_base_id"
            value={form.unidad_base_id}
            onChange={manejarCambio}
          >
            <option value="">Ninguna (es unidad base)</option>
            {opcionesDeBase.map((unidad) => (
              <option key={unidad.id} value={unidad.id}>
                {unidad.nombre}
              </option>
            ))}
          </select>
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
            placeholder="Nombre de la unidad"
          />
        </label>
        <button type="submit">Buscar</button>
      </form>

      {loading && <p>Cargando unidades de medida...</p>}

      {!loading && unidades.length === 0 && (
        <p>No hay unidades de medida para mostrar.</p>
      )}

      {!loading && unidades.length > 0 && (
        <div className="data-table-card">
          <div className="data-table-scroll-container">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Abreviatura</th>
                  <th>Factor</th>
                  <th>Unidad base</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((unidad) => (
                  <tr key={unidad.id}>
                    <td>{unidad.nombre}</td>
                    <td>{unidad.abreviatura}</td>
                    <td>{unidad.factor_conversion}</td>
                    <td>{nombreDeUnidadBase(unidad.unidad_base_id)}</td>
                    <td>{unidad.activo ? 'Activa' : 'Inactiva'}</td>
                    <td>
                      <button type="button" onClick={() => comenzarEdicion(unidad)}>
                        Editar
                      </button>
                      <button type="button" onClick={() => cambiarEstado(unidad)}>
                        {unidad.activo ? 'Desactivar' : 'Activar'}
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

export default UnidadesMedidaPage
