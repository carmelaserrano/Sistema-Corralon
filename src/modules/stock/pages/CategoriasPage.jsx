import { useEffect, useState } from 'react'
import {
  createCategoria,
  deleteCategoria,
  getCategorias,
  updateCategoria,
} from '../api/categoriasApi'

const categoriaInicial = {
  nombre: '',
  activo: true,
}

function CategoriasPage() {
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
      } else {
        const creada = await createCategoria(form)
        setAviso(`Categoría "${creada.nombre}" creada`)
      }

      limpiarFormulario()
      await cargarCategorias()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la categoría')
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
      await cargarCategorias()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la categoría')
    }
  }

  function buscar(event) {
    event.preventDefault()
    cargarCategorias()
  }

  return (
    <main>
      <h1>Gestión de categorías</h1>

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
      )}
    </main>
  )
}

export default CategoriasPage
