import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi, CODIGO_CHECK_VIOLADO, CODIGO_PERMISO_INSUFICIENTE } from '../../stock/api/errores'

// Tablas: pedidos_web, detalle_pedido_web, historial_estado_pedido
// (0033_base_sprint3.sql). Función: avanzar_estado_pedido
// (0051_estados_pedido_web.sql). El paso a Pagado lo hace el checkout (S3-18).

export const PERMISO_GESTIONAR = 'ecommerce.pedidos.gestionar'

export const ESTADOS_PEDIDO = [
  'Pendiente de pago',
  'Pagado',
  'En preparación',
  'Listo para retirar',
  'Enviado',
  'Entregado',
  'Cancelado',
]

// SQLSTATE que usa avanzar_estado_pedido para "transición no permitida".
const CODIGO_TRANSICION_INVALIDA = '22023'

const COLUMNAS_PEDIDO = 'id, numero, estado, total, tipo_entrega, created_at'

const COLUMNAS_PEDIDO_BACKOFFICE = `
  ${COLUMNAS_PEDIDO},
  referencia_pago,
  cliente:clientes(id, tipo_persona, nombre, apellido, razon_social)
`

/**
 * Transiciones que una persona puede hacer desde el backoffice. Espejo de
 * transicion_pedido_permitida (0051): la base es la que decide, esto solo
 * sirve para mostrar los botones correctos.
 *
 * @param {{estado: string, tipo_entrega: 'retiro'|'envio'}} pedido
 * @returns {Array<string>} Estados a los que puede pasar (vacío si es final).
 */
export function siguientesEstados(pedido) {
  switch (pedido?.estado) {
    case 'Pendiente de pago':
      return ['Cancelado']
    case 'Pagado':
      return ['En preparación', 'Cancelado']
    case 'En preparación':
      return [pedido.tipo_entrega === 'envio' ? 'Enviado' : 'Listo para retirar']
    case 'Listo para retirar':
    case 'Enviado':
      return ['Entregado']
    default:
      return []
  }
}

/**
 * Arma la línea de tiempo del pedido (CA-02) con el camino que corresponde a
 * su tipo de entrega. Cada paso trae la fecha del último cambio registrado a
 * ese estado; los pedidos seed de S3-00 no tienen historial, así que el paso
 * inicial toma la fecha de creación y el estado actual puede quedar sin fecha.
 *
 * @param {{estado: string, tipo_entrega: string, created_at: string}} pedido
 * @param {Array<{estado_nuevo: string, motivo?: string, created_at: string}>} historial
 * @returns {Array<{estado: string, fecha: string|null, motivo: string|null, completado: boolean, actual: boolean}>}
 */
export function armarLineaDeTiempo(pedido, historial = []) {
  const entrega = pedido.tipo_entrega === 'envio' ? 'Enviado' : 'Listo para retirar'
  const camino = ['Pendiente de pago', 'Pagado', 'En preparación', entrega, 'Entregado']

  const ultimoCambio = new Map()
  for (const cambio of [...historial].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    ultimoCambio.set(cambio.estado_nuevo, cambio)
  }

  const paso = (estado, completado, actual) => {
    const cambio = ultimoCambio.get(estado)
    const fecha = cambio?.created_at ?? (estado === 'Pendiente de pago' ? pedido.created_at : null)
    return { estado, fecha, motivo: cambio?.motivo ?? null, completado, actual }
  }

  if (pedido.estado === 'Cancelado') {
    // Se muestran los pasos por los que sí pasó, y después la cancelación.
    const alcanzados = camino.filter((estado, i) => i === 0 || ultimoCambio.has(estado))
    return [...alcanzados.map((estado) => paso(estado, true, false)), paso('Cancelado', true, true)]
  }

  const indiceActual = camino.indexOf(pedido.estado)
  return camino.map((estado, i) => paso(estado, i <= indiceActual, i === indiceActual))
}

function manejarErrorAvance(error) {
  if (error?.code === CODIGO_TRANSICION_INVALIDA) {
    throw errorDeApi(error.message || 'Esa transición de estado no está permitida', 409)
  }
  if (error?.code === CODIGO_CHECK_VIOLADO) {
    if (error.message?.includes('motivo es obligatorio')) {
      const conCampo = errorDeApi('El motivo es obligatorio para cancelar', 400)
      conCampo.campo = 'motivo'
      throw conCampo
    }
    throw errorDeApi('Revisá los datos: no cumplen una validación del sistema', 400)
  }
  if (error?.code === CODIGO_PERMISO_INSUFICIENTE) {
    throw errorDeApi(error.message || 'No tenés permiso para gestionar este pedido', 403)
  }
  throw error
}

