import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import {
  ingresar as ingresarApi,
  obtenerClienteActual,
  salir as salirApi,
} from '../api/clienteWebApi'

const ClienteWebContext = createContext(undefined)

/**
 * Firma congelada desde S3-00: `{ cliente, cargando, ingresar, salir }`.
 *
 * Escucha la sesión de Supabase Auth y carga el cliente vinculado por
 * `usuario_web_id`. Con confirmación de email, el primer ingreso completa el
 * registro pendiente (ver obtenerClienteActual). `cargando` vale true mientras
 * se resuelve el cliente de una sesión nueva, para que el carrito no fusione
 * antes de tiempo.
 */
export function ClienteWebProvider({ children }) {
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
        if (turno.current === miTurno) setCliente(encontrado)
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
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      setTimeout(() => {
        cargar(sesion?.user ?? null).catch(() => {
          // Sin cliente: la tienda sigue como visitante. ingresar() informa el motivo.
        })
      }, 0)
    })
    return () => {
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
      await salirApi().catch(() => {})
      throw error
    }
    if (!encontrado) {
      await salirApi().catch(() => {})
      throw new Error('Tu usuario no tiene una cuenta de cliente en la tienda.')
    }
  }, [cargar])

  /** @returns {Promise<void>} */
  const salir = useCallback(() => salirApi(), [])

  return (
    <ClienteWebContext.Provider value={{ cliente, cargando, ingresar, salir }}>
      {children}
    </ClienteWebContext.Provider>
  )
}

export function useClienteWeb() {
  const ctx = useContext(ClienteWebContext)
  if (!ctx) throw new Error('useClienteWeb debe usarse dentro de ClienteWebProvider')
  return ctx
}
