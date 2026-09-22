import { useEffect, useState } from 'react'
import {
  actualizarDomicilio,
  crearDomicilio,
  darDeBaja,
  listarDomicilios,
  marcarPrincipal,
} from '../api/domiciliosApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

const domicilioInicial = {
  alias: '',
  calle: '',
  numero: '',
  localidad: '',
  provincia: '',
  codigo_postal: '',
  referencias: '',
}

function formatearDireccion(domicilio) {
  const partes = [
    `${domicilio.calle} ${domicilio.numero}`,
    domicilio.localidad,
    domicilio.provincia,
  ]
  if (domicilio.codigo_postal) partes.push(`CP ${domicilio.codigo_postal}`)
  return partes.join(', ')
}

/**
 * Domicilios de entrega de un cliente (S3-03). Vive en su propio componente
 * y no dentro de ClientesPage porque tiene su propio ciclo de carga, su
 * propio formulario y sus propios estados de error: mismo criterio que
 * ContactosProveedor en el módulo de proveedores.
 *
 * A diferencia de otras secciones del módulo de clientes, no hay un
 * permiso propio que consultar: la policy domicilios_cliente_write (0031)
 * ya deja escribir a cualquier usuario interno, sin distinción.
 */
function DomiciliosCliente({ clienteId }) {
  const [domicilios, setDomicilios] = useState([])
  const [form, setForm] = useState(domicilioInicial)
  const [editandoId, setEditandoId] = useState(null)
  const [formAbierto, setFormAbierto] = useState(false)

  // CA-05: si el domicilio que se está por eliminar es el principal y
  // quedan otros activos, hay que elegir cuál lo reemplaza antes de poder
  // confirmar la baja.
  const [domicilioAEliminar, setDomicilioAEliminar] = useState(null)
  const [nuevoPrincipalElegido, setNuevoPrincipalElegido] = useState('')

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  async function cargarDomicilios() {
    try {
      setLoading(true)
      setError('')

      const data = await listarDomicilios(clienteId)
      setDomicilios(data)
    } catch (err) {
      setDomicilios([])
      setError(err.message || 'No se pudieron cargar los domicilios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDomicilios()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  function manejarCambio(event) {
    const { name, value } = event.target
    setForm((actual) => ({ ...actual, [name]: value }))
  }

  function abrirFormulario() {
    setForm(domicilioInicial)
    setEditandoId(null)
    setFormAbierto(true)
    setError('')
    setAviso('')
  }

  function cerrarFormulario() {
    setForm(domicilioInicial)
    setEditandoId(null)
    setFormAbierto(false)
    setError('')
  }

  function comenzarEdicion(domicilio) {
    setForm({
      alias: domicilio.alias,
      calle: domicilio.calle,
      numero: domicilio.numero,
      localidad: domicilio.localidad,
      provincia: domicilio.provincia,
      codigo_postal: domicilio.codigo_postal ?? '',
      referencias: domicilio.referencias ?? '',
    })
    setEditandoId(domicilio.id)
    setFormAbierto(true)
    setError('')
    setAviso('')
  }

  async function guardarDomicilio(event) {
    event.preventDefault()

    try {
      setGuardando(true)
      setError('')
      setAviso('')

      if (editandoId) {
        const actualizado = await actualizarDomicilio(editandoId, form)
        setAviso(`Domicilio "${actualizado.alias}" actualizado`)
      } else {
        const creado = await crearDomicilio(clienteId, form)
        setAviso(
          creado.es_principal
            ? `Domicilio "${creado.alias}" agregado como principal`
            : `Domicilio "${creado.alias}" agregado`,
        )
      }

      cerrarFormulario()
      await cargarDomicilios()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el domicilio')
    } finally {
      setGuardando(false)
    }
  }

  // CA-03
  async function elegirComoPrincipal(domicilio) {
    try {
      setError('')
      setAviso('')
      await marcarPrincipal(domicilio.id)
      setAviso(`"${domicilio.alias}" ahora es el domicilio principal`)
      await cargarDomicilios()
    } catch (err) {
      setError(err.message || 'No se pudo marcar el domicilio como principal')
    }
  }

  function pedirEliminacion(domicilio) {
    const otrosActivos = domicilios.filter((d) => d.id !== domicilio.id)

    // Sólo hace falta elegir reemplazo si lo que se borra es el principal y
    // queda algún otro domicilio: si no era principal, o si es el único,
    // no hay nada que reasignar.
    if (domicilio.es_principal && otrosActivos.length > 0) {
      setDomicilioAEliminar(domicilio)
      setNuevoPrincipalElegido('')
      setError('')
      return
    }

    const confirmado = window.confirm(
      `¿Seguro que querés eliminar el domicilio "${domicilio.alias}"?`,
    )
    if (!confirmado) return

    ejecutarBaja(domicilio.id)
  }

  async function ejecutarBaja(domicilioId) {
    try {
      setError('')
      setAviso('')
      await darDeBaja(domicilioId)
      setAviso('Domicilio eliminado')
      await cargarDomicilios()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el domicilio')
    }
  }

  function cancelarEleccionDePrincipal() {
    setDomicilioAEliminar(null)
    setNuevoPrincipalElegido('')
  }

  async function confirmarConNuevoPrincipal(event) {
    event.preventDefault()

    if (!nuevoPrincipalElegido) {
      setError('Elegí qué domicilio va a ser el nuevo principal')
      return
    }

    try {
      setError('')
      // El nuevo principal se marca primero: así nunca hay un momento sin
      // ningún domicilio principal para este cliente.
      await marcarPrincipal(nuevoPrincipalElegido)
      await darDeBaja(domicilioAEliminar.id)
      setAviso('Domicilio eliminado')
      setDomicilioAEliminar(null)
      setNuevoPrincipalElegido('')
      await cargarDomicilios()
    } catch (err) {
      setError(err.message || 'No se pudo completar el cambio')
    }
  }

  const sinDomicilios = !loading && !error && domicilios.length === 0

  return (
    <div className="domicilios-panel">
      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}

      {loading && (
        <p className="loading-state" role="status">
          Cargando domicilios…
        </p>
      )}

      {/* CA-05: paso intermedio para elegir el nuevo principal. */}
      {domicilioAEliminar && (
        <form onSubmit={confirmarConNuevoPrincipal}>
          <p>
            {`"${domicilioAEliminar.alias}" es el domicilio principal. Elegí cuál lo va a reemplazar antes de eliminarlo.`}
          </p>

          <div>
            <label htmlFor="nuevo-principal">Nuevo domicilio principal</label>
            <select
              id="nuevo-principal"
              value={nuevoPrincipalElegido}
              onChange={(event) => setNuevoPrincipalElegido(event.target.value)}
            >
              <option value="">Seleccioná un domicilio</option>
              {domicilios
                .filter((d) => d.id !== domicilioAEliminar.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.alias}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <Button type="submit">Confirmar y eliminar</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={cancelarEleccionDePrincipal}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* CA-01: estado vacío con la acción de agregar el primero. */}
      {sinDomicilios && !formAbierto && !domicilioAEliminar && (
        <EmptyState
          title="Este cliente no tiene domicilios cargados"
          description="Agregá el primero para poder planificar sus entregas."
        >
          <Button type="button" onClick={abrirFormulario}>
            Agregar el primer domicilio
          </Button>
        </EmptyState>
      )}

      {!loading && !error && domicilios.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Alias</th>
              <th>Dirección</th>
              <th>Principal</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {domicilios.map((domicilio) => (
              <tr key={domicilio.id}>
                <td>{domicilio.alias}</td>
                <td>{formatearDireccion(domicilio)}</td>
                <td>
                  {domicilio.es_principal ? (
                    <span className="estado-badge estado-badge-principal">
                      Principal
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => comenzarEdicion(domicilio)}
                  >
                    Editar
                  </Button>
                  {!domicilio.es_principal && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => elegirComoPrincipal(domicilio)}
                    >
                      Marcar como principal
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => pedirEliminacion(domicilio)}
                  >
                    Eliminar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* CA-01: se pueden agregar varios domicilios al mismo cliente. */}
      {!formAbierto && domicilios.length > 0 && (
        <Button type="button" onClick={abrirFormulario}>
          Agregar domicilio
        </Button>
      )}

      {formAbierto && (
        <form onSubmit={guardarDomicilio}>
          <h3>{editandoId ? 'Editar domicilio' : 'Nuevo domicilio'}</h3>

          <div>
            <label htmlFor="dom-alias">Alias</label>
            <input
              id="dom-alias"
              name="alias"
              value={form.alias}
              onChange={manejarCambio}
              placeholder="Obra Tres Cerritos"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="dom-calle">Calle</label>
            <input
              id="dom-calle"
              name="calle"
              value={form.calle}
              onChange={manejarCambio}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="dom-numero">Número</label>
            <input
              id="dom-numero"
              name="numero"
              value={form.numero}
              onChange={manejarCambio}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="dom-localidad">Localidad</label>
            <input
              id="dom-localidad"
              name="localidad"
              value={form.localidad}
              onChange={manejarCambio}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="dom-provincia">Provincia</label>
            <input
              id="dom-provincia"
              name="provincia"
              value={form.provincia}
              onChange={manejarCambio}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="dom-codigo-postal">Código postal</label>
            <input
              id="dom-codigo-postal"
              name="codigo_postal"
              value={form.codigo_postal}
              onChange={manejarCambio}
              placeholder="Opcional"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="dom-referencias">Referencias</label>
            <textarea
              id="dom-referencias"
              name="referencias"
              value={form.referencias}
              onChange={manejarCambio}
              placeholder="Opcional"
            />
          </div>

          <div>
            <Button type="submit" loading={guardando}>
              {editandoId ? 'Guardar cambios' : 'Agregar domicilio'}
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

export default DomiciliosCliente
