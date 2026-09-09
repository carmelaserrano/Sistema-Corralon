import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_CHECK_VIOLADO,
  CODIGO_SIN_FILAS,
} from '../../stock/api/errores'
import { getOrdenesCompra } from '../../compras/api/ordenesCompraApi'
import { getImputacionesDeFactura } from './imputacionesApi'

const TABLA = 'facturas_proveedor'
const TABLA_FACTURA_RECEPCION = 'factura_recepcion'

export const PERMISO_REGISTRAR = 'tesoreria.factura.registrar'
export const PERMISO_ANULAR = 'tesoreria.factura.anular'

// CA 2: la única letra que pide la historia (AFIP A/B/C/M), sin 'otro'.
export const LETRAS = ['A', 'B', 'C', 'M']

export const ESTADOS = ['pendiente', 'parcialmente_pagada', 'pagada', 'anulada']

// CA 9: la historia pide estas etiquetas puntuales para mostrar, no los
// nombres internos de la columna `estado`.
export const ETIQUETAS_ESTADO = {
  pendiente: 'Impaga',
  parcialmente_pagada: 'Pagada parcial',
  pagada: 'Pagada',
  anulada: 'Anulada',
}

const COLUMNAS = `
  id,
  proveedor_id,
  letra,
  sucursal,
  numero,
  fecha_emision,
  fecha_vencimiento,
  importe_neto,
  impuestos,
  importe_total,
  saldo_pendiente,
  estado,
  orden_compra_id,
  created_by,
  created_at,
  proveedor:proveedores(id, razon_social, cuit),
  orden_compra:ordenes_compra(id, numero, total)
`

/**
 * Completa Sucursal con ceros a la izquierda hasta 4 dígitos (CA 6).
 */
export function normalizarSucursal(valor) {
  return String(valor ?? '').trim().padStart(4, '0')
}

/**
 * Completa Número con ceros a la izquierda hasta 8 dígitos (CA 6).
 */
export function normalizarNumero(valor) {
  return String(valor ?? '').trim().padStart(8, '0')
}

/**
 * Indica si el usuario cargó algo del desglose (neto y/o impuestos). Si no
 * cargó ninguno de los dos, no tiene sentido comparar contra el total: no
 * hay nada para desglosar todavía (CA 7 solo aplica cuando sí lo hizo).
 */
export function tieneDesglose(datos) {
  const netoVacio = datos.importe_neto === '' || datos.importe_neto == null
  const impuestosVacio = datos.impuestos === '' || datos.impuestos == null
  return !netoVacio || !impuestosVacio
}

/**
 * Diferencia entre el importe total y neto + impuestos (CA 7). Redondea a
 * centavos para no arrastrar errores de punto flotante.
 */
export function calcularDiferenciaImporte(neto, impuestos, total) {
  const netoNum = Number(neto) || 0
  const impuestosNum = Number(impuestos) || 0
  const totalNum = Number(total) || 0
  return Math.round((totalNum - (netoNum + impuestosNum)) * 100) / 100
}

/**
 * Diferencia entre el total facturado y el total de la OC vinculada (CA 8).
 *
 * @param {number} importeTotal
 * @param {{ total: number } | null | undefined} ordenCompra
 * @returns {number|null} null si no hay OC vinculada.
 */
export function calcularDiferenciaOc(importeTotal, ordenCompra) {
  if (!ordenCompra) return null
  return Math.round((Number(importeTotal) - Number(ordenCompra.total)) * 100) / 100
}

function validarFactura(datos) {
  if (!datos.proveedor_id) {
    throw errorDeApi('El proveedor es obligatorio', 400)
  }
  if (!LETRAS.includes(datos.letra)) {
    throw errorDeApi('La letra debe ser A, B, C o M', 400)
  }

  const sucursal = normalizarSucursal(datos.sucursal)
  if (!/^[0-9]{4}$/.test(sucursal)) {
    throw errorDeApi('La sucursal debe tener 4 dígitos', 400)
  }

  const numero = normalizarNumero(datos.numero)
  if (!/^[0-9]{8}$/.test(numero)) {
    throw errorDeApi('El número debe tener 8 dígitos', 400)
  }

  if (!datos.fecha_emision) {
    throw errorDeApi('La fecha de emisión es obligatoria', 400)
  }

  // La 0013 exige importe_total > 0 y not null: aunque el enunciado de la
  // historia lo agrupa con los campos "además cargo", en el modelo de datos
  // (heredado de la 0013, que no se toca) es obligatorio para poder calcular
  // saldo_pendiente y estado. Se lo trata como obligatorio también en el
  // formulario.
  if (!datos.importe_total || Number(datos.importe_total) <= 0) {
    throw errorDeApi('El importe total debe ser mayor a 0', 400)
  }

  return { sucursal, numero }
}

