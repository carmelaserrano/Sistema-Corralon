import { supabase } from '../../../lib/supabaseClient'

const LIMITE_CLIENTES = 20

const COLUMNAS_CLIENTE_BUSQUEDA = `
  id,
  numero,
  tipo_persona,
  nombre,
  apellido,
  razon_social,
  tipo_documento,
  numero_documento,
  estado
`

const COLUMNAS_RESUMEN_CLIENTE = `
  id,
  numero,
  tipo_persona,
  nombre,
  apellido,
  razon_social,
  tipo_documento,
  numero_documento,
  email,
  telefono,
  estado,
  origen,
  habilita_cta_cte,
  tipo_cliente:tipos_cliente(
    id,
    nombre,
    lista_precio:listas_precio(id, nombre)
  )
`

function errorValidacion(mensaje, campo) {
  const error = new Error(mensaje)
  error.status = 400
  error.campo = campo
  return error
}

function validarId(valor, entidad) {
  if (!valor) throw errorValidacion(`El ${entidad} es obligatorio`, entidad)
}

function parsearFecha(fecha, campo) {
  if (!fecha) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw errorValidacion(`La fecha ${campo} no es válida`, campo)
  }

  const [anio, mes, dia] = fecha.split('-').map(Number)
  const valor = new Date(anio, mes - 1, dia)
  if (
    Number.isNaN(valor.getTime()) ||
    valor.getFullYear() !== anio ||
    valor.getMonth() !== mes - 1 ||
    valor.getDate() !== dia
  ) {
    throw errorValidacion(`La fecha ${campo} no es válida`, campo)
  }

  return valor
}

/**
 * Convierte fechas de calendario en un rango de timestamps. El límite
 * superior es exclusivo (medianoche local del día siguiente), de modo que
 * incluye por completo el día "hasta" sin depender de fracciones de segundo.
 *
 * @param {{desde?: string, hasta?: string}} filtros
 * @returns {{desdeIso: string|null, hastaExclusivoIso: string|null}}
 */
export function crearRangoFechas({ desde = '', hasta = '' } = {}) {
  const inicio = parsearFecha(desde, 'desde')
  const fin = parsearFecha(hasta, 'hasta')

  if (inicio && fin && inicio > fin) {
    throw errorValidacion('La fecha desde no puede ser posterior a la fecha hasta', 'desde')
  }

  if (fin) fin.setDate(fin.getDate() + 1)

  return {
    desdeIso: inicio?.toISOString() ?? null,
    hastaExclusivoIso: fin?.toISOString() ?? null,
  }
}

function aplicarRangoFechas(consulta, columna, filtros) {
  const { desdeIso, hastaExclusivoIso } = crearRangoFechas(filtros)
  let resultado = consulta
  if (desdeIso) resultado = resultado.gte(columna, desdeIso)
  if (hastaExclusivoIso) resultado = resultado.lt(columna, hastaExclusivoIso)
  return resultado
}

/**
 * Busca clientes por nombre, razón social, apellido o documento. Una búsqueda
 * vacía devuelve los clientes más recientes para que el selector sea usable
 * desde el primer ingreso.
 *
 * @param {string} termino
 * @returns {Promise<Array<Object>>}
 */
export async function buscarClientes(termino = '') {
  let consulta = supabase.from('clientes').select(COLUMNAS_CLIENTE_BUSQUEDA)
  const texto = termino.trim()

  if (texto) {
    const patron = `%${texto}%`
    consulta = consulta.or(
      `nombre.ilike.${patron},apellido.ilike.${patron},razon_social.ilike.${patron},numero_documento.ilike.${patron}`,
    )
  }

  const { data, error } = await consulta
    .order('created_at', { ascending: false })
    .limit(LIMITE_CLIENTES)

  if (error) throw error
  return data ?? []
}

/**
 * Suma el total persistido de las ventas comerciales válidas del cliente.
 * Se excluyen solamente las ventas Anuladas: Pendiente, Facturada y Entregada
 * son estados operativos vigentes definidos por el esquema.
 *
 * @param {string} clienteId
 * @returns {Promise<number>}
 */
export async function obtenerTotalComprado(clienteId) {
  validarId(clienteId, 'cliente')
  const { data, error } = await supabase
    .from('ventas')
    .select('total')
    .eq('cliente_id', clienteId)
    .neq('estado', 'Anulada')

  if (error) throw error
  return (data ?? []).reduce((total, venta) => total + Number(venta.total ?? 0), 0)
}

