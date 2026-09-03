import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_FK_VIOLADA,
  CODIGO_CHECK_VIOLADO,
  CODIGO_UUID_INVALIDO,
} from './errores'

const TABLA = 'movimientos_stock'

export const TIPOS = {
  INGRESO: 'ingreso',
  EGRESO: 'egreso',
  TRANSFERENCIA: 'transferencia',
  AJUSTE: 'ajuste',
}

export const ESTADOS = {
  PENDIENTE: 'pendiente',
  CONFIRMADO: 'confirmado',
  CANCELADO: 'cancelado',
}

// movimientos_stock tiene dos FK a depositos. Sin el hint por columna
// (depositos!deposito_origen_id) PostgREST no sabe cuál embeber y responde
// "more than one relationship was found".
const COLUMNAS = `
  id,
  fecha,
  estado_movimiento,
  comprobante,
  observaciones,
  created_by,
  created_at,
  categoria_ajuste,
  motivo_ajuste,
  origen_ajuste,
  inventario_fisico_id,
  tipo:tipos_movimiento (id, nombre, codigo),
  origen:depositos!deposito_origen_id (id, nombre),
  destino:depositos!deposito_destino_id (id, nombre),
  detalle:detalle_movimiento (
    id,
    cantidad,
    producto:productos (id, sku, nombre)
  )
`
const COLUMNAS_HISTORIAL = `
  id,
  fecha,
  estado_movimiento,
  comprobante,
  observaciones,
  created_by,
  created_at,
  categoria_ajuste,
  motivo_ajuste,
  origen_ajuste,
  inventario_fisico_id,
  tipo:tipos_movimiento!inner (id, nombre, codigo),
  origen:depositos!deposito_origen_id (id, nombre),
  destino:depositos!deposito_destino_id (id, nombre),
  detalle:detalle_movimiento!inner (
    id,
    producto_id,
    cantidad,
    producto:productos (id, sku, nombre)
  )
`

// Los códigos MVxxx los define la migración 0006; el resto son estándar de
// PostgreSQL o de PostgREST.
const STATUS_POR_CODIGO = {
  MV001: 400, // depósitos incoherentes con el tipo
  MV002: 404, // el movimiento no existe
  MV003: 409, // ya confirmado o cancelado
  MV004: 409, // supera el disponible del origen
  MV005: 409, // movimiento sin detalle
  MV006: 423, // otro movimiento en proceso sobre el mismo artículo/depósito
  MV007: 400, // tipo de movimiento inexistente
  MV008: 400, // artículo o cantidad inválidos
  '55P03': 423, // lock_not_available: lo levanta Postgres por el NOWAIT
  40001: 423, // serialization_failure
  '40P01': 423, // deadlock_detected
  PGRST116: 404, // .single() no encontró filas
  [CODIGO_FK_VIOLADA]: 422,
  [CODIGO_CHECK_VIOLADO]: 400,
  [CODIGO_UUID_INVALIDO]: 400,
  AJ001: 400, // datos del ajuste inválidos
  AJ002: 403, // permiso faltante
  AJ003: 409, // disponible insuficiente
  AJ004: 404, // inventario inexistente
  AJ005: 409, // inventario no aprobado
  AJ006: 409, // ajustes ya aplicados
}

// Los raise exception de la migración ya están redactados para mostrarse tal
// cual, así que se preserva el mensaje que viene de la base.
function manejarErrorMovimiento(error, mensajePorDefecto) {
  const status = STATUS_POR_CODIGO[error?.code]
  if (status) throw errorDeApi(error.message || mensajePorDefecto, status)
  throw error
}

function validarMovimiento(movimiento) {
  const tipo = movimiento.tipo
  const cantidad = Number(movimiento.cantidad)

  if (!Object.values(TIPOS).includes(tipo)) {
    throw errorDeApi(
      'El tipo de movimiento debe ser ingreso, egreso, transferencia o ajuste',
      400,
    )
  }

  if (!movimiento.articulo_id) {
    throw errorDeApi('El artículo es obligatorio', 400)
  }

  if (tipo === TIPOS.AJUSTE) {
    if (!movimiento.deposito_id) {
      throw errorDeApi('El depósito es obligatorio para el ajuste', 400)
    }

    if (!['rotura', 'vencimiento', 'robo', 'conteo_fisico', 'otro'].includes(
      movimiento.categoria_ajuste,
    )) {
      throw errorDeApi('La categoría del ajuste no es válida', 400)
    }

    if (!movimiento.motivo_ajuste?.trim()) {
      throw errorDeApi('El motivo del ajuste es obligatorio', 400)
    }

    if (!Number.isFinite(cantidad) || cantidad === 0) {
      throw errorDeApi('La cantidad del ajuste debe ser distinta de 0', 400)
    }

    return
  }

  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw errorDeApi('La cantidad debe ser mayor a 0', 400)
  }

  if (tipo === TIPOS.INGRESO && !movimiento.deposito_destino_id) {
    throw errorDeApi('Un ingreso requiere depósito destino', 400)
  }

  if (tipo === TIPOS.EGRESO && !movimiento.deposito_origen_id) {
    throw errorDeApi('Un egreso requiere depósito origen', 400)
  }

  if (tipo === TIPOS.TRANSFERENCIA) {
    if (!movimiento.deposito_origen_id || !movimiento.deposito_destino_id) {
      throw errorDeApi(
        'Una transferencia requiere depósito origen y destino',
        400,
      )
    }

    if (movimiento.deposito_origen_id === movimiento.deposito_destino_id) {
      throw errorDeApi(
        'El depósito origen y el destino deben ser distintos',
        400,
      )
    }
  }
}