async function manejarErrorFactura(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi('La factura ya fue registrada', 409)
  }

  if (error?.code === CODIGO_CHECK_VIOLADO) {
    if (error.message?.includes('chk_factura_letra')) {
      throw errorDeApi('La letra debe ser A, B, C o M', 400)
    }
    if (error.message?.includes('chk_factura_sucursal_formato')) {
      throw errorDeApi('La sucursal debe tener 4 dígitos', 400)
    }
    if (error.message?.includes('chk_factura_numero_formato')) {
      throw errorDeApi('El número debe tener 8 dígitos', 400)
    }
    if (error.message?.includes('chk_factura_fechas')) {
      throw errorDeApi('La fecha de vencimiento no puede ser anterior a la de emisión', 400)
    }
    if (error.message?.includes('chk_factura_importe')) {
      throw errorDeApi('El importe total debe ser mayor a 0', 400)
    }
    throw errorDeApi('Revisá los datos: no cumplen una validación del sistema', 400)
  }

  // FA002/FA003: fn_validar_factura_oc_proveedor / fn_validar_factura_recepcion_proveedor (0022).
  if (error?.code === 'FA002' || error?.code === 'FA003') {
    throw errorDeApi(error.message, 409)
  }

  if (error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo guardar la factura: no existe o no tenés permiso para verla',
      403,
    )
  }

  throw error
}

export async function puedeRegistrarFacturas() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_REGISTRAR,
  })
  if (error) throw error
  return data === true
}

/**
 * Lista facturas de proveedor, más recientes primero (CA 10).
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.proveedorId]
 * @param {string} [filtros.fechaDesde] Filtra por fecha_emision >=.
 * @param {string} [filtros.fechaHasta] Filtra por fecha_emision <=.
 * @param {string} [filtros.estado] Uno de ESTADOS.
 */
export async function getFacturas({
  proveedorId = '',
  fechaDesde = '',
  fechaHasta = '',
  estado = '',
  page = 1,
  pageSize = 50,
} = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS, { count: 'exact' })

  if (proveedorId) consulta = consulta.eq('proveedor_id', proveedorId)
  if (fechaDesde) consulta = consulta.gte('fecha_emision', fechaDesde)
  if (fechaHasta) consulta = consulta.lte('fecha_emision', fechaHasta)
  if (estado) consulta = consulta.eq('estado', estado)

  const desde = (page - 1) * pageSize

  const { data, count, error } = await consulta
    .order('fecha_emision', { ascending: false })
    .range(desde, desde + pageSize - 1)

  if (error) throw error

  const total = count ?? 0

  return {
    facturas: data ?? [],
    total,
    page,
    pageSize,
    totalPaginas: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * Detalle de una factura, con las recepciones vinculadas (CA 9) y las notas
 * de crédito/débito imputadas (S2-17, CA 2).
 */
export async function getFacturaById(id) {
  const { data: factura, error } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!factura) throw errorDeApi('La factura no existe', 404)

  const { data: vinculos, error: errorVinculos } = await supabase
    .from(TABLA_FACTURA_RECEPCION)
    .select('recepcion:recepciones(id, numero, fecha_recepcion)')
    .eq('factura_id', id)

  if (errorVinculos) throw errorVinculos

  return {
    ...factura,
    recepciones: (vinculos ?? []).map((v) => v.recepcion).filter(Boolean),
    imputaciones: await getImputacionesDeFactura(id),
  }
}

/**
 * Da de alta una factura de proveedor.
 *
 * Si `datos.importe_total` difiere de neto + impuestos (habiendo cargado
 * alguno de los dos) y no se pasó `datos.forzarDiferencia`, no guarda: lanza
 * un error con `requiereConfirmacion: true` para que la pantalla muestre el
 * aviso y pida confirmación explícita (CA 7).
 *
 * @param {Object} datos
 * @param {string} datos.proveedor_id
 * @param {'A'|'B'|'C'|'M'} datos.letra
 * @param {string} datos.sucursal Con o sin ceros a la izquierda.
 * @param {string} datos.numero Con o sin ceros a la izquierda.
 * @param {string} datos.fecha_emision
 * @param {string} [datos.fecha_vencimiento]
 * @param {number|string} [datos.importe_neto]
 * @param {number|string} [datos.impuestos]
 * @param {number|string} datos.importe_total
 * @param {string} [datos.orden_compra_id] Vínculo opcional a una OC (CA 4).
 * @param {string} [datos.recepcion_id] Vínculo opcional a una Recepción (CA 4).
 * @param {boolean} [datos.forzarDiferencia] Confirma guardar pese a CA 7.
 * @returns {Promise<Object>} La factura creada.
 * @throws {Error} 400 si falta un campo obligatorio o el formato es inválido;
 *   409 si ya existe (CA 5), si hay diferencia sin confirmar (CA 7,
 *   `requiereConfirmacion: true`), o si la OC/Recepción es de otro proveedor.
 */
