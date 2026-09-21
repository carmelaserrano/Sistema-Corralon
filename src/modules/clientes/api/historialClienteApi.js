// Stub de contrato — implementación real en S3-08.
// Tablas: clientes, ventas, detalle_venta, comprobantes_venta, cobros_venta,
// pedidos_web (0031_base_sprint3.sql).

/**
 * Historial 360° de un cliente: ventas, comprobantes, cobros y pedidos web.
 *
 * @param {string} clienteId
 * @param {Object} [filtros]
 * @param {string} [filtros.desde]
 * @param {string} [filtros.hasta]
 * @returns {Promise<{cliente: Object, ventas: Array, comprobantes: Array, cobros: Array, pedidosWeb: Array}>}
 */
export async function getHistorialCliente() {
  throw new Error('No implementado — ver issue S3-08')
}
