import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi, CODIGO_DUPLICADO, CODIGO_PERMISO_INSUFICIENTE, CODIGO_SIN_FILAS } from '../../stock/api/errores'
import { cuitEsValido, limpiarCuit } from '../../proveedores/cuit'

// Capa de datos del cliente web (S3-15). La seguridad la ponen las RLS de
// S3-00 y registrar_cliente_web (0043): los filtros por cliente o usuario que
// se aplican acá solo acotan la consulta, no protegen nada.
//
// Los domicilios de entrega (CA-05) no se duplican acá: Mis datos usa
// DomiciliosCliente y domiciliosApi (S3-03), y la policy
// domicilios_cliente_write limita al cliente web a los de su propio cliente.
//
// El proyecto tiene activada la confirmación de email: signUp no devuelve
// sesión y la función SQL necesita auth.uid(). Los datos del formulario viajan
// en los metadatos del usuario (METADATO_REGISTRO) y obtenerClienteActual
// completa el registro en el primer ingreso con sesión.

export const METADATO_REGISTRO = 'registro_cliente_web'
export const LARGO_MINIMO_PASSWORD = 8

export const MENSAJE_CREDENCIALES = 'Email o contraseña incorrectos'
// CA-02: mismo mensaje para email o documento repetidos; no confirma si
// existe otro cliente ni muestra sus datos.
export const MENSAJE_DUPLICADO =
  'No pudimos completar el registro con esos datos. Si ya tenés una cuenta, ingresá con tu email y contraseña; si no, consultá en una sucursal.'
const MENSAJE_REGISTRO_GENERICO = 'No pudimos completar el registro. Intentá de nuevo en unos minutos.'

const COLUMNAS_CLIENTE =
  'id, numero, nombre, apellido, razon_social, tipo_documento, numero_documento, email, telefono, estado, origen'

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DNI_REGEX = /^[0-9]{7,8}$/
const CUIT_FISICA_REGEX = /^(20|23|24|27)[0-9]{9}$/
const TELEFONO_REGEX = /^[0-9+()\s-]{6,30}$/

function errorConCampo(mensaje, status, campo) {
  const error = errorDeApi(mensaje, status)
  error.campo = campo
  return error
}

/**
 * Deja el documento solo con dígitos (sin puntos, guiones ni espacios).
 *
 * @param {'DNI'|'CUIT'} tipoDocumento
 * @param {string} valor Documento tal como lo escribió el usuario.
 * @returns {string} Documento normalizado.
 */
export function normalizarDocumento(tipoDocumento, valor) {
  return tipoDocumento === 'CUIT' ? limpiarCuit(valor) : (valor ?? '').replace(/\D/g, '')
}

/**
 * Valida y normaliza el formulario de registro con las mismas reglas que
 * registrar_cliente_web. Lanza el primer error encontrado, con `campo`.
 *
 * @param {Object} datos
 * @param {string} datos.nombre
 * @param {string} datos.apellido
 * @param {'DNI'|'CUIT'} datos.tipo_documento
 * @param {string} datos.numero_documento
 * @param {string} datos.email
 * @param {string} datos.telefono
 * @param {string} datos.password
 * @returns {Object} Datos normalizados (documento sin separadores, email en minúsculas).
 * @throws {Error} 400 con `campo` si un dato es inválido.
 */
export function validarRegistro(datos) {
  const nombre = datos?.nombre?.trim() ?? ''
  const apellido = datos?.apellido?.trim() ?? ''
  const tipo_documento = datos?.tipo_documento
  const numero_documento = normalizarDocumento(tipo_documento, datos?.numero_documento)
  const email = datos?.email?.trim().toLowerCase() ?? ''
  const telefono = datos?.telefono?.trim() ?? ''
  const password = datos?.password ?? ''

  if (!nombre) throw errorConCampo('Ingresá tu nombre', 400, 'nombre')
  if (!apellido) throw errorConCampo('Ingresá tu apellido', 400, 'apellido')
  if (tipo_documento === 'DNI') {
    if (!DNI_REGEX.test(numero_documento)) {
      throw errorConCampo('El DNI debe tener 7 u 8 dígitos', 400, 'numero_documento')
    }
  } else if (tipo_documento === 'CUIT') {
    if (!CUIT_FISICA_REGEX.test(numero_documento) || !cuitEsValido(numero_documento)) {
      throw errorConCampo('Ingresá un CUIT de persona física válido', 400, 'numero_documento')
    }
  } else {
    throw errorConCampo('Elegí DNI o CUIT', 400, 'tipo_documento')
  }
  if (!EMAIL_REGEX.test(email)) throw errorConCampo('Ingresá un email válido', 400, 'email')
  if (!TELEFONO_REGEX.test(telefono)) throw errorConCampo('Ingresá un teléfono válido', 400, 'telefono')
  if (password.length < LARGO_MINIMO_PASSWORD) {
    throw errorConCampo(`La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`, 400, 'password')
  }

  return { nombre, apellido, tipo_documento, numero_documento, email, telefono, password }
}

function traducirErrorRegistro(error) {
  if (error?.code === CODIGO_DUPLICADO) return errorDeApi(MENSAJE_DUPLICADO, 409)
  if (error?.code === '22023') return errorDeApi(error.message, 400)
  if (error?.code === CODIGO_PERMISO_INSUFICIENTE) {
    return errorDeApi('Necesitás iniciar sesión para completar el registro', 401)
  }
  return errorDeApi(MENSAJE_REGISTRO_GENERICO, 500)
}

