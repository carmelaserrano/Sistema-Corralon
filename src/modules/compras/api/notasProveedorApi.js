import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_CHECK_VIOLADO,
  CODIGO_SIN_FILAS,
} from '../../stock/api/errores'
import {
  LETRAS,
  normalizarSucursal,
  normalizarNumero,
} from '../../tesoreria/api/facturasProveedorApi'
import { vincularNotaFactura } from '../../tesoreria/api/imputacionesApi'

const TABLA = 'notas_proveedor'

export const PERMISO_REGISTRAR = 'tesoreria.nota_credito.registrar'

export { LETRAS }

// CA 2: define el signo con el que la nota afecta el saldo de la factura
// (CREDITO resta, DEBITO suma — notas técnicas de S2-16).
export const TIPOS = ['CREDITO', 'DEBITO']

export const ETIQUETAS_TIPO = {
  CREDITO: 'Nota de Crédito',
  DEBITO: 'Nota de Débito',
}

export const ESTADOS = ['disponible', 'parcialmente_aplicada', 'aplicada', 'anulada']

// CA 9: la historia pide estas etiquetas puntuales para mostrar.
export const ETIQUETAS_ESTADO = {
  disponible: 'Disponible',
  parcialmente_aplicada: 'Aplicada parcial',
  aplicada: 'Aplicada',
  anulada: 'Anulada',
}

const COLUMNAS = `
  id,
  proveedor_id,
  tipo,
  letra,
  sucursal,
  numero,
  fecha,
  importe,
  saldo_pendiente,
  estado,
  created_by,
  created_at,
  proveedor:proveedores(id, razon_social, cuit),
  imputaciones:imputaciones!nota_id(
    id,
    importe_imputado,
    anulado_at,
    factura:facturas_proveedor(id, letra, sucursal, numero)
  )
`

/**
 * Deja solo las vinculaciones vigentes: PostgREST trae también las que se
 * deshicieron (baja lógica, 0025) y filtrar el recurso embebido desde la
 * query obliga a un inner join que escondería las notas sin vínculos.
 *
 * @param {Object} fila Nota cruda devuelta por Supabase.
 * @returns {Object} Nota con `imputaciones` ya filtrada.
 */
function normalizarNota(fila) {
  return {
    ...fila,
    imputaciones: (fila.imputaciones ?? []).filter((imp) => !imp.anulado_at),
  }
}

function validarNota(datos) {
  if (!datos.proveedor_id) {
    throw errorDeApi('El proveedor es obligatorio', 400)
  }
  if (!TIPOS.includes(datos.tipo)) {
    throw errorDeApi('El tipo debe ser Nota de Crédito o Nota de Débito', 400)
  }
  if (!LETRAS.includes(datos.letra)) {
    throw errorDeApi('La letra debe ser A, B, C o M', 400)
  }

  const sucursal = normalizarSucursal(datos.sucursal)
  if (!/^[0-9]{4}$/.test(sucursal)) {
    throw errorDeApi('La sucursal debe tener 4 dígitos', 400)
  }

  const numero = normalizarNumero(datos.numero)
  if (!/^[0-9]{8}$/.test(numero)) {
    throw errorDeApi('El número debe tener 8 dígitos', 400)
  }

  if (!datos.fecha) {
    throw errorDeApi('La fecha es obligatoria', 400)
  }

  if (!datos.importe || Number(datos.importe) <= 0) {
    throw errorDeApi('El importe debe ser mayor a 0', 400)
  }

  return { sucursal, numero }
}

async function manejarErrorNota(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi('La nota ya fue registrada', 409)
  }

  if (error?.code === CODIGO_CHECK_VIOLADO) {
    if (error.message?.includes('chk_nota_tipo')) {
      throw errorDeApi('El tipo debe ser Nota de Crédito o Nota de Débito', 400)
    }
    if (error.message?.includes('chk_nota_letra')) {
      throw errorDeApi('La letra debe ser A, B, C o M', 400)
    }
    if (error.message?.includes('chk_nota_sucursal_formato')) {
      throw errorDeApi('La sucursal debe tener 4 dígitos', 400)
    }
    if (error.message?.includes('chk_nota_numero_formato')) {
      throw errorDeApi('El número debe tener 8 dígitos', 400)
    }
    throw errorDeApi('Revisá los datos: no cumplen una validación del sistema', 400)
  }

  // NT002/NT003: fn_validar_nota_factura_proveedor (0024).
  if (error?.code === 'NT002' || error?.code === 'NT003') {
    throw errorDeApi(error.message, 409)
  }

  if (error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo guardar la nota: no existe o no tenés permiso para verla',
      403,
    )
  }

  throw error
}

export async function puedeRegistrarNotas() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_REGISTRAR,
  })
  if (error) throw error
  return data === true
}

/**
 * Lista notas de proveedor, más recientes primero (CA 9).
 */
