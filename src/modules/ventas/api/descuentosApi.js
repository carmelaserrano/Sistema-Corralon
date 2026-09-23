import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../../lib/supabaseClient'
import {
  errorDeApi,
  CODIGO_CHECK_VIOLADO,
  CODIGO_PERMISO_INSUFICIENTE,
  CODIGO_SIN_FILAS,
} from '../../stock/api/errores'

// Tablas: reglas_descuento, parametros_ventas, autorizaciones_descuento
// (0033_base_sprint3.sql). Funciones: calcular_precio_venta,
// validar_descuento_manual, autorizar_descuento, autorizacion_descuento_valida
// (0038_descuentos.sql).

const TABLA_REGLAS = 'reglas_descuento'
const TABLA_PARAMETROS = 'parametros_ventas'

export const PERMISO_GESTIONAR = 'precios.gestionar'
export const PERMISO_AUTORIZAR = 'ventas.descuento.autorizar'

// clave de parametros_ventas donde vive el límite (CA-04).
const CLAVE_LIMITE = 'limite_descuento_manual'

// Mismos tres valores que chk_regla_descuento_tipo (0031). El value es lo
// que se manda a la base; label y tabla son para armar el desplegable de
// "a qué aplica" y para traer su nombre en listarReglasDescuento.
export const TIPOS_APLICACION = [
  { value: 'tipo_cliente', label: 'Tipo de cliente', tabla: 'tipos_cliente' },
  { value: 'categoria', label: 'Categoría', tabla: 'categorias' },
  { value: 'producto', label: 'Producto', tabla: 'productos' },
]

function errorConCampo(mensaje, status, campo) {
  const error = errorDeApi(mensaje, status)
  error.campo = campo
  return error
}

// CA-01: mismo rango que chk_regla_descuento_porcentaje. Se valida acá
// también para no ir a la red con un dato que ya sabemos que va a fallar
// (mismo criterio que clientesApi/domiciliosApi). Devuelve el número ya
// convertido: los `<input type="number">` mandan un string, y lo que se
// guarda en la base tiene que ser el número, no el texto tal cual.
function validarPorcentaje(porcentaje) {
  const numero = Number(porcentaje)
  if (!Number.isFinite(numero) || numero < 0.01 || numero > 100) {
    throw errorConCampo(
      'El porcentaje tiene que estar entre 0,01 y 100',
      400,
      'porcentaje',
    )
  }
  return numero
}

function validarTipoAplicacion(tipoAplicacion) {
  if (!TIPOS_APLICACION.some((t) => t.value === tipoAplicacion)) {
    throw errorConCampo('Elegí a qué aplica el descuento', 400, 'tipo_aplicacion')
  }
}

function validarRegla({ tipo_aplicacion, referencia_id, porcentaje }) {
  validarTipoAplicacion(tipo_aplicacion)
  if (!referencia_id) {
    throw errorConCampo('Elegí sobre qué aplica el descuento', 400, 'referencia_id')
  }
  return validarPorcentaje(porcentaje)
}

function manejarErrorRegla(error) {
  if (error?.code === CODIGO_CHECK_VIOLADO) {
    if (error.message?.includes('chk_regla_descuento_porcentaje')) {
      throw errorConCampo('El porcentaje tiene que estar entre 0,01 y 100', 400, 'porcentaje')
    }
    if (error.message?.includes('chk_regla_descuento_tipo')) {
      throw errorConCampo('Elegí a qué aplica el descuento', 400, 'tipo_aplicacion')
    }
    throw errorDeApi('Revisá los datos: no cumplen una validación del sistema', 400)
  }

  // reglas_descuento_write (0031) es un simple chequeo de permiso, no una
  // policy por dueño de fila: si falta 'precios.gestionar', Postgres
  // rechaza el INSERT/UPDATE ahí mismo con 42501, no con un PGRST116 de
  // PostgREST (eso pasa en updates filtrados por fila, como clientes_update;
  // acá no hay ninguna fila que filtrar, el permiso falta desde el vamos).
  // Se manejan los dos códigos igual, por si algún día cambia la policy.
  if (error?.code === CODIGO_PERMISO_INSUFICIENTE || error?.code === CODIGO_SIN_FILAS) {
    throw errorDeApi(
      'No se pudo guardar la regla: no existe o no tenés permiso para modificarla',
      403,
    )
  }

  throw error
}

/**
 * Trae las opciones para elegir "a qué aplica" una regla (el desplegable de
 * referencia_id), según el tipo elegido.
 *
 * reglas_descuento.referencia_id no tiene FK en la base (apunta a una de
 * tres tablas distintas según tipo_aplicacion, y Postgres no puede
 * garantizar eso con una sola foreign key). Por eso es importante que la
 * pantalla arme este campo siempre con un desplegable de acá, nunca con un
 * id tipeado a mano: un id que no exista no rompe nada al guardar (no hay
 * constraint que lo impida), simplemente la regla queda sin efecto.
 *
 * @param {'tipo_cliente'|'categoria'|'producto'} tipoAplicacion
 * @returns {Promise<Array<{id: string, nombre: string}>>}
 */
