// Stub de contrato — implementación real en S3-04.

/**
 * Valida filas de un CSV contra las reglas de `clientes` (pura, testeable).
 *
 * @param {Array<Object>} filas
 * @returns {Array<{fila: Object, estado: 'nueva'|'duplicada'|'error', motivo?: string}>}
 */
export function validarFilas() {
  throw new Error('No implementado — ver issue S3-04')
}

/**
 * Importa las filas ya validadas como "nueva", en una única transacción.
 * Usa la función SQL `importar_clientes(p_filas jsonb)` (a crear en S3-04).
 *
 * @param {Array<Object>} filasNuevas
 * @returns {Promise<{importadas: number, duplicadas: number, conError: number}>}
 */
export async function importarClientes() {
  throw new Error('No implementado — ver issue S3-04')
}
