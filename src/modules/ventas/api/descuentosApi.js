// Stub de contrato — implementación real en S3-06.
// Tablas: reglas_descuento, parametros_ventas (0031_base_sprint3.sql).
// Reemplaza con `create or replace` las funciones calcular_precio_venta,
// validar_descuento_manual y autorizar_descuento definidas en la base.

/** @returns {Promise<Array<Object>>} */
export async function listarReglasDescuento() {
  throw new Error('No implementado — ver issue S3-06')
}

/** @param {Object} regla {tipo_aplicacion, referencia_id, porcentaje} @returns {Promise<Object>} */
export async function crearReglaDescuento() {
  throw new Error('No implementado — ver issue S3-06')
}

/** @param {number} limite Porcentaje límite para exigir autorización. @returns {Promise<void>} */
export async function setLimiteDescuentoManual() {
  throw new Error('No implementado — ver issue S3-06')
}
