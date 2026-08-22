import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_FK_VIOLADA,
  CODIGO_UUID_INVALIDO,
} from './errores'

// La tabla se llama "productos" (modelo de datos del issue #5). En la UI y
// en la historia se le dice "artículo": este módulo hace de traductor.
const TABLA = 'productos'

const COLUMNAS = `
  id,
  sku,
  nombre,
  descripcion,
  codigo_barras,
  estado_producto,
  created_at,
  categoria:categorias(id, nombre),
  marca:marcas(id, nombre),
  unidad_medida:unidades_medida(id, nombre, abreviatura)
`

export const ESTADOS = ['activo', 'inactivo']

// US-STK-01 pide 422 cuando la categoría, la marca o la unidad de medida
// "no existen o están inactivos". La FK sola no alcanza: una fila inactiva
// existe, así que Postgres la aceptaría. Hay que chequearlo antes.
const REFERENCIAS = [
  { campo: 'categoria_id', tabla: 'categorias', etiqueta: 'La categoría' },
  { campo: 'marca_id', tabla: 'marcas', etiqueta: 'La marca' },
  {
    campo: 'unidad_medida_id',
    tabla: 'unidades_medida',
    etiqueta: 'La unidad de medida',
  },
]

function validarArticulo({ nombre, categoria_id, marca_id, unidad_medida_id }) {
  if (!nombre?.trim()) {
    throw errorDeApi('El nombre es obligatorio', 400)
  }
  if (!categoria_id) {
    throw errorDeApi('La categoría es obligatoria', 400)
  }
  if (!marca_id) {
    throw errorDeApi('La marca es obligatoria', 400)
  }
  if (!unidad_medida_id) {
    throw errorDeApi('La unidad de medida es obligatoria', 400)
  }
}

async function verificarReferenciasActivas(articulo) {
  for (const { campo, tabla, etiqueta } of REFERENCIAS) {
    const { data, error } = await supabase
      .from(tabla)
      .select('id')
      .eq('id', articulo[campo])
      .eq('activo', true)
      .maybeSingle()

    // Un id con formato inválido tampoco existe: mismo 422.
    if (error) {
      if (error.code === CODIGO_UUID_INVALIDO) {
        throw errorDeApi(`${etiqueta} seleccionada no existe`, 422)
      }
      throw error
    }

    if (!data) {
      throw errorDeApi(`${etiqueta} seleccionada no existe o está inactiva`, 422)
    }
  }
}

function manejarErrorArticulo(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi('Ya existe un artículo con ese código de barras', 409)
  }

  // Red de seguridad: si una referencia se borró entre la verificación y
  // el insert, la FK lo frena igual.
  if (error?.code === CODIGO_FK_VIOLADA) {
    throw errorDeApi(
      'La categoría, marca o unidad de medida seleccionada no existe',
      422,
    )
  }

  throw error
}

function armarCambios(articulo) {
  return {
    nombre: articulo.nombre.trim(),
    descripcion: articulo.descripcion?.trim() || null,
    categoria_id: articulo.categoria_id,
    marca_id: articulo.marca_id,
    unidad_medida_id: articulo.unidad_medida_id,
    // UNIQUE admite varios NULL, así que un artículo sin código de barras
    // no choca con otro. Cadena vacía sí chocaría: por eso se normaliza.
    codigo_barras: articulo.codigo_barras?.trim() || null,
  }
}

export async function getArticulos({
  search = '',
  categoria_id = '',
  marca_id = '',
  estado = '',
  page = 1,
  pageSize = 10,
} = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS, { count: 'exact' })

  if (categoria_id) consulta = consulta.eq('categoria_id', categoria_id)
  if (marca_id) consulta = consulta.eq('marca_id', marca_id)
  if (estado) consulta = consulta.eq('estado_producto', estado)

  if (search.trim()) {
    const patron = `%${search.trim()}%`
    consulta = consulta.or(
      `nombre.ilike.${patron},sku.ilike.${patron},codigo_barras.ilike.${patron}`,
    )
  }

  const desde = (page - 1) * pageSize
  const { data, count, error } = await consulta
    .order('nombre')
    .range(desde, desde + pageSize - 1)

  if (error) throw error

  const total = count ?? 0

  return {
    articulos: data ?? [],
    total,
    page,
    pageSize,
    totalPaginas: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getArticuloById(id) {
  const { data, error } = await supabase
    .from(TABLA)
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw errorDeApi('El artículo no existe', 404)

  return data
}

export async function createArticulo(articulo) {
  validarArticulo(articulo)
  await verificarReferenciasActivas(articulo)

  // sku y estado_producto los pone la base: sku por el default de la
  // secuencia (migración 0004) y estado_producto por su propio default.
  const { data, error } = await supabase
    .from(TABLA)
    .insert(armarCambios(articulo))
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorArticulo(error)
  return data
}

export async function updateArticulo(id, articulo) {
  validarArticulo(articulo)
  await verificarReferenciasActivas(articulo)

  const { data, error } = await supabase
    .from(TABLA)
    .update(armarCambios(articulo))
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorArticulo(error)
  return data
}

export async function setEstadoArticulo(id, estado) {
  if (!ESTADOS.includes(estado)) {
    throw errorDeApi('El estado debe ser "activo" o "inactivo"', 400)
  }

  const { data, error } = await supabase
    .from(TABLA)
    .update({ estado_producto: estado })
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) throw error
  return data
}
