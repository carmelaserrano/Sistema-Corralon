import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi, CODIGO_DUPLICADO, CODIGO_FK_VIOLADA } from './errores'

const COLUMNAS = 'id, nombre, activo, created_at'

function validarMarca({ nombre }) {
  if (!nombre?.trim()) {
    throw errorDeApi('El nombre es obligatorio', 400)
  }
}

function manejarErrorMarca(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi('Ya existe una marca con ese nombre', 409)
  }
  throw error
}

export async function getMarcas({ search = '', soloActivas = false } = {}) {
  let consulta = supabase.from('marcas').select(COLUMNAS)

  if (soloActivas) consulta = consulta.eq('activo', true)
  if (search.trim()) consulta = consulta.ilike('nombre', `%${search.trim()}%`)

  const { data, error } = await consulta.order('nombre')

  if (error) throw error
  return data
}

export async function createMarca(marca) {
  validarMarca(marca)

  const { data, error } = await supabase
    .from('marcas')
    .insert({ nombre: marca.nombre.trim() })
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorMarca(error)
  return data
}

export async function updateMarca(id, marca) {
  validarMarca(marca)

  const cambios = { nombre: marca.nombre.trim() }
  if (marca.activo !== undefined) cambios.activo = marca.activo

  const { data, error } = await supabase
    .from('marcas')
    .update(cambios)
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorMarca(error)
  return data
}

// US-STK-03 pide que, al rechazar una baja, se informe cuántos artículos
// usan la marca. Por eso se cuenta antes de intentar el delete.
export async function contarArticulosDeMarca(id) {
  const { count, error } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('marca_id', id)

  if (error) throw error
  return count ?? 0
}

export async function deleteMarca(id) {
  const enUso = await contarArticulosDeMarca(id)

  if (enUso > 0) {
    const detalle = enUso === 1 ? '1 artículo usa' : `${enUso} artículos usan`
    throw errorDeApi(`No se puede eliminar: ${detalle} esta marca`, 409)
  }

  const { error } = await supabase.from('marcas').delete().eq('id', id)

  if (error) {
    // Red de seguridad: si alguien creó un artículo entre el conteo y el
    // delete, la FK lo frena igual. El conteo es para el mensaje, la
    // garantía la da la base.
    if (error.code === CODIGO_FK_VIOLADA) {
      throw errorDeApi(
        'No se puede eliminar: hay artículos que usan esta marca',
        409,
      )
    }
    throw error
  }
}
