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

  const { data, error } = await supabase.rpc('iniciar_inventario_fisico', {
    p_deposito_id: depositoId,
  })

  if (error) {
    if (error.code === CODIGO_UUID_INVALIDO || error.code === 'P0002') {
      throw errorDeApi('El depósito no existe', 404)
    }

    if (error.code === CODIGO_DUPLICADO) {
      throw errorDeApi(
        'Ya existe una toma de inventario abierta para ese depósito',
        409,
      )
    }

    if (
      error.code === 'P0001' &&
      error.message?.includes('no tiene artículos vinculados')
    ) {
      throw errorDeApi(
        'El depósito no tiene artículos vinculados para inventariar',
        400,
      )
    }

    throw error
  }

  return getInventarioFisico(data)
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
 * Registra el conteo físico completo de una toma de inventario.
 *
 * Todos los artículos deben informarse en una única operación.
 * La carga se realiza mediante la RPC `cargar_conteos_inventario`,
 * que ejecuta la actualización dentro de una transacción en PostgreSQL.
 * Si ocurre un error durante la operación, no se guarda ningún conteo.
 *
 * La diferencia entre la cantidad contada y el stock teórico
 * se calcula automáticamente en la base de datos.
 *
 * @param {string} inventarioId - ID UUID de la toma de inventario.
 * @param {Array<{producto_id: string, cantidad_contada: number}>} conteos
 * - Conteos físicos de todos los artículos incluidos en la toma.
 * @returns {Promise<Object>} Inventario actualizado con sus diferencias.
 * @throws {Error} Error con status 400 si los conteos son inválidos,
 * incompletos, negativos o contienen artículos repetidos.
 * @throws {Error} Error con status 404 si la toma no existe.
 * @throws {Error} Error con status 409 si la toma no está en estado
 * "en_carga".
 */
export async function cargarConteosInventario(inventarioId, conteos) {
  if (!inventarioId) {
    throw errorDeApi('La toma de inventario es obligatoria', 400)
  }

  if (!Array.isArray(conteos) || conteos.length === 0) {
    throw errorDeApi('El conteo físico es obligatorio', 400)
  }

  const { error } = await supabase.rpc('cargar_conteos_inventario', {
    p_inventario_id: inventarioId,
    p_conteos: conteos,
  })

  if (error) {
    if (error.code === CODIGO_UUID_INVALIDO || error.code === 'P0002') {
      throw errorDeApi('La toma de inventario no existe', 404)
    }

    if (
      error.code === 'P0001' &&
      error.message?.includes('estado en_carga')
    ) {
      throw errorDeApi(
        'Solo se pueden cargar conteos en una toma en estado en_carga',
        409,
      )
    }

    if (error.code === 'P0001') {
      throw errorDeApi(error.message, 400)
    }

    throw error
  }

  return getInventarioFisico(inventarioId)
}

/**
 * Envía una toma de inventario completa a aprobación.
 *
 * Solo puede enviarse una toma en estado "en_carga" cuando todos sus
 * artículos tienen una cantidad física registrada.
 *
 * Cambia el estado a "pendiente_aprobacion" y registra la fecha de envío.
 *
 * @param {string} inventarioId - ID UUID de la toma de inventario.
 * @returns {Promise<Object>} Inventario actualizado en estado
 * "pendiente_aprobacion".
 * @throws {Error} Error con status 404 si la toma no existe.
 * @throws {Error} Error con status 409 si el estado no permite el envío
 * o si existen conteos pendientes.
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
 * Aprueba una toma de inventario pendiente.
 *
 * Registra el usuario autenticado que realiza la aprobación y la fecha
 * correspondiente.
 *
 * Esta operación NO modifica stock_x_deposito. El ajuste efectivo del
 * inventario corresponde a la US-STK-12.
 *
 * @param {string} inventarioId - ID UUID de la toma de inventario.
 * @returns {Promise<Object>} Inventario aprobado.
 * @throws {Error} Error con status 401 si no existe un usuario autenticado.
 * @throws {Error} Error con status 404 si la toma no existe.
 * @throws {Error} Error con status 409 si la toma no está en estado
 * "pendiente_aprobacion".
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

export async function puedeAjustarInventario() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: 'Ajuste de inventario',
  })

  if (error) throw error
  return data === true
}

export async function aplicarAjustesInventarioFisico(
  inventarioId,
  { categoria = 'conteo_fisico', motivo } = {},
) {
  if (!inventarioId) {
    throw errorDeApi('La toma de inventario es obligatoria', 400)
  }

  if (!motivo?.trim()) {
    throw errorDeApi('El motivo del ajuste es obligatorio', 400)
  }

  const { data, error } = await supabase.rpc(
    'aplicar_ajustes_inventario_fisico',
    {
      p_inventario_id: inventarioId,
      p_categoria: categoria,
      p_motivo: motivo.trim(),
    },
  )

  if (error) {
    const status = {
      AJ001: 400,
      AJ002: 403,
      AJ003: 409,
      AJ004: 404,
      AJ005: 409,
      AJ006: 409,
    }[error.code]

    if (status) throw errorDeApi(error.message, status)
    throw error
  }

  return data
}