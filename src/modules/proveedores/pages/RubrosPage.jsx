import { useEffect, useState } from 'react'
import {
  createRubro,
  darDeBajaRubro,
  getRubros,
  puedeGestionarRubros,
  reactivarRubro,
  updateRubro,
} from '../api/rubrosApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

const rubroInicial = {
  nombre: '',
}

function RubrosPage() {
  const [rubros, setRubros] = useState([])
  const [form, setForm] = useState(rubroInicial)
  const [editandoId, setEditandoId] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [mostrarInactivos, setMostrarInactivos] = useState(false)

  // Se arranca en true a propósito: si la consulta del permiso falla, es
  // preferible dejar las acciones a la vista y que la base rechace, antes
  // que afirmarle al usuario que no tiene un permiso que quizá sí tiene.
  const [puedeGestionar, setPuedeGestionar] = useState(true)
  const [avisoPermiso, setAvisoPermiso] = useState('')

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  async function verificarPermiso() {
    try {
      const habilitado = await puedeGestionarRubros()
      setPuedeGestionar(habilitado)
      setAvisoPermiso(
        habilitado
          ? ''
          : 'Sólo podés consultar los rubros. Para crearlos, editarlos o eliminarlos necesitás el permiso «proveedores.rubros.gestionar».',
      )
    } catch (err) {
      setPuedeGestionar(true)
      setAvisoPermiso(
        `No se pudo verificar tu permiso sobre rubros (${err.message || 'error desconocido'}). Las acciones quedan habilitadas, pero si al guardar no pasa nada, es por esto.`,
      )
    }
  }

  async function cargarRubros({
    search = busqueda,
    soloActivos = !mostrarInactivos,
  } = {}) {
    try {
      setLoading(true)
      setError('')

      const data = await getRubros({ search, soloActivos })
      setRubros(data)
      setBusquedaAplicada(search)
    } catch (err) {
      setRubros([])
      setError(err.message || 'No se pudieron cargar los rubros')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    verificarPermiso()
    cargarRubros({ search: '', soloActivos: true })
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
    setForm(rubroInicial)
    setEditandoId(null)
    setError('')
  }

  function comenzarEdicion(rubro) {
    setForm({ nombre: rubro.nombre })
    setEditandoId(rubro.id)
    setError('')
    setAviso('')
  }

  async function guardarRubro(event) {
    event.preventDefault()

    try {
      setGuardando(true)
      setError('')
      setAviso('')

      if (editandoId) {
        const actualizado = await updateRubro(editandoId, form)
        setAviso(`Rubro "${actualizado.nombre}" actualizado`)
      } else {
        const creado = await createRubro(form)
        setAviso(`Rubro "${creado.nombre}" creado`)
      }

      limpiarFormulario()
      await cargarRubros()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el rubro')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarRubro(rubro) {
    const confirmado = window.confirm(
      `¿Seguro que querés eliminar el rubro "${rubro.nombre}"?`,
    )

    if (!confirmado) return

    try {
      setError('')
      setAviso('')
      await darDeBajaRubro(rubro.id)
      setAviso(`Rubro "${rubro.nombre}" eliminado`)
      await cargarRubros()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el rubro')
    }
  }

  async function restaurarRubro(rubro) {
    try {
      setError('')
      setAviso('')
      await reactivarRubro(rubro.id)
      setAviso(`Rubro "${rubro.nombre}" reactivado`)
      await cargarRubros()
    } catch (err) {
      setError(err.message || 'No se pudo reactivar el rubro')
    }
  }

  function buscar(event) {
    event.preventDefault()
    cargarRubros()
  }

  function limpiarBusqueda() {
    setBusqueda('')
    cargarRubros({ search: '' })
  }

  function alternarInactivos(event) {
    const incluir = event.target.checked
    setMostrarInactivos(incluir)
    cargarRubros({ soloActivos: !incluir })
  }

  return (
    <main>
      <h1>Rubros de proveedor</h1>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}
      {avisoPermiso && <Feedback tone="info">{avisoPermiso}</Feedback>}

      {puedeGestionar && (
        <section>
          <h2>{editandoId ? 'Editar rubro' : 'Nuevo rubro'}</h2>

          <form onSubmit={guardarRubro}>
            <div>
              <label htmlFor="nombre">Nombre</label>
              <input
                id="nombre"
                name="nombre"
                value={form.nombre}
                onChange={manejarCambio}
                placeholder="Cemento"
                autoComplete="off"
              />
            </div>

            <div>
              <Button type="submit" loading={guardando}>
                {editandoId ? 'Guardar cambios' : 'Crear rubro'}
              </Button>

              {editandoId && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={limpiarFormulario}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </section>
      )}

      <section>
        <h2>Buscar</h2>

        <form onSubmit={buscar}>
          <div>
            <label htmlFor="busqueda">Nombre del rubro</label>
            <input
              id="busqueda"
              name="busqueda"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Cemento"
              autoComplete="off"
            />
          </div>

          <div>
            <Button type="submit">Buscar</Button>
            <Button type="button" variant="ghost" onClick={limpiarBusqueda}>
              Limpiar
            </Button>
          </div>

          <label className="checkbox-field" htmlFor="mostrar-inactivos">
            <input
              id="mostrar-inactivos"
              type="checkbox"
              checked={mostrarInactivos}
              onChange={alternarInactivos}
            />
            Mostrar rubros eliminados
          </label>
        </form>
      </section>

      <section>
        <h2>
          Rubros registrados
          {!loading && !error && rubros.length > 0 && ` (${rubros.length})`}
        </h2>

        {loading && (
          <p className="loading-state" role="status">
            Cargando rubros…
          </p>
        )}

        {!loading && error && (
          <p>No se pudo mostrar el listado. Revisá el error de arriba.</p>
        )}

        {!loading && !error && rubros.length === 0 && (
          <EmptyState
            title="Todavía no hay rubros"
            description={
              busquedaAplicada
                ? `Ningún rubro coincide con "${busquedaAplicada}".`
                : 'Creá el primer rubro para empezar a clasificar proveedores.'
            }
          />
        )}

        {!loading && !error && rubros.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Proveedores asociados</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rubros.map((rubro) => (
                <tr key={rubro.id}>
                  <td>{rubro.nombre}</td>
                  <td>{rubro.proveedores_asociados}</td>
                  <td>{rubro.activo ? 'Activo' : 'Eliminado'}</td>
                  <td>
                    {!puedeGestionar && <span>—</span>}

                    {puedeGestionar && rubro.activo && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => comenzarEdicion(rubro)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => eliminarRubro(rubro)}
                        >
                          Eliminar
                        </Button>
                      </>
                    )}

                    {puedeGestionar && !rubro.activo && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => restaurarRubro(rubro)}
                      >
                        Reactivar
                      </Button>
                    )}
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

export default RubrosPage
