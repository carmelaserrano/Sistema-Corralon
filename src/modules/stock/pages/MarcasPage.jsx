import { useEffect, useState } from 'react'
import {
  createMarca,
  deleteMarca,
  getMarcas,
  updateMarca,
} from '../api/marcasApi'

const marcaInicial = {
  nombre: '',
  activo: true,
}

function MarcasPage() {
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
      } else {
        const creada = await createMarca(form)
        setAviso(`Marca "${creada.nombre}" creada`)
      }

      limpiarFormulario()
      await cargarMarcas()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la marca')
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
      await cargarMarcas()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la marca')
    }
  }

  function buscar(event) {
    event.preventDefault()
    cargarMarcas()
  }

  return (
    <main>
      <h1>Gestión de marcas</h1>

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
      )}
    </main>
  )
}

export default MarcasPage