/**
 * Crea o vincula el cliente del usuario autenticado (registrar_cliente_web).
 * Es idempotente: repetirla con los mismos datos devuelve el mismo cliente.
 *
 * @param {Object} datos {nombre, apellido, tipo_documento, numero_documento, telefono}.
 * @returns {Promise<string>} ID del cliente propio.
 * @throws {Error} 409 con mensaje genérico si el documento ya tiene usuario
 *   web; 400 si un dato es inválido; 401 sin sesión.
 */
export async function completarRegistro(datos) {
  const { data, error } = await supabase.rpc('registrar_cliente_web', {
    p_datos: {
      nombre: datos.nombre,
      apellido: datos.apellido,
      tipo_documento: datos.tipo_documento,
      numero_documento: datos.numero_documento,
      telefono: datos.telefono,
    },
  })
  if (error) throw traducirErrorRegistro(error)
  return data
}

/**
 * Registra un cliente web (CA-01): crea el usuario de Supabase Auth y, si ya
 * hay sesión, su cliente. Con confirmación de email activada no hay sesión: el
 * cliente se crea o vincula en el primer ingreso (ver obtenerClienteActual).
 *
 * Un email ya registrado no da error con la confirmación activada (Supabase
 * no revela si existe): la respuesta es la misma que un registro nuevo (CA-02).
 *
 * @param {Object} datos Ver validarRegistro.
 * @returns {Promise<{estado: 'confirmar_email'} | {estado: 'registrado', clienteId: string}>}
 * @throws {Error} 400 con `campo` si un dato es inválido; 409 genérico si el
 *   email o el documento ya están registrados; 429 si hay demasiados intentos.
 */
export async function registrar(datos) {
  const { password, email, ...perfil } = validarRegistro(datos)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { [METADATO_REGISTRO]: perfil },
      emailRedirectTo: `${window.location.origin}/tienda`,
    },
  })

  if (error) {
    if (error.code === 'user_already_exists' || /already registered/i.test(error.message ?? '')) {
      throw errorDeApi(MENSAJE_DUPLICADO, 409)
    }
    if (error.code === 'weak_password') {
      throw errorConCampo('La contraseña es muy débil: usá letras y números', 400, 'password')
    }
    if (error.status === 429) {
      throw errorDeApi('Hiciste muchos intentos seguidos. Esperá unos minutos y volvé a probar.', 429)
    }
    throw errorDeApi(MENSAJE_REGISTRO_GENERICO, 500)
  }

  if (!data?.session) return { estado: 'confirmar_email' }
  return { estado: 'registrado', clienteId: await completarRegistro(perfil) }
}

/**
 * Inicia sesión con email y contraseña (CA-04). Cualquier dato incorrecto
 * devuelve el mismo mensaje genérico.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} Usuario de Supabase Auth.
 * @throws {Error} 401 con mensaje genérico; 403 si falta confirmar el email.
 */
export async function ingresar(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email?.trim().toLowerCase() ?? '',
    password: password ?? '',
  })
  if (error) {
    // Supabase solo devuelve email_not_confirmed con la contraseña correcta.
    if (error.code === 'email_not_confirmed') {
      throw errorDeApi('Todavía no confirmaste tu email. Revisá tu correo y hacé clic en el enlace.', 403)
    }
    throw errorDeApi(MENSAJE_CREDENCIALES, 401)
  }
  return data.user
}

/**
 * Cierra la sesión del cliente web.
 *
 * @returns {Promise<void>}
 */
export async function salir() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * Devuelve el cliente vinculado al usuario autenticado. Si todavía no existe
 * y el usuario tiene un registro pendiente en sus metadatos (confirmación de
 * email), lo completa con registrar_cliente_web.
 *
 * @param {Object} [usuario] Usuario de la sesión; si falta, se consulta.
 * @returns {Promise<Object|null>} Cliente propio, o null sin sesión o sin
 *   cliente asociado (por ejemplo, un usuario interno).
 * @throws {Error} 409 genérico si el registro pendiente no se pudo completar.
 */
export async function obtenerClienteActual(usuario) {
  let actual = usuario
  if (actual === undefined) {
    const { data, error } = await supabase.auth.getUser()
    if (error) return null
    actual = data?.user
  }
  if (!actual) return null

  const buscar = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select(COLUMNAS_CLIENTE)
      .eq('usuario_web_id', actual.id)
      .maybeSingle()
    if (error) throw error
    return data
  }

  const cliente = await buscar()
  if (cliente) return cliente

  const pendiente = actual.user_metadata?.[METADATO_REGISTRO]
  if (!pendiente) return null
  await completarRegistro(pendiente)
  return buscar()
}

/**
 * Actualiza el teléfono del cliente propio (CA-05). La policy clientes_update
 * y el trigger de S3-00 solo le permiten a un cliente web tocar su fila, y en
 * ella solo teléfono y email.
 *
 * @param {string} telefono
 * @returns {Promise<Object>} Cliente actualizado.
 * @throws {Error} 400 si el teléfono es inválido; 401 sin sesión; 403 si la
 *   RLS no dejó actualizar.
 */
export async function actualizarTelefono(telefono) {
  const valor = telefono?.trim() ?? ''
  if (!TELEFONO_REGEX.test(valor)) throw errorConCampo('Ingresá un teléfono válido', 400, 'telefono')

  const { data: sesion } = await supabase.auth.getUser()
  if (!sesion?.user) throw errorDeApi('Tu sesión venció. Volvé a ingresar.', 401)

  const { data, error } = await supabase
    .from('clientes')
    .update({ telefono: valor })
    .eq('usuario_web_id', sesion.user.id)
    .select(COLUMNAS_CLIENTE)
    .single()

  if (error) {
    if (error.code === CODIGO_SIN_FILAS || error.code === CODIGO_PERMISO_INSUFICIENTE) {
      throw errorDeApi('No se pudo actualizar tu teléfono', 403)
    }
    throw error
  }
  return data
}
