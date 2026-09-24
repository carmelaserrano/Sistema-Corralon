/** Delega la transición al RPC transaccional e idempotente de la base. */
export async function procesarPago(rpc, { pedidoId, referencia, estado, motivo = null }) {
  const { data, error } = await rpc('confirmar_pago_pedido', {
    p_pedido: pedidoId,
    p_referencia: String(referencia),
    p_estado: estado,
    p_motivo: motivo,
  })
  if (error) throw error
  return data
}
