import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi } from '../../stock/api/errores'

const COLUMNAS_LISTADO_VENTAS = `
  id,
  numero,
  estado,
  total,
  observaciones,
  created_at,
  deposito_id,
  cliente:clientes(
    id,
    tipo_persona,
    nombre,
    apellido,
    razon_social,
    tipo_documento,
    numero_documento,
    condicion_iva:condiciones_iva(id, nombre)
  ),
  comprobantes:comprobantes_venta(
    id,
    tipo_comprobante,
    letra,
    numero,
    estado,
    total,
    neto,
    iva,
    cae,
    cae_vencimiento,
    fecha_emision,
    punto_venta:puntos_venta(id, numero, nombre)
  ),
  cobros:cobros_venta(
    id,
    total,
    created_at,
    detalle:detalle_cobro(
      id,
      monto,
      medio_pago:medios_pago(id, nombre)
    )
  )
`

function finDelDiaSiguiente(fecha) {
  const fin = new Date(`${fecha}T00:00:00`)
  fin.setDate(fin.getDate() + 1)
  return fin.toISOString()
}

/**
 * Lista las ventas del sistema con sus relaciones para la pantalla de Ventas.
 *
 * @param {Object} [filtros]
 * @param {'Pendiente'|'Facturada'|'Entregada'|'Anulada'} [filtros.estado]
 * @param {string} [filtros.desde] Fecha YYYY-MM-DD inclusive.
 * @param {string} [filtros.hasta] Fecha YYYY-MM-DD inclusive.
 * @param {string} [filtros.clienteId] UUID del cliente.
 * @returns {Promise<Array<Object>>} Listado de ventas.
 */
export async function listarVentas({ estado, desde, hasta, clienteId } = {}) {
  let consulta = supabase.from('ventas').select(COLUMNAS_LISTADO_VENTAS)

  if (estado) consulta = consulta.eq('estado', estado)
  if (clienteId) consulta = consulta.eq('cliente_id', clienteId)
  if (desde) consulta = consulta.gte('created_at', `${desde}T00:00:00`)
  if (hasta) consulta = consulta.lt('created_at', finDelDiaSiguiente(hasta))

  const { data, error } = await consulta.order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Obtiene la información completa de una venta, incluyendo cliente, artículos (detalle_venta),
 * comprobantes emitidos y cobros registrados con medios de pago.
 *
 * @param {string} id UUID de la venta.
 * @returns {Promise<Object>} Venta detallada.
 */
export async function getVentaById(id) {
  if (!id) {
    throw errorDeApi('El ID de la venta es obligatorio', 400)
  }

  const { data, error } = await supabase
    .from('ventas')
    .select(`
      id,
      numero,
      estado,
      total,
      observaciones,
      created_at,
      deposito_id,
      vendedor_id,
      cliente:clientes(
        id,
        tipo_persona,
        nombre,
        apellido,
        razon_social,
        tipo_documento,
        numero_documento,
        email,
        telefono,
        habilita_cta_cte,
        condicion_iva:condiciones_iva(id, nombre),
        domicilios:domicilios_cliente(*)
      ),
      detalle:detalle_venta(
        id,
        cantidad,
        cantidad_backorder,
        precio_unitario,
        descuento_pct,
        subtotal,
        producto:productos(id, nombre, codigo)
      ),
      comprobantes:comprobantes_venta(
        id,
        tipo_comprobante,
        letra,
        numero,
        neto,
        iva,
        total,
        cae,
        cae_vencimiento,
        estado,
        fecha_emision,
        comprobante_asociado_id,
        punto_venta:puntos_venta(id, numero, nombre)
      ),
      cobros:cobros_venta(
        id,
        numero,
        total,
        created_at,
        detalle:detalle_cobro(
          id,
          monto,
          medio_pago:medios_pago(id, nombre)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  if (!data) throw errorDeApi('Venta no encontrada', 404)

  const cobrosList = data.cobros ?? []
  const totalCobrado = cobrosList.reduce((acc, c) => acc + Number(c.total || 0), 0)
  const tieneCuentaCorriente = cobrosList.some((c) =>
    (c.detalle ?? []).some((d) => d.medio_pago?.nombre === 'Cuenta corriente'),
  )

  return {
    ...data,
    totalCobrado,
    tieneCuentaCorriente,
    estaCobrada: totalCobrado >= Number(data.total || 0),
  }
}
