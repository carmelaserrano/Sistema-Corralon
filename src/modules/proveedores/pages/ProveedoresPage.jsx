import { useEffect, useState } from 'react'
import {
  CONDICIONES_FISCALES,
  createProveedor,
  getProveedores,
  puedeAltaProveedores,
} from '../api/proveedoresApi'
import { getRubros } from '../api/rubrosApi'
import { cuitEsValido, formatearCuit } from '../cuit'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

const proveedorInicial = {
  razon_social: '',
  nombre_fantasia: '',
  cuit: '',
  condicion_fiscal: '',
  condicion_pago_habitual: '',
  domicilio: '',
  localidad: '',
  provincia: '',
  telefono: '',
  email: '',
  observaciones: '',
}

function ProveedoresPage() {
  const [proveedores, setProveedores] = useState([])
  const [rubros, setRubros] = useState([])
  const [form, setForm] = useState(proveedorInicial)
  const [rubroId, setRubroId] = useState('')
  const [cuitError, setCuitError] = useState('')

  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')

  // Arranca en true por la misma razón que en RubrosPage: si falla la
  // consulta del permiso, es preferible dejar las acciones a la vista y que
  // la base rechace, antes que afirmarle al usuario que no tiene un permiso
  // que quizá sí tiene.
  const [puedeCrear, setPuedeCrear] = useState(true)
  const [avisoPermiso, setAvisoPermiso] = useState('')

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  async function verificarPermiso() {
    try {
      const habilitado = await puedeAltaProveedores()
      setPuedeCrear(habilitado)
      setAvisoPermiso(
        habilitado
          ? ''
          : 'Sólo podés consultar los proveedores. Para dar de alta necesitás el permiso «proveedores.alta».',
      )
    } catch (err) {
      setPuedeCrear(true)
      setAvisoPermiso(
        `No se pudo verificar tu permiso sobre proveedores (${err.message || 'error desconocido'}). Las acciones quedan habilitadas, pero si al guardar no pasa nada, es por esto.`,
      )
    }
  }

  async function cargarProveedores({ search = busqueda } = {}) {
    try {
      setLoading(true)
      setError('')

      const data = await getProveedores({ search })
      setProveedores(data)
      setBusquedaAplicada(search)
    } catch (err) {
      setProveedores([])
      setError(err.message || 'No se pudieron cargar los proveedores')
    } finally {
      setLoading(false)
    }
  }

  async function cargarRubros() {
    try {
      const data = await getRubros()
      setRubros(data)
    } catch {
      // El dropdown de rubro es un dato secundario del alta: si falla, se
      // deja vacío y el proveedor igual se puede crear sin rubro asociado.
      setRubros([])
    }
  }

  useEffect(() => {
    verificarPermiso()
    cargarProveedores({ search: '' })
    cargarRubros()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function manejarCambio(event) {
    const { name, value } = event.target
    setForm((actual) => ({ ...actual, [name]: value }))
  }

  function manejarCambioCuit(event) {
    setForm((actual) => ({ ...actual, cuit: formatearCuit(event.target.value) }))
    setCuitError('')
  }

  function validarCuitAlPerderFoco() {
    if (form.cuit && !cuitEsValido(form.cuit)) {
      setCuitError('CUIT inválido')
    }
  }

  function limpiarFormulario() {
    setForm(proveedorInicial)
    setRubroId('')
    setCuitError('')
    setError('')
  }

  async function guardarProveedor(event) {
    event.preventDefault()

    if (form.cuit && !cuitEsValido(form.cuit)) {
      setCuitError('CUIT inválido')
      return
    }

    try {
      setGuardando(true)
      setError('')
      setAviso('')

      const creado = await createProveedor(form, rubroId || null)
      setAviso(`Proveedor "${creado.razon_social}" creado`)

      limpiarFormulario()
      await cargarProveedores()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el proveedor')
    } finally {
      setGuardando(false)
    }
  }

  function buscar(event) {
    event.preventDefault()
    cargarProveedores()
  }

  function limpiarBusqueda() {
    setBusqueda('')
    cargarProveedores({ search: '' })
  }

  return (
    <main>
      <h1>Proveedores</h1>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}
      {avisoPermiso && <Feedback tone="info">{avisoPermiso}</Feedback>}

      {puedeCrear && (
        <section>
          <h2>Nuevo proveedor</h2>

          <form onSubmit={guardarProveedor}>
            <div>
              <label htmlFor="razon_social">Razón Social</label>
              <input
                id="razon_social"
                name="razon_social"
                value={form.razon_social}
                onChange={manejarCambio}
                placeholder="Corralón San Martín S.A."
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="nombre_fantasia">Nombre de Fantasía</label>
              <input
                id="nombre_fantasia"
                name="nombre_fantasia"
                value={form.nombre_fantasia}
                onChange={manejarCambio}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="cuit">CUIT</label>
              <input
                id="cuit"
                name="cuit"
                value={form.cuit}
                onChange={manejarCambioCuit}
                onBlur={validarCuitAlPerderFoco}
                placeholder="20-12345678-9"
                autoComplete="off"
                inputMode="numeric"
              />
              {cuitError && <Feedback tone="error">{cuitError}</Feedback>}
            </div>

            <div>
              <label htmlFor="condicion_fiscal">Condición Fiscal</label>
              <select
                id="condicion_fiscal"
                name="condicion_fiscal"
                value={form.condicion_fiscal}
                onChange={manejarCambio}
              >
                <option value="">Seleccioná una opción</option>
                {CONDICIONES_FISCALES.map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rubro">Rubro</label>
              <select
                id="rubro"
                name="rubro"
                value={rubroId}
                onChange={(event) => setRubroId(event.target.value)}
              >
                <option value="">Sin rubro</option>
                {rubros.map((rubro) => (
                  <option key={rubro.id} value={rubro.id}>
                    {rubro.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="domicilio">Domicilio</label>
              <input
                id="domicilio"
                name="domicilio"
                value={form.domicilio}
                onChange={manejarCambio}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="localidad">Localidad</label>
              <input
                id="localidad"
                name="localidad"
                value={form.localidad}
                onChange={manejarCambio}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="provincia">Provincia</label>
              <input
                id="provincia"
                name="provincia"
                value={form.provincia}
                onChange={manejarCambio}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="telefono">Teléfono</label>
              <input
                id="telefono"
                name="telefono"
                value={form.telefono}
                onChange={manejarCambio}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={manejarCambio}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="condicion_pago_habitual">
                Condición de Pago Habitual
              </label>
              <input
                id="condicion_pago_habitual"
                name="condicion_pago_habitual"
                value={form.condicion_pago_habitual}
                onChange={manejarCambio}
                placeholder="Cuenta corriente 30 días"
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="observaciones">Observaciones</label>
              <textarea
                id="observaciones"
                name="observaciones"
                value={form.observaciones}
                onChange={manejarCambio}
              />
            </div>

            <div>
              <Button type="submit" loading={guardando}>
                Crear proveedor
              </Button>
            </div>
          </form>
        </section>
      )}

      <section>
        <h2>Buscar</h2>

        <form onSubmit={buscar}>
          <div>
            <label htmlFor="busqueda">Buscar por razón social</label>
            <input
              id="busqueda"
              name="busqueda"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div>
            <Button type="submit">Buscar</Button>
            <Button type="button" variant="ghost" onClick={limpiarBusqueda}>
              Limpiar
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2>
          Proveedores registrados
          {!loading && !error && proveedores.length > 0 &&
            ` (${proveedores.length})`}
        </h2>

        {loading && (
          <p className="loading-state" role="status">
            Cargando proveedores…
          </p>
        )}

        {!loading && error && (
          <p>No se pudo mostrar el listado. Revisá el error de arriba.</p>
        )}

        {!loading && !error && proveedores.length === 0 && (
          <EmptyState
            title="Todavía no hay proveedores"
            description={
              busquedaAplicada
                ? `Ningún proveedor coincide con "${busquedaAplicada}".`
                : 'Creá el primer proveedor para empezar a armar el padrón.'
            }
          />
        )}

        {!loading && !error && proveedores.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Razón Social</th>
                <th>CUIT</th>
                <th>Condición Fiscal</th>
                <th>Rubro</th>
                <th>Localidad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((proveedor) => (
                <tr key={proveedor.id}>
                  <td>{proveedor.razon_social}</td>
                  <td>{formatearCuit(proveedor.cuit)}</td>
                  <td>
                    {CONDICIONES_FISCALES.find(
                      (opcion) => opcion.value === proveedor.condicion_fiscal,
                    )?.label ?? proveedor.condicion_fiscal}
                  </td>
                  <td>{proveedor.rubro?.nombre ?? '—'}</td>
                  <td>{proveedor.localidad || '—'}</td>
                  <td>{proveedor.estado === 'activo' ? 'Activo' : 'Inactivo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

export default ProveedoresPage
