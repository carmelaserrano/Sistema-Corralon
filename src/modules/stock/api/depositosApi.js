import { supabase } from '../../../lib/supabaseClient'

function validarDeposito(deposito) {
  if (!deposito.nombre?.trim()) {
    const error = new Error('El nombre es obligatorio')
    error.status = 400
    throw error
  }

  if (!deposito.direccion?.trim()) {
    const error = new Error('La dirección es obligatoria')
    error.status = 400
    throw error
  }

  if (!deposito.localidad?.trim()) {
    const error = new Error('La localidad es obligatoria')
    error.status = 400
    throw error
  }

  if (!deposito.tipo_deposito_id) {
    const error = new Error('El tipo de depósito es obligatorio')
    error.status = 400
    throw error
  }

  if (
    deposito.capacidad_maxima === '' ||
    deposito.capacidad_maxima === null ||
    deposito.capacidad_maxima === undefined ||
    Number(deposito.capacidad_maxima) <= 0
  ) {
    const error = new Error('La capacidad máxima debe ser mayor a 0')
    error.status = 400
    throw error
  }
}

function manejarErrorDeposito(error) {
  if (error?.code === '23505') {
    const duplicateError = new Error('Ya existe un depósito con ese nombre')
    duplicateError.status = 409
    throw duplicateError
  }

  throw error
}

export async function getDepositos() {
  const { data, error } = await supabase
    .from('depositos')
    .select(`
      id,
      nombre,
      direccion,
      localidad,
      capacidad_maxima,
      tipo_deposito_id,
      tipo:tipos_deposito (
        id,
        nombre
      )
    `)
    .order('nombre')

  if (error) throw error
  return data
}

export async function getTiposDeposito() {
  const { data, error } = await supabase
    .from('tipos_deposito')
    .select('id, nombre')
    .order('nombre')

  if (error) throw error
  return data
}

export async function createDeposito(deposito) {
  validarDeposito(deposito)

  const { data, error } = await supabase
    .from('depositos')
    .insert({
      nombre: deposito.nombre.trim(),
      direccion: deposito.direccion.trim(),
      localidad: deposito.localidad.trim(),
      tipo_deposito_id: deposito.tipo_deposito_id,
      capacidad_maxima: Number(deposito.capacidad_maxima),
    })
    .select()
    .single()

  if (error) manejarErrorDeposito(error)
  return data
}

export async function updateDeposito(id, deposito) {
  validarDeposito(deposito)

  const { data, error } = await supabase
    .from('depositos')
    .update({
      nombre: deposito.nombre.trim(),
      direccion: deposito.direccion.trim(),
      localidad: deposito.localidad.trim(),
      tipo_deposito_id: deposito.tipo_deposito_id,
      capacidad_maxima: Number(deposito.capacidad_maxima),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) manejarErrorDeposito(error)
  return data
}

export async function deleteDeposito(id) {
  const { data: stockAsociado, error: stockError } = await supabase
    .from('stock_x_deposito')
    .select('id')
    .eq('deposito_id', id)
    .limit(1)

  if (stockError) throw stockError

  if ((stockAsociado?.length ?? 0) > 0) {
    const error = new Error('El depósito tiene stock asociado y no puede eliminarse')
    error.status = 409
    throw error
  }

  const { error } = await supabase
    .from('depositos')
    .delete()
    .eq('id', id)

  if (error) throw error
}