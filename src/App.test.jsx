import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './lib/AuthContext'
import App from './App'

// App.jsx monta ~30 páginas reales del backoffice; para no pegarle a
// Supabase real en estos tests, cada caso usa una página restringida para
// el rol (CA-03) o un estado que nunca llega a montar ninguna página
// (loading, sin sesión, cliente web). No hace falta mockear cada page.
vi.mock('./lib/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Importar App carga todas las páginas y, con ellas, supabaseClient.js, que
// exige VITE_SUPABASE_URL/ANON_KEY apenas se importa. En CI no hay .env.local,
// así que sin este mock la suite falla antes de correr un solo test.
vi.mock('./lib/supabaseClient', () => {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    order: () => consulta,
    limit: () => consulta,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolver) => Promise.resolve({ data: [], error: null }).then(resolver),
  }
  return {
    supabase: {
      from: () => consulta,
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      channel: () => ({ on() { return this }, subscribe() { return this } }),
      removeChannel: () => {},
    },
  }
})

// Única página que un test monta "de verdad" (ver el último caso): se
// mockea para no pegarle a Supabase real desde el test.
vi.mock('./modules/proveedores/pages/ProveedoresPage', () => ({
  default: () => <div>Pantalla de Proveedores</div>,
}))

function setHash(pagina) {
  window.location.hash = pagina ? `#${pagina}` : ''
}

describe('App', () => {
  beforeEach(() => {
    setHash('')
  })

  it('muestra la pantalla de carga mientras loading=true', () => {
    useAuth.mockReturnValue({ session: null, loading: true, esInterno: false, rol: null, signOut: vi.fn() })
    render(<App />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('sin sesión muestra el login', () => {
    useAuth.mockReturnValue({ session: null, loading: false, esInterno: false, rol: null, signOut: vi.fn() })
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Ingresar' })).toBeInTheDocument()
  })

  it('CA-04: sesión sin fila interna activa desloguea y redirige a /tienda, sin mostrar el backoffice', async () => {
    const signOut = vi.fn().mockResolvedValue({})
    useAuth.mockReturnValue({
      session: { user: { id: 'u-web', email: 'cliente@web.com' } },
      loading: false,
      esInterno: false,
      rol: null,
      signOut,
    })

    const originalLocation = window.location
    delete window.location
    window.location = { ...originalLocation, href: '' }

    const { container } = render(<App />)

    await waitFor(() => expect(signOut).toHaveBeenCalled())
    await waitFor(() => expect(window.location.href).toBe('/tienda'))
    expect(container).toBeEmptyDOMElement()

    window.location = originalLocation
  })

  it('CA-03: Vendedor forzando la URL a una pantalla de otro rol ve Acceso Denegado, no la pantalla', () => {
    setHash('proveedores')
    useAuth.mockReturnValue({
      session: { user: { id: 'u1', email: 'vendedor@test.com' } },
      loading: false,
      esInterno: true,
      rol: 'Vendedor',
      signOut: vi.fn(),
    })

    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent('Acceso denegado')
    expect(screen.queryByText('Pantalla de Proveedores')).not.toBeInTheDocument()
  })

  it('si falla la consulta de permisos no desloguea: muestra Reintentar', () => {
    const signOut = vi.fn(() => Promise.resolve())
    const reintentarPermisos = vi.fn()
    useAuth.mockReturnValue({
      session: { user: { id: 'u1', email: 'admin@test.com' } },
      loading: false,
      esInterno: false,
      rol: null,
      errorPermisos: true,
      reintentarPermisos,
      signOut,
    })

    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos verificar tus permisos')
    expect(signOut).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'Reintentar' }).click()
    expect(reintentarPermisos).toHaveBeenCalled()
  })

  it('CA-03: el botón "Volver al inicio" navega a la primera página habilitada para el rol', () => {
    setHash('proveedores')
    useAuth.mockReturnValue({
      session: { user: { id: 'u1', email: 'vendedor@test.com' } },
      loading: false,
      esInterno: true,
      rol: 'Vendedor',
      signOut: vi.fn(),
    })

    render(<App />)
    screen.getByRole('button', { name: 'Volver al inicio' }).click()

    expect(window.location.hash).toBe('#clientes')
  })

  it('un Administrador no ve Acceso Denegado en una pantalla restringida a otros roles', () => {
    setHash('proveedores')
    useAuth.mockReturnValue({
      session: { user: { id: 'u-admin', email: 'admin@test.com' } },
      loading: false,
      esInterno: true,
      rol: 'Administrador',
      signOut: vi.fn(),
    })

    render(<App />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Pantalla de Proveedores')).toBeInTheDocument()
  })
})
