import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_FK_VIOLADA,
  CODIGO_SIN_FILAS,
  CODIGO_UUID_INVALIDO,
} from '../../stock/api/errores'

const TABLA = 'domicilios_cliente'

const COLUMNAS =
  'id, cliente_id, alias, calle, numero, localidad, provincia, codigo_postal, referencias, es_principal, activo, created_at'

// No hay migración propia en esta historia: domicilios_cliente y sus dos
// índices únicos parciales (alias por cliente, y un solo principal por
// cliente) ya vienen completos desde 0031_base_sprint3.sql, igual que la
// policy domicilios_cliente_write (cualquier usuario interno puede escribir
// domicilios de cualquier cliente). No hace falta un permiso propio ni un
// trigger nuevo.

function errorConCampo(mensaje, status, campo) {
  const error = errorDeApi(mensaje, status)
  error.campo = campo
  return error
}

// CA-02: alias, calle, número, localidad y provincia son obligatorios;
// código postal y referencias son opcionales. La base sólo garantiza
// NOT NULL (y alias no-vacío vía chk_domicilio_alias_no_vacio); acá se
// valida también que el resto no sean cadenas de espacios.
function validarDomicilio({ alias, calle, numero, localidad, provincia }) {
  if (!alias?.trim()) {
    throw errorConCampo('El alias es obligatorio', 400, 'alias')
  }
  if (!calle?.trim()) {
    throw errorConCampo('La calle es obligatoria', 400, 'calle')
  }
  if (!numero?.trim()) {
    throw errorConCampo('El número es obligatorio', 400, 'numero')
  }
  if (!localidad?.trim()) {
    throw errorConCampo('La localidad es obligatoria', 400, 'localidad')
  }
  if (!provincia?.trim()) {
    throw errorConCampo('La provincia es obligatoria', 400, 'provincia')
  }
}

function armarCambios(datos) {
  return {
    alias: datos.alias.trim(),
    calle: datos.calle.trim(),
    numero: datos.numero.trim(),
    localidad: datos.localidad.trim(),
    provincia: datos.provincia.trim(),
    codigo_postal: datos.codigo_postal?.trim() || null,
    referencias: datos.referencias?.trim() || null,
  }
}

function manejarErrorDomicilio(error) {
  // CA-06: alias repetido para el mismo cliente (ux_domicilio_alias_activo,
  // scopeado a activo = true: un alias liberado por una baja lógica se
  // puede volver a usar).
  if (error?.code === CODIGO_DUPLICADO) {
    if (error.message?.includes('ux_domicilio_alias_activo')) {
      throw errorConCampo(
        'Ya existe un domicilio con ese alias para este cliente',
        409,
        'alias',
      )
    }
    // ux_domicilio_principal: no debería dispararse desde acá (marcarPrincipal
    // desmarca antes de marcar), pero si dos pedidos chocan justo en el medio,
    // es mejor este mensaje que uno genérico de Postgres.
    if (error.message?.includes('ux_domicilio_principal')) {
      throw errorDeApi(
        'Ya hay otro domicilio marcado como principal, intentá de nuevo',
        409,
      )
    }
    throw errorDeApi('Ya existe un domicilio con esos datos', 409)
  }

  if (error?.code === CODIGO_FK_VIOLADA) {
    throw errorDeApi('El cliente indicado no existe', 422)
  }

  if (error?.code === CODIGO_UUID_INVALIDO) {
    throw errorDeApi('El domicilio no existe', 404)
  }

  // Igual que en clientesApi/proveedoresApi: sin permiso, la RLS deja la
  // escritura sin filas y PostgREST devuelve PGRST116, no un error de Postgres.
  if (error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo guardar el domicilio: no existe o no tenés permiso para modificarlo',
      403,
    )
  }

  throw error
}

/**
 * Lista los domicilios activos de un cliente: el principal primero, el
 * resto por alias (CA-01).
 *
 * @param {string} clienteId ID del cliente.
 * @returns {Promise<Array<Object>>} Domicilios activos.
 */
export async function listarDomicilios(clienteId) {
  const { data, error } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('cliente_id', clienteId)
    .eq('activo', true)
    .order('es_principal', { ascending: false })
    .order('alias')

  if (error) throw error
  return data ?? []
}

