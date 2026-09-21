import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_CHECK_VIOLADO,
  CODIGO_FK_VIOLADA,
  CODIGO_SIN_FILAS,
} from '../../stock/api/errores'
import { cuitEsValido, limpiarCuit } from '../../proveedores/cuit'

const TABLA = 'clientes'

export const PERMISO_ALTA = 'clientes.alta'
export const PERMISO_MODIFICAR = 'clientes.modificar'

export const TIPOS_PERSONA = [
  { value: 'fisica', label: 'Física' },
  { value: 'juridica', label: 'Jurídica' },
]

export const TIPOS_DOCUMENTO = [
  { value: 'DNI', label: 'DNI' },
  { value: 'CUIT', label: 'CUIT' },
]

const PAGE_SIZE_DEFECTO = 20

// condicion_iva_id y tipo_cliente_id son FK a-uno, no N:N como
// proveedor_rubro: PostgREST ya devuelve el objeto embebido directo, sin
// necesidad de aplanar un array.
const COLUMNAS = `
  id,
  numero,
  tipo_persona,
  nombre,
  apellido,
  razon_social,
  tipo_documento,
  numero_documento,
  condicion_iva_id,
  tipo_cliente_id,
  email,
  telefono,
  estado,
  origen,
  created_at,
  created_by,
  updated_at,
  updated_by,
  condicion_iva:condiciones_iva(id, nombre),
  tipo_cliente:tipos_cliente(id, nombre)
`

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DNI_REGEX = /^[0-9]{7,8}$/

function errorConCampo(mensaje, status, campo) {
  const error = errorDeApi(mensaje, status)
  error.campo = campo
  return error
}

function soloDigitos(valor) {
  return (valor ?? '').replace(/\D/g, '')
}

// CA-01: el tipo de persona decide si el documento va con nombre + apellido
// (persona física) o con razón social (persona jurídica); el check
// chk_cliente_nombre de la base exige exactamente uno de los dos grupos.
function validarCliente({
  tipo_persona,
  nombre,
  apellido,
  razon_social,
  tipo_documento,
  numero_documento,
  condicion_iva_id,
  tipo_cliente_id,
  telefono,
  email,
}) {
  if (!TIPOS_PERSONA.some((opcion) => opcion.value === tipo_persona)) {
    throw errorConCampo('El tipo de persona es obligatorio', 400, 'tipo_persona')
  }

  if (tipo_persona === 'fisica') {
    if (!nombre?.trim()) {
      throw errorConCampo('El nombre es obligatorio', 400, 'nombre')
    }
    if (!apellido?.trim()) {
      throw errorConCampo('El apellido es obligatorio', 400, 'apellido')
    }
  } else if (!razon_social?.trim()) {
    throw errorConCampo('La razón social es obligatoria', 400, 'razon_social')
  }

  if (!TIPOS_DOCUMENTO.some((opcion) => opcion.value === tipo_documento)) {
    throw errorConCampo(
      'El tipo de documento es obligatorio',
      400,
      'tipo_documento',
    )
  }

  // CA-03: CUIT con dígito verificador inválido, o DNI que no tiene 7 u 8
  // dígitos. cuitEsValido ya hace la validación de módulo 11 completa.
  if (!numero_documento?.trim()) {
    throw errorConCampo(
      'El número de documento es obligatorio',
      400,
      'numero_documento',
    )
  }
  if (tipo_documento === 'DNI' && !DNI_REGEX.test(soloDigitos(numero_documento))) {
    throw errorConCampo(
      'El DNI debe tener 7 u 8 dígitos',
      400,
      'numero_documento',
    )
  }
  if (tipo_documento === 'CUIT' && !cuitEsValido(numero_documento)) {
    throw errorConCampo('CUIT inválido', 400, 'numero_documento')
  }

  // CA-05: ambos son obligatorios. La condición de "sólo valores activos" la
  // garantiza el desplegable (listarCondicionesIva/listarTiposCliente sólo
  // ofrecen filas con activo = true); acá sólo se exige que se haya elegido.
  if (!condicion_iva_id) {
    throw errorConCampo(
      'La condición frente al IVA es obligatoria',
      400,
      'condicion_iva_id',
    )
  }
  if (!tipo_cliente_id) {
    throw errorConCampo('El tipo de cliente es obligatorio', 400, 'tipo_cliente_id')
  }

  // CA-06: el teléfono es obligatorio, el email es opcional pero con formato.
  if (!telefono?.trim()) {
    throw errorConCampo('El teléfono es obligatorio', 400, 'telefono')
  }
  if (email?.trim() && !EMAIL_REGEX.test(email.trim())) {
    throw errorConCampo('El email no tiene un formato válido', 400, 'email')
  }
}

