import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_PERMISO_INSUFICIENTE,
} from '../../stock/api/errores'

/**
 * Redondea un valor numérico a 2 decimales para precisión monetaria.
 *
 * @param {number} valor
 * @returns {number}
 */
export function redondear(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100
}

/**
 * Consulta la lista de depósitos disponibles para la venta.
 *
 * @returns {Promise<Array<Object>>} Lista de depósitos ordenados por nombre.
 */
export async function listarDepositos() {
  const { data, error } = await supabase
    .from('depositos')
    .select('id, nombre, direccion, localidad')
    .order('nombre', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Busca clientes habilitados para operar en ventas mostrador (CA-02).
 *
 * @param {string} [texto=''] Término de búsqueda (Nombre, Apellido, Razón Social, DNI o CUIT).
 * @returns {Promise<Array<Object>>} Lista de clientes activos.
 */
export async function buscarClientes(texto = '') {
  let query = supabase
    .from('clientes')
    .select(`
      id,
      numero,
      tipo_persona,
      nombre,
      apellido,
      razon_social,
      tipo_documento,
      numero_documento,
      estado,
      condicion_iva:condiciones_iva(id, nombre),
      tipo_cliente:tipos_cliente(id, nombre, lista_precio_id)
    `)
    .eq('estado', 'Activo')

  const termino = texto?.trim()
  if (termino) {
    query = query.or(
      `nombre.ilike.%${termino}%,apellido.ilike.%${termino}%,razon_social.ilike.%${termino}%,numero_documento.ilike.%${termino}%`,
    )
  }

  query = query
    .order('apellido', { ascending: true, nullsFirst: false })
    .order('nombre', { ascending: true, nullsFirst: false })
    .order('razon_social', { ascending: true, nullsFirst: false })
    .limit(30)

  const { data, error } = await query

  if (error) throw error
  return data || []
}

/**
 * Obtiene el precio de venta unitario de un artículo aplicando la lista de precios
 * correspondiente al cliente o la lista General (CA-04).
 *
 * @param {string} productoId UUID del producto.
 * @param {string} [clienteId=null] UUID del cliente (opcional).
 * @param {number} [cantidad=1] Cantidad de la línea.
 * @returns {Promise<number|null>} Precio unitario o null si no está definido.
 */
export async function calcularPrecioVenta(productoId, clienteId = null, cantidad = 1) {
  if (!productoId) {
    throw errorDeApi('El producto es obligatorio para calcular precio', 400)
  }

  const { data, error } = await supabase.rpc('calcular_precio_venta', {
    p_producto: productoId,
    p_cliente: clienteId || null,
    p_cantidad: Number(cantidad) > 0 ? Number(cantidad) : 1,
  })

  if (error) throw error
  return data !== null && data !== undefined ? Number(data) : null
}

/**
 * Valida que el precio enviado por el navegador coincida con el precio calculado
 * por la base de datos para producto, cliente y cantidad. Esto evita precios
 * manipulados en el frontend y rechaza productos sin precio válido.
 *
 * @param {string} productoId UUID del producto
 * @param {string|null} clienteId UUID del cliente
 * @param {number} cantidad Cantidad de la línea
 * @param {number|null} precioUnitario Precio recibido en la UI
 * @returns {Promise<{valido: boolean, precio_esperado: number}>}
 */
export async function validarPrecioVenta(
  productoId,
  clienteId = null,
  cantidad = 1,
  precioUnitario = null,
) {
  if (!productoId) {
    throw errorDeApi('El producto es obligatorio para validar precio', 400)
  }
  if (precioUnitario === undefined || precioUnitario === null) {
    throw errorDeApi('El precio unitario es obligatorio para validar la venta', 400)
  }

  const precioEsperado = await calcularPrecioVenta(productoId, clienteId, cantidad)

  if (precioEsperado === null) {
    throw errorDeApi(
      'No existe un precio válido para este producto en la lista del cliente.',
      400,
    )
  }

  if (Math.abs(Number(precioUnitario) - Number(precioEsperado)) > 0.01) {
    throw errorDeApi(
      'El precio del artículo cambió. Actualizá y confirmá nuevamente.',
      409,
    )
  }

  return {
    valido: true,
    precio_esperado: precioEsperado,
  }
}

/**
 * Valida si un porcentaje de descuento manual requiere autorización de un supervisor (CA-05).
 *
 * @param {number} porcentaje Porcentaje de descuento manual (0-100).
 * @returns {Promise<{requiere_autorizacion: boolean, limite: number|null}>}
 */
export async function validarDescuentoManual(porcentaje) {
  const pct = Number(porcentaje)
  if (isNaN(pct) || pct < 0 || pct > 100) {
    throw errorDeApi('El porcentaje debe estar entre 0 y 100', 400)
  }

  const { data, error } = await supabase.rpc('validar_descuento_manual', {
    p_porcentaje: pct,
  })

  if (error) throw error
  return data
}

/**
 * Busca artículos activos con stock disponible en un depósito determinado (CA-03).
 *
 * @param {string} depositoId UUID del depósito.
 * @param {string} [texto=''] Término de búsqueda (Nombre, SKU, código de barras).
 * @param {string} [clienteId=null] UUID del cliente para calcular precio anticipado.
 * @returns {Promise<Array<Object>>} Artículos con stock disponible y precio resuelto.
 */
export async function buscarArticulos(depositoId, texto = '', clienteId = null) {
  if (!depositoId) {
    throw errorDeApi('El depósito es obligatorio para buscar artículos', 400)
  }

  // 1. Obtener artículos con stock disponible en el depósito
  const { data: stockRows, error: stockError } = await supabase
    .from('v_stock_disponible')
    .select('producto_id, disponible')
    .eq('deposito_id', depositoId)
    .gt('disponible', 0)

  if (stockError) throw stockError
  if (!stockRows || stockRows.length === 0) return []

  const ids = stockRows.map((s) => s.producto_id)
  const stockMap = Object.fromEntries(
    stockRows.map((s) => [s.producto_id, Number(s.disponible)]),
  )

  // 2. Consultar catálogo de productos activos
  let query = supabase
    .from('productos')
    .select(`
      id,
      sku,
      nombre,
      descripcion,
      codigo_barras,
      estado_producto,
      unidad_medida:unidades_medida (
        id,
        nombre,
        abreviatura
      )
    `)
    .in('id', ids)
    .eq('estado_producto', 'activo')

  const termino = texto?.trim()
  if (termino) {
    query = query.or(
      `nombre.ilike.%${termino}%,sku.ilike.%${termino}%,codigo_barras.ilike.%${termino}%`,
    )
  }

  query = query.order('nombre', { ascending: true }).limit(50)

  const { data: productos, error: prodError } = await query
  if (prodError) throw prodError

  // 3. Resolver precio de venta unitario inicial para cada artículo
  const articulos = await Promise.all(
    (productos || []).map(async (prod) => {
      let precio = null
      try {
        precio = await calcularPrecioVenta(prod.id, clienteId, 1)
      } catch {
        precio = null
      }

      return {
        id: prod.id,
        producto_id: prod.id,
        sku: prod.sku,
        nombre: prod.nombre,
        descripcion: prod.descripcion,
        codigo_barras: prod.codigo_barras,
        unidad_medida:
          prod.unidad_medida?.abreviatura ||
          prod.unidad_medida?.nombre ||
          'un.',
        stock_disponible: stockMap[prod.id] ?? 0,
        disponible: stockMap[prod.id] ?? 0,
        precio_unitario: precio,
      }
    }),
  )

  return articulos
}

/**
 * Agrega un artículo a la lista de líneas de venta.
 * Si el artículo ya existe en la lista, suma la cantidad a la línea existente (CA-07).
 *
 * @param {Array<Object>} lineasExistentes Lista actual de líneas en el carrito.
 * @param {Object} articulo Artículo a agregar.
 * @param {number} [cantidad=1] Cantidad a agregar.
 * @param {number|null} [precioUnitario=null] Precio unitario resuelto.
 * @returns {Array<Object>} Nueva lista de líneas actualizada.
 */
export function agregarArticuloALineas(
  lineasExistentes = [],
  articulo,
  cantidad = 1,
  precioUnitario = null,
) {
  const productoId = articulo.producto_id || articulo.id
  const cant = Math.max(1, Number(cantidad) || 1)
  const index = lineasExistentes.findIndex((l) => l.producto_id === productoId)
  const precioValido = precioUnitario !== null && precioUnitario !== undefined
  const precio = precioValido ? Number(precioUnitario) : Number(articulo.precio_unitario ?? 0)

  if (index >= 0) {
    const lineaActual = lineasExistentes[index]
    const nuevaCantidad = lineaActual.cantidad + cant
    const precioLinea = precioValido ? precio : lineaActual.precio_unitario
    const descuento = Number(lineaActual.descuento_pct || 0)
    const nuevoSubtotal = redondear(
      nuevaCantidad * precioLinea * (1 - descuento / 100),
    )

    const actualizadas = [...lineasExistentes]
    actualizadas[index] = {
      ...lineaActual,
      cantidad: nuevaCantidad,
      precio_unitario: precioLinea,
      precio_validado: precioValido || lineaActual.precio_validado !== false,
      subtotal: nuevoSubtotal,
    }
    return actualizadas
  }

  const subtotal = redondear(cant * precio)

  return [
    ...lineasExistentes,
    {
      producto_id: productoId,
      nombre: articulo.nombre,
      sku: articulo.sku,
      unidad_medida: articulo.unidad_medida || 'un.',
      stock_disponible: articulo.stock_disponible ?? articulo.disponible ?? 0,
      cantidad: cant,
      backorder: false,
      precio_unitario: precio,
      precio_validado: precioValido,
      descuento_pct: 0,
      autorizacion_descuento_id: null,
      subtotal,
    },
  ]
}

/**
 * Calcula los totales consolidados de la venta (total monetario y cantidad de unidades) (CA-04).
 *
 * @param {Array<Object>} lineas Lista de líneas cargadas.
 * @returns {{ total: number, totalArticulos: number, cantidadItems: number }}
 */
export function calcularTotalesVenta(lineas = []) {
  const total = redondear(
    lineas.reduce((acc, l) => acc + (Number(l.subtotal) || 0), 0),
  )
  const totalArticulos = lineas.reduce(
    (acc, l) => acc + (Number(l.cantidad) || 0),
    0,
  )

  return {
    total,
    totalArticulos,
    cantidadItems: lineas.length,
  }
}

/**
 * Registra una venta completa en una sola transacción atómica (CA-06).
 *
 * @param {Object} cabecera Datos de cabecera: {deposito_id, cliente_id, observaciones}
 * @param {Array<Object>} items Líneas de la venta: {producto_id, cantidad, precio_unitario, descuento_pct?, autorizacion_descuento_id?, backorder?}
 * @returns {Promise<Object>} Venta creada con su número correlativo y estado 'Pendiente'.
 * @throws {Error} 422 STOCK_INSUFICIENTE con `details` por línea.
 * @throws {Error} 403 si el usuario no tiene permiso 'ventas.registrar'.
 * @throws {Error} 400 por validación de parámetros.
 */
export async function registrarVenta(cabecera, items) {
  if (!cabecera?.deposito_id) {
    throw errorDeApi('El depósito es obligatorio', 400)
  }
  if (!cabecera?.cliente_id) {
    throw errorDeApi('El cliente es obligatorio', 400)
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw errorDeApi('La venta debe tener al menos un artículo', 400)
  }

  for (const item of items) {
    if (!item.producto_id) {
      throw errorDeApi('Cada artículo debe tener un producto válido', 400)
    }
    if (item.cantidad === undefined || item.cantidad === null || Number(item.cantidad) <= 0) {
      throw errorDeApi('La cantidad debe ser mayor a 0', 400)
    }
    if (item.precio_unitario === undefined || item.precio_unitario === null || Number(item.precio_unitario) <= 0) {
      throw errorDeApi('El precio unitario debe ser mayor a 0', 400)
    }
    if (item.descuento_pct !== undefined && item.descuento_pct !== null) {
      const desc = Number(item.descuento_pct)
      if (isNaN(desc) || desc < 0 || desc > 100) {
        throw errorDeApi('El porcentaje de descuento debe estar entre 0 y 100', 400)
      }
    }

  }

  const payloadItems = items.map((i) => ({
    producto_id: i.producto_id,
    cantidad: Number(i.cantidad),
    precio_unitario: Number(i.precio_unitario),
    descuento_pct: Number(i.descuento_pct || 0),
    autorizacion_descuento_id: i.autorizacion_descuento_id || null,
    backorder: Boolean(i.backorder),
  }))

  const { data, error } = await supabase
    .rpc('registrar_venta', {
      p_cabecera: {
        deposito_id: cabecera.deposito_id,
        cliente_id: cabecera.cliente_id,
        observaciones: cabecera.observaciones?.trim() || null,
      },
      p_items: payloadItems,
    })
    .single()

  if (error) {
    if (error.message?.includes('STOCK_INSUFICIENTE')) {
      let details = []
      const rawDetails = error.details || error.hint
      if (rawDetails) {
        try {
          details = typeof rawDetails === 'string' ? JSON.parse(rawDetails) : rawDetails
        } catch {
          details = []
        }
      }
      const err = errorDeApi(error.message, 422)
      err.code = 'STOCK_INSUFICIENTE'
      err.details = Array.isArray(details) ? details : []
      throw err
    }
    if (error.code === CODIGO_PERMISO_INSUFICIENTE || error.message?.includes('permiso')) {
      throw errorDeApi('No tenés permiso para registrar ventas', 403)
    }
    throw errorDeApi(error.message || 'Error al registrar la venta', 400)
  }

  return data
}
