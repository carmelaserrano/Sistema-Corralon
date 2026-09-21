// Stub de contrato — implementación real en S3-13.
// Tablas: cobros_venta, detalle_cobro, medios_pago (0031_base_sprint3.sql).

/**
 * Registra el cobro de una venta (función SQL `registrar_cobro`, a crear en S3-13).
 *
 * @param {string} ventaId
 * @param {Array<Object>} detalle {medio_pago_id, monto, monto_recibido?, referencia?}
 * @returns {Promise<Object>} Cobro registrado.
 * @throws {Error} 400 si la suma no cierra con el total de la venta.
 */
export async function registrarCobro() {
  throw new Error('No implementado — ver issue S3-13')
}
