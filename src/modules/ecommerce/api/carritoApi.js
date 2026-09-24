import { supabase } from '../../../lib/supabaseClient'

/** Normaliza y acumula cantidades; cero elimina una línea al guardar.
 * @param {Array<{productoId: string, cantidad: number}>} items
 * @returns {Array<{producto_id: string, cantidad: number}>}
 */
export function normalizarItems(items) {
  if (!Array.isArray(items)) throw new Error('El carrito debe ser una lista de productos')
  const cantidades = new Map()
  for (const item of items) {
    if (!item || typeof item.productoId !== 'string' || !item.productoId.trim()) {
      throw new Error('Cada producto necesita un identificador')
    }
    if (typeof item.cantidad !== 'number' || !Number.isFinite(item.cantidad) || item.cantidad < 0) {
      throw new Error('La cantidad debe ser un número mayor o igual a cero')
    }
    const cantidad = (cantidades.get(item.productoId) ?? 0) + item.cantidad
    if (!Number.isFinite(cantidad)) throw new Error('La cantidad es demasiado grande')
    cantidades.set(item.productoId, cantidad)
  }
  return [...cantidades].filter(([, cantidad]) => cantidad > 0)
    .map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
}

function convertirItems(data) {
  if (!Array.isArray(data)) throw new Error('No se pudo leer la respuesta del carrito')
  return data.map((item) => ({
    productoId: item.producto_id,
    cantidad: Number(item.cantidad),
    nombre: item.nombre,
    imagenUrl: item.imagen_url,
    precioUnitario: item.precio === null ? null : Number(item.precio),
    disponible: item.disponible,
    motivo: item.motivo,
    ajustado: item.ajustado,
    subtotal: item.disponible ? Math.round(Number(item.precio) * Number(item.cantidad) * 100) / 100 : 0,
  }))
}

/** Consulta precios y ajusta las cantidades al stock web sin reservarlo.
 * Conserva las líneas no disponibles, excluidas del total.
 * @param {Array<{productoId: string, cantidad: number}>} items
 * @returns {Promise<Array<Object>>} Líneas con precio, imagen y disponibilidad.
 */
export async function validarItems(items) {
  const p_items = normalizarItems(items)
  if (!p_items.length) return []
  const { data, error } = await supabase.rpc('validar_carrito_web', { p_items })
  if (error) throw error
  return convertirItems(data)
}

/** Obtiene el carrito propio con precios y disponibilidad actuales.
 * @param {string} clienteId ID del cliente vinculado al usuario autenticado.
 * @returns {Promise<Array<Object>>} Líneas del carrito; [] si no existe.
 */
export async function obtenerCarrito(clienteId) {
  if (!clienteId) throw new Error('Falta el cliente del carrito')
  const { data: carrito, error } = await supabase.from('carritos')
    .select('id').eq('cliente_id', clienteId).maybeSingle()
  if (error) throw error
  if (!carrito) return []
  const { data, error: errorItems } = await supabase.from('items_carrito')
    .select('producto_id, cantidad').eq('carrito_id', carrito.id).order('created_at')
  if (errorItems) throw errorItems
  return validarItems(data.map((item) => ({ productoId: item.producto_id, cantidad: Number(item.cantidad) })))
}

async function persistir(clienteId, items, fusionId) {
  if (!clienteId) throw new Error('Falta el cliente del carrito')
  const { data, error } = await supabase.rpc('guardar_carrito_web', {
    p_cliente_id: clienteId,
    p_items: normalizarItems(items),
    p_fusion_id: fusionId,
  })
  if (error) throw error
  return convertirItems(data)
}

/** Reemplaza atómicamente las líneas del carrito propio; [] lo vacía.
 * @param {string} clienteId ID del cliente autenticado.
 * @param {Array<{productoId: string, cantidad: number}>} items Estado completo deseado.
 * @returns {Promise<Array<Object>>} Estado guardado con cantidades validadas por el servidor.
 */
export async function guardarItems(clienteId, items) {
  return persistir(clienteId, items, null)
}

/** Suma el carrito visitante al guardado y aplica el tope por stock.
 * @param {string} clienteId ID del cliente autenticado.
 * @param {Array<{productoId: string, cantidad: number}>} itemsEnMemoria Carrito visitante.
 * @param {string} [fusionId] UUID estable para reintentar sin duplicar cantidades.
 * @returns {Promise<Array<Object>>} Carrito fusionado y enriquecido.
 */
export async function fusionarCarrito(clienteId, itemsEnMemoria, fusionId = crypto.randomUUID()) {
  return persistir(clienteId, itemsEnMemoria, fusionId)
}
