import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi } from '../../stock/api/errores'

const TABLA = 'pagos_proveedor'
const TABLA_IMPUTACIONES = 'imputaciones'

export const PERMISO_REGISTRAR = 'tesoreria.pago.registrar'

// Códigos que define la migración 0026. Mismo patrón que recepcionesApi.js
// con los RCxxx: la base ya redacta el mensaje para mostrarse tal cual, que
// es lo que hace falta para los CA 8 y 10 (informan máximo y diferencia).
const STATUS_POR_CODIGO = {
  OP001: 400, // faltan datos obligatorios o son inválidos
  OP002: 404, // proveedor, medio de pago, factura o nota inexistente
  OP003: 400, // el importe imputado supera el máximo imputable
  OP004: 409, // el total imputado no coincide con el importe de la orden
  OP005: 409, // no pertenece al proveedor, o la nota ya está imputada ahí
  OP006: 409, // la factura o la nota no está en un estado imputable
  OP007: 409, // se intentó editar una orden confirmada
}

const COLUMNAS = `
  id,
  numero,
  proveedor_id,
  medio_pago_id,
  fecha,
  importe_total,
  referencia,
  observaciones,
  estado,
  created_by,
  created_at,
  proveedor:proveedores(id, razon_social, cuit),
  medio_pago:medios_pago(id, nombre)
`

const COLUMNAS_IMPUTACION = `
  id,
  factura_id,
  nota_id,
  pago_id,
  pago_origen_id,
  importe_imputado,
  created_at,
  factura:facturas_proveedor(id, letra, sucursal, numero, importe_total, saldo_pendiente, estado),
  nota:notas_proveedor(id, tipo, letra, sucursal, numero, importe, saldo_pendiente, estado)
`

function manejarErrorOrdenPago(error, mensajePorDefecto) {
  const status = STATUS_POR_CODIGO[error?.code]
  if (status) throw errorDeApi(error.message || mensajePorDefecto, status)
  throw error
}

/**
 * Totales de la orden en armado (CA 5/6).
 *
 * Una nota nunca es plata que sale: se imputa contra una factura y baja
 * (crédito) o sube (débito) el efectivo necesario para cancelarla. El
 * "total a pagar" es entonces el subtotal de facturas neteado por las notas
 * seleccionadas.
 *
 * @param {Array<{importe: number|string}>} facturas Facturas incluidas.
 * @param {Array<{tipo: string, importe: number|string}>} notas Notas elegidas.
 * @returns {{subtotal: number, creditos: number, debitos: number, total: number}}
 */
export function calcularTotales(facturas = [], notas = []) {
  const sumar = (items) =>
    items.reduce((acc, item) => acc + (Number(item.importe) || 0), 0)

  const subtotal = sumar(facturas)
  const creditos = sumar(notas.filter((n) => n.tipo === 'CREDITO'))
  const debitos = sumar(notas.filter((n) => n.tipo === 'DEBITO'))

  const redondear = (valor) => Math.round(valor * 100) / 100

  return {
    subtotal: redondear(subtotal),
    creditos: redondear(creditos),
    debitos: redondear(debitos),
    total: redondear(subtotal - creditos + debitos),
  }
}

/**
 * Medios de pago activos, para el selector del CA 9.
 */
export async function getMediosPago() {
  const { data, error } = await supabase
    .from('medios_pago')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  if (error) throw error
  return data ?? []
}

export async function puedeRegistrarOrdenesPago() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_REGISTRAR,
  })
  if (error) throw error
  return data === true
}

/**
 * Historial de órdenes de pago, más recientes primero (CA 13).
 */
export async function getOrdenesPago({
  proveedorId = '',
  fechaDesde = '',
  fechaHasta = '',
  page = 1,
  pageSize = 50,
} = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS, { count: 'exact' })

  if (proveedorId) consulta = consulta.eq('proveedor_id', proveedorId)
  if (fechaDesde) consulta = consulta.gte('fecha', fechaDesde)
  if (fechaHasta) consulta = consulta.lte('fecha', fechaHasta)

  const desde = (page - 1) * pageSize

  const { data, count, error } = await consulta
    .order('numero', { ascending: false })
    .range(desde, desde + pageSize - 1)

  if (error) throw error

  const total = count ?? 0

  return {
    ordenes: data ?? [],
    total,
    page,
    pageSize,
    totalPaginas: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * Detalle de una orden con sus dos clases de imputación (CA 13): las de
 * efectivo (`pago_id`) y las notas que se aplicaron dentro de esta orden
 * (`pago_origen_id`, la columna de trazabilidad que agrega la 0026).
 */
export async function getOrdenPagoById(id) {
  const { data: orden, error } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!orden) throw errorDeApi('La orden de pago no existe', 404)

  const { data: imputaciones, error: errorImputaciones } = await supabase
    .from(TABLA_IMPUTACIONES)
    .select(COLUMNAS_IMPUTACION)
    .or(`pago_id.eq.${id},pago_origen_id.eq.${id}`)
    .is('anulado_at', null)
    .order('created_at')

  if (errorImputaciones) throw errorImputaciones

  const filas = imputaciones ?? []

  return {
    ...orden,
    facturas: filas.filter((imp) => imp.pago_id === id),
    notas: filas.filter((imp) => imp.nota_id),
  }
}

/**
 * Confirma una orden de pago: cabecera, notas imputadas y efectivo, todo en
 * una sola transacción dentro de `crear_orden_pago` (0026).
 *
 * @param {Object} datos
 * @param {string} datos.proveedor_id
 * @param {string} datos.medio_pago_id
 * @param {string} datos.fecha
 * @param {number|string} datos.importe_total Efectivo que sale.
 * @param {Array<{factura_id: string, importe: number|string}>} datos.facturas
 * @param {Array<{nota_id: string, factura_id: string, importe: number|string}>} [datos.notas]
 * @param {string} [datos.referencia]
 * @param {string} [datos.observaciones]
 * @returns {Promise<Object>} La orden confirmada, con su número.
 * @throws {Error} 400 si faltan datos o un importe supera el máximo
 *   imputable (CA 8); 409 si el total no coincide con el importe (CA 10) o
 *   si algún comprobante no es imputable.
 */
export async function crearOrdenPago(datos) {
  if (!datos.proveedor_id) throw errorDeApi('El proveedor es obligatorio', 400)
  if (!datos.medio_pago_id) throw errorDeApi('El medio de pago es obligatorio', 400)
  if (!datos.fecha) throw errorDeApi('La fecha es obligatoria', 400)

  if (!datos.facturas?.length) {
    throw errorDeApi('La orden debe imputar al menos una factura', 400)
  }

  const importeTotal = Number(datos.importe_total)
  if (!Number.isFinite(importeTotal) || importeTotal <= 0) {
    throw errorDeApi('El importe de la orden debe ser mayor a 0', 400)
  }

  const { data, error } = await supabase.rpc('crear_orden_pago', {
    p_proveedor_id: datos.proveedor_id,
    p_medio_pago_id: datos.medio_pago_id,
    p_fecha: datos.fecha,
    p_importe_total: importeTotal,
    p_facturas: datos.facturas.map((f) => ({
      factura_id: f.factura_id,
      importe: Number(f.importe),
    })),
    p_notas: (datos.notas ?? []).map((n) => ({
      nota_id: n.nota_id,
      factura_id: n.factura_id,
      importe: Number(n.importe),
    })),
    p_referencia: datos.referencia?.trim() || null,
    p_observaciones: datos.observaciones?.trim() || null,
  })

  if (error) manejarErrorOrdenPago(error, 'No se pudo confirmar la orden de pago')
  return data
}
