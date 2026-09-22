import { useEffect, useState } from 'react'
import {
  TIPOS_APLICACION,
  actualizarReglaDescuento,
  crearReglaDescuento,
  listarOpcionesReferencia,
  listarReglasDescuento,
  obtenerLimiteDescuentoManual,
  puedeGestionarDescuentos,
  setLimiteDescuentoManual,
} from '../api/descuentosApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

const etiquetaTipo = (tipo) => TIPOS_APLICACION.find((t) => t.value === tipo)?.label ?? tipo

const reglaInicial = { tipo_aplicacion: '', referencia_id: '', porcentaje: '', activo: true }

function DescuentosPage() {
  const [reglas, setReglas] = useState([])
  const [form, setForm] = useState(reglaInicial)
  const [opcionesReferencia, setOpcionesReferencia] = useState([])

  const [limite, setLimite] = useState(null)
  const [limiteForm, setLimiteForm] = useState('')

  // Porcentaje en edición por regla, mientras no se guarda: { [id]: '12.5' }.
  const [edicionPorcentaje, setEdicionPorcentaje] = useState({})

  // Arranca en true: si falla la consulta del permiso, es preferible dejar
  // las acciones a la vista y que la RLS rechace, antes que afirmarle al
  // usuario que no tiene un permiso que quizá sí tiene (mismo criterio que
  // en clientesApi/rubrosApi).
  const [puedeGestionar, setPuedeGestionar] = useState(true)
  const [avisoPermiso, setAvisoPermiso] = useState('')

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardandoRegla, setGuardandoRegla] = useState(false)
  const [guardandoLimite, setGuardandoLimite] = useState(false)
  const [guardandoFilaId, setGuardandoFilaId] = useState(null)

  async function verificarPermiso() {
    try {
      const habilitado = await puedeGestionarDescuentos()
      setPuedeGestionar(habilitado)
      setAvisoPermiso(
        habilitado
          ? ''
          : 'Sólo podés consultar las reglas y el límite. Para crearlas o modificarlas necesitás el permiso «precios.gestionar».',
      )
    } catch (err) {
      setPuedeGestionar(true)
      setAvisoPermiso(
        `No se pudo verificar tu permiso (${err.message || 'error desconocido'}). Las acciones quedan habilitadas, pero si al guardar no pasa nada, es por esto.`,
      )
    }
  }

  async function cargarReglas() {
    try {
      setLoading(true)
      setError('')
      const data = await listarReglasDescuento()
      setReglas(data)
    } catch (err) {
      setReglas([])
      setError(err.message || 'No se pudieron cargar las reglas de descuento')
    } finally {
      setLoading(false)
    }
  }

  async function cargarLimite() {
    try {
      const valor = await obtenerLimiteDescuentoManual()
      setLimite(valor)
      setLimiteForm(valor === null ? '' : String(valor))
    } catch (err) {
      setError(err.message || 'No se pudo cargar el límite de descuento manual')
    }
  }

  useEffect(() => {
    verificarPermiso()
    cargarReglas()
    cargarLimite()
  }, [])

  // Las opciones de "a qué aplica" dependen de qué tipo se eligió arriba.
  useEffect(() => {
    if (!form.tipo_aplicacion) {
      setOpcionesReferencia([])
      return
    }

    let activo = true
    listarOpcionesReferencia(form.tipo_aplicacion)
      .then((opciones) => {
        if (activo) setOpcionesReferencia(opciones)
      })
      .catch((err) => {
        if (activo) setError(err.message || 'No se pudieron cargar las opciones')
      })

    return () => {
      activo = false
    }
  }, [form.tipo_aplicacion])

  function manejarCambioTipo(event) {
    setForm((actual) => ({
      ...actual,
      tipo_aplicacion: event.target.value,
      referencia_id: '', // cambia el tipo, las opciones de antes ya no valen
    }))
  }

  function manejarCambio(event) {
    const { name, value } = event.target
    setForm((actual) => ({ ...actual, [name]: value }))
  }

  function limpiarFormulario() {
    setForm(reglaInicial)
    setOpcionesReferencia([])
  }

  async function crearRegla(event) {
    event.preventDefault()

    try {
      setGuardandoRegla(true)
      setError('')
      setAviso('')

      await crearReglaDescuento({
        tipo_aplicacion: form.tipo_aplicacion,
        referencia_id: form.referencia_id,
        porcentaje: form.porcentaje,
        activo: form.activo,
      })

      setAviso('Regla de descuento creada')
      limpiarFormulario()
      await cargarReglas()
    } catch (err) {
      setError(err.message || 'No se pudo crear la regla')
    } finally {
      setGuardandoRegla(false)
    }
  }

  async function alternarActivo(regla) {
    try {
      setError('')
      setAviso('')
      setGuardandoFilaId(regla.id)
      await actualizarReglaDescuento(regla.id, { activo: !regla.activo })
      await cargarReglas()
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado de la regla')
    } finally {
      setGuardandoFilaId(null)
    }
  }

  async function guardarPorcentaje(regla) {
    const nuevoPorcentaje = edicionPorcentaje[regla.id]
    if (nuevoPorcentaje === undefined || nuevoPorcentaje === String(regla.porcentaje)) return

    try {
      setError('')
      setAviso('')
      setGuardandoFilaId(regla.id)
      await actualizarReglaDescuento(regla.id, { porcentaje: Number(nuevoPorcentaje) })
      setEdicionPorcentaje((actual) =>
        Object.fromEntries(Object.entries(actual).filter(([id]) => id !== regla.id)),
      )
      await cargarReglas()
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el porcentaje')
    } finally {
      setGuardandoFilaId(null)
    }
  }

  async function guardarLimite(event) {
    event.preventDefault()

    try {
      setGuardandoLimite(true)
      setError('')
      setAviso('')
      await setLimiteDescuentoManual(Number(limiteForm))
      setAviso('Límite de descuento manual actualizado')
      await cargarLimite()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el límite')
    } finally {
      setGuardandoLimite(false)
    }
  }

  return (
    <main>
      <h1>Descuentos</h1>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}
      {avisoPermiso && <Feedback tone="info">{avisoPermiso}</Feedback>}

      <section>
        <h2>Límite de descuento manual</h2>
        <p>
          A partir de qué porcentaje un descuento manual necesita que un
          supervisor lo autorice.
        </p>

        {puedeGestionar ? (
          <form onSubmit={guardarLimite}>
            <div>
              <label htmlFor="limite">Porcentaje límite</label>
              <input
                id="limite"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={limiteForm}
                onChange={(event) => setLimiteForm(event.target.value)}
                placeholder="Sin configurar"
              />
            </div>
            <Button type="submit" loading={guardandoLimite}>
              Guardar límite
            </Button>
          </form>
        ) : (
          <p>
            {limite === null
              ? 'Todavía no se configuró ningún límite: ningún descuento manual pide autorización.'
              : `Límite actual: ${limite}%`}
          </p>
        )}
      </section>

      {puedeGestionar && (
        <section>
          <h2>Nueva regla de descuento</h2>

          <form onSubmit={crearRegla}>
            <div>
              <label htmlFor="tipo_aplicacion">Aplica a</label>
              <select
                id="tipo_aplicacion"
                name="tipo_aplicacion"
                value={form.tipo_aplicacion}
                onChange={manejarCambioTipo}
              >
                <option value="">Seleccioná una opción</option>
                {TIPOS_APLICACION.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="referencia_id">
                {form.tipo_aplicacion
                  ? etiquetaTipo(form.tipo_aplicacion)
                  : 'Elegí primero a qué aplica'}
              </label>
              <select
                id="referencia_id"
                name="referencia_id"
                value={form.referencia_id}
                onChange={manejarCambio}
                disabled={!form.tipo_aplicacion}
              >
                <option value="">Seleccioná una opción</option>
                {opcionesReferencia.map((opcion) => (
                  <option key={opcion.id} value={opcion.id}>
                    {opcion.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="porcentaje">Porcentaje</label>
              <input
                id="porcentaje"
                name="porcentaje"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={form.porcentaje}
                onChange={manejarCambio}
                placeholder="10"
              />
            </div>

            <label className="checkbox-field" htmlFor="activo">
              <input
                id="activo"
                type="checkbox"
                checked={form.activo}
                onChange={(event) =>
                  setForm((actual) => ({ ...actual, activo: event.target.checked }))
                }
              />
              Activa
            </label>

            <div>
              <Button type="submit" loading={guardandoRegla}>
                Crear regla
              </Button>
            </div>
          </form>
        </section>
      )}

      <section>
        <h2>Reglas de descuento</h2>

        {loading && (
          <p className="loading-state" role="status">
            Cargando reglas…
          </p>
        )}

        {!loading && !error && reglas.length === 0 && (
          <EmptyState
            title="Todavía no hay reglas de descuento"
            description="Creá la primera para aplicar precios diferenciados."
          />
        )}

        {!loading && reglas.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Aplica a</th>
                <th>Referencia</th>
                <th>Porcentaje</th>
                <th>Estado</th>
                {puedeGestionar && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {reglas.map((regla) => (
                <tr key={regla.id}>
                  <td>{etiquetaTipo(regla.tipo_aplicacion)}</td>
                  <td>{regla.referencia_nombre ?? '— (ya no existe)'}</td>
                  <td>
                    {puedeGestionar ? (
                      <input
                        aria-label={`Porcentaje de la regla ${regla.referencia_nombre ?? regla.id}`}
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={edicionPorcentaje[regla.id] ?? String(regla.porcentaje)}
                        onChange={(event) =>
                          setEdicionPorcentaje((actual) => ({
                            ...actual,
                            [regla.id]: event.target.value,
                          }))
                        }
                        disabled={guardandoFilaId === regla.id}
                      />
                    ) : (
                      `${regla.porcentaje}%`
                    )}
                  </td>
                  <td>{regla.activo ? 'Activa' : 'Inactiva'}</td>
                  {puedeGestionar && (
                    <td>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => guardarPorcentaje(regla)}
                        disabled={
                          guardandoFilaId === regla.id ||
                          edicionPorcentaje[regla.id] === undefined ||
                          edicionPorcentaje[regla.id] === String(regla.porcentaje)
                        }
                      >
                        Guardar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => alternarActivo(regla)}
                        disabled={guardandoFilaId === regla.id}
                      >
                        {regla.activo ? 'Desactivar' : 'Activar'}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

export default DescuentosPage
