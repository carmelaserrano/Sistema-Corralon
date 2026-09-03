import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_CHECK_VIOLADO,
  CODIGO_SIN_FILAS,
} from '../../stock/api/errores'
import { cuitEsValido, limpiarCuit } from '../cuit'

const TABLA = 'proveedores'
const TABLA_RUBRO = 'proveedor_rubro'

export const PERMISO_ALTA = 'proveedores.alta'

export const CONDICIONES_FISCALES = [
  { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { value: 'monotributista', label: 'Monotributista' },
  { value: 'exento', label: 'Exento' },
  { value: 'consumidor_final', label: 'Consumidor Final' },
]

// A diferencia de Condición Fiscal, es opcional: el proveedor puede quedar
// sin una condición de pago definida en el alta.
export const CONDICIONES_PAGO = [
  { value: 'contado', label: 'Contado' },
  { value: '15_dias', label: '15 días' },
  { value: '30_dias', label: '30 días' },
  { value: '60_dias', label: '60 días' },
  { value: '30_60_dias', label: '30/60 días' },
  { value: 'anticipado', label: 'Anticipado' },
]

// El Rubro se resuelve vía proveedor_rubro (N:N, 0013), no una columna propia:
// esa tabla ya la usa el ABM de Rubros para contar proveedores asociados, y
// mover el vínculo a otro lado rompería ese conteo.
const COLUMNAS = `
  id,
  razon_social,
  nombre_fantasia,
  cuit,
  condicion_fiscal,
  condicion_pago_habitual,
  domicilio,
  localidad,
  provincia,
  telefono,
  email,
  observaciones,
  estado,
  created_at,
  created_by,
  updated_at,
  updated_by,
  proveedor_rubro(rubro:rubros_proveedor(id,nombre))
`

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Aplana el rubro embebido de PostgREST (llega como proveedor_rubro: [{rubro: {...}}]).
 * El alta solo vincula uno, aunque el modelo soporte varios.
 *
 * @param {Object} fila Fila cruda devuelta por Supabase.
 * @returns {Object} Proveedor con `rubro` como objeto único (o null).
 */
function normalizarProveedor(fila) {
  const { proveedor_rubro: vinculos, ...proveedor } = fila

  return {
    ...proveedor,
    rubro: vinculos?.[0]?.rubro ?? null,
  }
}

function validarProveedor({
  razon_social,
  cuit,
  condicion_fiscal,
  condicion_pago_habitual,
  email,
}) {
  if (!razon_social?.trim()) {
    throw errorDeApi('La Razón Social es obligatoria', 400)
  }
  if (!cuitEsValido(cuit)) {
    throw errorDeApi('CUIT inválido', 400)
  }
  if (!CONDICIONES_FISCALES.some((opcion) => opcion.value === condicion_fiscal)) {
    throw errorDeApi('La condición fiscal es obligatoria', 400)
  }
  if (
    condicion_pago_habitual &&
    !CONDICIONES_PAGO.some((opcion) => opcion.value === condicion_pago_habitual)
  ) {
    throw errorDeApi('La condición de pago habitual no es válida', 400)
  }
  if (email?.trim() && !EMAIL_REGEX.test(email.trim())) {
    throw errorDeApi('El email no tiene un formato válido', 400)
  }
}

/**
 * Busca la razón social de un proveedor por CUIT, para el mensaje de
 * duplicado (CA: "e indica la Razón Social del proveedor existente").
 * Si la búsqueda falla, no tapa el error original de duplicado: solo se
 * pierde el detalle de a quién pertenece.
 *
 * @param {string} cuit CUIT normalizado (11 dígitos).
 * @returns {Promise<string|null>} Razón social del proveedor existente.
 */
async function buscarRazonSocialPorCuit(cuit) {
  const { data } = await supabase
    .from(TABLA)
    .select('razon_social')
    .eq('cuit', cuit)
    .maybeSingle()

  return data?.razon_social ?? null
}

async function manejarErrorProveedor(error, { cuit } = {}) {
  if (error?.code === CODIGO_DUPLICADO) {
    const razonSocial = await buscarRazonSocialPorCuit(cuit)
    throw errorDeApi(
      razonSocial
        ? `Ya existe un proveedor con ese CUIT: ${razonSocial}`
        : 'Ya existe un proveedor con ese CUIT',
      409,
    )
  }

  if (error?.code === CODIGO_CHECK_VIOLADO) {
    if (error.message?.includes('chk_proveedor_condicion_fiscal')) {
      throw errorDeApi('La condición fiscal no es válida', 400)
    }
    if (error.message?.includes('chk_proveedor_condicion_pago')) {
      throw errorDeApi('La condición de pago habitual no es válida', 400)
    }
    if (error.message?.includes('chk_proveedor_email')) {
      throw errorDeApi('El email no tiene un formato válido', 400)
    }
    if (error.message?.includes('chk_proveedor_cuit')) {
      throw errorDeApi('CUIT inválido', 400)
    }
    throw errorDeApi('Revisá los datos: no cumplen una validación del sistema', 400)
  }

  // Igual que en rubrosApi: sin el permiso, el INSERT/UPDATE no falla con un
  // error de Postgres, la RLS lo deja sin filas y PostgREST devuelve PGRST116.
  if (error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo guardar el proveedor: no existe o no tenés permiso para modificarlo',
      403,
    )
  }

  throw error
}

