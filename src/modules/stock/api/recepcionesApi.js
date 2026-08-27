import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_FK_VIOLADA,
  CODIGO_CHECK_VIOLADO,
  CODIGO_UUID_INVALIDO,
} from './errores'

const TABLA = 'recepciones'

export const ESTADOS = {
  PENDIENTE: 'pendiente',
  CONFIRMADA: 'confirmada',
}

const COLUMNAS = `
  id,
  orden_compra_id,
  estado_recepcion,
  observaciones,
  created_by,
  created_at,
  confirmado_by,
  confirmado_at,
  destino:depositos!deposito_destino_id (id, nombre),
  detalle:detalle_recepcion (
    id,
    cantidad,
    costo_unitario,
    producto:productos (id, sku, nombre)
  )
`

// Los códigos RCxxx los define la migración 0011; el resto son estándar de
// PostgreSQL o de PostgREST.
const STATUS_POR_CODIGO = {
  RC001: 400, // depósito destino, ítems o cantidades/costos inválidos
  RC002: 404, // la recepción no existe
  RC003: 409, // la recepción ya fue confirmada
  RC005: 409, // recepción sin ítems
  RC006: 423, // otra operación en proceso sobre el mismo artículo/depósito
  '55P03': 423, // lock_not_available: lo levanta Postgres por el NOWAIT
  40001: 423, // serialization_failure
  '40P01': 423, // deadlock_detected
  PGRST116: 404, // .single() no encontró filas
  [CODIGO_FK_VIOLADA]: 404,
  [CODIGO_CHECK_VIOLADO]: 400,
  [CODIGO_UUID_INVALIDO]: 400,
}

// Los raise exception de la migración ya están redactados para mostrarse tal
// cual, así que se preserva el mensaje que viene de la base.
function manejarErrorRecepcion(error, mensajePorDefecto) {
  const status = STATUS_POR_CODIGO[error?.code]
  if (status) throw errorDeApi(error.message || mensajePorDefecto, status)
  throw error
}

function validarRecepcion(recepcion) {
  if (!recepcion.deposito_destino_id) {
    throw errorDeApi('El depósito destino es obligatorio', 400)
  }

  const items = recepcion.items

  if (!Array.isArray(items) || items.length === 0) {
    throw errorDeApi('Los ítems son obligatorios', 400)
  }

  for (const item of items) {
    if (!item.articulo_id) {
      throw errorDeApi('El artículo es obligatorio en cada ítem', 400)
    }

    const cantidad = Number(item.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw errorDeApi('La cantidad debe ser mayor a 0', 400)
    }

    const costoUnitario = Number(item.costo_unitario)
    if (!Number.isFinite(costoUnitario) || costoUnitario <= 0) {
      throw errorDeApi('El costo unitario debe ser mayor a 0', 400)
    }
  }
}

export async function getRecepciones({
  estado = '',
  page = 1,
  pageSize = 10,
} = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS, { count: 'exact' })

  if (estado) consulta = consulta.eq('estado_recepcion', estado)

  const desde = (page - 1) * pageSize
  const { data, count, error } = await consulta
    .order('created_at', { ascending: false })
    .range(desde, desde + pageSize - 1)

  if (error) throw error

  const total = count ?? 0

  return {
    recepciones: data ?? [],
    total,
    page,
    pageSize,
    totalPaginas: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getRecepcionById(id) {
  const { data, error } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw errorDeApi('La recepción no existe', 404)

  return data
}

export async function createRecepcion(recepcion) {
  validarRecepcion(recepcion)

  const items = recepcion.items.map((item) => ({
    producto_id: item.articulo_id,
    cantidad: Number(item.cantidad),
    costo_unitario: Number(item.costo_unitario),
  }))

  // PostgREST hace match por nombre exacto de argumento: sin el prefijo p_
  // la respuesta es PGRST202 "function not found".
  const { data, error } = await supabase
    .rpc('crear_recepcion', {
      p_deposito_destino_id: recepcion.deposito_destino_id,
      p_items: items,
      p_orden_compra_id: recepcion.orden_compra_id?.trim() || null,
      p_observaciones: recepcion.observaciones?.trim() || null,
    })
    .single()

  if (error) manejarErrorRecepcion(error, 'No se pudo registrar la recepción')
  return data
}

export async function confirmarRecepcion(id) {
  if (!id) throw errorDeApi('La recepción es obligatoria', 400)

  const { data, error } = await supabase
    .rpc('confirmar_recepcion', { p_recepcion_id: id })
    .single()

  if (error) manejarErrorRecepcion(error, 'No se pudo confirmar la recepción')
  return data
}
