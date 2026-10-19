import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi, CODIGO_PERMISO_INSUFICIENTE } from '../../stock/api/errores'

// Medio de los pedidos de la tienda: la pasarela no distingue débito de crédito.
export const MEDIO_PAGO_ONLINE = 'Pago online'

function traducirError(error, mensaje) {
  if (error?.code === CODIGO_PERMISO_INSUFICIENTE) {
    return errorDeApi('No tenés permiso para ver informes', 403)
  }
  if (error?.code === '22023') return errorDeApi(error.message, 400)
  return errorDeApi(mensaje, 500)
}

/**
 * Lo cobrado agrupado (informe_ingresos, 0068).
 *
 * @param {Object} filtros
 * @param {string} filtros.desde 'AAAA-MM-DD'.
 * @param {string} filtros.hasta 'AAAA-MM-DD'.
 * @param {'semana'|'mes'|'total'} filtros.agrupacion
 * @param {string[]} [filtros.sucursales] IDs de depósito; vacío = todas.
 * @param {string[]} [filtros.medios] Nombres de medio; vacío = todos.
 * @returns {Promise<Array<Object>>} Filas por período, sucursal, fuente y medio.
 */
export async function obtenerIngresos({ desde, hasta, agrupacion, sucursales = [], medios = [] }) {
  const { data, error } = await supabase.rpc('informe_ingresos', {
    p_desde: desde,
    p_hasta: hasta,
    p_agrupacion: agrupacion,
    p_deposito_ids: sucursales.length ? sucursales : null,
    p_medios: medios.length ? medios : null,
  })
  if (error) throw traducirError(error, 'No pudimos calcular los ingresos')
  return (data ?? []).map((f) => ({ ...f, monto: Number(f.monto) }))
}

/**
 * Lo pagado agrupado (informe_egresos, 0069): órdenes de pago a proveedores y
 * egresos de caja, sin anulados.
 *
 * @param {Object} filtros Mismos que obtenerIngresos.
 * @returns {Promise<Array<Object>>} Filas por período, sucursal, fuente y medio.
 */
export async function obtenerEgresos({ desde, hasta, agrupacion, sucursales = [], medios = [] }) {
  const { data, error } = await supabase.rpc('informe_egresos', {
    p_desde: desde,
    p_hasta: hasta,
    p_agrupacion: agrupacion,
    p_deposito_ids: sucursales.length ? sucursales : null,
    p_medios: medios.length ? medios : null,
  })
  if (error) throw traducirError(error, 'No pudimos calcular los egresos')
  return (data ?? []).map((f) => ({ ...f, monto: Number(f.monto) }))
}

/**
 * Lo facturado agrupado (informe_facturado, 0068).
 *
 * @param {Object} filtros Mismos que obtenerIngresos, sin medios.
 * @returns {Promise<Array<Object>>} Filas por período, sucursal y tipo de comprobante.
 */
export async function obtenerFacturado({ desde, hasta, agrupacion, sucursales = [] }) {
  const { data, error } = await supabase.rpc('informe_facturado', {
    p_desde: desde,
    p_hasta: hasta,
    p_agrupacion: agrupacion,
    p_deposito_ids: sucursales.length ? sucursales : null,
  })
  if (error) throw traducirError(error, 'No pudimos calcular lo facturado')
  return (data ?? []).map((f) => ({ ...f, monto: Number(f.monto), cantidad: Number(f.cantidad) }))
}

/**
 * Sucursales para el filtro.
 * @returns {Promise<Array<{id: string, nombre: string}>>}
 */
export async function listarSucursalesInforme() {
  const { data, error } = await supabase.from('depositos').select('id, nombre').order('nombre')
  if (error) throw traducirError(error, 'No pudimos cargar las sucursales')
  return data ?? []
}

// Medios activos, sin "Cuenta corriente" (no es plata que entra ni que sale).
async function mediosActivosSinCuentaCorriente() {
  const { data, error } = await supabase.from('medios_pago').select('nombre').eq('activo', true).order('nombre')
  if (error) throw traducirError(error, 'No pudimos cargar los medios de pago')
  return (data ?? [])
    .map((m) => m.nombre)
    .filter((n) => n?.trim().toLowerCase() !== 'cuenta corriente')
}

/**
 * Medios de pago para el filtro: los activos, sin "Cuenta corriente" (no es
 * plata que entró), más "Pago online" de la tienda.
 * @returns {Promise<string[]>} Nombres de medio.
 */
export async function listarMediosInforme() {
  return [...(await mediosActivosSinCuentaCorriente()), MEDIO_PAGO_ONLINE]
}

/**
 * Medios de pago para el filtro de egresos: los activos, sin "Cuenta
 * corriente". "Pago online" es solo de la tienda y no sale plata por ahí.
 * @returns {Promise<string[]>} Nombres de medio.
 */
export async function listarMediosEgresos() {
  return mediosActivosSinCuentaCorriente()
}
