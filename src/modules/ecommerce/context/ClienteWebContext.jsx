import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

const ClienteWebContext = createContext(undefined)

/**
 * Implementación mínima (contrato congelado desde S3-00): resuelve la
 * sesión de Supabase Auth y expone el cliente asociado por `usuario_web_id`.
 * S3-15 la completa con registro, vinculación con clientes de mostrador y
 * edición de "Mis datos".
 */
export function ClienteWebProvider({ children }) {
  const [cliente, setCliente] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    async function cargarCliente(usuarioId) {
      if (!usuarioId) {
        if (activo) setCliente(null)
        return
      }
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .eq('usuario_web_id', usuarioId)
        .maybeSingle()
      if (activo) setCliente(data ?? null)
    }

    supabase.auth.getSession().then(({ data }) => {
      cargarCliente(data.session?.user?.id).finally(() => {
        if (activo) setCargando(false)
      })
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      cargarCliente(session?.user?.id)
    })

    return () => {
      activo = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function ingresar(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('Email o contraseña incorrectos')
  }

  async function salir() {
    await supabase.auth.signOut()
  }

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
