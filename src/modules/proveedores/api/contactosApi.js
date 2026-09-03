import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_CHECK_VIOLADO,
  CODIGO_FK_VIOLADA,
  CODIGO_SIN_FILAS,
  CODIGO_UUID_INVALIDO,
} from '../../stock/api/errores'

const TABLA = 'contactos_proveedor'

// La escritura sobre contactos_proveedor la gobiernan las tres policies de
// la 0013 (insert / update / delete), todas con este mismo permiso.
export const PERMISO_CONTACTOS = 'proveedores.modificar'

const COLUMNAS = `
  id,
  proveedor_id,
  nombre,
  cargo,
  telefono,
  email,
  principal,
  created_at,
  created_by,
  updated_at,
  updated_by
`

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function validarContacto({ nombre, telefono, email }) {
  if (!nombre?.trim()) {
    throw errorDeApi('El nombre es obligatorio', 400)
  }

  // CA 4: el teléfono es obligatorio. La base también lo exige (NOT NULL +
  // chk_contacto_telefono, migración 0021); esto es para avisar antes de ir.
  if (!telefono?.trim()) {
    throw errorDeApi('El teléfono es obligatorio', 400)
  }

  // CA 3: el mensaje es el que pide el criterio, textual.
  if (email?.trim() && !EMAIL_REGEX.test(email.trim())) {
    throw errorDeApi('Formato de correo electrónico inválido', 400)
  }
}

function manejarErrorContacto(error) {
  // ux_contacto_principal (0013). Con el trigger de la 0021 no debería
  // dispararse nunca, pero si alguien escribe por fuera de esta capa el
  // índice sigue siendo la garantía real.
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi(
      'Ese proveedor ya tiene otro contacto marcado como principal',
      409,
    )
  }

  if (error?.code === CODIGO_CHECK_VIOLADO) {
    if (error.message?.includes('chk_contacto_email')) {
      throw errorDeApi('Formato de correo electrónico inválido', 400)
    }
    if (error.message?.includes('chk_contacto_telefono')) {
      throw errorDeApi('El teléfono es obligatorio', 400)
    }
    if (error.message?.includes('chk_contacto_nombre')) {
      throw errorDeApi('El nombre es obligatorio', 400)
    }
    throw errorDeApi(
      'Revisá los datos del contacto: no cumplen una validación del sistema',
      400,
    )
  }

  if (error?.code === CODIGO_FK_VIOLADA) {
    throw errorDeApi('El proveedor indicado no existe', 422)
  }

  if (error?.code === CODIGO_UUID_INVALIDO) {
    throw errorDeApi('El contacto no existe', 404)
  }

  // Igual que en proveedoresApi y rubrosApi: sin permiso, la RLS deja la
  // escritura sin filas y PostgREST devuelve PGRST116, no un error de Postgres.
  if (error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo guardar el contacto: no existe o no tenés permiso para modificarlo',
      403,
    )
  }

  throw error
}

function armarCambios(datos) {
  return {
    nombre: datos.nombre.trim(),
    cargo: datos.cargo?.trim() || null,
    telefono: datos.telefono.trim(),
    email: datos.email?.trim() || null,
    principal: Boolean(datos.principal),
  }
}

/**
 * Lista los contactos de un proveedor, con el principal primero y el resto
 * por nombre.
 *
 * @param {string} proveedorId ID del proveedor.
 * @returns {Promise<Array<Object>>} Contactos del proveedor.
 */
export async function getContactosDeProveedor(proveedorId) {
  const { data, error } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('proveedor_id', proveedorId)
    .order('principal', { ascending: false })
    .order('nombre')

  if (error) throw error
  return data ?? []
}

/**
 * Agrega un contacto a un proveedor (CA 1 y 2).
 *
 * Si viene marcado como principal, el trigger trg_contactos_unico_principal
 * (migración 0021) desmarca al anterior en la misma transacción: no hace
 * falta hacerlo desde acá.
 *
 * @param {string} proveedorId ID del proveedor.
 * @param {Object} datos
 * @param {string} datos.nombre
 * @param {string} datos.telefono Obligatorio (CA 4).
 * @param {string} [datos.cargo]
 * @param {string} [datos.email]
 * @param {boolean} [datos.principal=false]
 * @returns {Promise<Object>} Contacto creado.
 * @throws {Error} 400 si falta un obligatorio o el email tiene formato inválido.
 */
export async function createContacto(proveedorId, datos) {
  if (!proveedorId) {
    throw errorDeApi('El proveedor es obligatorio', 400)
  }

  validarContacto(datos)

  const { data, error } = await supabase
    .from(TABLA)
    .insert({ proveedor_id: proveedorId, ...armarCambios(datos) })
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorContacto(error)
  return data
}

/**
 * Modifica un contacto existente (CA 6). No cambia de proveedor: `proveedor_id`
 * no se manda en el UPDATE.
 *
 * @param {string} id ID del contacto.
 * @param {Object} datos Mismos campos que createContacto.
 * @returns {Promise<Object>} Contacto actualizado.
 */
export async function updateContacto(id, datos) {
  validarContacto(datos)

  const { data, error } = await supabase
    .from(TABLA)
    .update(armarCambios(datos))
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorContacto(error)
  return data
}

/**
 * Elimina un contacto (CA 6).
 *
 * Acá la baja es física, a diferencia de rubros y proveedores: la 0013 define
 * una policy de DELETE sobre esta tabla, así que el borrado es el
 * comportamiento previsto para los contactos.
 *
 * @param {string} id ID del contacto.
 * @returns {Promise<void>}
 */
export async function deleteContacto(id) {
  const { error } = await supabase.from(TABLA).delete().eq('id', id)

  if (error) manejarErrorContacto(error)
}

/**
 * Indica si el usuario actual puede administrar contactos.
 *
 * @returns {Promise<boolean>} true si tiene 'proveedores.modificar'.
 */
export async function puedeGestionarContactos() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_CONTACTOS,
  })

  if (error) throw error
  return data === true
}
