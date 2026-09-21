import { useEffect, useRef, useState } from 'react'
import {
  TIPOS_DOCUMENTO,
  TIPOS_PERSONA,
  actualizarCliente,
  crearCliente,
  listarClientes,
  listarCondicionesIva,
  listarTiposCliente,
  puedeAltaClientes,
  puedeModificarClientes,
} from '../api/clientesApi'
import { cuitEsValido, formatearCuit } from '../../proveedores/cuit'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

const DEBOUNCE_BUSQUEDA_MS = 300

// CA-03: el estado se muestra con un indicador visual (mismo patrón que
// EstadoBadge en proveedores). Bloqueado reutiliza el tono "error" del
// sistema de badges: es el estado que más atención necesita.
function EstadoBadge({ estado }) {
  const tono =
    estado === 'Activo' ? 'activo' : estado === 'Bloqueado' ? 'error' : 'inactivo'

  return <span className={`estado-badge estado-badge-${tono}`}>{estado}</span>
}

function nombreCliente(cliente) {
  return cliente.tipo_persona === 'fisica'
    ? `${cliente.apellido}, ${cliente.nombre}`
    : cliente.razon_social
}

function formatearDocumento(cliente) {
  const numero =
    cliente.tipo_documento === 'CUIT'
      ? formatearCuit(cliente.numero_documento)
      : cliente.numero_documento

  return `${cliente.tipo_documento} ${numero}`
}

const clienteInicial = {
  tipo_persona: 'fisica',
  nombre: '',
  apellido: '',
  razon_social: '',
  tipo_documento: 'DNI',
  numero_documento: '',
  condicion_iva_id: '',
  tipo_cliente_id: '',
  telefono: '',
  email: '',
}

