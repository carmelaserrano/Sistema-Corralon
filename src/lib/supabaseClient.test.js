import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const createClientMock = vi.fn(() => ({ mockClient: true }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => createClientMock(...args),
}))

describe('supabaseClient', () => {
  beforeEach(() => {
    vi.resetModules()
    createClientMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('crea el cliente de Supabase cuando están las variables de entorno', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://ejemplo.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-de-prueba')

    const { supabase } = await import('./supabaseClient')

    expect(createClientMock).toHaveBeenCalledWith(
      'https://ejemplo.supabase.co',
      'clave-de-prueba',
    )
    expect(supabase).toEqual({ mockClient: true })
  })

  it('lanza un error claro cuando faltan las variables de entorno', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    await expect(import('./supabaseClient')).rejects.toThrow(
      /Faltan VITE_SUPABASE_URL/,
    )
  })
})