function normalizarDocumento(tipoDocumento, valor) {
  return tipoDocumento === 'CUIT' ? limpiarCuit(valor) : soloDigitos(valor)
}

function manejarErrorCliente(error) {
  // CA-04: mismo tipo y número de documento ya registrados
  // (uq_cliente_documento). El resto de los índices únicos de la tabla
  // (numero, usuario_web_id) no los toca este formulario.
  if (error?.code === CODIGO_DUPLICADO) {
    if (error.message?.includes('uq_cliente_documento')) {
      throw errorConCampo(
        'Ya existe un cliente con ese documento',
        409,
        'numero_documento',
      )
    }
    throw errorDeApi('Ya existe un cliente con esos datos', 409)
  }

  if (error?.code === CODIGO_CHECK_VIOLADO) {
    if (error.message?.includes('chk_cliente_dni')) {
      throw errorConCampo(
        'El DNI debe tener 7 u 8 dígitos',
        400,
        'numero_documento',
      )
    }
    if (error.message?.includes('chk_cliente_cuit')) {
      throw errorConCampo('CUIT inválido', 400, 'numero_documento')
    }
    if (error.message?.includes('chk_cliente_telefono_no_vacio')) {
      throw errorConCampo('El teléfono es obligatorio', 400, 'telefono')
    }
    if (error.message?.includes('chk_cliente_email')) {
      throw errorConCampo('El email no tiene un formato válido', 400, 'email')
    }
    if (error.message?.includes('chk_cliente_nombre')) {
      throw errorDeApi(
        'Completá nombre y apellido, o razón social, según el tipo de persona',
        400,
      )
    }
    throw errorDeApi(
      'Revisá los datos: no cumplen una validación del sistema',
      400,
    )
  }

  // condicion_iva_id o tipo_cliente_id apuntan a una fila que ya no existe
  // (por ejemplo, se desactivó entre que se abrió el formulario y se guardó).
  if (error?.code === CODIGO_FK_VIOLADA) {
    throw errorDeApi(
      'La condición frente al IVA o el tipo de cliente seleccionado no existe',
      422,
    )
  }

  // Igual que en proveedoresApi y rubrosApi: sin permiso, la RLS deja la
  // escritura sin filas y PostgREST devuelve PGRST116, no un error de Postgres.
  if (error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo guardar el cliente: no existe o no tenés permiso para modificarlo',
      403,
    )
  }

  throw error
}

function armarCambios(datos) {
  const esFisica = datos.tipo_persona === 'fisica'

  return {
    tipo_persona: datos.tipo_persona,
    nombre: esFisica ? datos.nombre.trim() : null,
    apellido: esFisica ? datos.apellido.trim() : null,
    razon_social: esFisica ? null : datos.razon_social.trim(),
    tipo_documento: datos.tipo_documento,
    numero_documento: normalizarDocumento(
      datos.tipo_documento,
      datos.numero_documento,
    ),
    condicion_iva_id: datos.condicion_iva_id,
    tipo_cliente_id: datos.tipo_cliente_id,
    telefono: datos.telefono.trim(),
    email: datos.email?.trim() || null,
  }
}

/**
 * Lista clientes, con filtro de texto en vivo (nombre, apellido, razón
 * social, DNI o CUIT) y paginado de a 20 (CA-08).
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.search] Texto a buscar.
 * @param {number} [filtros.pagina=1] Página, arranca en 1.
 * @param {number} [filtros.pageSize=20]
 * @returns {Promise<{clientes: Array<Object>, total: number, pagina: number, pageSize: number, totalPaginas: number}>}
 */
