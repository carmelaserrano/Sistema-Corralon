// Stub de contrato — implementación real en S3-03.
// Tabla: domicilios_cliente (0031_base_sprint3.sql).

/** @param {string} clienteId @returns {Promise<Array<Object>>} */
export async function listarDomicilios() {
  throw new Error('No implementado — ver issue S3-03')
}

/** @param {string} clienteId @param {Object} datos @returns {Promise<Object>} */
export async function crearDomicilio() {
  throw new Error('No implementado — ver issue S3-03')
}

/** @param {string} id @param {Object} datos @returns {Promise<Object>} */
export async function actualizarDomicilio() {
  throw new Error('No implementado — ver issue S3-03')
}

/** @param {string} id @returns {Promise<Object>} Domicilio marcado como principal. */
export async function marcarPrincipal() {
  throw new Error('No implementado — ver issue S3-03')
}

/** @param {string} id Baja lógica (`activo = false`). @returns {Promise<void>} */
export async function darDeBaja() {
  throw new Error('No implementado — ver issue S3-03')
}
