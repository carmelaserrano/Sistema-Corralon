import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_FK_VIOLADA,
  CODIGO_CHECK_VIOLADO,
  CODIGO_UUID_INVALIDO,
} from './errores'

const TABLA_INVENTARIO = 'inventario_fisico'
const TABLA_DETALLE = 'detalle_inventario_fisico'

const COLUMNAS_INVENTARIO = `
  id,
  deposito_id,
  estado,
  created_by,
  created_at,
  enviado_at,
  aprobado_by,
  aprobado_at,
  deposito:depositos (
    id,
    nombre
  )
`

const COLUMNAS_DETALLE = `
  id,
  inventario_fisico_id,
  producto_id,
  stock_teorico,
  cantidad_contada,
  diferencia,
  created_at,
  producto:productos (
    id,
    sku,
    nombre
  )
`

function manejarErrorInventario(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi(
      'Ya existe una toma de inventario abierta para ese depósito',
      409,
    )
  }

  if (error?.code === CODIGO_FK_VIOLADA) {
    throw errorDeApi('El depósito, inventario o artículo no existe', 404)
  }

  if (error?.code === CODIGO_CHECK_VIOLADO) {
    throw errorDeApi('Los datos del inventario no cumplen las validaciones', 400)
  }

  throw error
}

async function obtenerInventarioPorId(id) {
  const { data, error } = await supabase
    .from(TABLA_INVENTARIO)
    .select(COLUMNAS_INVENTARIO)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    if (error.code === CODIGO_UUID_INVALIDO) {
      throw errorDeApi('La toma de inventario no existe', 404)
    }

    throw error
  }

  if (!data) {
    throw errorDeApi('La toma de inventario no existe', 404)
  }

  return data
}

async function verificarDeposito(depositoId) {
  const { data, error } = await supabase
    .from('depositos')
    .select('id')
    .eq('id', depositoId)
    .maybeSingle()

  if (error) {
    if (error.code === CODIGO_UUID_INVALIDO) {
      throw errorDeApi('El depósito no existe', 404)
    }

    throw error
  }

  if (!data) {
    throw errorDeApi('El depósito no existe', 404)
  }
}
/**
 * Obtiene la toma abierta de un depósito.
 *
 * @param {string} depositoId ID del depósito.
 * @returns {Promise<Object|null>} Toma abierta con su detalle, o null si no existe.
 */
export async function getInventarioAbiertoPorDeposito(depositoId) {
  if (!depositoId) {
    throw errorDeApi('El depósito es obligatorio', 400)
  }

  const { data, error } = await supabase
    .from(TABLA_INVENTARIO)
    .select('id')
    .eq('deposito_id', depositoId)
    .in('estado', ['en_carga', 'pendiente_aprobacion'])
    .maybeSingle()

  if (error) {
    if (error.code === CODIGO_UUID_INVALIDO) {
      throw errorDeApi('El depósito no existe', 404)
    }

    throw error
  }

  if (!data) {
    return null
  }

  return getInventarioFisico(data.id)
}
/**
 * Inicia una toma de inventario físico para un depósito.
 * Congela como stock teórico las cantidades actuales de todos los artículos
 * vinculados al depósito en stock_x_deposito.
 *
 * @param {string} depositoId ID del depósito.
 * @returns {Promise<Object>} Inventario creado con su detalle congelado.
 */
export async function iniciarInventarioFisico(depositoId) {
  if (!depositoId) {
    throw errorDeApi('El depósito es obligatorio', 400)
  }

  await verificarDeposito(depositoId)

  const { data: abierto, error: abiertoError } = await supabase
    .from(TABLA_INVENTARIO)
    .select('id')
    .eq('deposito_id', depositoId)
    .in('estado', ['en_carga', 'pendiente_aprobacion'])
    .maybeSingle()

  if (abiertoError) throw abiertoError

  if (abierto) {
    throw errorDeApi(
      'Ya existe una toma de inventario abierta para ese depósito',
      409,
    )
  }

  const { data: stock, error: stockError } = await supabase
    .from('stock_x_deposito')
    .select('producto_id, cantidad')
    .eq('deposito_id', depositoId)

  if (stockError) throw stockError

  if (!stock || stock.length === 0) {
    throw errorDeApi(
      'El depósito no tiene artículos vinculados para inventariar',
      400,
    )
  }

  const { data: inventario, error: inventarioError } = await supabase
    .from(TABLA_INVENTARIO)
    .insert({
      deposito_id: depositoId,
      estado: 'en_carga',
    })
    .select(COLUMNAS_INVENTARIO)
    .single()

  if (inventarioError) manejarErrorInventario(inventarioError)

  const detalle = stock.map((item) => ({
    inventario_fisico_id: inventario.id,
    producto_id: item.producto_id,
    stock_teorico: Number(item.cantidad),
  }))

  const { error: detalleError } = await supabase
    .from(TABLA_DETALLE)
    .insert(detalle)

  if (detalleError) manejarErrorInventario(detalleError)

  return getInventarioFisico(inventario.id)
}

/**
 * Obtiene una toma de inventario físico con su detalle.
 *
 * @param {string} id ID de la toma.
 * @returns {Promise<Object>} Cabecera y detalle del inventario.
 */
