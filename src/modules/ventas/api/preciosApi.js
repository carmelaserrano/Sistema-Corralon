import { supabase } from '../../../lib/supabaseClient'
import {
  CODIGO_CHECK_VIOLADO,
  CODIGO_DUPLICADO,
  CODIGO_SIN_FILAS,
  errorDeApi,
} from '../../stock/api/errores'

const TABLA_LISTAS = 'listas_precio'
const TABLA_PRECIOS = 'precios_lista'
const TABLA_TIPOS = 'tipos_cliente'
const TABLA_PRODUCTOS = 'productos'

const COLUMNAS_LISTA = 'id, nombre, activo, created_at'
const COLUMNAS_PRECIO =
  'id, lista_precio_id, producto_id, precio, created_at'
const COLUMNAS_TIPO = 'id, nombre, lista_precio_id, activo, created_at'

export const PERMISO_GESTIONAR_PRECIOS = 'precios.gestionar'

function nombreNormalizado(nombre) {
  const normalizado = nombre?.trim()

  if (!normalizado) {
    throw errorDeApi('El nombre es obligatorio', 400)
  }

  return normalizado
}

function manejarErrorLista(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi(
      'Ya existe una lista de precios con ese nombre',
      409,
    )
  }

  if (error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo guardar la lista: no existe o no tenés permiso para modificarla',
      403,
    )
  }

  throw error
}

function precioNormalizado(precio) {
  const valor = Number(precio)

  if (!Number.isFinite(valor) || valor <= 0) {
    throw errorDeApi('El precio debe ser mayor a 0', 400)
  }

  return valor
}

function manejarErrorPrecio(error) {
  if (error?.code === CODIGO_CHECK_VIOLADO) {
    throw errorDeApi('El precio debe ser mayor a 0', 400)
  }

  if (error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo guardar el precio: no tenés permiso para modificarlo',
      403,
    )
  }

  throw error
}

/** Lista todas las listas, incluidas las desactivadas. */
export async function listarListasPrecio() {
  const { data, error } = await supabase
    .from(TABLA_LISTAS)
    .select(COLUMNAS_LISTA)
    .order('nombre')

  if (error) throw error
  return data ?? []
}

/** Crea una lista activa. */
export async function crearListaPrecio(nombre) {
  const { data, error } = await supabase
    .from(TABLA_LISTAS)
    .insert({ nombre: nombreNormalizado(nombre) })
    .select(COLUMNAS_LISTA)
    .single()

  if (error) manejarErrorLista(error)
  return data
}

/** Edita los datos admitidos por el contrato actual de una lista. */
export async function editarListaPrecio(id, datos) {
  const cambios = { nombre: nombreNormalizado(datos?.nombre) }
  const { data, error } = await supabase
    .from(TABLA_LISTAS)
    .update(cambios)
    .eq('id', id)
    .select(COLUMNAS_LISTA)
    .single()

  if (error) manejarErrorLista(error)
  return data
}

/** Desactiva una lista sin borrar físicamente la fila. */
export async function desactivarListaPrecio(id) {
  const { data, error } = await supabase
    .from(TABLA_LISTAS)
    .update({ activo: false })
    .eq('id', id)
    .select(COLUMNAS_LISTA)
    .single()

  if (error) manejarErrorLista(error)
  return data
}

/**
 * Devuelve todos los productos activos y combina el precio de la lista.
 * `precio` queda en null cuando todavía no existe una fila en precios_lista.
 */
export async function listarProductosConPrecio(listaId) {
  const consultaProductos = supabase
    .from(TABLA_PRODUCTOS)
    .select('id, sku, nombre')
    .eq('estado_producto', 'activo')
    .order('nombre')
  const consultaPrecios = supabase
    .from(TABLA_PRECIOS)
    .select(COLUMNAS_PRECIO)
    .eq('lista_precio_id', listaId)

  const [respuestaProductos, respuestaPrecios] = await Promise.all([
    consultaProductos,
    consultaPrecios,
  ])

  if (respuestaProductos.error) throw respuestaProductos.error
  if (respuestaPrecios.error) throw respuestaPrecios.error

  const preciosPorProducto = new Map(
    (respuestaPrecios.data ?? []).map((fila) => [fila.producto_id, fila]),
  )

  return (respuestaProductos.data ?? []).map((producto) => {
    const filaPrecio = preciosPorProducto.get(producto.id)

    return {
      ...producto,
      precio_id: filaPrecio?.id ?? null,
      precio: filaPrecio?.precio ?? null,
    }
  })
}

/** Crea o actualiza el precio de un producto dentro de una lista. */
export async function guardarPrecio(listaId, productoId, precio) {
  const fila = {
    lista_precio_id: listaId,
    producto_id: productoId,
    precio: precioNormalizado(precio),
  }
  const { data, error } = await supabase
    .from(TABLA_PRECIOS)
    .upsert(fila, { onConflict: 'lista_precio_id,producto_id' })
    .select(COLUMNAS_PRECIO)
    .single()

  if (error) manejarErrorPrecio(error)
  return data
}

/** Lista los tipos de cliente activos y su asignación actual. */
export async function listarTiposCliente() {
  const { data, error } = await supabase
    .from(TABLA_TIPOS)
    .select(COLUMNAS_TIPO)
    .eq('activo', true)
    .order('nombre')

  if (error) throw error
  return data ?? []
}

/** Asigna únicamente una lista activa a un tipo de cliente. */
export async function asignarListaATipo(tipoClienteId, listaId) {
  const { data: lista, error: errorLista } = await supabase
    .from(TABLA_LISTAS)
    .select('id')
    .eq('id', listaId)
    .eq('activo', true)
    .single()

  if (errorLista) {
    if (errorLista.code === CODIGO_SIN_FILAS) {
      throw errorDeApi('Elegí una lista de precios activa', 400)
    }
    throw errorLista
  }
  if (!lista) throw errorDeApi('Elegí una lista de precios activa', 400)

  const { data, error } = await supabase
    .from(TABLA_TIPOS)
    .update({ lista_precio_id: lista.id })
    .eq('id', tipoClienteId)
    .select(COLUMNAS_TIPO)
    .single()

  if (error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo asignar la lista: el tipo no existe o no tenés permiso para modificarlo',
      403,
    )
  }
  if (error) throw error
  return data
}

/** Indica si el usuario actual puede gestionar listas, precios y asignaciones. */
export async function puedeGestionarPrecios() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_GESTIONAR_PRECIOS,
  })

  if (error) throw error
  return data === true
}