/**
 * Agrega un domicilio a un cliente (CA-02).
 *
 * Si es el primer domicilio activo del cliente, queda como principal
 * automáticamente (CA-04): el formulario no ofrece ese campo, lo decide
 * esta función contando los domicilios existentes antes de insertar.
 *
 * @param {string} clienteId ID del cliente.
 * @param {Object} datos
 * @param {string} datos.alias
 * @param {string} datos.calle
 * @param {string} datos.numero
 * @param {string} datos.localidad
 * @param {string} datos.provincia
 * @param {string} [datos.codigo_postal]
 * @param {string} [datos.referencias]
 * @returns {Promise<Object>} Domicilio creado.
 * @throws {Error} 400 si falta un campo obligatorio; 409 si el alias ya
 *   existe para ese cliente (CA-06).
 */
export async function crearDomicilio(clienteId, datos) {
  validarDomicilio(datos)

  const { count, error: errorConteo } = await supabase
    .from(TABLA)
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId)
    .eq('activo', true)

  if (errorConteo) throw errorConteo

  const esElPrimero = (count ?? 0) === 0

  const { data, error } = await supabase
    .from(TABLA)
    .insert({
      cliente_id: clienteId,
      ...armarCambios(datos),
      es_principal: esElPrimero,
    })
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorDomicilio(error)
  return data
}

/**
 * Modifica los datos de un domicilio existente. No toca `es_principal` ni
 * `activo`: eso es responsabilidad de marcarPrincipal y darDeBaja.
 *
 * @param {string} id ID del domicilio.
 * @param {Object} datos Mismos campos que crearDomicilio.
 * @returns {Promise<Object>} Domicilio actualizado.
 */
export async function actualizarDomicilio(id, datos) {
  validarDomicilio(datos)

  const { data, error } = await supabase
    .from(TABLA)
    .update(armarCambios(datos))
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorDomicilio(error)
  return data
}

/**
 * Marca un domicilio como principal (CA-03). El anterior deja de serlo
 * automáticamente.
 *
 * ux_domicilio_principal (0031) es un índice único parcial: rechaza un
 * segundo principal, no lo reemplaza solo. Por eso acá se desmarca primero
 * y se marca después, en dos pasos: no hay una migración propia en esta
 * historia para resolverlo con un trigger, como sí se hizo para
 * contactos_proveedor (0021).
 *
 * @param {string} id ID del domicilio a marcar como principal.
 * @returns {Promise<Object>} Domicilio actualizado.
 * @throws {Error} 404 si el domicilio no existe.
 */
export async function marcarPrincipal(id) {
  const { data: domicilio, error: errorLectura } = await supabase
    .from(TABLA)
    .select('cliente_id')
    .eq('id', id)
    .maybeSingle()

  if (errorLectura) throw errorLectura
  if (!domicilio) throw errorDeApi('El domicilio no existe', 404)

  const { error: errorDesmarcar } = await supabase
    .from(TABLA)
    .update({ es_principal: false })
    .eq('cliente_id', domicilio.cliente_id)
    .eq('es_principal', true)
    .neq('id', id)

  if (errorDesmarcar) throw errorDesmarcar

  const { data, error } = await supabase
    .from(TABLA)
    .update({ es_principal: true })
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorDomicilio(error)
  return data
}

/**
 * Da de baja lógica un domicilio (`activo = false`). No existe borrado
 * físico.
 *
 * Si el domicilio era el principal, esta función lo desmarca junto con la
 * baja: no deja un domicilio inactivo marcado como principal. Elegir un
 * reemplazo (CA-05, cuando quedan otros domicilios) es responsabilidad de
 * quien llama, con una llamada aparte a marcarPrincipal antes de ésta.
 *
 * @param {string} id ID del domicilio.
 * @returns {Promise<void>}
 */
export async function darDeBaja(id) {
  // .select().single() no es para devolver el domicilio (la firma es void):
  // es lo que permite detectar un UPDATE que no tocó ninguna fila (id
  // inexistente, o la RLS filtrándolo) y traducirlo a un error en vez de
  // fallar en silencio.
  const { error } = await supabase
    .from(TABLA)
    .update({ activo: false, es_principal: false })
    .eq('id', id)
    .select('id')
    .single()

  if (error) manejarErrorDomicilio(error)
}
