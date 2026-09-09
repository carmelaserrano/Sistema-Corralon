import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi } from './errores'

const COLUMNAS = `id, numero, orden_compra_id, estado_recepcion, observaciones,
  created_by, created_at, updated_by, updated_at, confirmado_by, confirmado_at,
  orden:ordenes_compra(numero, estado, proveedor:proveedores(razon_social)), destino:depositos!deposito_destino_id(id, nombre),
  detalle:detalle_recepcion(id, orden_compra_detalle_id, cantidad, costo_unitario, producto:productos(id, sku, nombre))`

/**
 * @typedef {Object} RenglonRecepcion
 * @property {string} orden_compra_detalle_id UUID del renglón de la OC.
 * @property {number|string} cantidad Unidades enteras recibidas; cero omite el renglón.
 * @property {number|string} pendiente Máximo mostrado en pantalla; la RPC lo revalida en la base.
 * @property {string} [nombre] Nombre del artículo para los mensajes de validación.
 */

/**
 * @typedef {Object} Recepcion
 * @property {string} id UUID de la recepción.
 * @property {number} numero Número correlativo único.
 * @property {string} orden_compra_id UUID de la OC vinculada.
 * @property {string} estado_recepcion Estado persistido; las nuevas quedan confirmadas.
 * @property {?string} observaciones Observaciones de la entrega.
 * @property {string} created_by UUID del usuario creador.
 * @property {string} created_at Fecha y hora de creación en formato ISO.
 * @property {?string} updated_by UUID del último usuario que actualizó el registro.
 * @property {string} updated_at Fecha y hora de última actualización en formato ISO.
 * @property {?string} confirmado_by UUID del usuario que confirmó.
 * @property {?string} confirmado_at Fecha y hora de confirmación en formato ISO.
 * @property {Object} [orden] OC con número, estado actual y proveedor. Solo en consultas.
 * @property {Object} [destino] Depósito de destino (id, nombre). Solo en consultas.
 * @property {Object[]} [detalle] Renglones con cantidad, costo y producto. Solo en consultas.
 */

/**
 * Valida una cantidad sin efectuar consultas ni modificar stock.
 * @param {RenglonRecepcion} item Renglón ingresado en el formulario.
 * @returns {string} Mensaje de error, o cadena vacía si la cantidad es válida.
 */
export function errorCantidadRecepcion(item) {
  const cantidad = Number(item.cantidad)
  if (item.cantidad === '' || item.cantidad == null || !Number.isSafeInteger(cantidad) || cantidad < 0) {
    return 'La cantidad debe ser un número entero mayor o igual a cero'
  }
  if (cantidad > Number(item.pendiente)) {
    return `Cantidad máxima admitida para ${item.nombre || 'el producto'}: ${item.pendiente}`
  }
  return ''
}

/**
 * Consulta el permiso compras.recepcion.registrar del usuario autenticado.
 * @returns {Promise<boolean>} true si el usuario puede confirmar recepciones.
 * @throws {Error} Error de Supabase al consultar el permiso.
 */
export async function puedeRegistrarRecepciones() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', { p_nombre: 'compras.recepcion.registrar' })
  if (error) throw error
  return data === true
}
/**
 * Obtiene todas las OC Pendientes o Parciales, recorriendo páginas de 100 filas.
 * @returns {Promise<Array<{id: string, numero: number, estado: string, deposito_destino_id: string, proveedor: Object}>>}
 * OC elegibles, ordenadas por número descendente; proveedor contiene razon_social.
 * @throws {Error} Error de lectura de Supabase.
 */
export async function getOrdenesRecepcion() {
  const ordenes = []
  for (let desde = 0; ; desde += 100) {
    const { data, error } = await supabase.from('ordenes_compra')
      .select('id, numero, estado, deposito_destino_id, proveedor:proveedores(razon_social)')
      .in('estado', ['pendiente', 'parcialmente_recibida']).order('numero', { ascending: false }).range(desde, desde + 99)
    if (error) throw error
    ordenes.push(...(data ?? []))
    if (!data || data.length < 100) return ordenes
  }
}
/**
 * Obtiene todos los renglones de una OC y calcula pedido menos recibido.
 * @param {string} id UUID de la orden de compra.
 * @returns {Promise<Array<{id: string, producto_id: string, cantidad: number, cantidad_recibida: number, precio_unitario: number, producto: Object, pendiente: number}>>}
 * Renglones con producto (id, sku, nombre) y saldo pendiente; [] si no hay renglones visibles.
 * @throws {Error} Error de lectura de Supabase.
 */
