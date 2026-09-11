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
        cantidad_recibida,
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

/**
 * Historial paginado de 20 OC. Fechas inclusivas de creación en Argentina.
 * @param {{estado?: string, proveedorId?: string, fechaDesde?: string, fechaHasta?: string, orden?: string, ascendente?: boolean, page?: number}} filtros
 * @returns {Promise<{ordenes: Array, total: number, importeTotal: number, totalPaginas: number}>} Totales de todo el filtro; importe sin canceladas.
 */
export async function getHistorialOC({ estado, proveedorId, fechaDesde, fechaHasta, orden = 'created_at', ascendente = false, page = 1 } = {}) {
  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) throw errorDeApi('La fecha desde no puede ser posterior a la fecha hasta', 400)
  const { data, error } = await supabase.rpc('consultar_historial_oc', {
    p_estado: estado || null, p_proveedor: proveedorId || null,
    p_desde: fechaDesde || null, p_hasta: fechaHasta || null,
    p_orden: orden, p_ascendente: ascendente, p_pagina: page,
  })
  if (error) throw error
  return data
}

/**
 * Consulta una OC con recepciones, facturas y notas vinculadas por imputaciones vigentes.
 * @param {string} id UUID de la orden.
 * @returns {Promise<Object>} Cabecera/detalles, recepciones y facturas con sus notas.
 */
export async function getDetalleHistorialOC(id) {
  const columnasFactura = `id, letra, sucursal, numero, fecha_emision, importe_total, estado,
    imputaciones:imputaciones!factura_id(id, anulado_at, importe_imputado,
      nota:notas_proveedor!nota_id(id, tipo, letra, sucursal, numero, fecha, importe, estado))`
  const [orden, recepciones, facturas] = await Promise.all([
    getOrdenCompraById(id),
    supabase.from('recepciones').select(`id, numero, fecha_recepcion, estado_recepcion, deposito:depositos(nombre),
      enlaces:factura_recepcion(factura:facturas_proveedor(${columnasFactura}))`).eq('orden_compra_id', id).order('numero'),
    supabase.from('facturas_proveedor').select(columnasFactura).eq('orden_compra_id', id).order('fecha_emision'),
  ])
  if (recepciones.error) throw recepciones.error
  if (facturas.error) throw facturas.error
  const asociadas = new Map((facturas.data ?? []).map(f => [f.id, f]))
  for (const r of recepciones.data ?? []) {
    for (const e of r.enlaces ?? []) if (e.factura) asociadas.set(e.factura.id, e.factura)
  }
  return { ...orden, recepciones: recepciones.data ?? [], facturas: [...asociadas.values()].map(f => ({
    ...f, imputaciones: (f.imputaciones ?? []).filter(i => !i.anulado_at && i.nota),
  })) }
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

  // 1. Capturamos el detalle ACTUAL antes de modificar (para el diff de ítems)
  const { data: detalleAnterior } = await supabase
    .from(TABLA_DETALLE)
    .select('producto_id, cantidad, precio_unitario, producto:productos(nombre, sku)')
    .eq('orden_compra_id', id)

  const itemsAnteriores = (detalleAnterior ?? []).map(d => ({
    producto_id: d.producto_id,
    nombre: d.producto?.nombre ?? d.producto_id,
    cantidad: Number(d.cantidad),
    precio_unitario: Number(d.precio_unitario),
  }))

  // 2. Actualizamos la cabecera
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

  // 3. Eliminamos el detalle actual
  const { error: errorDelete } = await supabase
    .from(TABLA_DETALLE)
    .delete()
    .eq('orden_compra_id', id)

  if (errorDelete) {
    throw errorDeApi(errorDelete.message || 'Error al actualizar el detalle de la orden (delete)')
  }

  // 4. Insertamos el nuevo detalle
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

  // 5. Calculamos diff de ítems y registramos en historial
  try {
    const userResp = await supabase.auth.getUser()
    const uid = userResp.data.user?.id
    const email = userResp.data.user?.email

    const mapaAnterior = new Map(itemsAnteriores.map(i => [i.producto_id, i]))
    const mapaNew = new Map(orden.items.map(i => [
      i.producto_id,
      { nombre: i.nombre ?? i.producto_id, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario) },
    ]))

    const registros = []

    // Artículos eliminados o con cambios en cantidad/precio
    for (const [pid, ant] of mapaAnterior) {
      const nvo = mapaNew.get(pid)
      if (!nvo) {
        registros.push({
          orden_id: id,
          campo: 'artículo eliminado',
          valor_anterior: `${ant.nombre} — cant: ${ant.cantidad}, precio: ${ant.precio_unitario}`,
          valor_nuevo: null,
          modificado_por: uid,
          modificado_por_email: email,
        })
      } else {
        if (ant.cantidad !== nvo.cantidad) {
          registros.push({
            orden_id: id,
            campo: `cantidad (${ant.nombre})`,
            valor_anterior: String(ant.cantidad),
            valor_nuevo: String(nvo.cantidad),
            modificado_por: uid,
            modificado_por_email: email,
          })
        }
        if (ant.precio_unitario !== nvo.precio_unitario) {
          registros.push({
            orden_id: id,
            campo: `precio unitario (${ant.nombre})`,
            valor_anterior: String(ant.precio_unitario),
            valor_nuevo: String(nvo.precio_unitario),
            modificado_por: uid,
            modificado_por_email: email,
          })
        }
      }
    }

    // Artículos nuevos
    for (const [pid, nvo] of mapaNew) {
      if (!mapaAnterior.has(pid)) {
        registros.push({
          orden_id: id,
          campo: 'artículo agregado',
          valor_anterior: null,
          valor_nuevo: `${nvo.nombre} — cant: ${nvo.cantidad}, precio: ${nvo.precio_unitario}`,
          modificado_por: uid,
          modificado_por_email: email,
        })
      }
    }

    if (registros.length > 0) {
      await supabase.from('historial_modificaciones_oc').insert(registros)
    }
  } catch {
    // No bloqueamos el guardado si falla el registro del historial de ítems
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

/**
 * Devuelve el historial de modificaciones de cabecera de una OC,
 * del más reciente al más antiguo (CA 4).
 *
 * @param {string} id ID de la orden de compra.
 * @returns {Promise<Array<Object>>} Registros de cambio.
 */
export async function getHistorialModificaciones(id) {
  const { data, error } = await supabase
    .from('historial_modificaciones_oc')
    .select('id, campo, valor_anterior, valor_nuevo, modificado_por, modificado_por_email, modificado_en')
    .eq('orden_id', id)
    .order('modificado_en', { ascending: false })

  if (error) throw error
  return data ?? []
}