export async function listarOpcionesReferencia(tipoAplicacion) {
  const config = TIPOS_APLICACION.find((t) => t.value === tipoAplicacion)
  if (!config) return []

  // productos no tiene una columna booleana `activo`: usa `estado_producto`
  // ('activo'/'inactivo'/'descontinuado'), a diferencia de categorias y
  // tipos_cliente. No tiene sentido armar una regla sobre un producto que
  // no está a la venta, así que las tres tablas quedan filtradas igual.
  let consulta = supabase.from(config.tabla).select('id, nombre')
  consulta =
    config.tabla === 'productos'
      ? consulta.eq('estado_producto', 'activo')
      : consulta.eq('activo', true)

  const { data, error } = await consulta.order('nombre')
  if (error) throw error
  return (data ?? []).map((fila) => ({ id: fila.id, nombre: fila.nombre }))
}

/**
 * Lista las reglas de descuento, con el nombre de a qué aplican resuelto
 * (CA-01): "Mayoristas", "Cemento", "Cemento Portland x50kg", etc.
 *
 * @param {Object} [opciones]
 * @param {boolean} [opciones.soloActivas=false]
 * @returns {Promise<Array<Object>>} Cada fila trae además `referencia_nombre`.
 */
export async function listarReglasDescuento({ soloActivas = false } = {}) {
  let consulta = supabase
    .from(TABLA_REGLAS)
    .select('id, tipo_aplicacion, referencia_id, porcentaje, activo, created_at')

  if (soloActivas) consulta = consulta.eq('activo', true)

  const { data, error } = await consulta.order('created_at', { ascending: false })
  if (error) throw error

  const reglas = data ?? []

  // Un select por tabla (tipos_cliente/categorias/productos), no uno por
  // regla: agrupa los ids que hacen falta de cada una y los trae de una vez.
  const nombresPorId = new Map()
  for (const { value, tabla } of TIPOS_APLICACION) {
    const ids = [...new Set(reglas.filter((r) => r.tipo_aplicacion === value).map((r) => r.referencia_id))]
    if (ids.length === 0) continue

    const { data: filas, error: errorNombres } = await supabase
      .from(tabla)
      .select('id, nombre')
      .in('id', ids)
    if (errorNombres) throw errorNombres

    for (const fila of filas ?? []) nombresPorId.set(fila.id, fila.nombre)
  }

  return reglas.map((regla) => ({
    ...regla,
    // null cuando el id ya no existe (se borró la categoría, etc.): la
    // pantalla lo puede señalar como "regla sin efecto" en vez de romper.
    referencia_nombre: nombresPorId.get(regla.referencia_id) ?? null,
  }))
}

/**
 * Crea una regla de descuento (CA-01).
 *
 * @param {Object} datos
 * @param {'tipo_cliente'|'categoria'|'producto'} datos.tipo_aplicacion
 * @param {string} datos.referencia_id Id de tipo de cliente, categoría o
 *   producto, según tipo_aplicacion (ver listarOpcionesReferencia).
 * @param {number} datos.porcentaje Entre 0,01 y 100.
 * @param {boolean} [datos.activo=true]
 * @returns {Promise<Object>} Regla creada.
 */
export async function crearReglaDescuento(datos) {
  const porcentaje = validarRegla(datos)

  const { data, error } = await supabase
    .from(TABLA_REGLAS)
    .insert({
      tipo_aplicacion: datos.tipo_aplicacion,
      referencia_id: datos.referencia_id,
      porcentaje,
      activo: datos.activo ?? true,
    })
    .select('id, tipo_aplicacion, referencia_id, porcentaje, activo, created_at')
    .single()

  if (error) manejarErrorRegla(error)
  return data
}

/**
 * Cambia el porcentaje y/o el estado activo/inactivo de una regla existente
 * (CA-01). No se puede cambiar tipo_aplicacion ni referencia_id: para eso
 * se da de baja la regla y se crea una nueva.
 *
 * @param {string} id
 * @param {Object} cambios
 * @param {number} [cambios.porcentaje]
 * @param {boolean} [cambios.activo]
 * @returns {Promise<Object>} Regla actualizada.
 */
export async function actualizarReglaDescuento(id, cambios) {
  const datos = {}
  if (cambios.porcentaje !== undefined) {
    datos.porcentaje = validarPorcentaje(cambios.porcentaje)
  }
  if (cambios.activo !== undefined) {
    datos.activo = cambios.activo
  }

  const { data, error } = await supabase
    .from(TABLA_REGLAS)
    .update(datos)
    .eq('id', id)
    .select('id, tipo_aplicacion, referencia_id, porcentaje, activo, created_at')
    .single()

  if (error) manejarErrorRegla(error)
  return data
}