/**
 * Lista los proveedores ordenados por razón social, con el rubro asociado.
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.search] Texto a buscar dentro de la razón social.
 * @param {boolean} [filtros.soloActivos=true] Excluir los inactivos.
 * @returns {Promise<Array<Object>>} Proveedores con `rubro` resuelto.
 */
export async function getProveedores({ search = '', soloActivos = true } = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS)

  if (soloActivos) consulta = consulta.eq('estado', 'activo')
  if (search.trim()) {
    consulta = consulta.ilike('razon_social', `%${search.trim()}%`)
  }

  const { data, error } = await consulta.order('razon_social')

  if (error) throw error
  return (data ?? []).map(normalizarProveedor)
}

/**
 * Da de alta un proveedor y, si se indica, lo vincula a un rubro.
 *
 * @param {Object} datos
 * @param {string} datos.razon_social
 * @param {string} datos.cuit CUIT con o sin guiones; se guarda solo el dígito.
 * @param {string} datos.condicion_fiscal Uno de CONDICIONES_FISCALES.
 * @param {string} [datos.nombre_fantasia]
 * @param {string} [datos.condicion_pago_habitual]
 * @param {string} [datos.domicilio]
 * @param {string} [datos.localidad]
 * @param {string} [datos.provincia]
 * @param {string} [datos.telefono]
 * @param {string} [datos.email]
 * @param {string} [datos.observaciones]
 * @param {string|null} [rubroId] ID del rubro a asociar.
 * @returns {Promise<Object>} Proveedor creado, con `rubro` resuelto.
 * @throws {Error} 400 si falta un campo obligatorio o el CUIT es inválido;
 *   409 si el CUIT ya existe.
 */
export async function createProveedor(datos, rubroId = null) {
  validarProveedor(datos)

  const cuit = limpiarCuit(datos.cuit)

  const { data, error } = await supabase
    .from(TABLA)
    .insert({
      razon_social: datos.razon_social.trim(),
      nombre_fantasia: datos.nombre_fantasia?.trim() || null,
      cuit,
      condicion_fiscal: datos.condicion_fiscal,
      condicion_pago_habitual: datos.condicion_pago_habitual?.trim() || null,
      domicilio: datos.domicilio?.trim() || null,
      localidad: datos.localidad?.trim() || null,
      provincia: datos.provincia?.trim() || null,
      telefono: datos.telefono?.trim() || null,
      email: datos.email?.trim() || null,
      observaciones: datos.observaciones?.trim() || null,
    })
    .select(COLUMNAS)
    .single()

  if (error) await manejarErrorProveedor(error, { cuit })

  if (!rubroId) return normalizarProveedor(data)

  const { error: errorRubro } = await supabase
    .from(TABLA_RUBRO)
    .insert({ proveedor_id: data.id, rubro_id: rubroId })

  if (errorRubro) {
    // El proveedor ya existe: no lo revertimos (no hay transacción cruzada
    // desde el cliente). Se avisa para que el rubro se asocie después.
    throw errorDeApi(
      `El proveedor se creó, pero no se pudo asociar el rubro (${errorRubro.message || 'error desconocido'}). Podés asociarlo después.`,
      409,
    )
  }

  const { data: dataConRubro, error: errorRefetch } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('id', data.id)
    .single()

  if (errorRefetch) throw errorRefetch
  return normalizarProveedor(dataConRubro)
}

/**
 * Indica si el usuario actual puede dar de alta proveedores.
 *
 * Igual que puedeGestionarRubros: consultarlo antes evita que el usuario
 * llene el formulario para que la RLS lo descarte en silencio.
 *
 * @returns {Promise<boolean>} true si tiene el permiso.
 */
export async function puedeAltaProveedores() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_ALTA,
  })

  if (error) throw error
  return data === true
}
