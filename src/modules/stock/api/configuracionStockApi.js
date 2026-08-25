import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_FK_VIOLADA,
  CODIGO_CHECK_VIOLADO,
  CODIGO_UUID_INVALIDO,
} from './errores'

const TABLA = 'configuracion_stock'

const COLUMNAS = `
  id,
  producto_id,
  deposito_id,
  min_stock,
  max_stock,
  created_at,
  producto:productos (
    id,
    sku,
    nombre
  ),
  deposito:depositos (
    id,
    nombre
  )
`

function validarConfiguracion({
  articulo_id,
  deposito_id,
  stock_minimo,
  stock_maximo,
}) {
  if (!articulo_id) {
    throw errorDeApi('El artículo es obligatorio', 400)
  }

  if (!deposito_id) {
    throw errorDeApi('El depósito es obligatorio', 400)
  }

  if (
    stock_minimo === '' ||
    stock_minimo === null ||
    stock_minimo === undefined
  ) {
    throw errorDeApi('El stock mínimo es obligatorio', 400)
  }

  if (
    stock_maximo === '' ||
    stock_maximo === null ||
    stock_maximo === undefined
  ) {
    throw errorDeApi('El stock máximo es obligatorio', 400)
  }

  const minimo = Number(stock_minimo)
  const maximo = Number(stock_maximo)

  if (Number.isNaN(minimo) || Number.isNaN(maximo)) {
    throw errorDeApi('El stock mínimo y máximo deben ser números válidos', 400)
  }

  if (minimo < 0 || maximo < 0) {
    throw errorDeApi('El stock mínimo y máximo no pueden ser negativos', 400)
  }

  if (minimo > maximo) {
    throw errorDeApi('El stock mínimo no puede ser mayor al stock máximo', 400)
  }
}

async function verificarArticuloYDeposito(articulo_id, deposito_id) {
  const { data: articulo, error: articuloError } = await supabase
    .from('productos')
    .select('id')
    .eq('id', articulo_id)
    .maybeSingle()

  if (articuloError) {
    if (articuloError.code === CODIGO_UUID_INVALIDO) {
      throw errorDeApi('El artículo no existe', 404)
    }
    throw articuloError
  }

  if (!articulo) {
    throw errorDeApi('El artículo no existe', 404)
  }

  const { data: deposito, error: depositoError } = await supabase
    .from('depositos')
    .select('id')
    .eq('id', deposito_id)
    .maybeSingle()

  if (depositoError) {
    if (depositoError.code === CODIGO_UUID_INVALIDO) {
      throw errorDeApi('El depósito no existe', 404)
    }
    throw depositoError
  }

  if (!deposito) {
    throw errorDeApi('El depósito no existe', 404)
  }
}

function manejarErrorConfiguracion(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi(
      'Ya existe una configuración para ese artículo y depósito',
      409,
    )
  }

  if (error?.code === CODIGO_FK_VIOLADA) {
    throw errorDeApi('El artículo o depósito seleccionado no existe', 404)
  }

  if (error?.code === CODIGO_CHECK_VIOLADO) {
    throw errorDeApi(
      'El stock mínimo y máximo no cumplen las reglas de validación',
      400,
    )
  }

  throw error
}

export async function getConfiguracionesStock({
  deposito_id = '',
  articulo_id = '',
} = {}) {
  let consulta = supabase
    .from(TABLA)
    .select(COLUMNAS)
    .order('created_at', { ascending: false })

  if (deposito_id) {
    consulta = consulta.eq('deposito_id', deposito_id)
  }

  if (articulo_id) {
    consulta = consulta.eq('producto_id', articulo_id)
  }

  const { data: configuraciones, error } = await consulta

  if (error) throw error

  const lista = configuraciones ?? []

  if (lista.length === 0) {
    return []
  }

  const { data: stock, error: stockError } = await supabase
    .from('stock_x_deposito')
    .select('producto_id, deposito_id, cantidad')

  if (stockError) throw stockError

  const stockPorArticuloDeposito = new Map(
    (stock ?? []).map((item) => [
      `${item.producto_id}:${item.deposito_id}`,
      Number(item.cantidad),
    ]),
  )

  return lista.map((configuracion) => {
    const clave = `${configuracion.producto_id}:${configuracion.deposito_id}`

    const existeStock = stockPorArticuloDeposito.has(clave)

    const stockActual = existeStock
      ? stockPorArticuloDeposito.get(clave)
      : null

    let estado = 'Sin stock registrado'

if (existeStock) {
  if (stockActual < Number(configuracion.min_stock)) {
    estado = 'Stock bajo'
  } else if (stockActual > Number(configuracion.max_stock)) {
    estado = 'Stock alto'
  } else {
    estado = 'Normal'
  }
}

return {
  ...configuracion,
  stock_actual: stockActual,
  estado_stock: estado,
}
  })
}

export async function createConfiguracionStock(configuracion) {
  validarConfiguracion(configuracion)

  await verificarArticuloYDeposito(
    configuracion.articulo_id,
    configuracion.deposito_id,
  )

  const { data, error } = await supabase
    .from(TABLA)
    .insert({
      producto_id: configuracion.articulo_id,
      deposito_id: configuracion.deposito_id,
      min_stock: Number(configuracion.stock_minimo),
      max_stock: Number(configuracion.stock_maximo),
    })
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorConfiguracion(error)

  return data
}

export async function updateConfiguracionStock(id, configuracion) {
  validarConfiguracion(configuracion)

  const { data: existente, error: existenteError } = await supabase
    .from(TABLA)
    .select('id, producto_id, deposito_id')
    .eq('id', id)
    .maybeSingle()

  if (existenteError) {
    if (existenteError.code === CODIGO_UUID_INVALIDO) {
      throw errorDeApi('La configuración no existe', 404)
    }
    throw existenteError
  }

  if (!existente) {
    throw errorDeApi('La configuración no existe', 404)
  }

  const { data, error } = await supabase
    .from(TABLA)
    .update({
      min_stock: Number(configuracion.stock_minimo),
      max_stock: Number(configuracion.stock_maximo),
    })
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorConfiguracion(error)

  return data
}