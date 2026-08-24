import { useEffect, useState } from 'react'
import {
  createUnidadMedida,
  getUnidadesMedida,
  setEstadoUnidadMedida,
  updateUnidadMedida,
} from '../api/unidadesMedidaApi'

const unidadInicial = {
  nombre: '',
  abreviatura: '',
  factor_conversion: 1,
  unidad_base_id: '',
  activo: true,
}

function UnidadesMedidaPage() {
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
      } else {
        const creada = await createUnidadMedida(form)
        setAviso(`Unidad "${creada.nombre}" creada`)
      }

      limpiarFormulario()
      await cargarUnidades()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la unidad de medida')
    }
  }

  async function cambiarEstado(unidad) {
    try {
      setError('')
      setAviso('')
      await setEstadoUnidadMedida(unidad.id, !unidad.activo)
      setAviso(
        `Unidad "${unidad.nombre}" ${unidad.activo ? 'desactivada' : 'activada'}`,
      )
      await cargarUnidades()
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado de la unidad')
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

  return (
    <main>
      <h1>Gestión de unidades de medida</h1>

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
      )}
    </main>
  )
}

export default UnidadesMedidaPage