function ClientesPage() {
  const [clientes, setClientes] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)

  const [condicionesIva, setCondicionesIva] = useState([])
  const [tiposCliente, setTiposCliente] = useState([])

  const [form, setForm] = useState(clienteInicial)
  const [editandoId, setEditandoId] = useState(null)
  const [formOriginal, setFormOriginal] = useState(null)
  const [erroresCampo, setErroresCampo] = useState({})

  const [busqueda, setBusqueda] = useState('')
  // El montaje ya dispara su propia carga inicial (más abajo); sin este
  // freno, el efecto de búsqueda en vivo la duplicaría 300ms después con la
  // misma búsqueda vacía.
  const busquedaAlMontar = useRef(true)

  // Arrancan en true: si falla la consulta del permiso es preferible dejar
  // la acción a la vista y que la RLS rechace, antes que afirmarle al
  // usuario que no tiene un permiso que quizá sí tiene (mismo criterio que
  // en proveedoresApi/rubrosApi).
  const [puedeCrear, setPuedeCrear] = useState(true)
  const [puedeModificar, setPuedeModificar] = useState(true)
  const [avisoPermisos, setAvisoPermisos] = useState('')

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  async function verificarPermisos() {
    try {
      const [alta, modificar] = await Promise.all([
        puedeAltaClientes(),
        puedeModificarClientes(),
      ])
      setPuedeCrear(alta)
      setPuedeModificar(modificar)

      const faltantes = [!alta && 'dar de alta', !modificar && 'editar']
        .filter(Boolean)
        .join(' y ')

      setAvisoPermisos(
        faltantes
          ? `Sólo podés consultar el padrón: no tenés permiso para ${faltantes} clientes.`
          : '',
      )
    } catch (err) {
      setPuedeCrear(true)
      setPuedeModificar(true)
      setAvisoPermisos(
        `No se pudo verificar tu permiso sobre clientes (${err.message || 'error desconocido'}). Las acciones quedan habilitadas, pero si al guardar no pasa nada, es por esto.`,
      )
    }
  }

  async function cargarClientes({ search = busqueda, pagina: pag = 1 } = {}) {
    try {
      setLoading(true)
      setError('')

      const resultado = await listarClientes({ search, pagina: pag })

      setClientes(resultado.clientes)
      setTotal(resultado.total)
      setTotalPaginas(resultado.totalPaginas)
      setPagina(resultado.pagina)
    } catch (err) {
      setClientes([])
      setError(err.message || 'No se pudieron cargar los clientes')
    } finally {
      setLoading(false)
    }
  }

  async function cargarCatalogos() {
    const [iva, tipos] = await Promise.all([
      listarCondicionesIva(),
      listarTiposCliente(),
    ])
    setCondicionesIva(iva)
    setTiposCliente(tipos)
  }

  useEffect(() => {
    verificarPermisos()
    cargarClientes({ search: '', pagina: 1 })
    cargarCatalogos().catch((err) =>
      setError(
        err.message ||
          'No se pudieron cargar las condiciones de IVA y los tipos de cliente',
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // CA-08: filtrado en vivo, sin botón "Buscar". El debounce evita relanzar
  // la consulta en cada tecla; cada búsqueda nueva vuelve a la página 1.
  useEffect(() => {
    if (busquedaAlMontar.current) {
      busquedaAlMontar.current = false
      return
    }

    const temporizador = setTimeout(() => {
      cargarClientes({ search: busqueda, pagina: 1 })
    }, DEBOUNCE_BUSQUEDA_MS)

    return () => clearTimeout(temporizador)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  function manejarCambio(event) {
    const { name, value } = event.target

    setForm((actual) => ({ ...actual, [name]: value }))
    setErroresCampo((actual) => ({ ...actual, [name]: '' }))
  }

  // CA-01: el tipo de persona decide qué grupo de campos se pide. Cambiarlo
  // limpia el grupo que deja de aplicar, para no mandar datos de sobra.
  function manejarCambioTipoPersona(event) {
    const tipo_persona = event.target.value

    setForm((actual) => ({
      ...actual,
      tipo_persona,
      nombre: tipo_persona === 'fisica' ? actual.nombre : '',
      apellido: tipo_persona === 'fisica' ? actual.apellido : '',
      razon_social: tipo_persona === 'juridica' ? actual.razon_social : '',
    }))
  }

  function manejarCambioTipoDocumento(event) {
    setForm((actual) => ({
      ...actual,
      tipo_documento: event.target.value,
      numero_documento: '',
    }))
    setErroresCampo((actual) => ({ ...actual, numero_documento: '' }))
  }

  function manejarCambioDocumento(event) {
    const valor =
      form.tipo_documento === 'CUIT'
        ? formatearCuit(event.target.value)
        : event.target.value.replace(/\D/g, '').slice(0, 8)

    setForm((actual) => ({ ...actual, numero_documento: valor }))
    setErroresCampo((actual) => ({ ...actual, numero_documento: '' }))
  }

  function limpiarFormulario() {
    setForm(clienteInicial)
    setEditandoId(null)
    setFormOriginal(null)
    setErroresCampo({})
    setError('')
  }

  function comenzarEdicion(cliente) {
    const datosForm = {
      tipo_persona: cliente.tipo_persona,
      nombre: cliente.nombre ?? '',
      apellido: cliente.apellido ?? '',
      razon_social: cliente.razon_social ?? '',
      tipo_documento: cliente.tipo_documento,
      numero_documento:
        cliente.tipo_documento === 'CUIT'
          ? formatearCuit(cliente.numero_documento)
          : cliente.numero_documento,
      condicion_iva_id: cliente.condicion_iva_id ?? '',
      tipo_cliente_id: cliente.tipo_cliente_id ?? '',
      telefono: cliente.telefono ?? '',
      email: cliente.email ?? '',
    }

    setForm(datosForm)
    setEditandoId(cliente.id)
    setFormOriginal(datosForm)
    setErroresCampo({})
    setError('')
    setAviso('')
  }

  // CA-03: mismo criterio que el CUIT en proveedoresPage — se corta acá, sin
  // ir a la red, en vez de esperar a que la base lo rechace.
  function documentoInvalido() {
    if (!form.numero_documento) return null

    if (form.tipo_documento === 'CUIT' && !cuitEsValido(form.numero_documento)) {
      return 'CUIT inválido'
    }
    if (
      form.tipo_documento === 'DNI' &&
      !/^[0-9]{7,8}$/.test(form.numero_documento)
    ) {
      return 'El DNI debe tener 7 u 8 dígitos'
    }
    return null
  }

  async function guardarCliente(event) {
    event.preventDefault()

    const errorDocumento = documentoInvalido()
    if (errorDocumento) {
      setErroresCampo((actual) => ({ ...actual, numero_documento: errorDocumento }))
      return
    }

    // Sin esto, guardar sin tocar nada igual dispara el UPDATE y dispara el
    // trigger de auditoría con un cambio que en realidad no existió.
    if (
      editandoId &&
      formOriginal &&
      JSON.stringify(form) === JSON.stringify(formOriginal)
    ) {
      setAviso('No se hicieron cambios')
      limpiarFormulario()
      return
    }

    try {
      setGuardando(true)
      setError('')
      setAviso('')
      setErroresCampo({})

      if (editandoId) {
        await actualizarCliente(editandoId, form)
        setAviso('Cliente actualizado')
      } else {
        const creado = await crearCliente(form)
        setAviso(`Cliente Nº ${creado.numero} creado`)
      }

      limpiarFormulario()
      await cargarClientes({ pagina })
    } catch (err) {
      if (err.campo) {
        setErroresCampo({ [err.campo]: err.message })
      } else {
        setError(err.message || 'No se pudo guardar el cliente')
      }
    } finally {
      setGuardando(false)
    }
  }

  const esFisica = form.tipo_persona === 'fisica'

  return (
    <main>
      <h1>Clientes</h1>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}
      {avisoPermisos && <Feedback tone="info">{avisoPermisos}</Feedback>}

      {(puedeCrear || editandoId) && (
        <section>
          <h2>{editandoId ? 'Editar cliente' : 'Nuevo cliente'}</h2>

          <form onSubmit={guardarCliente}>
            <div>
              <label htmlFor="tipo_persona">Tipo de persona</label>
              <select
                id="tipo_persona"
                name="tipo_persona"
                value={form.tipo_persona}
                onChange={manejarCambioTipoPersona}
              >
                {TIPOS_PERSONA.map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </select>
            </div>

            {esFisica ? (
              <>
                <div>
                  <label htmlFor="nombre">Nombre</label>
                  <input
                    id="nombre"
                    name="nombre"
                    value={form.nombre}
                    onChange={manejarCambio}
                    autoComplete="off"
                  />
                  {erroresCampo.nombre && (
                    <Feedback tone="error">{erroresCampo.nombre}</Feedback>
                  )}
                </div>

                <div>
                  <label htmlFor="apellido">Apellido</label>
                  <input
                    id="apellido"
                    name="apellido"
                    value={form.apellido}
                    onChange={manejarCambio}
                    autoComplete="off"
                  />
                  {erroresCampo.apellido && (
                    <Feedback tone="error">{erroresCampo.apellido}</Feedback>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="razon_social">Razón social</label>
                <input
                  id="razon_social"
                  name="razon_social"
                  value={form.razon_social}
                  onChange={manejarCambio}
                  autoComplete="off"
                />
                {erroresCampo.razon_social && (
                  <Feedback tone="error">{erroresCampo.razon_social}</Feedback>
                )}
              </div>
            )}

            <div>
              <label htmlFor="tipo_documento">Tipo de documento</label>
              <select
                id="tipo_documento"
                name="tipo_documento"
                value={form.tipo_documento}
                onChange={manejarCambioTipoDocumento}
              >
                {TIPOS_DOCUMENTO.map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="numero_documento">
                {form.tipo_documento === 'CUIT' ? 'CUIT' : 'DNI'}
              </label>
              <input
                id="numero_documento"
                name="numero_documento"
                value={form.numero_documento}
                onChange={manejarCambioDocumento}
                onBlur={() => {
                  const errorDocumento = documentoInvalido()
                  if (errorDocumento) {
                    setErroresCampo((actual) => ({
                      ...actual,
                      numero_documento: errorDocumento,
                    }))
                  }
                }}
                placeholder={
                  form.tipo_documento === 'CUIT' ? '20-12345678-6' : '30111222'
                }
                inputMode="numeric"
                autoComplete="off"
              />
              {erroresCampo.numero_documento && (
                <Feedback tone="error">{erroresCampo.numero_documento}</Feedback>
              )}
            </div>

            <div>
              <label htmlFor="condicion_iva_id">Condición frente al IVA</label>
              <select
                id="condicion_iva_id"
                name="condicion_iva_id"
                value={form.condicion_iva_id}
                onChange={manejarCambio}
              >
                <option value="">Seleccioná una opción</option>
                {condicionesIva.map((opcion) => (
                  <option key={opcion.id} value={opcion.id}>
                    {opcion.nombre}
                  </option>
                ))}
              </select>
              {erroresCampo.condicion_iva_id && (
                <Feedback tone="error">{erroresCampo.condicion_iva_id}</Feedback>
              )}
            </div>

            <div>
              <label htmlFor="tipo_cliente_id">Tipo de cliente</label>
              <select
                id="tipo_cliente_id"
                name="tipo_cliente_id"
                value={form.tipo_cliente_id}
                onChange={manejarCambio}
              >
                <option value="">Seleccioná una opción</option>
                {tiposCliente.map((opcion) => (
                  <option key={opcion.id} value={opcion.id}>
                    {opcion.nombre}
                  </option>
                ))}
              </select>
              {erroresCampo.tipo_cliente_id && (
                <Feedback tone="error">{erroresCampo.tipo_cliente_id}</Feedback>
              )}
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
              {erroresCampo.telefono && (
                <Feedback tone="error">{erroresCampo.telefono}</Feedback>
              )}
            </div>

            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={manejarCambio}
                placeholder="Opcional"
                autoComplete="off"
              />
              {erroresCampo.email && (
                <Feedback tone="error">{erroresCampo.email}</Feedback>
              )}
            </div>

            <div>
              <Button type="submit" loading={guardando}>
                {editandoId ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
              {editandoId && (
                <Button type="button" variant="ghost" onClick={limpiarFormulario}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </section>
      )}

      <section>
        <h2>Buscar</h2>

        <div>
          <label htmlFor="busqueda">Nombre, razón social, DNI o CUIT</label>
          <input
            id="busqueda"
            name="busqueda"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            autoComplete="off"
          />
        </div>
      </section>

      <section>
        <h2>
          Clientes registrados
          {!loading && !error && total > 0 && ` (${total})`}
        </h2>

        {loading && (
          <p className="loading-state" role="status">
            Cargando clientes…
          </p>
        )}

        {!loading && error && (
          <p>No se pudo mostrar el listado. Revisá el error de arriba.</p>
        )}

        {!loading && !error && clientes.length === 0 && (
          <EmptyState
            title="Todavía no hay clientes"
            description={
              busqueda
                ? `Ningún cliente coincide con "${busqueda}".`
                : 'Creá el primer cliente para empezar a armar el padrón.'
            }
          />
        )}

        {!loading && !error && clientes.length > 0 && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Cliente</th>
                  <th>Documento</th>
                  <th>Teléfono</th>
                  <th>Origen</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((cliente) => (
                  <tr key={cliente.id}>
                    <td>{cliente.numero}</td>
                    <td>{nombreCliente(cliente)}</td>
                    <td>{formatearDocumento(cliente)}</td>
                    <td>{cliente.telefono}</td>
                    <td>{cliente.origen}</td>
                    <td>
                      <EstadoBadge estado={cliente.estado} />
                    </td>
                    <td>
                      {puedeModificar ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => comenzarEdicion(cliente)}
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

            <p>
              Página {pagina} de {totalPaginas}
            </p>

            <div>
              <Button
                type="button"
                variant="ghost"
                disabled={pagina <= 1}
                onClick={() => cargarClientes({ pagina: pagina - 1 })}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pagina >= totalPaginas}
                onClick={() => cargarClientes({ pagina: pagina + 1 })}
              >
                Siguiente
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default ClientesPage