function validarMovimientoMultiarticulo(movimiento) {
  if (!movimiento.deposito_id) {
    throw errorDeApi('El depósito es obligatorio', 400)
  }
  if (![TIPOS.INGRESO, TIPOS.EGRESO, TIPOS.TRANSFERENCIA].includes(
    movimiento.tipo,
  )) {
    throw errorDeApi('El tipo de movimiento no es válido', 400)
  }
  if (!Array.isArray(movimiento.items) || movimiento.items.length === 0) {
    throw errorDeApi('Agregá al menos un artículo al movimiento', 400)
  }
  const ids = new Set()
  for (const item of movimiento.items) {
    const cantidad = Number(item.cantidad)
    if (!item.producto_id || !Number.isInteger(cantidad) || cantidad <= 0) {
      throw errorDeApi(
        'Todos los artículos deben tener una cantidad entera mayor a 0',
        400,
      )
    }
    if (ids.has(item.producto_id)) {
      throw errorDeApi('No se puede repetir un artículo en el movimiento', 400)
    }
    ids.add(item.producto_id)
  }
  if (
    movimiento.tipo === TIPOS.TRANSFERENCIA &&
    (!movimiento.deposito_destino_id ||
      movimiento.deposito_destino_id === movimiento.deposito_id)
  ) {
    throw errorDeApi('Seleccioná otro depósito de destino', 400)
  }
}

export async function getTiposMovimiento() {
  const { data, error } = await supabase
    .from('tipos_movimiento')
    .select('id, nombre, codigo')
    .order('nombre')

  if (error) throw error
  return data
}

