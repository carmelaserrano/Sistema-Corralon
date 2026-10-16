import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import {
  ingresar as ingresarApi,
  registrar as registrarApi,
  recuperarRegistro,
  METADATO_REGISTRO,
  obtenerClienteActual,
  salir as salirApi,
} from '../api/clienteWebApi'

import { ClienteWebContext } from './clienteWebContextStore'

/**
 * Expone cliente, cargando, registrar, ingresar y salir.
 *
 * Escucha la sesión de Supabase Auth y carga el cliente vinculado por
 * `usuario_web_id`. Recupera registros pendientes de cuentas existentes.
 * `cargando` vale true mientras
 * se resuelve el cliente de una sesión nueva, para que el carrito no fusione
 * antes de tiempo.
 */
export function ClienteWebProvider({ children }) {
  const [pendiente, setPendiente] = useState(null)
  const [errorRegistro, setErrorRegistro] = useState('')
  const operacion = useRef(false)
  const [cliente, setCliente] = useState(null)
  const [cargando, setCargando] = useState(true)
  // Carga en curso por usuario: el evento SIGNED_IN y ingresar() comparten la
  // misma promesa, así el registro pendiente se completa una sola vez.
  const enCurso = useRef({ usuarioId: undefined, promesa: null })
  const turno = useRef(0)

  const cargar = useCallback((usuario) => {
    const usuarioId = usuario?.id ?? null
    if (enCurso.current.usuarioId === usuarioId && enCurso.current.promesa) {
      return enCurso.current.promesa
    }
    const miTurno = ++turno.current
    setCargando(true)
    const promesa = (usuarioId ? obtenerClienteActual(usuario) : Promise.resolve(null))
      .then((encontrado) => {
        if (turno.current === miTurno) {
          setCliente(encontrado)
          if (encontrado) { setPendiente(null); setErrorRegistro('') }
        }
        return encontrado
      })
      .catch((error) => {
        if (turno.current === miTurno) setCliente(null)
        // Un fallo (red, registro rechazado) no queda cacheado: el próximo
        // ingreso vuelve a intentar.
        if (enCurso.current.promesa === promesa) enCurso.current = { usuarioId: undefined, promesa: null }
        throw error
      })
      .finally(() => {
        if (turno.current === miTurno) setCargando(false)
      })
    enCurso.current = { usuarioId, promesa }
    return promesa
  }, [])

  useEffect(() => {
    // INITIAL_SESSION cubre la carga inicial (incluido el enlace de
    // confirmación). setTimeout: Supabase desaconseja llamar a su API dentro
    // del callback, que corre con el lock de sesión tomado.
    let activo = true
    let evento = 0
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      const actual = ++evento
      setTimeout(() => {
        if (!activo || actual !== evento || operacion.current) return
        const usuario = sesion?.user
        if (!usuario) { setPendiente(null); setErrorRegistro('') }
        cargar(usuario ?? null).catch((error) => {
          if (!activo || actual !== evento) return
          if (usuario?.user_metadata?.[METADATO_REGISTRO]) setPendiente(usuario)
          setErrorRegistro(error.message)
        })
      }, 0)
    })
    return () => {
      activo = false
      enCurso.current = { usuarioId: undefined, promesa: null }
      turno.current += 1
      listener.subscription.unsubscribe()
    }
  }, [cargar])

  /**
   * @param {string} email
   * @param {string} password
   * @returns {Promise<void>} Resuelve con el cliente ya cargado en el contexto.
   * @throws {Error} Mensaje genérico con datos incorrectos (CA-04), o el
   *   motivo por el que no hay cliente asociado.
   */
  const ingresar = useCallback(async (email, password) => {
    const usuario = await ingresarApi(email, password)
    let encontrado
    try {
      encontrado = await cargar(usuario)
    } catch (error) {
      if (usuario?.user_metadata?.[METADATO_REGISTRO]) {
        setPendiente(usuario)
        setErrorRegistro(error.message)
        return
      }
      await salirApi().catch(() => {})
      throw error
    }
    if (!encontrado) {
      await salirApi().catch(() => {})
      throw new Error('Tu usuario no tiene una cuenta de cliente en la tienda.')
    }
  }, [cargar])

  const registrar = useCallback(async (datos) => {
    operacion.current = true
    let usuarioCreado
    try {
      const resultado = pendiente
        ? await recuperarRegistro(datos, pendiente)
        : await registrarApi(datos)
      usuarioCreado = resultado.usuario
      enCurso.current = { usuarioId: undefined, promesa: null }
      const encontrado = await cargar(resultado.usuario)
      if (!encontrado) throw new Error('No se pudo cargar tu cuenta de cliente. Volvé a ingresar.')
      setPendiente(null)
      setErrorRegistro('')
      return resultado
    } catch (error) {
      if (error.usuarioPendiente || usuarioCreado) setPendiente(error.usuarioPendiente ?? usuarioCreado)
      setErrorRegistro(error.message)
      throw error
    } finally {
      operacion.current = false
      setCargando(false)
    }
  }, [cargar, pendiente])

  /** @returns {Promise<void>} */
  const salir = useCallback(() => salirApi(), [])

  return (
    <ClienteWebContext.Provider value={{ cliente, cargando, registrar, ingresar, salir, pendiente, errorRegistro }}>
      {children}
    </ClienteWebContext.Provider>
  )
}

export function useClienteWeb() {
  const ctx = useContext(ClienteWebContext)
  if (!ctx) throw new Error('useClienteWeb debe usarse dentro de ClienteWebProvider')
  return ctx
}
