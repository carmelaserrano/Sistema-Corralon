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
const TABLA_HISTORIAL = 'historial_estado_proveedor'

export const PERMISO_ALTA = 'proveedores.alta'
export const PERMISO_MODIFICAR = 'proveedores.modificar'
export const PERMISO_ESTADO = 'proveedores.estado'

// Las dos únicas transiciones posibles (CA 6): no existe un tercer estado ni
// una baja física.
export const ESTADOS = ['activo', 'inactivo']

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

function validarProveedor(
  { razon_social, cuit, condicion_fiscal, condicion_pago_habitual, email },
  { validarCuit = true } = {},
) {
  if (!razon_social?.trim()) {
    throw errorDeApi('La Razón Social es obligatoria', 400)
  }
  if (validarCuit && !cuitEsValido(cuit)) {
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
    const razonSocial = cuit ? await buscarRazonSocialPorCuit(cuit) : null
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
 * @param {string} [filtros.estado] Filtrar por un estado puntual ('activo' o
 *   'inactivo'). Tiene prioridad sobre `soloActivos`: pasar `estado: ''`
 *   junto a `soloActivos: false` devuelve todos.
 * @returns {Promise<Array<Object>>} Proveedores con `rubro` resuelto.
 */
export async function getProveedores({
  search = '',
  soloActivos = true,
  estado = '',
} = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS)

  if (estado) {
    consulta = consulta.eq('estado', estado)
  } else if (soloActivos) {
    consulta = consulta.eq('estado', 'activo')
  }

  if (search.trim()) {
    consulta = consulta.ilike('razon_social', `%${search.trim()}%`)
  }

  const { data, error } = await consulta.order('razon_social')

  if (error) throw error
  return (data ?? []).map(normalizarProveedor)
}

/**
 * Proveedores que pueden elegirse en un comprobante (Orden de Compra,
 * recepción, factura). Excluye los inactivos: ése es el CA 5 de US-PRV-06.
 *
 * Existe como función propia y no como `getProveedores()` a secas para que
 * el módulo de Compras, cuando se construya, tenga una opción obvia y no
 * dependa de acordarse del valor por defecto de un parámetro.
 *
 * @returns {Promise<Array<Object>>} Proveedores en estado activo.
 */
export async function getProveedoresSeleccionables() {
  return getProveedores({ estado: 'activo' })
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
 * Modifica un proveedor existente. El CUIT no se toca: es inmutable una vez
 * dado de alta, y ni siquiera se manda en el UPDATE.
 *
 * A diferencia del alta, acá el rubro se sincroniza siempre (se borra el
 * vínculo vigente y, si se pasó uno, se crea el nuevo), porque a diferencia
 * de un proveedor recién creado, uno existente puede tener un vínculo previo
 * que haya que reemplazar o quitar.
 *
 * @param {string} id ID del proveedor.
 * @param {Object} datos Mismos campos que createProveedor, sin `cuit`.
 * @param {string|null} [rubroId] Rubro a asociar, o null para dejarlo sin rubro.
 * @returns {Promise<Object>} Proveedor actualizado, con `rubro` resuelto.
 * @throws {Error} 400 si falta un campo obligatorio.
 */
export async function updateProveedor(id, datos, rubroId = null) {
  validarProveedor(datos, { validarCuit: false })

  const { error } = await supabase
    .from(TABLA)
    .update({
      razon_social: datos.razon_social.trim(),
      nombre_fantasia: datos.nombre_fantasia?.trim() || null,
      condicion_fiscal: datos.condicion_fiscal,
      condicion_pago_habitual: datos.condicion_pago_habitual?.trim() || null,
      domicilio: datos.domicilio?.trim() || null,
      localidad: datos.localidad?.trim() || null,
      provincia: datos.provincia?.trim() || null,
      telefono: datos.telefono?.trim() || null,
      email: datos.email?.trim() || null,
      observaciones: datos.observaciones?.trim() || null,
    })
    .eq('id', id)

  if (error) await manejarErrorProveedor(error)

  const { error: errorBorrado } = await supabase
    .from(TABLA_RUBRO)
    .delete()
    .eq('proveedor_id', id)

  if (errorBorrado) {
    throw errorDeApi(
      `Se guardaron los datos del proveedor, pero no se pudo actualizar el rubro (${errorBorrado.message || 'error desconocido'}).`,
      409,
    )
  }

  if (rubroId) {
    const { error: errorVinculo } = await supabase
      .from(TABLA_RUBRO)
      .insert({ proveedor_id: id, rubro_id: rubroId })

    if (errorVinculo) {
      throw errorDeApi(
        `Se guardaron los datos del proveedor, pero no se pudo asociar el rubro (${errorVinculo.message || 'error desconocido'}).`,
        409,
      )
    }
  }

  const { data: dataFinal, error: errorRefetch } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('id', id)
    .single()

  if (errorRefetch) throw errorRefetch
  return normalizarProveedor(dataFinal)
}

/**
 * Cambia el estado de un proveedor entre 'activo' e 'inactivo'.
 *
 * Es una baja lógica: el registro nunca se elimina de la base (CA 1). No
 * existe una función de borrado en este módulo, ni una policy de DELETE
 * sobre `proveedores`, así que tampoco hay forma de hacerlo por accidente.
 *
 * El historial (usuario, fecha/hora y estado anterior, CA 4) lo escribe el
 * trigger trg_proveedores_historial_estado de la migración 0020, no esta
 * función: así queda registrado cualquier cambio, venga de donde venga.
 *
 * @param {string} id ID del proveedor.
 * @param {'activo'|'inactivo'} estado Estado al que se pasa.
 * @returns {Promise<Object>} Proveedor actualizado, con `rubro` resuelto.
 * @throws {Error} 400 si el estado no es uno de los dos válidos; 403 si la
 *   RLS descarta el UPDATE por falta de permiso.
 */
export async function setEstadoProveedor(id, estado) {
  if (!ESTADOS.includes(estado)) {
    throw errorDeApi('El estado debe ser "activo" o "inactivo"', 400)
  }

  const { data, error } = await supabase
    .from(TABLA)
    .update({ estado })
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) await manejarErrorProveedor(error)
  return normalizarProveedor(data)
}

/**
 * Devuelve los cambios de estado de un proveedor, del más reciente al más
 * antiguo (CA 4).
 *
 * `cambiado_por` es el uuid del usuario de Supabase Auth. No se resuelve a un
 * nombre o email porque el esquema `auth` no está expuesto por PostgREST y el
 * proyecto todavía no tiene una tabla de perfiles.
 *
 * @param {string} id ID del proveedor.
 * @returns {Promise<Array<Object>>} Cambios de estado registrados.
 */
export async function getHistorialEstadoProveedor(id) {
  const { data, error } = await supabase
    .from(TABLA_HISTORIAL)
    .select('id, estado_anterior, estado_nuevo, cambiado_por, cambiado_en')
    .eq('proveedor_id', id)
    .order('cambiado_en', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Indica si el usuario actual puede cambiar el estado de un proveedor.
 *
 * La policy proveedores_update (0013) acepta 'proveedores.modificar' o
 * 'proveedores.estado', así que se consulta el segundo y se cae al primero:
 * alcanza con cualquiera de los dos.
 *
 * @returns {Promise<boolean>} true si tiene alguno de los dos permisos.
 */
export async function puedeCambiarEstadoProveedores() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_ESTADO,
  })

  if (error) throw error
  if (data === true) return true

  return puedeModificarProveedores()
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

/**
 * Indica si el usuario actual puede modificar proveedores existentes.
 *
 * @returns {Promise<boolean>} true si tiene el permiso.
 */
export async function puedeModificarProveedores() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_MODIFICAR,
  })

  if (error) throw error
  return data === true
}