export async function createFactura(datos) {
  const { sucursal, numero } = validarFactura(datos)

  if (tieneDesglose(datos)) {
    const diferenciaImporte = calcularDiferenciaImporte(
      datos.importe_neto,
      datos.impuestos,
      datos.importe_total,
    )
    if (diferenciaImporte !== 0 && !datos.forzarDiferencia) {
      const error = errorDeApi(
        `El importe total difiere de neto + impuestos por ${diferenciaImporte}. Confirmá para guardar igual.`,
        409,
      )
      error.requiereConfirmacion = true
      error.diferenciaImporte = diferenciaImporte
      throw error
    }
  }

  const { data: cabecera, error } = await supabase
    .from(TABLA)
    .insert({
      proveedor_id: datos.proveedor_id,
      letra: datos.letra,
      sucursal,
      numero,
      fecha_emision: datos.fecha_emision,
      fecha_vencimiento: datos.fecha_vencimiento || null,
      importe_neto: Number(datos.importe_neto) || 0,
      impuestos: Number(datos.impuestos) || 0,
      importe_total: Number(datos.importe_total),
      orden_compra_id: datos.orden_compra_id || null,
    })
    .select(COLUMNAS)
    .single()

  if (error) await manejarErrorFactura(error)

  if (datos.recepcion_id) {
    const { error: errorVinculo } = await supabase
      .from(TABLA_FACTURA_RECEPCION)
      .insert({ factura_id: cabecera.id, recepcion_id: datos.recepcion_id })

    if (errorVinculo) {
      // La cabecera ya se guardó: no hay transacción cruzada desde el
      // cliente para revertirla (mismo criterio que createProveedor con el
      // rubro, en proveedoresApi.js). Se avisa para vincularla después.
      throw errorDeApi(
        `La factura se registró, pero no se pudo vincular a la recepción (${errorVinculo.message || 'error desconocido'}).`,
        409,
      )
    }
  }

  return cabecera
}

/**
 * Facturas de un proveedor con saldo pendiente, para el selector de vínculo
 * de las notas de crédito/débito (S2-16, CA 7) y para armar la orden de pago
 * (S2-15, CA 2).
 *
 * Cada factura viene con las notas que ya tiene imputadas (S2-15, CA 3): su
 * efecto ya está reflejado en `saldo_pendiente`, así que se muestran al lado
 * para explicar por qué el saldo es el que es.
 */
export async function getFacturasConSaldoDelProveedor(proveedorId) {
  if (!proveedorId) return []

  const { data, error } = await supabase
    .from(TABLA)
    .select(`
      id,
      letra,
      sucursal,
      numero,
      fecha_emision,
      importe_total,
      saldo_pendiente,
      estado,
      imputaciones:imputaciones!factura_id(
        id,
        importe_imputado,
        anulado_at,
        nota:notas_proveedor(id, tipo, letra, sucursal, numero)
      )
    `)
    .eq('proveedor_id', proveedorId)
    .gt('saldo_pendiente', 0)
    .neq('estado', 'anulada')
    .order('fecha_emision', { ascending: false })

  if (error) throw error

  // Las imputaciones de pago (sin nota) y las deshechas no aportan acá.
  return (data ?? []).map(({ imputaciones, ...factura }) => ({
    ...factura,
    notas: (imputaciones ?? []).filter((imp) => !imp.anulado_at && imp.nota),
  }))
}

/**
 * Órdenes de Compra no canceladas de un proveedor, para el combo de vínculo
 * opcional del formulario de factura (CA 4). Reusa getOrdenesCompra de
 * compras/api/ordenesCompraApi.js: esa historia (S2-08) ya está cerrada y
 * mergeada, así que es seguro depender de ella sin tocarla.
 */
export async function getOrdenesCompraDelProveedor(proveedorId) {
  if (!proveedorId) return []
  const { ordenes } = await getOrdenesCompra({ proveedorId, pageSize: 200 })
  return ordenes.filter((orden) => orden.estado !== 'cancelada')
}

/**
 * Recepciones confirmadas de un proveedor, para el vínculo opcional del
 * formulario de factura (CA 4).
 *
 * Es una consulta propia y acotada en vez de reusar
 * stock/api/recepcionesApi.js a propósito: ese módulo todavía no trae las
 * columnas que la 0013 le agregó a `recepciones` (proveedor_id, numero,...)
 * porque S2-12 —la historia que lo actualiza— sigue abierta y sin rama
 * publicada. Tocar ese archivo desde acá arriesga pisar ese trabajo en curso.
 */
export async function getRecepcionesConfirmadasDelProveedor(proveedorId) {
  if (!proveedorId) return []

  const { data, error } = await supabase
    .from('recepciones')
    .select('id, numero, fecha_recepcion, orden_compra_id')
    .eq('proveedor_id', proveedorId)
    .eq('estado_recepcion', 'confirmada')
    .order('fecha_recepcion', { ascending: false })

  if (error) throw error
  return data ?? []
}
