import { useEffect, useState } from 'react'
import {
  createDeposito,
  deleteDeposito,
  getDepositos,
  getTiposDeposito,
  updateDeposito,
} from '../api/depositosApi'

const depositoInicial = {
  nombre: '',
  direccion: '',
  localidad: '',
  tipo_deposito_id: '',
  capacidad_maxima: '',
}

function DepositosPage() {
  const [depositos, setDepositos] = useState([])
  const [tipos, setTipos] = useState([])
  const [form, setForm] = useState(depositoInicial)
  const [editandoId, setEditandoId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function cargarDatos() {
    try {
      setLoading(true)
      setError('')

      const [depositosData, tiposData] = await Promise.all([
        getDepositos(),
        getTiposDeposito(),
      ])

      setDepositos(depositosData)
      setTipos(tiposData)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los depósitos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  function manejarCambio(event) {
    const { name, value } = event.target

    setForm((actual) => ({
      ...actual,
      [name]: value,
    }))
  }

  function limpiarFormulario() {
    setForm(depositoInicial)
    setEditandoId(null)
    setError('')
  }

  function comenzarEdicion(deposito) {
    setForm({
      nombre: deposito.nombre,
      direccion: deposito.direccion,
      localidad: deposito.localidad,
      tipo_deposito_id: deposito.tipo_deposito_id,
      capacidad_maxima: deposito.capacidad_maxima,
    })

    setEditandoId(deposito.id)
    setError('')
  }

  async function guardarDeposito(event) {
    event.preventDefault()

    try {
      setError('')

      if (editandoId) {
        await updateDeposito(editandoId, form)
      } else {
        await createDeposito(form)
      }

      limpiarFormulario()
      await cargarDatos()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el depósito')
    }
  }

  async function eliminarDeposito(deposito) {
    const confirmado = window.confirm(
      `¿Seguro que querés eliminar "${deposito.nombre}"?`,
    )

    if (!confirmado) return

    try {
      setError('')
      await deleteDeposito(deposito.id)
      await cargarDatos()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el depósito')
    }
  }

  if (loading) {
    return <p>Cargando depósitos...</p>
  }

  return (
    <main>
      <h1>Gestión de depósitos</h1>

      {error && <p role="alert">{error}</p>}

      <section>
        <h2>{editandoId ? 'Editar depósito' : 'Nuevo depósito'}</h2>

        <form onSubmit={guardarDeposito}>
          <div>
            <label htmlFor="nombre">Nombre</label>
            <input
              id="nombre"
              name="nombre"
              value={form.nombre}
              onChange={manejarCambio}
              required
            />
          </div>

          <div>
            <label htmlFor="direccion">Dirección</label>
            <input
              id="direccion"
              name="direccion"
              value={form.direccion}
              onChange={manejarCambio}
              required
            />
          </div>

          <div>
            <label htmlFor="localidad">Localidad</label>
            <input
              id="localidad"
              name="localidad"
              value={form.localidad}
              onChange={manejarCambio}
              required
            />
          </div>

          <div>
            <label htmlFor="tipo_deposito_id">Tipo</label>
            <select
              id="tipo_deposito_id"
              name="tipo_deposito_id"
              value={form.tipo_deposito_id}
              onChange={manejarCambio}
              required
            >
              <option value="">Seleccionar...</option>

              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="capacidad_maxima">Capacidad máxima</label>
            <input
              id="capacidad_maxima"
              name="capacidad_maxima"
              type="number"
              min="1"
              value={form.capacidad_maxima}
              onChange={manejarCambio}
              required
            />
          </div>

          <button type="submit">
            {editandoId ? 'Guardar cambios' : 'Crear depósito'}
          </button>

          {editandoId && (
            <button type="button" onClick={limpiarFormulario}>
              Cancelar
            </button>
          )}
        </form>
      </section>

      <section>
        <h2>Depósitos registrados</h2>

        {depositos.length === 0 ? (
          <p>No hay depósitos registrados.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Dirección</th>
                <th>Localidad</th>
                <th>Tipo</th>
                <th>Capacidad máxima</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {depositos.map((deposito) => (
                <tr key={deposito.id}>
                  <td>{deposito.nombre}</td>
                  <td>{deposito.direccion}</td>
                  <td>{deposito.localidad}</td>
                  <td>{deposito.tipo?.nombre || '-'}</td>
                  <td>{deposito.capacidad_maxima}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => comenzarEdicion(deposito)}
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => eliminarDeposito(deposito)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

export default DepositosPage