/**
 * Pedidos del cliente web logueado (CA-01), del más reciente al más antiguo.
 * Se filtra por cliente además de la RLS para que un usuario interno que
 * entra a la tienda vea solo sus compras y no todos los pedidos.
 *
 * @param {string} clienteId ID del cliente vinculado a la sesión.
 * @returns {Promise<Array<{id: string, numero: number, estado: string, total: number, tipo_entrega: string, created_at: string}>>}
 * @throws {Error} Error de Supabase al consultar.
 */
export async function listarMisPedidos(clienteId) {
  if (!clienteId) return []
  const { data, error } = await supabase
    .from('pedidos_web')
    .select(COLUMNAS_PEDIDO)
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Pedido con sus ítems e historial de estados (CA-02). Devuelve null si el
 * pedido no existe o la RLS no lo deja ver (CA-05: pedido de otro cliente).
 *
 * @param {string} pedidoId
 * @returns {Promise<{pedido: Object, items: Array<Object>, historial: Array<Object>}|null>}
 * @throws {Error} Error de Supabase al consultar.
 */
export async function obtenerSeguimientoPedido(pedidoId) {
  if (!pedidoId) return null
  const { data: pedido, error } = await supabase
    .from('pedidos_web')
    .select(COLUMNAS_PEDIDO)
    .eq('id', pedidoId)
    .maybeSingle()
  if (error) throw error
  if (!pedido) return null

  const [items, historial] = await Promise.all([
    supabase
      .from('detalle_pedido_web')
      .select('id, cantidad, precio_unitario, subtotal, producto:productos(id, nombre, sku)')
      .eq('pedido_id', pedidoId),
    listarHistorialPedido(pedidoId),
  ])
  if (items.error) throw items.error
  return { pedido, items: items.data ?? [], historial }
}

/**
 * Historial de cambios de estado de un pedido, del más antiguo al más nuevo.
 *
 * @param {string} pedidoId
 * @returns {Promise<Array<{id: string, estado_anterior: string|null, estado_nuevo: string, motivo: string|null, created_at: string}>>}
 * @throws {Error} Error de Supabase al consultar.
 */
export async function listarHistorialPedido(pedidoId) {
  const { data, error } = await supabase
    .from('historial_estado_pedido')
    .select('id, estado_anterior, estado_nuevo, motivo, created_at')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Todos los pedidos web para el backoffice, con el cliente embebido.
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.estado] Uno de ESTADOS_PEDIDO.
 * @returns {Promise<Array<Object>>}
 * @throws {Error} Error de Supabase al consultar.
 */
export async function listarPedidosWeb({ estado } = {}) {
  let consulta = supabase.from('pedidos_web').select(COLUMNAS_PEDIDO_BACKOFFICE)
  if (estado) consulta = consulta.eq('estado', estado)
  const { data, error } = await consulta.order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Consulta el permiso ecommerce.pedidos.gestionar del usuario autenticado.
 * @returns {Promise<boolean>} true si puede avanzar y cancelar pedidos.
 * @throws {Error} Error de Supabase al consultar el permiso.
 */
export async function puedeGestionarPedidos() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', { p_nombre: PERMISO_GESTIONAR })
  if (error) throw error
  return data === true
}

/**
 * Pasa el pedido al estado indicado (CA-03). Cancelado exige motivo y libera
 * la reserva de stock (CA-04); Entregado egresa el stock reservado. La base
 * valida la transición y deja la fila en historial_estado_pedido.
 *
 * @param {string} pedidoId
 * @param {string} estado Estado destino.
 * @param {string} [motivo] Obligatorio para Cancelado.
 * @returns {Promise<Object>} Pedido actualizado.
 * @throws {Error} status 400 (motivo faltante), 403 (sin permiso) o 409 (transición inválida).
 */
export async function avanzarEstadoPedido(pedidoId, estado, motivo) {
  if (!pedidoId) throw errorDeApi('Falta el pedido', 400)
  if (!ESTADOS_PEDIDO.includes(estado)) throw errorDeApi('Estado de pedido no válido', 400)
  const motivoLimpio = motivo?.trim() || null
  if (estado === 'Cancelado' && !motivoLimpio) {
    const conCampo = errorDeApi('El motivo es obligatorio para cancelar', 400)
    conCampo.campo = 'motivo'
    throw conCampo
  }

  const { data, error } = await supabase.rpc('avanzar_estado_pedido', {
    p_pedido: pedidoId,
    p_estado: estado,
    p_motivo: motivoLimpio,
  })
  if (error) manejarErrorAvance(error)
  return data
}