export async function getDetalleOrdenRecepcion(id) {
  const items = []
  for (let desde = 0; ; desde += 100) {
    const { data, error } = await supabase.from('detalle_orden_compra')
      .select('id, producto_id, cantidad, cantidad_recibida, precio_unitario, producto:productos(id, sku, nombre)')
      .eq('orden_compra_id', id).order('id').range(desde, desde + 99)
    if (error) throw error
    items.push(...(data ?? []))
    if (!data || data.length < 100) break
  }
  return items.map((item) => ({ ...item, pendiente: Number(item.cantidad) - Number(item.cantidad_recibida) }))
}
/**
 * Consulta el historial con OC, depósito, artículos y auditoría.
 * @param {Object} [opciones] Filtros y paginación.
 * @param {string} [opciones.estado=''] Estado de recepción; vacío incluye todos.
 * @param {number} [opciones.page=1] Página solicitada, comenzando en 1.
 * @param {number} [opciones.pageSize=10] Cantidad de recepciones por página.
 * @returns {Promise<{recepciones: Recepcion[], total: number, page: number, pageSize: number, totalPaginas: number}>}
 * Página ordenada por fecha descendente, conteo total y metadatos de paginación.
 * @throws {Error} Error de lectura de Supabase.
 */
export async function getRecepciones({ estado = '', page = 1, pageSize = 10 } = {}) {
  let consulta = supabase.from('recepciones').select(COLUMNAS, { count: 'exact' })
  if (estado) consulta = consulta.eq('estado_recepcion', estado)
  const { data, count, error } = await consulta.order('created_at', { ascending: false }).order('id')
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return { recepciones: data ?? [], total: count ?? 0, page, pageSize, totalPaginas: Math.max(1, Math.ceil((count ?? 0) / pageSize)) }
}
/**
 * Consulta una recepción y las relaciones necesarias para su vista de detalle.
 * @param {string} id UUID de la recepción.
 * @returns {Promise<Recepcion>} Recepción con OC, depósito y artículos recibidos.
 * @throws {Error} Error con status 404 si no existe o no es visible; error de Supabase en otros casos.
 */
export async function getRecepcionById(id) {
  const { data, error } = await supabase.from('recepciones').select(COLUMNAS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw errorDeApi('La recepción no existe', 404)
  return data
}
/**
 * Confirma una recepción mediante registrar_recepcion_oc en una única transacción.
 * La RPC toma costos de la OC, genera el ingreso de stock y actualiza el saldo y estado de la OC.
 * No crea facturas. Número, fechas y usuario se asignan en la base.
 * @param {Object} recepcion Datos ingresados en el formulario.
 * @param {string} recepcion.orden_compra_id UUID de una OC Pendiente o Parcial.
 * @param {string} recepcion.deposito_destino_id UUID del depósito elegido.
 * @param {string} [recepcion.observaciones] Texto opcional; se recorta y se envía null si queda vacío.
 * @param {RenglonRecepcion[]} recepcion.items Renglones; debe existir al menos una cantidad positiva.
 * @returns {Promise<Recepcion>} Cabecera confirmada devuelta por la RPC, sin relaciones anidadas.
 * @throws {Error} status 400 por validación, 403 por permisos, 409 por estado de OC,
 * 423 por concurrencia/bloqueo y 500 para errores no clasificados.
 */
export async function createRecepcion(recepcion) {
  if (!recepcion.orden_compra_id) throw errorDeApi('La orden de compra es obligatoria', 400)
  if (!recepcion.deposito_destino_id) throw errorDeApi('El depósito destino es obligatorio', 400)
  const items = recepcion.items ?? []
  if (!Array.isArray(items)) throw errorDeApi('Debe recibir al menos un producto', 400)
  const ids = new Set()
  for (const item of items) {
    if (!item.orden_compra_detalle_id || ids.has(item.orden_compra_detalle_id)) throw errorDeApi('Los renglones de la orden deben ser válidos y no repetirse', 400)
    ids.add(item.orden_compra_detalle_id)
    const errorCantidad = errorCantidadRecepcion(item)
    if (errorCantidad) throw errorDeApi(errorCantidad, 400)
  }
  const recibidos = items.filter((item) => Number(item.cantidad) > 0)
  if (!recibidos.length) throw errorDeApi('Debe recibir al menos un producto', 400)
  const { data, error } = await supabase.rpc('registrar_recepcion_oc', {
    p_orden_compra_id: recepcion.orden_compra_id, p_deposito_destino_id: recepcion.deposito_destino_id,
    p_observaciones: recepcion.observaciones?.trim() || null,
    p_items: recibidos.map((item) => ({ orden_compra_detalle_id: item.orden_compra_detalle_id, cantidad: Number(item.cantidad) })),
  }).single()
  if (error) {
    const estados = { RC001: 400, RC003: 409, RC006: 423, '55P03': 423, '40P01': 423, '40001': 423, '42501': 403 }
    throw errorDeApi(error.message || 'No se pudo confirmar la recepción', estados[error.code] || 500)
  }
  return data
}
