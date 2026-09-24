import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_PERMISO_INSUFICIENTE,
  CODIGO_SIN_FILAS,
  CODIGO_UUID_INVALIDO,
} from '../../stock/api/errores'

// La tienda lee solo de v_catalogo_web (0033 + 0043): productos activos y
// publicados, precio de la lista General y disponibilidad sobre el depósito
// de e-commerce (D-S3-03). Nunca expone cantidades exactas.
const VISTA = 'v_catalogo_web'
const BUCKET = 'productos'

export const POR_PAGINA = 12
export const ORDENES = ['nombre', 'precio']
export const DIRECCIONES = ['asc', 'desc']
export const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp']
export const TAMANO_MAXIMO_IMAGEN = 2 * 1024 * 1024

const COLUMNAS_CATALOGO =
  'id, sku, nombre, imagen_url, precio, disponible, categoria_id, categoria_nombre, marca_id, marca_nombre'
const COLUMNAS_DETALLE = `${COLUMNAS_CATALOGO}, descripcion, unidad_medida, unidad_abreviatura`
const COLUMNAS_PUBLICACION = `
  id,
  sku,
  nombre,
  estado_producto,
  publicado_web,
  imagen_url,
  categoria:categorias(nombre),
  marca:marcas(nombre)
`

const EXTENSIONES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/**
 * Escapa los comodines de LIKE para que el texto se busque literal.
 * @param {string} texto Texto ingresado por el usuario.
 * @returns {string} Texto con `\`, `%` y `_` escapados.
 */
export function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)
}

function normalizarPagina(pagina) {
  const numero = Number(pagina)
  return Number.isInteger(numero) && numero > 0 ? numero : 1
}

function convertirProducto(fila) {
  return {
    ...fila,
    precio: fila.precio === null ? null : Number(fila.precio),
    disponible: fila.disponible === true,
  }
}

function traducirError(error, mensaje) {
  if (error.code === CODIGO_PERMISO_INSUFICIENTE) {
    return errorDeApi('No tenés permiso para publicar productos en la tienda', 403)
  }
  if (error.code === CODIGO_UUID_INVALIDO) return errorDeApi('El producto no existe', 404)
  return errorDeApi(mensaje, 500)
}

/**
 * Lista el catálogo público con paginado del lado del servidor.
 * Los productos sin precio en la lista General no se listan: no se pueden comprar.
 * @param {Object} [filtros]
 * @param {string} [filtros.busqueda] Texto a buscar en el nombre (sin distinguir mayúsculas).
 * @param {string} [filtros.categoriaId] ID de categoría.
 * @param {string} [filtros.marcaId] ID de marca.
 * @param {'nombre'|'precio'} [filtros.orden='nombre'] Campo de orden; otro valor → 400.
 * @param {'asc'|'desc'} [filtros.direccion='asc'] Dirección del orden; otro valor → 400.
 * @param {number} [filtros.pagina=1] Página (desde 1), de a POR_PAGINA productos.
 * @returns {Promise<{items: Array<Object>, total: number}>} Productos de la página y total filtrado.
 * @throws {Error} status 400 por orden inválido, 500 si falla la consulta.
 */
export async function listarCatalogo({
  busqueda = '',
  categoriaId,
  marcaId,
  orden = 'nombre',
  direccion = 'asc',
  pagina = 1,
} = {}) {
  if (!ORDENES.includes(orden)) throw errorDeApi('El orden elegido no es válido', 400)
  if (!DIRECCIONES.includes(direccion)) throw errorDeApi('La dirección de orden no es válida', 400)

  const desde = (normalizarPagina(pagina) - 1) * POR_PAGINA
  let consulta = supabase
    .from(VISTA)
    .select(COLUMNAS_CATALOGO, { count: 'exact' })
    .gt('precio', 0)

  const texto = busqueda.trim()
  if (texto) consulta = consulta.ilike('nombre', `%${escaparLike(texto)}%`)
  if (categoriaId) consulta = consulta.eq('categoria_id', categoriaId)
  if (marcaId) consulta = consulta.eq('marca_id', marcaId)

  // El id desempata para que el paginado sea estable entre páginas.
  const { data, error, count } = await consulta
    .order(orden, { ascending: direccion === 'asc' })
    .order('id', { ascending: true })
    .range(desde, desde + POR_PAGINA - 1)

  if (error) throw traducirError(error, 'No pudimos cargar el catálogo')
  return { items: (data ?? []).map(convertirProducto), total: count ?? 0 }
}

