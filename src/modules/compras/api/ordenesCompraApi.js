import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi } from '../../stock/api/errores'

const TABLA = 'ordenes_compra'
const TABLA_DETALLE = 'detalle_orden_compra'

export const PERMISO_CREAR = 'compras.orden.crear'
export const PERMISO_MODIFICAR = 'compras.orden.modificar'
export const PERMISO_CANCELAR = 'compras.orden.cancelar'

export const ESTADOS = ['pendiente', 'parcialmente_recibida', 'recibida', 'cancelada']

const COLUMNAS = `
  id,
  numero,
  solicitud_id,
  proveedor_id,
  deposito_destino_id,
  condicion_pago,
  fecha_emision,
  fecha_entrega_estimada,
  estado,
  total,
  observaciones,
  cancelado_by,
  cancelado_at,
  motivo_cancelacion,
  created_by,
  updated_by,
  created_at,
  updated_at,
  proveedor:proveedores(id, razon_social, cuit),
  deposito_destino:depositos(id, nombre)
`

export async function puedeCrearOrdenes() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_CREAR,
  })
  if (error) throw error
  return data === true
}

export async function puedeModificarOrdenes() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_MODIFICAR,
  })
  if (error) throw error
  return data === true
}

export async function puedeCancelarOrdenes() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_CANCELAR,
  })
  if (error) throw error
  return data === true
}

export async function getOrdenesCompra({ estado, proveedorId, fechaDesde, fechaHasta, page = 1, pageSize = 50 } = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS, { count: 'exact' })

  if (estado) {
    consulta = consulta.eq('estado', estado)
  }

  if (proveedorId) {
    consulta = consulta.eq('proveedor_id', proveedorId)
  }

  if (fechaDesde) {
    consulta = consulta.gte('fecha_emision', fechaDesde)
  }

  if (fechaHasta) {
    consulta = consulta.lte('fecha_emision', fechaHasta)
  }

  const desde = (page - 1) * pageSize

  const { data, count, error } = await consulta
    .order('numero', { ascending: false })
    .range(desde, desde + pageSize - 1)

  if (error) throw error

  return {
    ordenes: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    totalPaginas: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  }
}

export async function getOrdenCompraById(id) {
  const { data, error } = await supabase
    .from(TABLA)
    .select(`
      ${COLUMNAS},
      detalles:detalle_orden_compra(
        id,
        producto_id,
        cantidad,
        precio_unitario,
        subtotal,
        producto:productos(id, nombre, sku)
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw errorDeApi('La orden no existe', 404)
    throw error
  }

  return data
}

export async function createOrdenCompra(orden) {
  // Validación básica
  if (!orden.proveedor_id) throw errorDeApi('El proveedor es obligatorio', 400)
  if (!orden.deposito_destino_id) throw errorDeApi('El depósito destino es obligatorio', 400)
  if (!orden.items || orden.items.length === 0) throw errorDeApi('La orden debe tener al menos un artículo', 400)

  // Primero creamos la cabecera
  const { data: cabecera, error: errorCabecera } = await supabase
    .from(TABLA)
    .insert({
      proveedor_id: orden.proveedor_id,
      deposito_destino_id: orden.deposito_destino_id,
      condicion_pago: orden.condicion_pago?.trim() || null,
      fecha_emision: orden.fecha_emision || new Date().toISOString().split('T')[0],
      fecha_entrega_estimada: orden.fecha_entrega_estimada || null,
      observaciones: orden.observaciones?.trim() || null,
    })
    .select('id, numero')
    .single()

  if (errorCabecera) {
    throw errorDeApi(errorCabecera.message || 'Error al crear la cabecera de la orden')
  }

  // Ahora insertamos el detalle
  const items = orden.items.map((item) => ({
    orden_compra_id: cabecera.id,
    producto_id: item.producto_id,
    cantidad: Number(item.cantidad),
    precio_unitario: Number(item.precio_unitario),
  }))

  const { error: errorDetalle } = await supabase
    .from(TABLA_DETALLE)
    .insert(items)

  if (errorDetalle) {
    // Si falla el detalle, advertimos pero la cabecera ya se creó
    throw errorDeApi(errorDetalle.message || 'Error al crear el detalle de la orden. La cabecera fue creada.')
  }

  return cabecera
}

export async function updateOrdenCompra(id, orden) {
  // Validación básica
  if (!orden.proveedor_id) throw errorDeApi('El proveedor es obligatorio', 400)
  if (!orden.deposito_destino_id) throw errorDeApi('El depósito destino es obligatorio', 400)
  if (!orden.items || orden.items.length === 0) throw errorDeApi('La orden debe tener al menos un artículo', 400)

  // Actualizamos la cabecera
  const { data: cabecera, error: errorCabecera } = await supabase
    .from(TABLA)
    .update({
      proveedor_id: orden.proveedor_id,
      deposito_destino_id: orden.deposito_destino_id,
      condicion_pago: orden.condicion_pago?.trim() || null,
      fecha_emision: orden.fecha_emision,
      fecha_entrega_estimada: orden.fecha_entrega_estimada || null,
      observaciones: orden.observaciones?.trim() || null,
    })
    .eq('id', id)
    .select('id, numero')
    .single()

  if (errorCabecera) {
    throw errorDeApi(errorCabecera.message || 'Error al actualizar la cabecera de la orden')
  }

  // Eliminamos el detalle actual
  const { error: errorDelete } = await supabase
    .from(TABLA_DETALLE)
    .delete()
    .eq('orden_compra_id', id)

  if (errorDelete) {
    throw errorDeApi(errorDelete.message || 'Error al actualizar el detalle de la orden (delete)')
  }

  // Insertamos el nuevo detalle
  const items = orden.items.map((item) => ({
    orden_compra_id: id,
    producto_id: item.producto_id,
    cantidad: Number(item.cantidad),
    precio_unitario: Number(item.precio_unitario),
  }))

  const { error: errorDetalle } = await supabase
    .from(TABLA_DETALLE)
    .insert(items)

  if (errorDetalle) {
    throw errorDeApi(errorDetalle.message || 'Error al crear el detalle de la orden. La cabecera fue actualizada.')
  }

  return cabecera
}

export async function cancelarOrdenCompra(id, motivo) {
  if (!motivo || motivo.trim() === '') {
    throw errorDeApi('El motivo de cancelación es obligatorio', 400)
  }

  const userResp = await supabase.auth.getUser()
  const uid = userResp.data.user?.id

  const { data, error } = await supabase
    .from(TABLA)
    .update({
      estado: 'cancelada',
      motivo_cancelacion: motivo.trim(),
      cancelado_by: uid,
      cancelado_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id')
    .single()

  if (error) {
    throw errorDeApi(error.message || 'No se pudo cancelar la orden')
  }

  return data
}