/**
 * Obtiene los datos de cabecera del cliente junto con su total comprado.
 *
 * @param {string} clienteId
 * @returns {Promise<{cliente: Object, totalComprado: number}>}
 */
export async function obtenerResumenCliente(clienteId) {
  validarId(clienteId, 'cliente')
  const [respuestaCliente, totalComprado] = await Promise.all([
    supabase
      .from('clientes')
      .select(COLUMNAS_RESUMEN_CLIENTE)
      .eq('id', clienteId)
      .single(),
    obtenerTotalComprado(clienteId),
  ])

  if (respuestaCliente.error) throw respuestaCliente.error
  return { cliente: respuestaCliente.data, totalComprado }
}

/** @param {string} clienteId @param {{desde?: string, hasta?: string}} filtros */
export async function listarVentasCliente(clienteId, filtros = {}) {
  validarId(clienteId, 'cliente')
  let consulta = supabase
    .from('ventas')
    .select('id, numero, created_at, total, estado')
    .eq('cliente_id', clienteId)

  consulta = aplicarRangoFechas(consulta, 'created_at', filtros)
  const { data, error } = await consulta.order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/** @param {string} clienteId @param {{desde?: string, hasta?: string}} filtros */
export async function listarComprobantesCliente(clienteId, filtros = {}) {
  validarId(clienteId, 'cliente')
  let consulta = supabase
    .from('comprobantes_venta')
    .select(`
      id,
      numero,
      fecha_emision,
      total,
      estado,
      tipo_comprobante,
      letra,
      venta:ventas!inner(cliente_id)
    `)
    .eq('venta.cliente_id', clienteId)

  consulta = aplicarRangoFechas(consulta, 'fecha_emision', filtros)
  const { data, error } = await consulta.order('fecha_emision', { ascending: false })

  if (error) throw error
  return data ?? []
}

/** @param {string} clienteId @param {{desde?: string, hasta?: string}} filtros */
export async function listarCobrosCliente(clienteId, filtros = {}) {
  validarId(clienteId, 'cliente')
  let consulta = supabase
    .from('cobros_venta')
    .select('id, numero, created_at, total, venta:ventas!inner(cliente_id)')
    .eq('venta.cliente_id', clienteId)

  consulta = aplicarRangoFechas(consulta, 'created_at', filtros)
  const { data, error } = await consulta.order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/** @param {string} clienteId @param {{desde?: string, hasta?: string}} filtros */
export async function listarPedidosWebCliente(clienteId, filtros = {}) {
  validarId(clienteId, 'cliente')
  let consulta = supabase
    .from('pedidos_web')
    .select('id, numero, created_at, total, estado')
    .eq('cliente_id', clienteId)

  consulta = aplicarRangoFechas(consulta, 'created_at', filtros)
  const { data, error } = await consulta.order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Obtiene los renglones de una venta con el artículo relacionado.
 *
 * @param {string} ventaId
 * @returns {Promise<Array<Object>>}
 */
export async function obtenerDetalleVenta(ventaId) {
  validarId(ventaId, 'venta')
  const { data, error } = await supabase
    .from('detalle_venta')
    .select(`
      id,
      cantidad,
      precio_unitario,
      descuento_pct,
      subtotal,
      producto:productos(id, sku, nombre, descripcion)
    `)
    .eq('venta_id', ventaId)
    .order('created_at')

  if (error) throw error
  return data ?? []
}

/**
 * Contrato agregador conservado desde el stub de S3-08.
 *
 * @param {string} clienteId
 * @param {{desde?: string, hasta?: string}} filtros
 * @returns {Promise<Object>}
 */
export async function getHistorialCliente(clienteId, filtros = {}) {
  validarId(clienteId, 'cliente')
  const [resumen, ventas, comprobantes, cobros, pedidosWeb] = await Promise.all([
    obtenerResumenCliente(clienteId),
    listarVentasCliente(clienteId, filtros),
    listarComprobantesCliente(clienteId, filtros),
    listarCobrosCliente(clienteId, filtros),
    listarPedidosWebCliente(clienteId, filtros),
  ])

  return {
    ...resumen,
    ventas,
    comprobantes,
    cobros,
    pedidosWeb,
  }
}
