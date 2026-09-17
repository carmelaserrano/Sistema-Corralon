// Stub de contrato — implementación real en S3-12.
// Tablas: comprobantes_venta, puntos_venta, numeracion_comprobantes.
// Función: siguiente_numero_comprobante (0031_base_sprint3.sql).

/**
 * Emite un comprobante (función SQL `emitir_comprobante`, a crear en S3-12).
 *
 * @param {string} ventaId
 * @param {'factura'|'nota_credito'|'nota_debito'} tipo
 * @param {Array<Object>} [items] Requerido para Nota de Crédito parcial.
 * @returns {Promise<Object>} Comprobante emitido, con CAE simulado.
 */
export async function emitirComprobante() {
  throw new Error('No implementado — ver issue S3-12')
}

/** @param {string} comprobanteId @returns {Promise<Blob>} PDF del comprobante. */
export async function descargarComprobantePdf() {
  throw new Error('No implementado — ver issue S3-12')
}