/**
 * Obtiene las categorías y marcas que tienen al menos un producto publicado.
 * @returns {Promise<{categorias: Array<{id: string, nombre: string}>, marcas: Array<{id: string, nombre: string}>}>}
 * Opciones ordenadas por nombre.
 * @throws {Error} status 500 si falla la consulta.
 */
export async function listarFiltrosCatalogo() {
  const { data, error } = await supabase
    .from(VISTA)
    .select('categoria_id, categoria_nombre, marca_id, marca_nombre')
    .gt('precio', 0)
  if (error) throw traducirError(error, 'No pudimos cargar los filtros')

  const categorias = new Map()
  const marcas = new Map()
  for (const fila of data ?? []) {
    if (fila.categoria_id) categorias.set(fila.categoria_id, fila.categoria_nombre)
    if (fila.marca_id) marcas.set(fila.marca_id, fila.marca_nombre)
  }
  const ordenar = (mapa) => [...mapa]
    .map(([id, nombre]) => ({ id, nombre: nombre ?? 'Sin nombre' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return { categorias: ordenar(categorias), marcas: ordenar(marcas) }
}

/**
 * Obtiene el detalle público de un producto publicado.
 * @param {string} id ID del producto.
 * @returns {Promise<Object>} Producto con descripción, unidad de medida, precio y disponibilidad.
 * @throws {Error} status 404 si no existe, no está activo o no está publicado; 500 si falla.
 */
export async function obtenerProducto(id) {
  if (!id) throw errorDeApi('El producto no existe', 404)
  const { data, error } = await supabase
    .from(VISTA)
    .select(COLUMNAS_DETALLE)
    .eq('id', id)
    .maybeSingle()
  if (error) throw traducirError(error, 'No pudimos cargar el producto')
  if (!data || !(Number(data.precio) > 0)) throw errorDeApi('El producto no está disponible en la tienda', 404)
  return convertirProducto(data)
}

/**
 * Consulta el permiso ecommerce.publicar del usuario autenticado.
 * @returns {Promise<boolean>} true si puede publicar productos y subir imágenes.
 * @throws {Error} Error de Supabase al consultar el permiso.
 */
export async function puedePublicar() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', { p_nombre: 'ecommerce.publicar' })
  if (error) throw error
  return data === true
}

/**
 * Lista productos del backoffice con su estado de publicación.
 * `visibleEnTienda` indica si el producto aparece hoy en /tienda
 * (activo, publicado y con precio en la lista General).
 * @param {Object} [filtros]
 * @param {string} [filtros.busqueda] Texto a buscar en nombre o SKU.
 * @param {number} [filtros.pagina=1] Página (desde 1), de a POR_PAGINA productos.
 * @returns {Promise<{items: Array<Object>, total: number}>} Productos de la página y total filtrado.
 * @throws {Error} status 500 si falla la consulta.
 */
export async function listarPublicacion({ busqueda = '', pagina = 1 } = {}) {
  const desde = (normalizarPagina(pagina) - 1) * POR_PAGINA
  let consulta = supabase
    .from('productos')
    .select(COLUMNAS_PUBLICACION, { count: 'exact' })

  const texto = busqueda.trim()
  if (texto) {
    // Dentro de or() las comas y paréntesis separan condiciones: se quitan.
    const patron = `%${escaparLike(texto.replace(/[,()]/g, ' '))}%`
    consulta = consulta.or(`nombre.ilike.${patron},sku.ilike.${patron}`)
  }

  const { data, error, count } = await consulta
    .order('nombre', { ascending: true })
    .order('id', { ascending: true })
    .range(desde, desde + POR_PAGINA - 1)
  if (error) throw traducirError(error, 'No pudimos cargar los productos')

  const filas = data ?? []
  let visibles = new Set()
  if (filas.length) {
    const { data: enTienda, error: errorVista } = await supabase
      .from(VISTA)
      .select('id')
      .gt('precio', 0)
      .in('id', filas.map((fila) => fila.id))
    if (errorVista) throw traducirError(errorVista, 'No pudimos verificar qué productos están en la tienda')
    visibles = new Set((enTienda ?? []).map((fila) => fila.id))
  }

  return {
    items: filas.map((fila) => ({ ...fila, visibleEnTienda: visibles.has(fila.id) })),
    total: count ?? 0,
  }
}

/**
 * Marca o desmarca un producto como publicado en la tienda web.
 * @param {string} id ID del producto.
 * @param {boolean} publicado true para publicar, false para despublicar.
 * @returns {Promise<{id: string, publicado_web: boolean}>} Estado guardado.
 * @throws {Error} status 400 si `publicado` no es booleano, 403 sin permiso,
 * 404 si el producto no existe o la RLS lo oculta, 500 si falla.
 */
export async function publicarProducto(id, publicado) {
  if (!id) throw errorDeApi('El producto no existe', 404)
  if (typeof publicado !== 'boolean') throw errorDeApi('Indicá si el producto se publica o no', 400)
  const { data, error } = await supabase
    .from('productos')
    .update({ publicado_web: publicado })
    .eq('id', id)
    .select('id, publicado_web')
    .single()
  if (error?.code === CODIGO_SIN_FILAS) throw errorDeApi('El producto no existe', 404)
  if (error) throw traducirError(error, 'No pudimos actualizar la publicación')
  return data
}

/**
 * Valida que el archivo sea una imagen admitida para el catálogo.
 * @param {File} file Archivo elegido por el usuario.
 * @throws {Error} status 400 si falta, no es JPG/PNG/WebP o supera TAMANO_MAXIMO_IMAGEN.
 */
export function validarImagen(file) {
  if (!file) throw errorDeApi('Elegí una imagen', 400)
  if (!TIPOS_IMAGEN.includes(file.type)) throw errorDeApi('La imagen debe ser JPG, PNG o WebP', 400)
  if (file.size > TAMANO_MAXIMO_IMAGEN) throw errorDeApi('La imagen no puede superar los 2 MB', 400)
}

/**
 * Sube la imagen de un producto al bucket `productos` y actualiza productos.imagen_url.
 * Si falla la actualización del producto, borra el archivo recién subido.
 * @param {string} id ID del producto.
 * @param {File} file Imagen JPG, PNG o WebP de hasta 2 MB.
 * @returns {Promise<{id: string, imagen_url: string}>} Producto con la URL pública nueva.
 * @throws {Error} status 400 por archivo inválido, 403 sin permiso, 404 si el producto no existe, 500 si falla.
 */
export async function subirImagen(id, file) {
  if (!id) throw errorDeApi('El producto no existe', 404)
  validarImagen(file)

  // Nombre único: evita que la CDN sirva la imagen anterior desde caché.
  const ruta = `${id}/${Date.now()}.${EXTENSIONES[file.type]}`
  const almacenamiento = supabase.storage.from(BUCKET)
  const { error: errorSubida } = await almacenamiento.upload(ruta, file, {
    contentType: file.type,
    upsert: false,
  })
  if (errorSubida) {
    if (errorSubida.statusCode === '403' || errorSubida.statusCode === 403) {
      throw errorDeApi('No tenés permiso para subir imágenes', 403)
    }
    throw errorDeApi('No pudimos subir la imagen', 500)
  }

  const { data: publica } = almacenamiento.getPublicUrl(ruta)
  const { data, error } = await supabase
    .from('productos')
    .update({ imagen_url: publica.publicUrl })
    .eq('id', id)
    .select('id, imagen_url')
    .single()

  if (error) {
    await almacenamiento.remove([ruta])
    if (error.code === CODIGO_SIN_FILAS) throw errorDeApi('El producto no existe', 404)
    throw traducirError(error, 'No pudimos guardar la imagen del producto')
  }
  return data
}
