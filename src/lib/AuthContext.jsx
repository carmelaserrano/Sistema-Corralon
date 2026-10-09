import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(undefined)

// Valor seguro para "no es un usuario interno activo": ni sesión anónima ni
// cliente web ven rol ni permisos (CA-04).
const PERMISOS_POR_DEFECTO = { interno: false, rol: null, permisos: [] }

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [permisosUsuario, setPermisosUsuario] = useState(PERMISOS_POR_DEFECTO)

  useEffect(() => {
    let activo = true
    // Sentinel distinto de null/undefined de usuario real, para que la
    // primera sesión (incluso sin usuario) siempre dispare la sincronización.
    let usuarioIdActual

    async function sincronizarPermisos() {
      const { data, error } = await supabase.rpc('obtener_permisos_usuario_actual')
      if (!activo) return
      setPermisosUsuario(
        error || !data
          ? PERMISOS_POR_DEFECTO
          : {
              interno: data.interno ?? false,
              rol: data.rol ?? null,
              permisos: data.permisos ?? [],
            },
      )
      setLoading(false)
    }

    function manejarSesion(sesionNueva) {
      if (!activo) return
      setSession(sesionNueva)

      const nuevoUsuarioId = sesionNueva?.user?.id ?? null
      // Mismo usuario que ya teníamos (p. ej. TOKEN_REFRESHED): no hay que
      // recargar rol/permisos ni volver a mostrar la pantalla de carga.
      if (nuevoUsuarioId === usuarioIdActual) return
      usuarioIdActual = nuevoUsuarioId

      if (!nuevoUsuarioId) {
        setPermisosUsuario(PERMISOS_POR_DEFECTO)
        setLoading(false)
        return
      }

      setLoading(true)
      sincronizarPermisos()
    }

    supabase.auth.getSession().then(({ data }) => manejarSesion(data.session))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      manejarSesion(newSession)
    })

    return () => {
      activo = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        signIn,
        signOut,
        esInterno: permisosUsuario.interno,
        rol: permisosUsuario.rol,
        permisos: permisosUsuario.permisos,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