/**
 * Indica si el usuario actual puede crear/editar reglas y el límite de
 * descuento manual.
 *
 * @returns {Promise<boolean>} true si tiene el permiso 'precios.gestionar'.
 */
export async function puedeGestionarDescuentos() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_GESTIONAR,
  })
  if (error) throw error
  return data === true
}

/**
 * Límite de descuento manual configurado (CA-04), o null si todavía no se
 * configuró ninguno.
 *
 * @returns {Promise<number|null>}
 */
export async function obtenerLimiteDescuentoManual() {
  const { data, error } = await supabase
    .from(TABLA_PARAMETROS)
    .select('valor')
    .eq('clave', CLAVE_LIMITE)
    .maybeSingle()

  if (error) throw error
  return data ? Number(data.valor) : null
}

/**
 * Configura el límite de descuento manual (CA-04): a partir de qué
 * porcentaje validar_descuento_manual empieza a pedir autorización.
 *
 * @param {number} limite Entre 0 y 100.
 * @returns {Promise<void>}
 */
export async function setLimiteDescuentoManual(limite) {
  const numero = Number(limite)
  if (!Number.isFinite(numero) || numero < 0 || numero > 100) {
    throw errorConCampo('El límite tiene que estar entre 0 y 100', 400, 'limite')
  }

  const { error } = await supabase
    .from(TABLA_PARAMETROS)
    .upsert({ clave: CLAVE_LIMITE, valor: numero }, { onConflict: 'clave' })

  if (error) {
    if (error.code === CODIGO_SIN_FILAS || error.code === CODIGO_PERMISO_INSUFICIENTE) {
      throw errorDeApi('No tenés permiso para configurar el límite de descuento manual', 403)
    }
    throw error
  }
}

/**
 * Consulta si un porcentaje de descuento manual necesita autorización
 * (CA-04), llamando a la función de base validar_descuento_manual.
 *
 * @param {number} porcentaje
 * @returns {Promise<{requiereAutorizacion: boolean, limite: number|null}>}
 */
export async function validarDescuentoManual(porcentaje) {
  const { data, error } = await supabase.rpc('validar_descuento_manual', {
    p_porcentaje: porcentaje,
  })
  if (error) throw error

  return {
    requiereAutorizacion: data?.requiere_autorizacion === true,
    limite: data?.limite ?? null,
  }
}

/**
 * Autentica a un supervisor con su email y contraseña, y si tiene el
 * permiso 'ventas.descuento.autorizar', autoriza el descuento (CA-05).
 *
 * La usa ModalAutorizacionDescuento. El login corre en un cliente de
 * Supabase aparte, creado acá mismo y descartado al terminar, con
 * `persistSession: false`: no toca el `localStorage` ni la sesión del
 * vendedor que tiene la venta abierta en la pestaña. `autorizar_descuento`
 * se llama con la sesión de ESE cliente, así que en la base
 * `auth.uid()` va a ser el supervisor, no el vendedor — por eso el
 * permiso se valida correctamente aunque quien abrió el modal no lo tenga.
 *
 * @param {Object} datos
 * @param {string} datos.email Email del supervisor.
 * @param {string} datos.password Contraseña del supervisor.
 * @param {number} datos.porcentaje Porcentaje a autorizar.
 * @returns {Promise<string>} El autorizacion_id (uuid), válido 5 minutos.
 * @throws {Error} Si el email/contraseña son incorrectos, o el supervisor
 *   no tiene el permiso 'ventas.descuento.autorizar'.
 */
export async function autorizarDescuentoComoSupervisor({ email, password, porcentaje }) {
  const clienteSupervisor = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )

  try {
    const { error: errorLogin } = await clienteSupervisor.auth.signInWithPassword({
      email,
      password,
    })
    if (errorLogin) {
      throw errorDeApi('Email o contraseña incorrectos', 401)
    }

    const { data, error: errorRpc } = await clienteSupervisor.rpc('autorizar_descuento', {
      p_porcentaje: porcentaje,
    })

    if (errorRpc) {
      if (errorRpc.code === CODIGO_PERMISO_INSUFICIENTE) {
        throw errorDeApi('Ese usuario no tiene permiso para autorizar descuentos', 403)
      }
      throw errorDeApi('No se pudo autorizar el descuento', 500)
    }

    return data
  } finally {
    // Nada quedó guardado en el navegador (persistSession: false), pero esto
    // además invalida la sesión del lado del servidor apenas se usa, en vez
    // de dejarla viva hasta que expire sola.
    await clienteSupervisor.auth.signOut().catch(() => {})
  }
}
