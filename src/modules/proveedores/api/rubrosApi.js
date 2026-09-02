import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_RESTRICT,
  CODIGO_SIN_FILAS,
  CODIGO_UUID_INVALIDO,
} from '../../stock/api/errores'

const TABLA = 'rubros_proveedor'
const TABLA_ASOCIACION = 'proveedor_rubro'

export const PERMISO_RUBROS = 'proveedores.rubros.gestionar'

// proveedor_rubro(count) trae la cantidad de proveedores asociados en la
// misma consulta (CA 6), sin una segunda vuelta por cada rubro.
const COLUMNAS = `
  id,
  nombre,
  activo,
  created_at,
  created_by,
  updated_at,
  updated_by,
  proveedor_rubro(count)
`

/**
 * Aplana el conteo embebido de PostgREST, que llega como [{ count: n }].
 *
 * @param {Object} fila Fila cruda devuelta por Supabase.
 * @returns {Object} Rubro con `proveedores_asociados` como número.
 */
function normalizarRubro(fila) {
  const { proveedor_rubro: asociados, ...rubro } = fila

  return {
    ...rubro,
    proveedores_asociados: asociados?.[0]?.count ?? 0,
  }
}

function validarRubro({ nombre }) {
  if (!nombre?.trim()) {
    throw errorDeApi('El nombre es obligatorio', 400)
  }
}

function manejarErrorRubro(error) {
  // Lo dispara tanto uq_rubro_nombre como el índice normalizado que agrega
  // la migración 0015: para el usuario los dos casos son el mismo duplicado.
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi('Ya existe un rubro con ese nombre', 409)
  }

  // Lo levanta el trigger fn_impedir_baja_rubro_en_uso con el detalle de
  // cuántos proveedores usan el rubro: se respeta ese mensaje.
  if (error?.code === CODIGO_RESTRICT) {
    throw errorDeApi(
      error.message || 'No se puede eliminar un rubro en uso',
      409,
    )
  }

  if (error?.code === CODIGO_UUID_INVALIDO) {
    throw errorDeApi('El rubro no existe', 404)
  }

  // Escribir sin el permiso proveedores.rubros.gestionar no produce un error
  // de Postgres: la RLS deja el UPDATE/INSERT sin filas y PostgREST devuelve
  // PGRST116. Sin traducirlo, el usuario ve un mensaje sobre objetos JSON.
  if (error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo guardar el rubro: no existe o no tenés permiso para modificarlo',
      403,
    )
  }

  throw error
}

/**
 * Lista los rubros de proveedor ordenados alfabéticamente, con la cantidad
 * de proveedores asociados a cada uno (CA 6).
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.search] Texto a buscar dentro del nombre.
 * @param {boolean} [filtros.soloActivos=true] Excluir los dados de baja.
 * @returns {Promise<Array<Object>>} Rubros con `proveedores_asociados`.
 */
export async function getRubros({ search = '', soloActivos = true } = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS)

  if (soloActivos) consulta = consulta.eq('activo', true)
  if (search.trim()) consulta = consulta.ilike('nombre', `%${search.trim()}%`)

  const { data, error } = await consulta.order('nombre')

  if (error) throw error
  return (data ?? []).map(normalizarRubro)
}

/**
 * Cuenta cuántos proveedores tienen asociado un rubro.
 *
 * La relación es N:N a través de proveedor_rubro; no existe una columna
 * `proveedores.rubro_id` como suponía la nota técnica de la historia.
 *
 * @param {string} id ID del rubro.
 * @returns {Promise<number>} Cantidad de proveedores asociados.
 */
export async function contarProveedoresDeRubro(id) {
  const { count, error } = await supabase
    .from(TABLA_ASOCIACION)
    .select('rubro_id', { count: 'exact', head: true })
    .eq('rubro_id', id)

  if (error) throw error
  return count ?? 0
}

/**
 * Crea un rubro de proveedor.
 *
 * @param {Object} rubro
 * @param {string} rubro.nombre Nombre del rubro. Se guarda sin espacios extremos.
 * @returns {Promise<Object>} Rubro creado.
 * @throws {Error} 400 si el nombre está vacío; 409 si ya existe.
 */
export async function createRubro(rubro) {
  validarRubro(rubro)

  const { data, error } = await supabase
    .from(TABLA)
    .insert({ nombre: rubro.nombre.trim() })
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorRubro(error)
  return normalizarRubro(data)
}

/**
 * Actualiza el nombre de un rubro existente.
 *
 * @param {string} id ID del rubro.
 * @param {Object} rubro
 * @param {string} rubro.nombre Nuevo nombre.
 * @returns {Promise<Object>} Rubro actualizado.
 * @throws {Error} 400 si el nombre está vacío; 409 si ya existe otro igual.
 */
export async function updateRubro(id, rubro) {
  validarRubro(rubro)

  const { data, error } = await supabase
    .from(TABLA)
    .update({ nombre: rubro.nombre.trim() })
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorRubro(error)
  return normalizarRubro(data)
}

/**
 * Da de baja un rubro. La baja es lógica (`activo = false`): la tabla no
 * admite DELETE por decisión de la migración 0013.
 *
 * Cuenta los proveedores asociados antes de intentarlo para poder informar
 * el número exacto (CA 4). La garantía real la da el trigger
 * fn_impedir_baja_rubro_en_uso, que cubre la ventana entre el conteo y el
 * update.
 *
 * @param {string} id ID del rubro.
 * @returns {Promise<Object>} Rubro dado de baja.
 * @throws {Error} 409 si tiene proveedores asociados.
 */
export async function darDeBajaRubro(id) {
  const enUso = await contarProveedoresDeRubro(id)

  if (enUso > 0) {
    const detalle =
      enUso === 1 ? '1 proveedor lo usa' : `${enUso} proveedores lo usan`
    throw errorDeApi(`No se puede eliminar el rubro: ${detalle}`, 409)
  }

  const { data, error } = await supabase
    .from(TABLA)
    .update({ activo: false })
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorRubro(error)
  return normalizarRubro(data)
}

/**
 * Vuelve a activar un rubro dado de baja.
 *
 * No lo pide ningún criterio de aceptación, pero sin esto la baja lógica es
 * un camino de ida: la fila sigue en la base y no habría forma de recuperarla
 * desde la aplicación.
 *
 * @param {string} id ID del rubro.
 * @returns {Promise<Object>} Rubro reactivado.
 */
export async function reactivarRubro(id) {
  const { data, error } = await supabase
    .from(TABLA)
    .update({ activo: true })
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorRubro(error)
  return normalizarRubro(data)
}

/**
 * Indica si el usuario actual puede crear, editar o dar de baja rubros.
 *
 * Las policies de rubros_proveedor exigen el permiso
 * `proveedores.rubros.gestionar`. Sin él, un INSERT o UPDATE no falla con
 * error: la RLS simplemente no afecta ninguna fila. Consultarlo antes
 * permite avisarle al usuario en vez de dejarlo frente a un guardado que
 * parece funcionar y no hace nada.
 *
 * @returns {Promise<boolean>} true si tiene el permiso.
 */
export async function puedeGestionarRubros() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_RUBROS,
  })

  if (error) throw error
  return data === true
}