export async function getNotas({
  proveedorId = '',
  tipo = '',
  estado = '',
  fechaDesde = '',
  fechaHasta = '',
  page = 1,
  pageSize = 50,
} = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS, { count: 'exact' })

  if (proveedorId) consulta = consulta.eq('proveedor_id', proveedorId)
  if (tipo) consulta = consulta.eq('tipo', tipo)
  if (estado) consulta = consulta.eq('estado', estado)
  if (fechaDesde) consulta = consulta.gte('fecha', fechaDesde)
  if (fechaHasta) consulta = consulta.lte('fecha', fechaHasta)

  const desde = (page - 1) * pageSize

  const { data, count, error } = await consulta
    .order('fecha', { ascending: false })
    .range(desde, desde + pageSize - 1)

  if (error) throw error

  const total = count ?? 0

  return {
    notas: (data ?? []).map(normalizarNota),
    total,
    page,
    pageSize,
    totalPaginas: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * Detalle de una nota, para la pantalla desde la que se vincula a facturas
 * (S2-17, CA 1).
 */
export async function getNotaById(id) {
  const { data, error } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw errorDeApi('La nota no existe', 404)

  return normalizarNota(data)
}

/**
 * Notas de un proveedor con saldo disponible para imputar, para el selector
 * del detalle de factura (S2-17, CA 2). Simétrico a
 * getFacturasConSaldoDelProveedor en facturasProveedorApi.js.
 */
export async function getNotasDisponiblesDelProveedor(proveedorId) {
  if (!proveedorId) return []

  const { data, error } = await supabase
    .from(TABLA)
    .select('id, tipo, letra, sucursal, numero, importe, saldo_pendiente, estado')
    .eq('proveedor_id', proveedorId)
    .gt('saldo_pendiente', 0)
    .neq('estado', 'anulada')
    .order('fecha', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Da de alta una nota de crédito o débito de proveedor.
 *
 * Si se pasa `datos.factura_id`, además la vincula a esa factura por el
 * importe completo (S2-16 CA 5) creando la imputación correspondiente; si
 * no, la nota queda "Disponible" con su saldo completo (S2-16 CA 6) para
 * vincularla más adelante a mano.
 *
 * @param {Object} datos
 * @param {string} datos.proveedor_id
 * @param {'CREDITO'|'DEBITO'} datos.tipo
 * @param {'A'|'B'|'C'|'M'} datos.letra
 * @param {string} datos.sucursal Con o sin ceros a la izquierda.
 * @param {string} datos.numero Con o sin ceros a la izquierda.
 * @param {string} datos.fecha
 * @param {number|string} datos.importe Siempre positivo (nota técnica: el
 *   signo lo define `tipo`, no el importe).
 * @param {string} [datos.factura_id] Vínculo opcional a una factura del
 *   mismo proveedor.
 * @returns {Promise<Object>} La nota creada.
 * @throws {Error} 400 si falta un campo obligatorio o el formato es
 *   inválido; 409 si ya existe o si la factura es de otro proveedor.
 */
export async function createNota(datos) {
  const { sucursal, numero } = validarNota(datos)

  const { data: nota, error } = await supabase
    .from(TABLA)
    .insert({
      proveedor_id: datos.proveedor_id,
      tipo: datos.tipo,
      letra: datos.letra,
      sucursal,
      numero,
      fecha: datos.fecha,
      importe: Number(datos.importe),
    })
    .select(COLUMNAS)
    .single()

  if (error) await manejarErrorNota(error)

  if (!datos.factura_id) return normalizarNota(nota)

  try {
    await vincularNotaFactura({
      notaId: nota.id,
      facturaId: datos.factura_id,
      importe: Number(datos.importe),
    })
  } catch (errorVinculo) {
    // La nota ya se guardó y no hay transacción cruzada desde el cliente
    // para revertirla (mismo criterio que createProveedor con el rubro, en
    // proveedoresApi.js). Queda Disponible y se puede vincular a mano.
    throw errorDeApi(
      `La nota se registró, pero no se pudo vincular a la factura (${errorVinculo.message || 'error desconocido'}). Quedó Disponible para vincularla desde su detalle.`,
      409,
    )
  }

  return getNotaById(nota.id)
}

/**
 * "Elimina" una nota no aplicada (CA 10). Si ya está vinculada a una
 * factura, el backend lo rechaza e informa cuál (`eliminar_nota_proveedor`,
 * 0025) — acá solo se traduce ese error, no se decide de nuevo en JS.
 *
 * @param {string} id
 * @throws {Error} 404 si no existe; 409 si ya está aplicada.
 */
export async function eliminarNota(id) {
  if (!id) throw errorDeApi('La nota es obligatoria', 400)

  const { error } = await supabase.rpc('eliminar_nota_proveedor', { p_id: id })

  if (error) {
    if (error.code === 'NT001') throw errorDeApi(error.message, 409)
    if (error.code === 'NT002') throw errorDeApi(error.message, 404)
    throw error
  }
}
