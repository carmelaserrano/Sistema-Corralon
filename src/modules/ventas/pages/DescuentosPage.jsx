import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { CheckCircle2, Download, Percent, ShieldAlert } from 'lucide-react'
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
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { useToast } from '../../../components/ui/ToastContext'

const etiquetaTipo = (tipo) => TIPOS_APLICACION.find((t) => t.value === tipo)?.label ?? tipo

const reglaInicial = { tipo_aplicacion: '', referencia_id: '', porcentaje: '', activo: true }

function DescuentosPage() {
  const toast = useToast()
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

  function exportarCsv() {
    if (!reglas.length) return
    const filas = reglas.map((r) => ({
      Aplica_A: etiquetaTipo(r.tipo_aplicacion),
      Referencia: r.referencia_nombre ?? '—',
      Porcentaje: `${r.porcentaje}%`,
      Estado: r.activo ? 'Activa' : 'Inactiva',
    }))
    const csv = Papa.unparse(filas)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `reglas_descuento_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Reglas de descuento exportadas a CSV')
  }

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
      toast.success('Regla de descuento creada')
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
      toast.success(`Regla ${regla.activo ? 'desactivada' : 'activada'}`)
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
      toast.success('Porcentaje de descuento actualizado')
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
      toast.success('Límite de descuento manual actualizado')
      await cargarLimite()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el límite')
    } finally {
      setGuardandoLimite(false)
    }
  }

  return (
    <main>
      <PageHeader
        breadcrumbs={[{ label: 'Ventas', to: '/#/ventas' }, { label: 'Descuentos' }]}
        kicker="Ventas y Precios"
        title="Descuentos"
        description="Reglas comerciales de bonificación automática por tipo de cliente o producto y límite de descuento manual."
        actions={
          reglas.length > 0 ? (
            <Button variant="secondary" onClick={exportarCsv}>
              <Download size={16} />
              Exportar CSV
            </Button>
          ) : null
        }
      />

      <div className="kpi-grid">
        <KpiCard
          label="Total reglas"
          value={reglas.length}
          icon={Percent}
          tone="brand"
          helperText="Reglas registradas"
        />
        <KpiCard
          label="Reglas activas"
          value={reglas.filter((r) => r.activo).length}
          icon={CheckCircle2}
          tone="success"
          helperText="Aplicando descuentos"
        />
        <KpiCard
          label="Límite manual"
          value={limite !== null ? `${limite}%` : 'Sin configurar'}
          icon={ShieldAlert}
          tone={limite !== null ? 'warning' : 'neutral'}
          helperText="Requiere autorización"
        />
      </div>

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
          <div className="data-table-card">
            <div className="data-table-scroll-container">
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
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default DescuentosPage