export async function listarClientes({
  search = '',
  pagina = 1,
  pageSize = PAGE_SIZE_DEFECTO,
} = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS, { count: 'exact' })

  if (search.trim()) {
    const patron = `%${search.trim()}%`
    consulta = consulta.or(
      `nombre.ilike.${patron},apellido.ilike.${patron},razon_social.ilike.${patron},numero_documento.ilike.${patron}`,
    )
  }

  const desde = (pagina - 1) * pageSize
  const { data, count, error } = await consulta
    .order('created_at', { ascending: false })
    .range(desde, desde + pageSize - 1)

  if (error) throw error

  const total = count ?? 0

  return {
    clientes: data ?? [],
    total,
    pagina,
    pageSize,
    totalPaginas: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * Da de alta un cliente (CA-02). El número lo asigna la base (identity
 * sobre `numero`), y estado/origen quedan en sus valores por defecto
 * ('Activo' / 'Mostrador'): ninguno de los tres se manda en el insert.
 *
 * @param {Object} datos
 * @param {'fisica'|'juridica'} datos.tipo_persona
 * @param {string} [datos.nombre] Obligatorio si tipo_persona es 'fisica'.
 * @param {string} [datos.apellido] Obligatorio si tipo_persona es 'fisica'.
 * @param {string} [datos.razon_social] Obligatorio si tipo_persona es 'juridica'.
 * @param {'DNI'|'CUIT'} datos.tipo_documento
 * @param {string} datos.numero_documento
 * @param {string} datos.condicion_iva_id
 * @param {string} datos.tipo_cliente_id
 * @param {string} datos.telefono
 * @param {string} [datos.email]
 * @returns {Promise<Object>} Cliente creado.
 * @throws {Error} 400 datos inválidos; 409 documento duplicado.
 */
export async function crearCliente(datos) {
  validarCliente(datos)

  const { data, error } = await supabase
    .from(TABLA)
    .insert(armarCambios(datos))
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorCliente(error)
  return data
}

/**
 * Modifica un cliente existente (CA-07). El número de cliente no se manda
 * en el update: es inmutable, lo asigna la base al crear.
 *
 * @param {string} id ID del cliente.
 * @param {Object} datos Mismos campos que crearCliente.
 * @returns {Promise<Object>} Cliente actualizado.
 */
export async function actualizarCliente(id, datos) {
  validarCliente(datos)

  const { data, error } = await supabase
    .from(TABLA)
    .update(armarCambios(datos))
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorCliente(error)
  return data
}

/**
 * Condiciones frente al IVA disponibles para el desplegable (CA-05).
 *
 * @param {Object} [opciones]
 * @param {boolean} [opciones.soloActivas=true]
 * @returns {Promise<Array<{id: string, nombre: string, activo: boolean}>>}
 */
export async function listarCondicionesIva({ soloActivas = true } = {}) {
  let consulta = supabase.from('condiciones_iva').select('id, nombre, activo')

  if (soloActivas) consulta = consulta.eq('activo', true)

  const { data, error } = await consulta.order('nombre')

  if (error) throw error
  return data ?? []
}

/**
 * Tipos de cliente disponibles para el desplegable (CA-05).
 *
 * @param {Object} [opciones]
 * @param {boolean} [opciones.soloActivas=true]
 * @returns {Promise<Array<{id: string, nombre: string, activo: boolean}>>}
 */
export async function listarTiposCliente({ soloActivas = true } = {}) {
  let consulta = supabase.from('tipos_cliente').select('id, nombre, activo')

  if (soloActivas) consulta = consulta.eq('activo', true)

  const { data, error } = await consulta.order('nombre')

  if (error) throw error
  return data ?? []
}

/**
 * Indica si el usuario actual puede dar de alta clientes.
 *
 * @returns {Promise<boolean>} true si tiene el permiso 'clientes.alta'.
 */
export async function puedeAltaClientes() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_ALTA,
  })

  if (error) throw error
  return data === true
}

/**
 * Indica si el usuario actual puede modificar clientes existentes.
 *
 * @returns {Promise<boolean>} true si tiene el permiso 'clientes.modificar'.
 */
export async function puedeModificarClientes() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_MODIFICAR,
  })

  if (error) throw error
  return data === true
}
