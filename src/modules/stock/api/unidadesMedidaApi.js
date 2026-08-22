import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_DUPLICADO,
  CODIGO_FK_VIOLADA,
  CODIGO_CHECK_VIOLADO,
} from './errores'

const COLUMNAS =
  'id, nombre, abreviatura, activo, factor_conversion, unidad_base_id, created_at'

function validarUnidadMedida({ nombre, abreviatura, factor_conversion }) {
  if (!nombre?.trim()) {
    throw errorDeApi('El nombre es obligatorio', 400)
  }

  // abreviatura es NOT NULL desde la migración 0001. No figura en el
  // contrato de la historia, pero sin ella el insert falla con 23502.
  if (!abreviatura?.trim()) {
    throw errorDeApi('La abreviatura es obligatoria', 400)
  }

  const factor = Number(factor_conversion)

  if (
    factor_conversion === '' ||
    factor_conversion === null ||
    factor_conversion === undefined ||
    Number.isNaN(factor) ||
    factor <= 0
  ) {
    throw errorDeApi('El factor de conversión debe ser mayor a 0', 400)
  }
}

function manejarErrorUnidadMedida(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    throw errorDeApi('Ya existe una unidad de medida con ese nombre', 409)
  }

  // La FK de unidad_base_id apunta a la propia tabla: si el id no existe,
  // Postgres la rechaza. Acá 23503 significa "referencia inexistente"
  // (422), no "tiene hijos" como en categorías y marcas.
  if (error?.code === CODIGO_FK_VIOLADA) {
    throw errorDeApi('La unidad base referenciada no existe', 422)
  }

  if (error?.code === CODIGO_CHECK_VIOLADO) {
    if (error.message?.includes('base_distinta')) {
      throw errorDeApi('Una unidad no puede ser su propia unidad base', 400)
    }
    throw errorDeApi('El factor de conversión debe ser mayor a 0', 400)
  }

  throw error
}

function armarCambios(unidad) {
  const cambios = {
    nombre: unidad.nombre.trim(),
    abreviatura: unidad.abreviatura.trim(),
    factor_conversion: Number(unidad.factor_conversion),
    // El <select> devuelve '' cuando no se eligió nada; la columna espera null.
    unidad_base_id: unidad.unidad_base_id || null,
  }

  if (unidad.activo !== undefined) cambios.activo = unidad.activo

  return cambios
}

export async function getUnidadesMedida({
  search = '',
  soloActivas = false,
} = {}) {
  let consulta = supabase.from('unidades_medida').select(COLUMNAS)

  if (soloActivas) consulta = consulta.eq('activo', true)
  if (search.trim()) consulta = consulta.ilike('nombre', `%${search.trim()}%`)

  const { data, error } = await consulta.order('nombre')

  if (error) throw error
  return data
}

export async function createUnidadMedida(unidad) {
  validarUnidadMedida(unidad)

  const { data, error } = await supabase
    .from('unidades_medida')
    .insert(armarCambios(unidad))
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorUnidadMedida(error)
  return data
}

export async function updateUnidadMedida(id, unidad) {
  validarUnidadMedida(unidad)

  if (unidad.unidad_base_id === id) {
    throw errorDeApi('Una unidad no puede ser su propia unidad base', 400)
  }

  const { data, error } = await supabase
    .from('unidades_medida')
    .update(armarCambios(unidad))
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) manejarErrorUnidadMedida(error)
  return data
}

// La historia no define DELETE para unidades de medida: el contrato es
// POST / GET / PUT, y el criterio "sólo pueden seleccionarse unidades
// activas" implica que la baja es lógica. Se desactiva, no se borra.
export async function setEstadoUnidadMedida(id, activo) {
  const { data, error } = await supabase
    .from('unidades_medida')
    .update({ activo })
    .eq('id', id)
    .select(COLUMNAS)
    .single()

  if (error) throw error
  return data
}
