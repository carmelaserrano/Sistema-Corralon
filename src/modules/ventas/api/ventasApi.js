// Stub de contrato — implementación real en S3-09 (base) y S3-10 (stock).
// Usa calcular_precio_venta, validar_descuento_manual,
// cliente_habilitado_para_vender, v_stock_disponible, comprometer_stock
// (0031_base_sprint3.sql).

/** @param {string} texto Nombre, DNI o CUIT. @returns {Promise<Array<Object>>} Solo clientes habilitados. */
export async function buscarClientes() {
  throw new Error('No implementado — ver issue S3-09')
}

/** @param {string} depositoId @param {string} texto @returns {Promise<Array<Object>>} Con stock disponible. */
export async function buscarArticulos() {
  throw new Error('No implementado — ver issue S3-09')
}

/**
 * Registra una venta completa en una transacción (función SQL
 * `registrar_venta`, a crear en S3-09/S3-10).
 *
 * @param {Object} cabecera {deposito_id, cliente_id, observaciones}
 * @param {Array<Object>} items {producto_id, cantidad, precio_unitario, descuento_pct?, autorizacion_descuento_id?}
 * @returns {Promise<Object>} Venta creada, estado "Pendiente".
 * @throws {Error} 422 STOCK_INSUFICIENTE con detalle por línea.
 */
export async function registrarVenta() {
  throw new Error('No implementado — ver issue S3-09')
}
