import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi, CODIGO_DUPLICADO, CODIGO_FK_VIOLADA } from './errores'

const COLUMNAS = 'id, nombre, activo, created_at'

function validarCategoria({ nombre }) {
  if (!nombre?.trim()) {
    throw errorDeApi('El nombre es obligatorio', 400)
  }
}

function manejarErrorCategoria(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi('Ya existe una categoría con ese nombre', 409)
  }
  throw error
}

export async function getCategorias({ search = '', soloActivas = false } = {}) {
  let consulta = supabase.from('categorias').select(COLUMNAS)

  if (soloActivas) consulta = consulta.eq('activo', true)
  if (search.trim()) consulta = consulta.ilike('nombre', `%${search.trim()}%`)

  const { data, error } = await consulta.order('nombre')

  if (error) throw error
  return data
}

export async function createCategoria(categoria) {
  validarCategoria(categoria)

  const { data, error } = await supabase
    .from('categorias')
    .insert({ nombre: categoria.nombre.trim() })
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorCategoria(error)
  return data
}

export async function updateCategoria(id, categoria) {
  validarCategoria(categoria)

  const cambios = { nombre: categoria.nombre.trim() }
  if (categoria.activo !== undefined) cambios.activo = categoria.activo

  const { data, error } = await supabase
    .from('categorias')
    .update(cambios)
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorCategoria(error)
  return data
}

// Se cuenta antes de intentar el delete para que al rechazar la baja se informa cuantos articulos usa la categoria
export async function contarArticulosDeCategoria(id) {
  const { count, error } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('categoria_id', id)

  if (error) throw error
  return count ?? 0
}

export async function deleteCategoria(id) {
  const enUso = await contarArticulosDeCategoria(id)

  if (enUso > 0) {
    const detalle = enUso === 1 ? '1 artículo usa' : `${enUso} artículos usan`
    throw errorDeApi(`No se puede eliminar: ${detalle} esta categoría`, 409)
  }

  const { error } = await supabase.from('categorias').delete().eq('id', id)

  if (error) {
    if (error.code === CODIGO_FK_VIOLADA) {
      throw errorDeApi(
        'No se puede eliminar: hay artículos que usan esta categoría',
        409,
      )
    }
    throw error
  }
}
