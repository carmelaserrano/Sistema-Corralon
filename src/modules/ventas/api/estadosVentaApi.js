// Stub de contrato — implementación real en S3-07.
// Tablas: ventas, historial_estado_venta, comprobantes_venta (0031_base_sprint3.sql).
// Funciones compartidas: liberar_stock, egresar_comprometido.

/** @param {Object} [filtros] {estado, desde, hasta} @returns {Promise<Array<Object>>} */
export async function listarVentasSupervision() {
  throw new Error('No implementado — ver issue S3-07')
}

/** @param {string} ventaId @returns {Promise<Array<Object>>} */
export async function getHistorialEstadoVenta() {
  throw new Error('No implementado — ver issue S3-07')
}

/** @param {string} ventaId @returns {Promise<Object>} Venta pasada a "Entregada". */
export async function marcarEntregada() {
  throw new Error('No implementado — ver issue S3-07')
}

/** @param {string} ventaId @param {string} motivo @returns {Promise<Object>} Venta pasada a "Anulada". */
export async function anularVenta() {
  throw new Error('No implementado — ver issue S3-07')
}
