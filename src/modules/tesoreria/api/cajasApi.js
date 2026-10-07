import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi } from '../../stock/api/errores'

export const PERMISOS_CAJAS = {
  abrir: 'cajas.abrir',
  cerrar: 'cajas.cerrar',
  operar: 'cajas.operar',
  administrar: 'cajas.administrar',
}

const STATUS_POR_CODIGO = {
  CX001: 400,
  CX002: 404,
  CX003: 409,
  CX007: 409,
  CV008: 409,
  23505: 409,
  42501: 403,
}

function manejarErrorCaja(error) {
  const status = STATUS_POR_CODIGO[error?.code]
  if (status) throw errorDeApi(error.message || 'No se pudo completar la operación de caja', status)
  throw error
}

export async function puedeGestionarCajas(permiso) {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: permiso,
  })
  if (error) throw error
  return data === true
}

export async function obtenerSesionCajaActiva() {
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser()
  if (errorUsuario) throw errorUsuario
  if (!usuario.user) return null

  const { data, error } = await supabase
    .from('sesiones_caja')
    .select('id, caja_id, usuario_id, estado, saldo_inicial, abierta_at, caja:cajas(nombre)')
    .eq('usuario_id', usuario.user.id)
    .eq('estado', 'abierta')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function obtenerUsuarioCaja() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user?.id ?? null
}

export async function listarCajas() {
  const { data, error } = await supabase
    .from('cajas')
    .select(`
      id,
      nombre,
      punto_venta_id,
      usuario_asignado_id,
      activa,
      punto_venta:puntos_venta(id, numero, nombre)
    `)
    .order('nombre')
  if (error) throw error
  return data ?? []
}

export async function listarPuntosVenta() {
  const { data, error } = await supabase
    .from('puntos_venta')
    .select('id, numero, nombre')
    .eq('activo', true)
    .order('numero')
  if (error) throw error
  return data ?? []
}

export async function listarCajeros() {
  const { data, error } = await supabase.rpc('listar_cajeros')
  if (error) manejarErrorCaja(error)
  return data ?? []
}

export async function listarSesionesCaja() {
  const { data, error } = await supabase
    .from('sesiones_caja')
    .select(`
      id,
      caja_id,
      usuario_id,
      estado,
      saldo_inicial,
      abierta_at,
      cerrada_at,
      monto_declarado,
      saldo_teorico,
      diferencia,
      caja:cajas(nombre, punto_venta:puntos_venta(numero, nombre))
    `)
    .order('abierta_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function listarMovimientosCaja(sesionCajaId) {
  if (!sesionCajaId) return []
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select(`
      id,
      tipo,
      origen,
      medio_pago_id,
      monto,
      motivo,
      comprobante,
      venta_id,
      created_at,
      medio_pago:medios_pago(nombre)
    `)
    .eq('sesion_caja_id', sesionCajaId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function guardarCaja({ id, nombre, punto_venta_id, usuario_asignado_id, activa = true }) {
  const nombreNormalizado = nombre?.trim()
  if (!nombreNormalizado || !punto_venta_id) {
    throw errorDeApi('El nombre y el punto de venta son obligatorios', 400)
  }

  const valores = {
    nombre: nombreNormalizado,
    punto_venta_id,
    usuario_asignado_id: usuario_asignado_id || null,
    activa,
  }
  const consulta = id
    ? supabase.from('cajas').update(valores).eq('id', id)
    : supabase.from('cajas').insert(valores)
  const { data, error } = await consulta.select('id').single()
  if (error) manejarErrorCaja(error)
  return data
}

export async function abrirCaja(cajaId, saldoInicial) {
  const saldo = Number(saldoInicial)
  if (!cajaId || !Number.isFinite(saldo) || saldo < 0) {
    throw errorDeApi('Seleccione una caja e ingrese un saldo inicial no negativo', 400)
  }
  const { data, error } = await supabase.rpc('abrir_caja', {
    p_caja_id: cajaId,
    p_saldo_inicial: saldo,
  })
  if (error) manejarErrorCaja(error)
  return data
}

export async function cerrarCaja(sesionCajaId, montoDeclarado) {
  const monto = Number(montoDeclarado)
  if (!sesionCajaId || !Number.isFinite(monto) || monto < 0) {
    throw errorDeApi('Ingrese un monto declarado no negativo', 400)
  }
  const { data, error } = await supabase.rpc('cerrar_caja', {
    p_sesion_caja_id: sesionCajaId,
    p_monto_declarado: monto,
  })
  if (error) manejarErrorCaja(error)
  return data
}

export async function registrarMovimientoCaja({ tipo, medio_pago_id, monto, motivo, comprobante }) {
  const importe = Number(monto)
  if (!['ingreso', 'egreso'].includes(tipo) || !medio_pago_id ||
      !Number.isFinite(importe) || importe <= 0 ||
      !motivo?.trim() || !comprobante?.trim()) {
    throw errorDeApi('Complete tipo, medio de pago, importe, motivo y comprobante', 400)
  }
  const { data, error } = await supabase.rpc('registrar_movimiento_caja', {
    p_tipo: tipo,
    p_medio_pago_id: medio_pago_id,
    p_monto: importe,
    p_motivo: motivo.trim(),
    p_comprobante: comprobante.trim(),
  })
  if (error) manejarErrorCaja(error)
  return data
}
