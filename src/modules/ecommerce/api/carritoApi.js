// Stub de contrato — implementación real en S3-17.
// Tablas: carritos, items_carrito (0031_base_sprint3.sql).

/** @param {string} clienteId @returns {Promise<Array<Object>>} */
export async function obtenerCarrito() {
  throw new Error('No implementado — ver issue S3-17')
}

/** @param {string} clienteId @param {Array<Object>} items @returns {Promise<void>} */
export async function guardarItems() {
  throw new Error('No implementado — ver issue S3-17')
}

/** @param {string} clienteId @param {Array<Object>} itemsEnMemoria Fusiona el carrito anónimo con el guardado. @returns {Promise<Array<Object>>} */
export async function fusionarCarrito() {
  throw new Error('No implementado — ver issue S3-17')
}
