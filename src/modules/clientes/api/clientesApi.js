// Stub de contrato — implementación real en S3-01.
// Tablas: clientes, condiciones_iva, tipos_cliente (0031_base_sprint3.sql).

/**
 * Lista clientes, con filtro de texto en vivo (nombre, razón social, DNI o CUIT).
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.search]
 * @param {number} [filtros.pagina] Página de a 20 (CA-08 de S3-01).
 * @returns {Promise<Array<Object>>}
 */
export async function listarClientes() {
  throw new Error('No implementado — ver issue S3-01')
}

/**
 * Da de alta un cliente.
 *
 * @param {Object} datos Ver columnas de `clientes` en 0031_base_sprint3.sql.
 * @returns {Promise<Object>} Cliente creado.
 * @throws {Error} 400 datos inválidos; 409 documento duplicado.
 */
export async function crearCliente() {
  throw new Error('No implementado — ver issue S3-01')
}

/**
 * Modifica un cliente existente. El número no es editable.
 *
 * @param {string} id
 * @param {Object} datos
 * @returns {Promise<Object>} Cliente actualizado.
 */
export async function actualizarCliente() {
  throw new Error('No implementado — ver issue S3-01')
}
