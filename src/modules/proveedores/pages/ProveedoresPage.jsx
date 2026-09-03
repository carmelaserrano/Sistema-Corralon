import { useEffect, useState } from 'react'
import {
  CONDICIONES_FISCALES,
  CONDICIONES_PAGO,
  createProveedor,
  getProveedores,
  puedeAltaProveedores,
  puedeModificarProveedores,
  updateProveedor,
} from '../api/proveedoresApi'
import { getRubros } from '../api/rubrosApi'
import { cuitEsValido, formatearCuit } from '../cuit'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

function formatearFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR')
}

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
  const [editandoId, setEditandoId] = useState(null)
  const [formOriginal, setFormOriginal] = useState(null)
  const [detalleId, setDetalleId] = useState(null)
  const [cuitError, setCuitError] = useState('')

  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')

  // Arrancan en true por la misma razón que en RubrosPage: si falla la
  // consulta del permiso, es preferible dejar las acciones a la vista y que
  // la base rechace, antes que afirmarle al usuario que no tiene un permiso
  // que quizá sí tiene.
  const [puedeCrear, setPuedeCrear] = useState(true)
  const [puedeModificar, setPuedeModificar] = useState(true)
  const [avisoPermisoAlta, setAvisoPermisoAlta] = useState('')
  const [avisoPermisoModificar, setAvisoPermisoModificar] = useState('')

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  async function verificarPermisoAlta() {
    try {
      const habilitado = await puedeAltaProveedores()
      setPuedeCrear(habilitado)
      setAvisoPermisoAlta(
        habilitado
          ? ''
          : 'No tenés el permiso «proveedores.alta»: podés modificar proveedores existentes, pero no dar de alta nuevos.',
      )
    } catch (err) {
      setPuedeCrear(true)
      setAvisoPermisoAlta(
        `No se pudo verificar tu permiso de alta (${err.message || 'error desconocido'}). La acción queda habilitada, pero si al crear no pasa nada, es por esto.`,
      )
    }
  }

  async function verificarPermisoModificar() {
    try {
      const habilitado = await puedeModificarProveedores()
      setPuedeModificar(habilitado)
      setAvisoPermisoModificar(
        habilitado
          ? ''
          : 'No tenés el permiso «proveedores.modificar»: podés dar de alta proveedores, pero no editar los existentes.',
      )
    } catch (err) {
      setPuedeModificar(true)
      setAvisoPermisoModificar(
        `No se pudo verificar tu permiso de modificación (${err.message || 'error desconocido'}). La acción queda habilitada, pero si al guardar no pasa nada, es por esto.`,
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
    verificarPermisoAlta()
    verificarPermisoModificar()
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
    setEditandoId(null)
    setFormOriginal(null)
    setCuitError('')
    setError('')
  }

  function comenzarEdicion(proveedor) {
    const datosForm = {
      razon_social: proveedor.razon_social ?? '',
      nombre_fantasia: proveedor.nombre_fantasia ?? '',
      cuit: formatearCuit(proveedor.cuit ?? ''),
      condicion_fiscal: proveedor.condicion_fiscal ?? '',
      condicion_pago_habitual: proveedor.condicion_pago_habitual ?? '',
      domicilio: proveedor.domicilio ?? '',
      localidad: proveedor.localidad ?? '',
      provincia: proveedor.provincia ?? '',
      telefono: proveedor.telefono ?? '',
      email: proveedor.email ?? '',
      observaciones: proveedor.observaciones ?? '',
    }
    const rubroSeleccionado = proveedor.rubro?.id ?? ''

    setForm(datosForm)
    setRubroId(rubroSeleccionado)
    setEditandoId(proveedor.id)
    setFormOriginal({ ...datosForm, rubroId: rubroSeleccionado })
    setDetalleId(null)
    setCuitError('')
    setError('')
    setAviso('')
  }

  function verDetalle(proveedor) {
    setDetalleId(proveedor.id)
  }

  function cerrarDetalle() {
    setDetalleId(null)
  }

  async function guardarProveedor(event) {
    event.preventDefault()

    // El CUIT no se valida en modo edición: el campo queda deshabilitado y
    // no se manda en el UPDATE, es inmutable una vez dado de alta.
    if (!editandoId && form.cuit && !cuitEsValido(form.cuit)) {
      setCuitError('CUIT inválido')
      return
    }

    // Sin esto, guardar sin tocar nada igual dispara el UPDATE y el trigger
    // de auditoría deja registrado un cambio que en realidad no existió.
    if (
      editandoId &&
      formOriginal &&
      JSON.stringify({ ...form, rubroId: rubroId || '' }) ===
        JSON.stringify(formOriginal)
    ) {
      setAviso(`No se hicieron cambios en "${form.razon_social}"`)
      limpiarFormulario()
      return
    }

    try {
      setGuardando(true)
      setError('')
      setAviso('')

      if (editandoId) {
        const actualizado = await updateProveedor(
          editandoId,
          form,
          rubroId || null,
        )
        setAviso(`Proveedor "${actualizado.razon_social}" actualizado`)
      } else {
        const creado = await createProveedor(form, rubroId || null)
        setAviso(`Proveedor "${creado.razon_social}" creado`)
      }

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

  const proveedorDetalle = detalleId
    ? (proveedores.find((p) => p.id === detalleId) ?? null)
    : null

  return (
    <main>
      <h1>Proveedores</h1>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}
      {avisoPermisoAlta && <Feedback tone="info">{avisoPermisoAlta}</Feedback>}
      {avisoPermisoModificar && (
        <Feedback tone="info">{avisoPermisoModificar}</Feedback>
      )}

      {(puedeCrear || editandoId) && (
        <section>
          <h2>{editandoId ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>

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
                disabled={Boolean(editandoId)}
              />
              {editandoId && <small>El CUIT no se puede modificar.</small>}
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
              <select
                id="condicion_pago_habitual"
                name="condicion_pago_habitual"
                value={form.condicion_pago_habitual}
                onChange={manejarCambio}
              >
                <option value="">Sin especificar</option>
                {CONDICIONES_PAGO.map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </select>
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
                {editandoId ? 'Guardar cambios' : 'Crear proveedor'}
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

      {detalleId && (
        <section>
          <h2>Detalle del proveedor</h2>

          {!proveedorDetalle && (
            <p>Este proveedor ya no está en el listado actual.</p>
          )}

          {proveedorDetalle && (
            <table>
              <tbody>
                <tr>
                  <th>Razón Social</th>
                  <td>{proveedorDetalle.razon_social}</td>
                </tr>
                <tr>
                  <th>Nombre de Fantasía</th>
                  <td>{proveedorDetalle.nombre_fantasia || '—'}</td>
                </tr>
                <tr>
                  <th>CUIT</th>
                  <td>{formatearCuit(proveedorDetalle.cuit)}</td>
                </tr>
                <tr>
                  <th>Condición Fiscal</th>
                  <td>
                    {CONDICIONES_FISCALES.find(
                      (opcion) =>
                        opcion.value === proveedorDetalle.condicion_fiscal,
                    )?.label ?? proveedorDetalle.condicion_fiscal}
                  </td>
                </tr>
                <tr>
                  <th>Condición de Pago Habitual</th>
                  <td>
                    {CONDICIONES_PAGO.find(
                      (opcion) =>
                        opcion.value ===
                        proveedorDetalle.condicion_pago_habitual,
                    )?.label ?? '—'}
                  </td>
                </tr>
                <tr>
                  <th>Rubro</th>
                  <td>{proveedorDetalle.rubro?.nombre ?? '—'}</td>
                </tr>
                <tr>
                  <th>Domicilio</th>
                  <td>{proveedorDetalle.domicilio || '—'}</td>
                </tr>
                <tr>
                  <th>Localidad</th>
                  <td>{proveedorDetalle.localidad || '—'}</td>
                </tr>
                <tr>
                  <th>Provincia</th>
                  <td>{proveedorDetalle.provincia || '—'}</td>
                </tr>
                <tr>
                  <th>Teléfono</th>
                  <td>{proveedorDetalle.telefono || '—'}</td>
                </tr>
                <tr>
                  <th>Email</th>
                  <td>{proveedorDetalle.email || '—'}</td>
                </tr>
                <tr>
                  <th>Observaciones</th>
                  <td>{proveedorDetalle.observaciones || '—'}</td>
                </tr>
                <tr>
                  <th>Estado</th>
                  <td>
                    {proveedorDetalle.estado === 'activo' ? 'Activo' : 'Inactivo'}
                  </td>
                </tr>
                <tr>
                  <th>Creado el</th>
                  <td>{formatearFecha(proveedorDetalle.created_at)}</td>
                </tr>
                <tr>
                  <th>Última modificación</th>
                  <td>{formatearFecha(proveedorDetalle.updated_at)}</td>
                </tr>
              </tbody>
            </table>
          )}

          <Button type="button" variant="ghost" onClick={cerrarDetalle}>
            Cerrar
          </Button>
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
                <th>Condición de Pago</th>
                <th>Rubro</th>
                <th>Localidad</th>
                <th>Estado</th>
                <th>Acciones</th>
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
                  <td>
                    {CONDICIONES_PAGO.find(
                      (opcion) =>
                        opcion.value === proveedor.condicion_pago_habitual,
                    )?.label ?? '—'}
                  </td>
                  <td>{proveedor.rubro?.nombre ?? '—'}</td>
                  <td>{proveedor.localidad || '—'}</td>
                  <td>{proveedor.estado === 'activo' ? 'Activo' : 'Inactivo'}</td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => verDetalle(proveedor)}
                    >
                      Ver detalle
                    </Button>
                    {puedeModificar ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => comenzarEdicion(proveedor)}
                      >
                        Editar
                      </Button>
                    ) : (
                      <span>—</span>
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

export default ProveedoresPage
