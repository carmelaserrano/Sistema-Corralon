import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TiendaApp, { TiendaShell } from './TiendaApp'
import { supabase } from '../../lib/supabaseClient'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {
  auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), onAuthStateChange: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() },
  from: vi.fn(), rpc: vi.fn(),
} }))
vi.mock('./api/carritoApi', () => ({
  esCantidadEnteraPositiva: () => true,
  validarItems: vi.fn().mockResolvedValue([]), obtenerCarrito: vi.fn().mockResolvedValue([]),
  fusionarCarrito: vi.fn().mockResolvedValue([]), guardarItems: vi.fn().mockResolvedValue([]),
}))
vi.mock('./pages/CatalogoPage', () => ({ default: () => <p>CATALOGO TEST</p> }))
vi.mock('./pages/ProductoDetallePage', () => ({ default: () => null }))
vi.mock('./pages/CarritoPage', () => ({ default: () => null }))
vi.mock('./pages/CheckoutPage', () => ({ default: () => null }))
vi.mock('./pages/PagoResultadoPage', () => ({ default: () => null }))
vi.mock('./pages/PasarelaSimuladaPage', () => ({ default: () => null }))
vi.mock('./pages/MisDatosPage', () => ({ default: () => null }))
vi.mock('./pages/MisPedidosPage', () => ({ default: () => null }))
vi.mock('./pages/SobreNosotrosPage', () => ({ default: () => null }))

let callback
let vinculado
let usuario
beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  vinculado = false
  usuario = { id: 'auth-nuevo', email: 'ana@example.com', user_metadata: {} }
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  supabase.auth.onAuthStateChange.mockImplementation((fn) => {
    callback = fn
    fn('INITIAL_SESSION', null)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  supabase.auth.signUp.mockImplementation(async ({ options }) => {
    usuario.user_metadata = options.data
    callback('SIGNED_IN', { user: usuario })
    return { data: { user: usuario, session: { user: usuario } }, error: null }
  })
  supabase.rpc.mockImplementation(async () => { vinculado = true; return { data: 'c1', error: null } })
  const consulta = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: vinculado ? { id: 'c1', nombre: 'Ana' } : null, error: null })) }
  consulta.select.mockReturnValue(consulta)
  consulta.eq.mockReturnValue(consulta)
  supabase.from.mockReturnValue(consulta)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it.each([TiendaApp, TiendaShell])('mantiene providers y resultado al registrar, cambiar auth y rerenderizar %s', async (Entrada) => {
  const vista = render(<StrictMode><Entrada /></StrictMode>)
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar / Registrarme' }))
  fireEvent.click(screen.getByRole('button', { name: 'Crear una cuenta' }))
  for (const [selector, value] of [['nombre', 'Ana'], ['apellido', 'Suarez'], ['numero_documento', '40111222'], ['email', 'ana@example.com'], ['telefono', '3874000002'], ['password', 'secreta123']]) {
    fireEvent.change(document.getElementById(`registro-${selector}`), { target: { value } })
  }
  const campoNombre = document.getElementById('registro-nombre')
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
  expect(await screen.findByText(/Tu cuenta fue creada correctamente/)).toBeInTheDocument()
  expect(supabase.auth.signUp).toHaveBeenCalledTimes(1)
  expect(supabase.rpc).toHaveBeenCalledTimes(1)
  await act(async () => {
    callback('TOKEN_REFRESHED', { user: usuario })
    await new Promise(resolve => setTimeout(resolve, 10))
  })
  vista.rerender(<StrictMode><Entrada /></StrictMode>)
  expect(screen.getByText(/Tu cuenta fue creada correctamente/)).toBeInTheDocument()
  expect(campoNombre.isConnected).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: /Ir al cat/ }))
  await waitFor(() => expect(screen.getByText('CATALOGO TEST')).toBeInTheDocument())
  expect(supabase.auth.signOut).not.toHaveBeenCalled()
})
