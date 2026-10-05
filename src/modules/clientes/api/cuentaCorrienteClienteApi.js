import { supabase } from '../../../lib/supabaseClient'

/**
 * Obtiene el resumen de crédito del cliente:
 * - límite de crédito
 * - plazo en días
 * - saldo deudor acumulado
 * - crédito disponible
 * - cantidad de facturas pendientes
 *
 * @param {string} clienteId
 * @returns {Promise<{
 *   cliente_id: string,
 *   habilita_cta_cte: boolean,
 *   limite_credito: number,
 *   plazo_credito_dias: number,
 *   saldo_deudor: number,
 *   credito_disponible: number,
 *   facturas_pendientes_count: number
 * }>}
 */
export async function obtenerResumenCtaCte(clienteId) {
  if (!clienteId) throw new Error('El ID de cliente es obligatorio')

  const { data, error } = await supabase.rpc('obtener_resumen_cta_cte_cliente', {
    p_cliente_id: clienteId,
  })

  if (error) throw error
  return data
}

/**
 * Lista los movimientos del libro mayor de la cuenta corriente de un cliente.
 *
 * @param {string} clienteId
 * @param {{desde?: string, hasta?: string}} [filtros]
 * @returns {Promise<Array<{
 *   cliente_id: string,
 *   fecha: string,
 *   tipo_movimiento: 'factura' | 'recibo' | 'nota_credito',
 *   comprobante_id: string,
 *   comprobante: string,
 *   referencia: string,
 *   debe: number,
 *   haber: number,
 *   saldo_acumulado: number,
 *   created_at: string
 * }>>}
 */
export async function listarMovimientosCtaCte(clienteId, { desde = '', hasta = '' } = {}) {
  if (!clienteId) throw new Error('El ID de cliente es obligatorio')

  let consulta = supabase
    .from('vw_cuenta_corriente_cliente')
    .select('*')
    .eq('cliente_id', clienteId)

  if (desde) consulta = consulta.gte('fecha', desde)
  if (hasta) consulta = consulta.lte('fecha', hasta)

  const { data, error } = await consulta.order('fecha', { ascending: false }).order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Lista las ventas o facturas en cuenta corriente con saldo pendiente de cancelación.
 *
 * @param {string} clienteId
 * @returns {Promise<Array<{
 *   venta_id: string,
 *   numero: number,
 *   fecha: string,
 *   comprobante: string,
 *   total_credito: number,
 *   total_imputado: number,
 *   saldo_pendiente: number
 * }>>}
 */
export async function listarVentasPendientesCtaCte(clienteId) {
  if (!clienteId) throw new Error('El ID de cliente es obligatorio')

  const { data, error } = await supabase.rpc('listar_ventas_pendientes_cta_cte', {
    p_cliente_id: clienteId,
  })

  if (error) throw error
  return data ?? []
}

/**
 * Registra un recibo de cobranza en cuenta corriente imputando ventas pendientes.
 *
 * @param {{
 *   clienteId: string,
 *   fecha?: string,
 *   medios: Array<{ medio_pago_id: string, monto: number, referencia?: string }>,
 *   imputaciones?: Array<{ venta_id: string, monto_imputado: number }>,
 *   observaciones?: string
 * }} payload
 * @returns {Promise<{
 *   id: string,
 *   numero: number,
 *   total: number,
 *   fecha: string,
 *   total_imputado: number,
 *   saldo_a_cuenta: number
 * }>}
 */
export async function registrarReciboCobranza({
  clienteId,
  fecha,
  medios,
  imputaciones = [],
  observaciones = '',
}) {
  if (!clienteId) throw new Error('El cliente es obligatorio')
  if (!medios?.length) throw new Error('Debe especificar al menos un medio de cobro')

  const { data, error } = await supabase.rpc('registrar_recibo_cobranza', {
    p_cliente_id: clienteId,
    p_fecha: fecha || new Date().toISOString().slice(0, 10),
    p_medios: medios,
    p_imputaciones: imputaciones,
    p_observaciones: observaciones || null,
  })

  if (error) throw error
  return data
}

/**
 * Actualiza las condiciones de crédito de un cliente (límite, plazo y habilitación).
 *
 * @param {string} clienteId
 * @param {{
 *   limite_credito?: number,
 *   plazo_credito_dias?: number,
 *   habilita_cta_cte?: boolean
 * }} condiciones
 */
export async function actualizarCondicionesCredito(clienteId, condiciones) {
  if (!clienteId) throw new Error('El cliente es obligatorio')

  const { data, error } = await supabase
    .from('clientes')
    .update({
      ...(condiciones.limite_credito !== undefined && { limite_credito: Number(condiciones.limite_credito) }),
      ...(condiciones.plazo_credito_dias !== undefined && { plazo_credito_dias: Number(condiciones.plazo_credito_dias) }),
      ...(condiciones.habilita_cta_cte !== undefined && { habilita_cta_cte: Boolean(condiciones.habilita_cta_cte) }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', clienteId)
    .select('id, habilita_cta_cte, limite_credito, plazo_credito_dias')
    .single()

  if (error) throw error
  return data
}
