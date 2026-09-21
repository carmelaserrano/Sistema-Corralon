// Stub de contrato — implementación real en S3-16.
// Tablas: pedidos_web, historial_estado_pedido (0031_base_sprint3.sql).
// Función SQL a crear: avanzar_estado_pedido(p_pedido, p_estado, p_motivo).

/** @returns {Promise<Array<Object>>} Pedidos del cliente logueado. */
export async function listarMisPedidos() {
  throw new Error('No implementado — ver issue S3-16')
}

/** @returns {Promise<Array<Object>>} Todos los pedidos (backoffice). */
export async function listarPedidosWeb() {
  throw new Error('No implementado — ver issue S3-16')
}

/** @param {string} pedidoId @param {string} estado @param {string} [motivo] @returns {Promise<Object>} */
export async function avanzarEstadoPedido() {
  throw new Error('No implementado — ver issue S3-16')
}
