// Stub de contrato — implementación real en S3-18.
// Funciones SQL a crear: crear_pedido_web(p_datos), confirmar_pago_pedido(...).
// Edge Functions a crear: crear-preferencia-pago, webhook-pago.
// Usa comprometer_stock, liberar_stock (0031_base_sprint3.sql).

/** @param {Object} datos {tipo_entrega, domicilio_id?} @returns {Promise<Object>} Pedido en "Pendiente de pago". */
export async function crearPedidoWeb() {
  throw new Error('No implementado — ver issue S3-18')
}

/** @param {string} pedidoId @returns {Promise<{init_point: string}>} URL de la pasarela. */
export async function iniciarPago() {
  throw new Error('No implementado — ver issue S3-18')
}
