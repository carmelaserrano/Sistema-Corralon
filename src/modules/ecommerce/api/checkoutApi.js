import { supabase } from '../../../lib/supabaseClient'

async function errorFuncion(error, mensaje) {
  try {
    const cuerpo = await error?.context?.json()
    return new Error(cuerpo?.error || cuerpo?.message || mensaje)
  } catch {
    return new Error(error?.message || mensaje)
  }
}

/**
 * Crea y reserva un pedido a partir del carrito persistido del usuario.
 * @param {{checkoutId: string, tipoEntrega: 'retiro'|'envio', domicilioId?: string|null}} datos
 * @returns {Promise<Object>} Pedido en estado Pendiente de pago.
 */
export async function crearPedidoWeb({ checkoutId, tipoEntrega, domicilioId = null }) {
  if (!checkoutId) throw new Error('Falta el identificador del checkout')
  if (!['retiro', 'envio'].includes(tipoEntrega)) throw new Error('Elegí retiro o envío')
  if (tipoEntrega === 'envio' && !domicilioId) throw new Error('Elegí un domicilio para el envío')
  const { data, error } = await supabase.rpc('crear_pedido_web', {
    p_datos: { checkout_id: checkoutId, tipo_entrega: tipoEntrega, domicilio_id: tipoEntrega === 'envio' ? domicilioId : null },
  })
  if (error) throw error
  if (!data?.id) throw new Error('El servidor no devolvió el pedido creado')
  return data
}

/**
 * Solicita a la Edge Function una preferencia segura de Mercado Pago.
 * @param {string} pedidoId ID del pedido pendiente.
 * @returns {Promise<{init_point: string, preference_id: string}>} URL y referencia de la pasarela.
 */
export async function iniciarPago(pedidoId) {
  if (!pedidoId) throw new Error('Falta el pedido a pagar')
  const { data, error } = await supabase.functions.invoke('crear-preferencia-pago', { body: { pedido_id: pedidoId } })
  if (error) throw await errorFuncion(error, 'No pudimos iniciar el pago')
  if (!data?.init_point) throw new Error('La pasarela no devolvió una dirección de pago')
  return data
}

/**
 * Envía una decisión de la pasarela simulada. Solo se acepta cuando
 * PAGO_SIMULADO=true en la Edge Function.
 * @param {string} pedidoId ID del pedido.
 * @param {'approved'|'rejected'} estado Resultado elegido por QA.
 * @returns {Promise<Object>} Pedido actualizado.
 */
export async function resolverPagoSimulado(pedidoId, estado) {
  if (!pedidoId) throw new Error('Falta el pedido a pagar')
  if (!['approved', 'rejected'].includes(estado)) throw new Error('Resultado de pago no válido')
  const { data, error } = await supabase.functions.invoke('webhook-pago', {
    body: { simulated: true, pedido_id: pedidoId, status: estado },
  })
  if (error) throw await errorFuncion(error, 'No pudimos procesar el pago simulado')
  if (!data?.pedido?.id) throw new Error('El servidor no confirmó el resultado del pago')
  return data.pedido
}

/**
 * Solicita a la Edge Function que busque y reconcilie el pago del pedido
 * consultando directamente a Mercado Pago. Requiere sesión del usuario.
 * @param {string} pedidoId ID del pedido a reconciliar.
 * @returns {Promise<Object>} Pedido actualizado o mensaje informativo.
 */
export async function reconciliarPago(pedidoId) {
  if (!pedidoId) throw new Error('Falta el pedido a reconciliar')
  const { data, error } = await supabase.functions.invoke('webhook-pago', {
    body: { action: 'reconcile', pedido_id: pedidoId },
  })
  if (error) throw await errorFuncion(error, 'No pudimos reconciliar el pago')
  return data
}

/**
 * Obtiene el estado autoritativo de un pedido propio para mostrar el retorno.
 * @param {string} pedidoId ID del pedido.
 * @returns {Promise<Object|null>} Pedido visible para el cliente, o null.
 */
export async function obtenerPedido(pedidoId) {
  if (!pedidoId) return null
  const { data, error } = await supabase
    .from('pedidos_web')
    .select('id, numero, estado, total, tipo_entrega, pago_estado, pago_motivo, vence_at, referencia_pago, created_at')
    .eq('id', pedidoId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}
