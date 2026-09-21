// Stub de contrato — implementación real en S3-15.
// Función SQL a crear: registrar_cliente_web(p_datos jsonb) security definer.
// Políticas RLS de cliente web ya definidas en 0031_base_sprint3.sql.

/** @param {Object} datos {nombre, apellido, documento, email, telefono, password} @returns {Promise<Object>} */
export async function registrarClienteWeb() {
  throw new Error('No implementado — ver issue S3-15')
}

/** @param {string} email @param {string} password @returns {Promise<Object>} Cliente vinculado a la sesión. */
export async function ingresarClienteWeb() {
  throw new Error('No implementado — ver issue S3-15')
}

/** @param {Object} datos {telefono} @returns {Promise<Object>} */
export async function actualizarMisDatos() {
  throw new Error('No implementado — ver issue S3-15')
}
