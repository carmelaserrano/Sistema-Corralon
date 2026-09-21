// Stub de contrato — implementación real en S3-05.
// Tablas: listas_precio, precios_lista, tipos_cliente (0031_base_sprint3.sql).

/** @returns {Promise<Array<Object>>} */
export async function listarListasPrecio() {
  throw new Error('No implementado — ver issue S3-05')
}

/** @param {string} nombre @returns {Promise<Object>} */
export async function crearListaPrecio() {
  throw new Error('No implementado — ver issue S3-05')
}

/** @param {string} id @param {Object} datos @returns {Promise<Object>} */
export async function editarListaPrecio() {
  throw new Error('No implementado — ver issue S3-05')
}

/** @param {string} id @returns {Promise<Object>} */
export async function desactivarListaPrecio() {
  throw new Error('No implementado — ver issue S3-05')
}

/** @param {string} listaId @param {string} productoId @param {number} precio @returns {Promise<Object>} */
export async function guardarPrecio() {
  throw new Error('No implementado — ver issue S3-05')
}

/** @param {string} tipoClienteId @param {string} listaId @returns {Promise<Object>} */
export async function asignarListaATipo() {
  throw new Error('No implementado — ver issue S3-05')
}
