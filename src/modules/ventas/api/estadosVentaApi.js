import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi, CODIGO_CHECK_VIOLADO, CODIGO_PERMISO_INSUFICIENTE } from '../../stock/api/errores'

// Tablas: ventas, historial_estado_venta, comprobantes_venta
// (0031_base_sprint3.sql). Función: cambiar_estado_venta (0037_estados_venta.sql).

export const PERMISO_ENTREGAR = 'ventas.entregar'
export const PERMISO_ANULAR = 'ventas.anular'

// SQLSTATE que usa cambiar_estado_venta para "transición no permitida" y
// para el caso puntual de CA-05 (Facturada → Anulada por el camino manual).
// No está en stock/api/errores.js porque es propio de esta transición, no
// un código compartido entre módulos.
const CODIGO_TRANSICION_INVALIDA = '22023'

const COLUMNAS_VENTA = `
  id,
  numero,
  estado,
  total,
  observaciones,
  created_at,
  cliente:clientes(id, tipo_persona, nombre, apellido, razon_social)
`

function errorConCampo(mensaje, status, campo) {
  const error = errorDeApi(mensaje, status)
  error.campo = campo
  return error
}

// CA-01: "hasta" es una fecha (sin hora); comparar directo contra
// created_at (timestamptz) dejaría afuera las ventas del propio día
// "hasta" (Postgres lo interpreta como las 00:00). Se compara contra el
// inicio del día siguiente en su lugar, así el día completo queda incluido.
function finDelDiaSiguiente(fecha) {
  const fin = new Date(`${fecha}T00:00:00`)
  fin.setDate(fin.getDate() + 1)
  return fin.toISOString()
}

function manejarErrorCambioEstado(error) {
  if (error?.code === CODIGO_TRANSICION_INVALIDA) {
    // CA-05: caso puntual, con una marca aparte para que la pantalla pueda
    // ofrecer una acción concreta ("hacé una Nota de Crédito") en vez de
    // mostrar el texto crudo.
    if (error.message?.includes('Nota de Crédito')) {
      const nuevoError = errorDeApi(error.message, 409)
      nuevoError.requiereNotaCredito = true
      throw nuevoError
    }
    throw errorDeApi(error.message || 'Esa transición de estado no está permitida', 409)
  }

  if (error?.code === CODIGO_CHECK_VIOLADO) {
    if (error.message?.includes('motivo es obligatorio')) {
      throw errorConCampo('El motivo es obligatorio para anular', 400, 'motivo')
    }
    throw errorDeApi('Revisá los datos: no cumplen una validación del sistema', 400)
  }

  // Lo levanta cambiar_estado_venta tanto si falta el permiso puntual
  // (ventas.entregar / ventas.anular) como si la venta no existe o la RLS
  // la filtró: los dos casos ya traen un mensaje claro desde la base.
  if (error?.code === CODIGO_PERMISO_INSUFICIENTE) {
    throw errorDeApi(
      error.message || 'No se pudo cambiar el estado: no existe o no tenés permiso',
      403,
    )
  }

  throw error
}

/**
 * Lista las ventas para la pantalla de supervisión (CA-01), con el cliente
 * embebido y filtros opcionales por estado y por fecha.
 *
 * @param {Object} [filtros]
 * @param {'Pendiente'|'Facturada'|'Entregada'|'Anulada'} [filtros.estado]
 * @param {string} [filtros.desde] Fecha (YYYY-MM-DD), inclusive.
 * @param {string} [filtros.hasta] Fecha (YYYY-MM-DD), inclusive.
 * @returns {Promise<Array<Object>>}
 */
export async function listarVentasSupervision({ estado, desde, hasta } = {}) {
  let consulta = supabase.from('ventas').select(COLUMNAS_VENTA)

  if (estado) consulta = consulta.eq('estado', estado)
  if (desde) consulta = consulta.gte('created_at', `${desde}T00:00:00`)
  if (hasta) consulta = consulta.lt('created_at', finDelDiaSiguiente(hasta))

  const { data, error } = await consulta.order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Historial de cambios de estado de una venta, del más reciente al más
 * antiguo (CA-06): lo escriben tanto cambiar_estado_venta como los
 * triggers automáticos de facturación/nota de crédito.
 *
 * @param {string} ventaId
 * @returns {Promise<Array<Object>>}
 */
export async function getHistorialEstadoVenta(ventaId) {
  const { data, error } = await supabase
    .from('historial_estado_venta')
    .select('id, estado_anterior, estado_nuevo, motivo, usuario_id, created_at')
    .eq('venta_id', ventaId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Marca una venta Facturada como Entregada (CA-03): descuenta el stock
 * físico reservado con egresar_comprometido, todo del lado de la base.
 *
 * @param {string} ventaId
 * @returns {Promise<Object>} Venta actualizada.
 * @throws {Error} 409 si la transición no es válida (ej. la venta no está
 *   Facturada); 403 si falta el permiso 'ventas.entregar'.
 */
export async function marcarEntregada(ventaId) {
  const { data, error } = await supabase
    .rpc('cambiar_estado_venta', { p_venta: ventaId, p_estado_nuevo: 'Entregada' })
    .single()

  if (error) manejarErrorCambioEstado(error)
  return data
}

/**
 * Anula una venta Pendiente, con motivo obligatorio (CA-04): libera la
 * reserva de stock con liberar_stock.
 *
 * Una venta Facturada no se puede anular por acá (CA-05): la base rechaza
 * el intento y el error viene con `requiereNotaCredito: true`, para que la
 * pantalla indique que hace falta una Nota de Crédito en su lugar.
 *
 * @param {string} ventaId
 * @param {string} motivo
 * @returns {Promise<Object>} Venta actualizada.
 * @throws {Error} 400 si falta el motivo; 409 si la transición no es
 *   válida; 403 si falta el permiso 'ventas.anular'.
 */
export async function anularVenta(ventaId, motivo) {
  if (!motivo?.trim()) {
    throw errorConCampo('El motivo es obligatorio para anular', 400, 'motivo')
  }

  const { data, error } = await supabase
    .rpc('cambiar_estado_venta', {
      p_venta: ventaId,
      p_estado_nuevo: 'Anulada',
      p_motivo: motivo.trim(),
    })
    .single()

  if (error) manejarErrorCambioEstado(error)
  return data
}

/**
 * Indica si el usuario actual puede marcar ventas como entregadas.
 *
 * @returns {Promise<boolean>} true si tiene el permiso 'ventas.entregar'.
 */
export async function puedeEntregarVentas() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_ENTREGAR,
  })
  if (error) throw error
  return data === true
}

/**
 * Indica si el usuario actual puede anular ventas.
 *
 * @returns {Promise<boolean>} true si tiene el permiso 'ventas.anular'.
 */
export async function puedeAnularVentas() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_ANULAR,
  })
  if (error) throw error
  return data === true
}
