import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi } from '../../stock/api/errores'

export const PERMISO_COBRAR = 'ventas.cobrar'

const STATUS_POR_CODIGO = {
  CV001: 400,
  CV002: 404,
  CV003: 409,
  CV004: 409,
  CV005: 400,
  CV006: 400,
  CV007: 409,
  23505: 409,
  42501: 403,
}

function nombreNormalizado(medio) {
  return medio?.nombre?.trim().toLocaleLowerCase('es') ?? ''
}

export function esEfectivo(medio) {
  return nombreNormalizado(medio) === 'efectivo'
}

export function esTarjeta(medio) {
  return nombreNormalizado(medio).startsWith('tarjeta')
}

export function esTransferencia(medio) {
  return nombreNormalizado(medio).startsWith('transferencia')
}

export function esCuentaCorriente(medio) {
  return nombreNormalizado(medio) === 'cuenta corriente'
}

function manejarErrorCobro(error) {
  const status = STATUS_POR_CODIGO[error?.code]
  if (status) {
    throw errorDeApi(error.message || 'No se pudo registrar el cobro', status)
  }
  throw error
}

/** Medios de pago activos disponibles para registrar un cobro. */
export async function listarMediosPago() {
  const { data, error } = await supabase
    .from('medios_pago')
    .select('id, nombre, activo')
    .eq('activo', true)
    .order('nombre')

  if (error) throw error
  return data ?? []
}

/** Informa si la sesión puede ejecutar la acción de cobro. */
export async function puedeRegistrarCobros() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_COBRAR,
  })

  if (error) throw error
  return data === true
}

/**
 * Registra, de forma atómica, un cobro con uno o más medios de pago.
 *
 * @param {string} ventaId
 * @param {Array<{medio_pago_id: string, monto: number|string, monto_recibido?: number|string|null, referencia?: string|null}>} detalle
 * @returns {Promise<{venta_id: string, cobro_id: string, numero: number, total: number, fecha: string, created_by: string, cobrada: boolean, estado_venta: string}>}
 *   Cobro confirmado. `cobrada` describe el estado de pago; `estado_venta`
 *   conserva el estado operativo de la venta.
 */
export async function registrarCobro(ventaId, detalle) {
  if (!ventaId) throw errorDeApi('La venta es obligatoria', 400)
  if (!Array.isArray(detalle) || detalle.length === 0) {
    throw errorDeApi('Debe indicar al menos un medio de pago', 400)
  }

  const detalleNormalizado = detalle.map((item) => {
    const monto = Number(item.monto)
    if (!item.medio_pago_id) {
      throw errorDeApi('El medio de pago es obligatorio', 400)
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      throw errorDeApi('Todos los importes deben ser mayores a 0', 400)
    }

    const recibidoVacio =
      item.monto_recibido === undefined ||
      item.monto_recibido === null ||
      item.monto_recibido === ''
    const montoRecibido = recibidoVacio ? null : Number(item.monto_recibido)

    if (montoRecibido !== null && !Number.isFinite(montoRecibido)) {
      throw errorDeApi('El monto recibido no es válido', 400)
    }

    return {
      medio_pago_id: item.medio_pago_id,
      monto,
      monto_recibido: montoRecibido,
      referencia: item.referencia?.trim() || null,
    }
  })

  const consulta = supabase.rpc('registrar_cobro', {
    p_venta: ventaId,
    p_detalle: detalleNormalizado,
  })
  const { data, error } = await consulta.single()

  if (error) manejarErrorCobro(error)
  return data
}