export async function getInventarioFisico(id) {
  const inventario = await obtenerInventarioPorId(id)

  const { data: detalle, error } = await supabase
    .from(TABLA_DETALLE)
    .select(COLUMNAS_DETALLE)
    .eq('inventario_fisico_id', id)
    .order('created_at', { ascending: true })

  if (error) throw error

  return {
    ...inventario,
    detalle: detalle ?? [],
  }
}

/**
 * Registra el conteo físico completo de una toma.
 * No permite guardado parcial.
 *
 * @param {string} inventarioId ID de la toma.
 * @param {Array<{producto_id: string, cantidad_contada: number}>} conteos
 * @returns {Promise<Object>} Inventario actualizado con diferencias calculadas.
 */
export async function cargarConteosInventario(inventarioId, conteos) {
  const inventario = await obtenerInventarioPorId(inventarioId)

  if (inventario.estado !== 'en_carga') {
    throw errorDeApi(
      'Solo se pueden cargar conteos en una toma en estado en_carga',
      409,
    )
  }

  if (!Array.isArray(conteos) || conteos.length === 0) {
    throw errorDeApi('El conteo físico es obligatorio', 400)
  }

  const { data: detalleActual, error: detalleError } = await supabase
    .from(TABLA_DETALLE)
    .select('id, producto_id')
    .eq('inventario_fisico_id', inventarioId)

  if (detalleError) throw detalleError

  if (conteos.length !== detalleActual.length) {
    throw errorDeApi(
      'Debe informarse el conteo de todos los artículos de la toma',
      400,
    )
  }

  const productosEsperados = new Set(
    detalleActual.map((item) => item.producto_id),
  )

  const productosRecibidos = new Set()

  for (const conteo of conteos) {
    if (!conteo.producto_id) {
      throw errorDeApi('El artículo es obligatorio', 400)
    }

    if (!productosEsperados.has(conteo.producto_id)) {
      throw errorDeApi(
        'El conteo incluye un artículo que no pertenece a la toma',
        400,
      )
    }

    if (productosRecibidos.has(conteo.producto_id)) {
      throw errorDeApi('No se puede repetir un artículo en el conteo', 400)
    }

    productosRecibidos.add(conteo.producto_id)

    if (
      conteo.cantidad_contada === '' ||
      conteo.cantidad_contada === null ||
      conteo.cantidad_contada === undefined
    ) {
      throw errorDeApi(
        'Debe informarse la cantidad contada de todos los artículos',
        400,
      )
    }

    const cantidad = Number(conteo.cantidad_contada)

    if (Number.isNaN(cantidad)) {
      throw errorDeApi('La cantidad contada debe ser un número válido', 400)
    }

    if (cantidad < 0) {
      throw errorDeApi('La cantidad contada no puede ser negativa', 400)
    }
  }

  for (const conteo of conteos) {
    const detalle = detalleActual.find(
      (item) => item.producto_id === conteo.producto_id,
    )

    const { error } = await supabase
      .from(TABLA_DETALLE)
      .update({
        cantidad_contada: Number(conteo.cantidad_contada),
      })
      .eq('id', detalle.id)

    if (error) manejarErrorInventario(error)
  }

  return getInventarioFisico(inventarioId)
}

/**
 * Finaliza la carga y envía la toma a aprobación.
 *
 * @param {string} inventarioId ID de la toma.
 * @returns {Promise<Object>} Inventario en estado pendiente_aprobacion.
 */
export async function enviarInventarioAprobacion(inventarioId) {
  const inventario = await obtenerInventarioPorId(inventarioId)

  if (inventario.estado !== 'en_carga') {
    throw errorDeApi(
      'Solo una toma en carga puede enviarse a aprobación',
      409,
    )
  }

  const { data: detalle, error: detalleError } = await supabase
    .from(TABLA_DETALLE)
    .select('id, cantidad_contada')
    .eq('inventario_fisico_id', inventarioId)

  if (detalleError) throw detalleError

  const incompletos = (detalle ?? []).some(
    (item) => item.cantidad_contada === null,
  )

  if (incompletos) {
    throw errorDeApi(
      'Debe completar el conteo de todos los artículos antes de enviar a aprobación',
      400,
    )
  }

  const { data, error } = await supabase
    .from(TABLA_INVENTARIO)
    .update({
      estado: 'pendiente_aprobacion',
      enviado_at: new Date().toISOString(),
    })
    .eq('id', inventarioId)
    .select(COLUMNAS_INVENTARIO)
    .single()

  if (error) manejarErrorInventario(error)

  return data
}

/**
 * Aprueba una toma de inventario.
 * La aprobación no modifica stock_x_deposito.
 *
 * @param {string} inventarioId ID de la toma.
 * @returns {Promise<Object>} Inventario aprobado.
 */
export async function aprobarInventarioFisico(inventarioId) {
  const inventario = await obtenerInventarioPorId(inventarioId)

  if (inventario.estado !== 'pendiente_aprobacion') {
    throw errorDeApi(
      'Solo una toma pendiente de aprobación puede aprobarse',
      409,
    )
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError

  if (!user) {
    throw errorDeApi('No hay un usuario autenticado', 401)
  }

  const { data, error } = await supabase
    .from(TABLA_INVENTARIO)
    .update({
      estado: 'aprobado',
      aprobado_by: user.id,
      aprobado_at: new Date().toISOString(),
    })
    .eq('id', inventarioId)
    .select(COLUMNAS_INVENTARIO)
    .single()

  if (error) manejarErrorInventario(error)

  return data
}