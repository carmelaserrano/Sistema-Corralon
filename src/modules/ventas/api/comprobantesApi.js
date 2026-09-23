import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi, CODIGO_PERMISO_INSUFICIENTE } from '../../stock/api/errores'
import { exportarComprobantePdf } from '../pdf/comprobantePdf'

export const PERMISO_FACTURAR = 'ventas.facturar'
export const PERMISO_ANULAR = 'ventas.anular'

const CODIGO_TRANSICION_INVALIDA = '22023'

/**
 * Determina la letra de comprobante según la condición frente al IVA del cliente (CA-02).
 * Corralón es Responsable Inscripto:
 *   - Cliente Responsable Inscripto -> Factura A
 *   - Cliente Monotributo, Consumidor Final, Exento u otros -> Factura B
 *
 * @param {string} condicionIvaNombre
 * @returns {'A'|'B'}
 */
export function determinarLetraComprobante(condicionIvaNombre) {
  if (!condicionIvaNombre) return 'B'
  const normalizado = condicionIvaNombre.trim().toLowerCase()
  return normalizado === 'responsable inscripto' || normalizado === 'ri' ? 'A' : 'B'
}

/**
 * Calcula el desglose de IVA 21% a partir de un total bruto (CA-03).
 *
 * @param {number} total
 * @returns {{ total: number, neto: number, iva: number }}
 */
export function calcularDesgloseIva(total) {
  const totalNum = Number(total || 0)
  const neto = Number((totalNum / 1.21).toFixed(2))
  const iva = Number((totalNum - neto).toFixed(2))
  return { total: totalNum, neto, iva }
}

function manejarErrorComprobante(error) {
  if (error?.code === CODIGO_PERMISO_INSUFICIENTE) {
    throw errorDeApi(
      error.message || 'No tenés permiso suficiente para emitir este comprobante',
      403,
    )
  }

  if (error?.code === CODIGO_TRANSICION_INVALIDA) {
    throw errorDeApi(error.message || 'Operación no permitida para el estado actual de la venta', 409)
  }

  throw error
}

/**
 * Emite un comprobante para una venta (CA-01, CA-02, CA-03, CA-05, CA-06, CA-07).
 * Invoca la función SQL `emitir_comprobante`.
 *
 * @param {string} ventaId UUID de la venta.
 * @param {'factura'|'nota_credito'|'nota_debito'} tipo Tipo de comprobante.
 * @param {Array<Object>} [items] Opcional para Nota de Crédito parcial.
 * @returns {Promise<Object>} Comprobante emitido con CAE simulado ("HOMOLOGACIÓN").
 */
export async function emitirComprobante(ventaId, tipo = 'factura', items = null) {
  if (!ventaId) {
    throw errorDeApi('El ID de la venta es obligatorio', 400)
  }

  if (!['factura', 'nota_credito', 'nota_debito'].includes(tipo)) {
    throw errorDeApi(`Tipo de comprobante inválido: ${tipo}`, 400)
  }

  const { data, error } = await supabase
    .rpc('emitir_comprobante', {
      p_venta: ventaId,
      p_tipo: tipo,
      p_items: items,
    })
    .single()

  if (error) {
    manejarErrorComprobante(error)
  }

  return data
}

/**
 * Obtiene un comprobante por su ID junto con la información asociada para generar el PDF.
 *
 * @param {string} comprobanteId
 * @returns {Promise<Object>}
 */
export async function obtenerComprobante(comprobanteId) {
  if (!comprobanteId) {
    throw errorDeApi('El ID del comprobante es obligatorio', 400)
  }

  const { data, error } = await supabase
    .from('comprobantes_venta')
    .select(`
      *,
      punto_venta:puntos_venta(*),
      venta:ventas(
        *,
        cliente:clientes(
          *,
          condicion_iva:condiciones_iva(*),
          domicilios:domicilios_cliente(*)
        ),
        detalle_venta(
          *,
          producto:productos(*)
        )
      )
    `)
    .eq('id', comprobanteId)
    .single()

  if (error) throw error
  return data
}

/**
 * Lista los comprobantes asociados a una venta.
 *
 * @param {string} ventaId
 * @returns {Promise<Array<Object>>}
 */
export async function listarComprobantesPorVenta(ventaId) {
  if (!ventaId) return []

  const { data, error } = await supabase
    .from('comprobantes_venta')
    .select('*, punto_venta:puntos_venta(*)')
    .eq('venta_id', ventaId)
    .order('fecha_emision', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Descarga el PDF del comprobante solicitado (CA-04).
 *
 * @param {string} comprobanteId
 * @param {boolean} [guardar=true] Si dispara el diálogo de descarga en el navegador.
 * @returns {Promise<Blob>} Blob del PDF generado.
 */
export async function descargarComprobantePdf(comprobanteId, guardar = true) {
  const comprobante = await obtenerComprobante(comprobanteId)
  if (!comprobante) {
    throw errorDeApi('Comprobante no encontrado', 404)
  }

  return exportarComprobantePdf({
    comprobante,
    venta: comprobante.venta,
    guardar,
  })
}

/**
 * Comprueba si el usuario autenticado tiene permiso para facturar ventas.
 *
 * @returns {Promise<boolean>}
 */
export async function puedeFacturarVentas() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_FACTURAR,
  })
  if (error) throw error
  return data === true
}

/**
 * Comprueba si el usuario autenticado tiene permiso para anular / emitir notas de crédito.
 *
 * @returns {Promise<boolean>}
 */
export async function puedeAnularVentas() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_ANULAR,
  })
  if (error) throw error
  return data === true
}
