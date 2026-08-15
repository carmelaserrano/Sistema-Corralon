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
  },
}))

function mockearAuthPorDefecto(sessionInicial = null) {
  supabase.auth.getSession.mockResolvedValue({ data: { session: sessionInicial } })
  const unsubscribe = vi.fn()
  supabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe } },
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
})
