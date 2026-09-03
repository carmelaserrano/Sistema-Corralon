import { useEffect, useState } from 'react'
import {
  createContacto,
  deleteContacto,
  getContactosDeProveedor,
  updateContacto,
} from '../api/contactosApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

const contactoInicial = {
  nombre: '',
  cargo: '',
  telefono: '',
  email: '',
  principal: false,
}

/**
 * Solapa de contactos dentro del detalle de un proveedor (US-PRV-05).
 *
 * Vive en su propio componente y no dentro de ProveedoresPage porque tiene
 * su propio ciclo de carga, su propio formulario y sus propios estados de
 * error: mezclarlo con el alta de proveedores haría una pantalla imposible
 * de seguir.
 */
function ContactosProveedor({
  proveedorId,
  puedeGestionar = true,
  mostrarAvisoPermiso = true,
}) {
  const [contactos, setContactos] = useState([])
  const [form, setForm] = useState(contactoInicial)
  const [editandoId, setEditandoId] = useState(null)
  const [formAbierto, setFormAbierto] = useState(false)

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  async function cargarContactos() {
    try {
      setLoading(true)
      setError('')

      const data = await getContactosDeProveedor(proveedorId)
      setContactos(data)
    } catch (err) {
      setContactos([])
      setError(err.message || 'No se pudieron cargar los contactos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarContactos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId])

  function manejarCambio(event) {
    const { name, value, type, checked } = event.target

    setForm((actual) => ({
      ...actual,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function abrirFormulario() {
    setForm(contactoInicial)
    setEditandoId(null)
    setFormAbierto(true)
    setError('')
    setAviso('')
  }

  function cerrarFormulario() {
    setForm(contactoInicial)
    setEditandoId(null)
    setFormAbierto(false)
    setError('')
  }

  function comenzarEdicion(contacto) {
    setForm({
      nombre: contacto.nombre ?? '',
      cargo: contacto.cargo ?? '',
      telefono: contacto.telefono ?? '',
      email: contacto.email ?? '',
      principal: Boolean(contacto.principal),
    })
    setEditandoId(contacto.id)
    setFormAbierto(true)
    setError('')
    setAviso('')
  }

  async function guardarContacto(event) {
    event.preventDefault()

    try {
      setGuardando(true)
      setError('')
      setAviso('')

      if (editandoId) {
        const actualizado = await updateContacto(editandoId, form)
        setAviso(`Contacto "${actualizado.nombre}" actualizado`)
      } else {
        const creado = await createContacto(proveedorId, form)
        setAviso(`Contacto "${creado.nombre}" agregado`)
      }

      cerrarFormulario()
      // Se recarga siempre: si el contacto quedó como principal, el trigger
      // de la base desmarcó a otro y esa fila también cambió (CA 5).
      await cargarContactos()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el contacto')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarContacto(contacto) {
    const confirmado = window.confirm(
      `¿Seguro que querés eliminar el contacto "${contacto.nombre}"?`,
    )

    if (!confirmado) return

    try {
      setError('')
      setAviso('')
      await deleteContacto(contacto.id)
      setAviso(`Contacto "${contacto.nombre}" eliminado`)
      if (editandoId === contacto.id) cerrarFormulario()
      await cargarContactos()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el contacto')
    }
  }

  const sinContactos = !loading && !error && contactos.length === 0

  return (
    <div className="contactos-panel">
      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}

      {!puedeGestionar && mostrarAvisoPermiso && (
        <Feedback tone="info">
          Sólo podés consultar los contactos. Para agregarlos, editarlos o
          eliminarlos necesitás el permiso «proveedores.modificar».
        </Feedback>
      )}

      {loading && (
        <p className="loading-state" role="status">
          Cargando contactos…
        </p>
      )}

      {/* CA 7: estado vacío con la acción de agregar el primero. */}
      {sinContactos && !formAbierto && (
        <EmptyState
          title="Este proveedor no tiene contactos"
          description={
            puedeGestionar
              ? 'Cargá el primero para tener a quién escribirle o llamar.'
              : 'Nadie cargó contactos todavía, y no tenés permiso para agregarlos.'
          }
        >
          {puedeGestionar && (
            <Button type="button" onClick={abrirFormulario}>
              Agregar el primer contacto
            </Button>
          )}
        </EmptyState>
      )}

      {!loading && !error && contactos.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Cargo</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Principal</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {contactos.map((contacto) => (
              <tr key={contacto.id}>
                <td>{contacto.nombre}</td>
                <td>{contacto.cargo || '—'}</td>
                <td>{contacto.telefono}</td>
                <td>{contacto.email || '—'}</td>
                <td>
                  {contacto.principal ? (
                    <span className="estado-badge estado-badge-principal">
                      Principal
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {puedeGestionar ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => comenzarEdicion(contacto)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => eliminarContacto(contacto)}
                      >
                        Eliminar
                      </Button>
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* CA 1: se pueden agregar varios contactos al mismo proveedor. */}
      {puedeGestionar && !formAbierto && contactos.length > 0 && (
        <Button type="button" onClick={abrirFormulario}>
          Agregar contacto
        </Button>
      )}

      {puedeGestionar && formAbierto && (
        <form onSubmit={guardarContacto}>
          <h3>{editandoId ? 'Editar contacto' : 'Nuevo contacto'}</h3>

          <div>
            <label htmlFor="contacto-nombre">Nombre</label>
            <input
              id="contacto-nombre"
              name="nombre"
              value={form.nombre}
              onChange={manejarCambio}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="contacto-cargo">Cargo</label>
            <input
              id="contacto-cargo"
              name="cargo"
              value={form.cargo}
              onChange={manejarCambio}
              placeholder="Opcional"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="contacto-telefono">Teléfono</label>
            <input
              id="contacto-telefono"
              name="telefono"
              value={form.telefono}
              onChange={manejarCambio}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="contacto-email">Email</label>
            <input
              id="contacto-email"
              name="email"
              value={form.email}
              onChange={manejarCambio}
              placeholder="Opcional"
              autoComplete="off"
            />
          </div>

          <label className="checkbox-field" htmlFor="contacto-principal">
            <input
              id="contacto-principal"
              type="checkbox"
              name="principal"
              checked={form.principal}
              onChange={manejarCambio}
            />
            Es el contacto principal
          </label>

          <div>
            <Button type="submit" loading={guardando}>
              {editandoId ? 'Guardar cambios' : 'Agregar contacto'}
            </Button>
            <Button type="button" variant="ghost" onClick={cerrarFormulario}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

export default ContactosProveedor
