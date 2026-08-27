import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi, CODIGO_UUID_INVALIDO } from './errores'

const TABLA = 'alertas_stock'

export const ESTADOS = {
  ACTIVA: 'activa',
  ATENDIDA: 'atendida',
}

const COLUMNAS = `
  id,
  producto_id,
  deposito_id,
  stock_disponible,
  stock_minimo,
  estado,
  generada_en,
  atendida_by,
  atendida_at,
  producto:productos (id, sku, nombre),
  deposito:depositos (id, nombre)
`

// Los codigos AL00x los define la migracion 0010; el resto son estandar de
// PostgreSQL/PostgREST. Mismo criterio que STATUS_POR_CODIGO en movimientosApi.js.
const STATUS_POR_CODIGO = {
  AL001: 404, // la alerta no existe
  AL002: 409, // la alerta ya fue atendida
  PGRST116: 404, // .single() no encontro filas
  [CODIGO_UUID_INVALIDO]: 404,
}

function manejarErrorAlerta(error, mensajePorDefecto) {
  const status = STATUS_POR_CODIGO[error?.code]
  if (status) throw errorDeApi(error.message || mensajePorDefecto, status)
  throw error
}

/**
 * Obtiene las alertas de stock minimo.
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.estado] Filtra por estado ('activa' | 'atendida').
 *   Sin filtro trae todas.
 * @returns {Promise<Array>} Alertas encontradas, mas nuevas primero.
 */
export async function getAlertasStock({ estado = '' } = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS)

  if (estado) consulta = consulta.eq('estado', estado)

  const { data, error } = await consulta.order('generada_en', {
    ascending: false,
  })

  if (error) throw error
  return data ?? []
}

/**
 * Marca una alerta de stock minimo como atendida.
 *
 * @param {string} id ID de la alerta.
 * @returns {Promise<Object>} Alerta atendida.
 * @throws {Error} Error con status 404 si la alerta no existe.
 * @throws {Error} Error con status 409 si la alerta ya estaba atendida.
 */
export async function atenderAlertaStock(id) {
  if (!id) throw errorDeApi('La alerta es obligatoria', 400)

  const { data, error } = await supabase
    .rpc('atender_alerta_stock', { p_alerta_id: id })
    .single()

  if (error) manejarErrorAlerta(error, 'No se pudo atender la alerta')
  return data
}
