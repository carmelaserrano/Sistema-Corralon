import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi } from './errores'

const COLUMNAS = `id, numero, orden_compra_id, estado_recepcion, observaciones,
  created_by, created_at, updated_by, updated_at, confirmado_by, confirmado_at,
  orden:ordenes_compra(numero, estado, proveedor:proveedores(razon_social)), destino:depositos!deposito_destino_id(id, nombre),
  detalle:detalle_recepcion(id, orden_compra_detalle_id, cantidad, costo_unitario, producto:productos(id, sku, nombre))`

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

export async function puedeRegistrarRecepciones() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', { p_nombre: 'compras.recepcion.registrar' })
  if (error) throw error
  return data === true
}
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
export async function getRecepciones({ estado = '', page = 1, pageSize = 10 } = {}) {
  let consulta = supabase.from('recepciones').select(COLUMNAS, { count: 'exact' })
  if (estado) consulta = consulta.eq('estado_recepcion', estado)
  const { data, count, error } = await consulta.order('created_at', { ascending: false }).order('id')
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return { recepciones: data ?? [], total: count ?? 0, page, pageSize, totalPaginas: Math.max(1, Math.ceil((count ?? 0) / pageSize)) }
}
export async function getRecepcionById(id) {
  const { data, error } = await supabase.from('recepciones').select(COLUMNAS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw errorDeApi('La recepción no existe', 404)
  return data
}
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
