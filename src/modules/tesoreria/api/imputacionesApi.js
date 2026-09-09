import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi } from '../../stock/api/errores'

const TABLA = 'imputaciones'

// Códigos que define la migración 0024. Mismo patrón que recepcionesApi.js
// con los RCxxx: la base ya redacta el mensaje para mostrarse tal cual.
const STATUS_POR_CODIGO = {
  IM001: 400, // el importe supera el máximo imputable
  IM002: 404, // la nota, la factura o la vinculación no existen
  IM003: 409, // la factura ya está totalmente pagada
  IM004: 409, // nota y factura de proveedores distintos
  IM005: 409, // nota, factura o vinculación anulada
  IM006: 409, // esa nota ya está vinculada a esa factura
}

const COLUMNAS = `
  id,
  factura_id,
  nota_id,
  importe_imputado,
  created_by,
  created_at,
  nota:notas_proveedor(id, tipo, letra, sucursal, numero, importe, saldo_pendiente, estado),
  factura:facturas_proveedor(id, letra, sucursal, numero, importe_total, saldo_pendiente, estado)
`

function manejarErrorImputacion(error, mensajePorDefecto) {
  const status = STATUS_POR_CODIGO[error?.code]
  if (status) throw errorDeApi(error.message || mensajePorDefecto, status)
  throw error
}

/**
 * Máximo que se puede imputar de una nota a una factura (CA 5).
 *
 * Una nota de CRÉDITO no puede dejar la factura en negativo, así que está
 * limitada también por el saldo de la factura. Una de DÉBITO aumenta ese
 * saldo en vez de reducirlo, así que su único límite es su propio saldo.
 *
 * @param {{tipo: string, saldo_pendiente: number|string}} nota
 * @param {{saldo_pendiente: number|string}} factura
 * @returns {number} Máximo imputable, redondeado a centavos.
 */
export function calcularMaximoImputable(nota, factura) {
  if (!nota || !factura) return 0

  const saldoNota = Number(nota.saldo_pendiente) || 0
  const saldoFactura = Number(factura.saldo_pendiente) || 0

  const maximo = nota.tipo === 'CREDITO' ? Math.min(saldoNota, saldoFactura) : saldoNota

  return Math.round(Math.max(maximo, 0) * 100) / 100
}

/**
 * Vinculaciones vigentes de una factura, con la nota embebida (CA 2).
 */
export async function getImputacionesDeFactura(facturaId) {
  if (!facturaId) return []

  const { data, error } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('factura_id', facturaId)
    .not('nota_id', 'is', null)
    .is('anulado_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Vinculaciones vigentes de una nota, con la factura embebida (CA 1).
 */
export async function getImputacionesDeNota(notaId) {
  if (!notaId) return []

  const { data, error } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('nota_id', notaId)
    .is('anulado_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Vincula una nota a una factura por un importe (CA 1/2/3/4/5).
 *
 * Toda la validación y el recálculo de ambos saldos ocurren dentro de
 * `vincular_nota_factura` (0024), en una sola transacción: acá solo se
 * traducen los códigos de error.
 *
 * @param {Object} datos
 * @param {string} datos.notaId
 * @param {string} datos.facturaId
 * @param {number|string} datos.importe
 * @returns {Promise<Object>} La imputación creada.
 * @throws {Error} 400 si el importe supera el máximo imputable; 404 si la
 *   nota o la factura no existen; 409 si la factura está pagada, si son de
 *   proveedores distintos o si ya estaban vinculadas.
 */
export async function vincularNotaFactura({ notaId, facturaId, importe }) {
  if (!notaId) throw errorDeApi('La nota es obligatoria', 400)
  if (!facturaId) throw errorDeApi('La factura es obligatoria', 400)

  const importeNumero = Number(importe)
  if (!Number.isFinite(importeNumero) || importeNumero <= 0) {
    throw errorDeApi('El importe a imputar debe ser mayor a 0', 400)
  }

  const { data, error } = await supabase.rpc('vincular_nota_factura', {
    p_nota_id: notaId,
    p_factura_id: facturaId,
    p_importe: importeNumero,
  })

  if (error) manejarErrorImputacion(error, 'No se pudo vincular la nota a la factura')
  return data
}

/**
 * Deshace una vinculación y revierte los saldos de nota y factura (CA 6).
 *
 * Es una baja lógica: la fila queda con `anulado_by`/`anulado_at` para
 * conservar el rastro de quién desvinculó y cuándo (CA 8).
 *
 * @param {string} imputacionId
 * @throws {Error} 404 si no existe; 409 si ya se deshizo o si la factura
 *   está totalmente pagada.
 */
export async function desvincularNota(imputacionId) {
  if (!imputacionId) throw errorDeApi('La vinculación es obligatoria', 400)

  const { error } = await supabase.rpc('desvincular_nota_factura', {
    p_imputacion_id: imputacionId,
  })

  if (error) manejarErrorImputacion(error, 'No se pudo desvincular la nota')
}
