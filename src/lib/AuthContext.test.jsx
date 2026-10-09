import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { supabase } from './supabaseClient'

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
  },
}))

function mockearAuthPorDefecto(sessionInicial = null) {
  supabase.auth.getSession.mockResolvedValue({ data: { session: sessionInicial } })
  const unsubscribe = vi.fn()
  supabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe } },
  })
  supabase.rpc.mockResolvedValue({
    data: { interno: false, rol: null, permisos: [] },
    error: null,
  })
  return { unsubscribe }
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('expone la sesión que devuelve Supabase al montar', async () => {
    const sessionMock = { user: { id: 'u1', email: 'user@test.com' } }
    mockearAuthPorDefecto(sessionMock)

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toEqual(sessionMock)
  })

  it('actualiza la sesión cuando cambia el estado de autenticación', async () => {
    mockearAuthPorDefecto(null)
    let onChangeCallback
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      onChangeCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const nuevaSession = { user: { id: 'u2', email: 'otro@test.com' } }
    act(() => {
      onChangeCallback('SIGNED_IN', nuevaSession)
    })

    expect(result.current.session).toEqual(nuevaSession)
  })

  it('llama a signInWithPassword con las credenciales', async () => {
    mockearAuthPorDefecto(null)
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    result.current.signIn('user@test.com', '123456')

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@test.com',
      password: '123456',
    })
  })

  it('llama a signOut', async () => {
    mockearAuthPorDefecto(null)
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    result.current.signOut()

    expect(supabase.auth.signOut).toHaveBeenCalled()
  })

  it('lanza un error si useAuth se usa fuera de AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth debe usarse dentro de AuthProvider',
    )
  })

  it('se desuscribe del listener al desmontar', async () => {
    const { unsubscribe } = mockearAuthPorDefecto(null)
    const { unmount, result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })

  it('sin sesión expone esInterno/rol/permisos vacíos (CA-04)', async () => {
    mockearAuthPorDefecto(null)
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.esInterno).toBe(false)
    expect(result.current.rol).toBe(null)
    expect(result.current.permisos).toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('con sesión, carga rol y permisos desde obtener_permisos_usuario_actual', async () => {
    const sessionMock = { user: { id: 'u1', email: 'vendedor@test.com' } }
    mockearAuthPorDefecto(sessionMock)
    supabase.rpc.mockResolvedValue({
      data: { interno: true, rol: 'Vendedor', permisos: ['ventas.registrar'] },
      error: null,
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('obtener_permisos_usuario_actual')
    expect(result.current.esInterno).toBe(true)
    expect(result.current.rol).toBe('Vendedor')
    expect(result.current.permisos).toEqual(['ventas.registrar'])
  })

  it('CA-04: un autenticado sin fila interna (cliente web) queda con esInterno=false', async () => {
    const sessionMock = { user: { id: 'u-web', email: 'cliente@web.com' } }
    mockearAuthPorDefecto(sessionMock)
    supabase.rpc.mockResolvedValue({
      data: { interno: false, rol: null, permisos: [] },
      error: null,
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.esInterno).toBe(false)
    expect(result.current.rol).toBe(null)
  })

  it('si la RPC de permisos falla, no deja esInterno en un estado inseguro', async () => {
    const sessionMock = { user: { id: 'u1', email: 'user@test.com' } }
    mockearAuthPorDefecto(sessionMock)
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('rpc caída') })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.esInterno).toBe(false)
    expect(result.current.rol).toBe(null)
    expect(result.current.permisos).toEqual([])
  })

  it('no vuelve a pedir permisos cuando el evento de auth repite el mismo usuario (TOKEN_REFRESHED)', async () => {
    const sessionMock = { user: { id: 'u1', email: 'user@test.com' } }
    mockearAuthPorDefecto(sessionMock)
    supabase.rpc.mockResolvedValue({
      data: { interno: true, rol: 'Tesorero', permisos: ['tesoreria.factura.registrar'] },
      error: null,
    })

    let onChangeCallback
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      onChangeCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.rpc).toHaveBeenCalledTimes(1)

    const sessionRefrescada = { user: { id: 'u1', email: 'user@test.com' }, access_token: 'nuevo' }
    act(() => {
      onChangeCallback('TOKEN_REFRESHED', sessionRefrescada)
    })

    expect(result.current.session).toEqual(sessionRefrescada)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(result.current.rol).toBe('Tesorero')
  })
})