export async function getMovimientos({
  estado = '',
  page = 1,
  pageSize = 10,
} = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS, { count: 'exact' })

  if (estado) consulta = consulta.eq('estado_movimiento', estado)

  const desde = (page - 1) * pageSize
  const { data, count, error } = await consulta
    .order('fecha', { ascending: false })
    .range(desde, desde + pageSize - 1)

  if (error) throw error

  const total = count ?? 0

  return {
    movimientos: data ?? [],
    total,
    page,
    pageSize,
    totalPaginas: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getMovimientoById(id) {
  const { data, error } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw errorDeApi('El movimiento no existe', 404)

  return data
}

/**
 * Consulta el historial de movimientos de stock con filtros opcionales.
 *
 * Todos los filtros pueden utilizarse de manera independiente o combinada.
 * La consulta es exclusivamente de lectura y no modifica movimientos.
 *
 * @param {Object} filtros - Filtros y datos de paginación.
 * @param {string} [filtros.articuloId] - ID del artículo.
 * @param {string} [filtros.tipoId] - ID del tipo de movimiento.
 * @param {string} [filtros.fechaDesde] - Fecha inicial en formato ISO.
 * @param {string} [filtros.fechaHasta] - Fecha final en formato ISO.
 * @param {string} [filtros.depositoOrigenId] - ID del depósito origen.
 * @param {string} [filtros.depositoDestinoId] - ID del depósito destino.
 * @param {number} [filtros.page=1] - Página solicitada.
 * @param {number} [filtros.pageSize=10] - Registros por página.
 * @returns {Promise<Object>} Movimientos encontrados y datos de paginación.
 */
export async function getHistorialMovimientos({
  articuloId = '',
  tipoId = '',
  fechaDesde = '',
  fechaHasta = '',
  depositoOrigenId = '',
  depositoDestinoId = '',
  page = 1,
  pageSize = 10,
} = {}) {
  let consulta = supabase
    .from(TABLA)
    .select(COLUMNAS_HISTORIAL, { count: 'exact' })

  if (articuloId) {
    consulta = consulta.eq('detalle.producto_id', articuloId)
  }

  if (tipoId) {
    consulta = consulta.eq('tipo_movimiento_id', tipoId)
  }

  if (fechaDesde) {
    const desdeFecha = new Date(`${fechaDesde}T00:00:00`)
    consulta = consulta.gte('fecha', desdeFecha.toISOString())
  } 
  
  if (fechaHasta) {
    const hastaFecha = new Date(`${fechaHasta}T23:59:59.999`)
    consulta = consulta.lte('fecha', hastaFecha.toISOString())
  }

  if (depositoOrigenId) {
    consulta = consulta.eq('deposito_origen_id', depositoOrigenId)
  }

  if (depositoDestinoId) {
    consulta = consulta.eq('deposito_destino_id', depositoDestinoId)
  }

  const desde = (page - 1) * pageSize

  const { data, count, error } = await consulta
    .order('fecha', { ascending: false })
    .range(desde, desde + pageSize - 1)

  if (error) throw error

  const total = count ?? 0

  return {
    movimientos: data ?? [],
    total,
    page,
    pageSize,
    totalPaginas: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function createMovimiento(movimiento) {
  validarMovimiento(movimiento)

  const tipo = movimiento.tipo

  if (tipo === TIPOS.AJUSTE) {
    const { data, error } = await supabase.rpc('crear_ajuste_inventario', {
      p_deposito_id: movimiento.deposito_id,
      p_producto_id: movimiento.articulo_id,
      p_cantidad: Number(movimiento.cantidad),
      p_categoria: movimiento.categoria_ajuste,
      p_motivo: movimiento.motivo_ajuste.trim(),
    }).single()

    if (error) manejarErrorMovimiento(error, 'No se pudo registrar el ajuste')
    return data
  }

  // El depósito que no corresponde al tipo se manda en null aunque el
  // formulario traiga un valor colgado: el trigger de la base lo rechazaría.
  const origen =
    tipo === TIPOS.INGRESO ? null : movimiento.deposito_origen_id || null
  const destino =
    tipo === TIPOS.EGRESO ? null : movimiento.deposito_destino_id || null

  // PostgREST hace match por nombre exacto de argumento: sin el prefijo p_
  // la respuesta es PGRST202 "function not found".
  const { data, error } = await supabase
    .rpc('crear_movimiento', {
      p_tipo: tipo,
      p_producto_id: movimiento.articulo_id,
      p_cantidad: Number(movimiento.cantidad),
      p_deposito_origen_id: origen,
      p_deposito_destino_id: destino,
      p_comprobante: movimiento.comprobante?.trim() || null,
      p_observaciones: movimiento.observaciones?.trim() || null,
    })
    .single()

  if (error) manejarErrorMovimiento(error, 'No se pudo registrar el movimiento')
  return data
}

/**
 * Crea una cabecera con todos los renglones y confirma el impacto de stock
 * dentro de una única transacción de PostgreSQL.
 */
export async function createMovimientoMultiarticulo(movimiento) {
  validarMovimientoMultiarticulo(movimiento)

  const { data, error } = await supabase
    .rpc('crear_movimiento_multiarticulo', {
      p_tipo: movimiento.tipo,
      p_deposito_id: movimiento.deposito_id,
      p_items: movimiento.items.map((item) => ({
        producto_id: item.producto_id,
        cantidad: Number(item.cantidad),
      })),
      p_deposito_destino_id:
        movimiento.tipo === TIPOS.TRANSFERENCIA
          ? movimiento.deposito_destino_id
          : null,
      p_comprobante: movimiento.comprobante?.trim() || null,
      p_observaciones: movimiento.observaciones?.trim() || null,
    })
    .single()

  if (error) {
    manejarErrorMovimiento(error, 'No se pudo confirmar el movimiento')
  }
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

  if (error) manejarErrorMovimiento(error, 'No se pudieron aplicar los ajustes')
  return data
}

export async function confirmarMovimiento(id) {
  if (!id) throw errorDeApi('El movimiento es obligatorio', 400)

  const { data, error } = await supabase
    .rpc('confirmar_movimiento', { p_movimiento_id: id })
    .single()

  if (error) manejarErrorMovimiento(error, 'No se pudo confirmar el movimiento')
  return data
}

export async function cancelarMovimiento(id) {
  if (!id) throw errorDeApi('El movimiento es obligatorio', 400)

  const { data, error } = await supabase
    .rpc('cancelar_movimiento', { p_movimiento_id: id })
    .single()

  if (error) manejarErrorMovimiento(error, 'No se pudo cancelar el movimiento')
  return data
}
