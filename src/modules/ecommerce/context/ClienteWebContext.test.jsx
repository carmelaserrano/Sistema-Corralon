import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClienteWebProvider, useClienteWeb } from './ClienteWebContext'
import IngresarPage from '../pages/IngresarPage'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: {
  auth: { onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn() },
  from: vi.fn(), rpc: vi.fn(),
} }))

const usuario = { id: 'demo-uid', email: 'demo.tienda@gmail.com', user_metadata: {} }
const cliente = { id: 'cliente-demo', nombre: 'Cliente Demo', usuario_web_id: usuario.id }
let listeners, persistida, consulta
function emitir(evento, sesion = persistida) { for (const fn of listeners) fn(evento, sesion) }
async function eventosPendientes() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) }) }
function Estado() {
  const ctx = useClienteWeb()
  return <><output data-testid="cliente">{ctx.cliente?.id ?? 'sin-cliente'}</output><IngresarPage /></>
}
function entrada() { return <StrictMode><ClienteWebProvider><Estado /></ClienteWebProvider></StrictMode> }
async function login() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: usuario.email } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'prueba-local' } })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar', exact: true }))
}
beforeEach(() => {
  vi.clearAllMocks()
  persistida = null
  listeners = new Set()
  supabase.auth.onAuthStateChange.mockImplementation(fn => {
    listeners.add(fn)
    fn('INITIAL_SESSION', persistida)
    return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }
  })
  supabase.auth.signInWithPassword.mockImplementation(async () => {
    persistida = { user: usuario }
    emitir('SIGNED_IN')
    return { data: { user: usuario, session: persistida }, error: null }
  })
  supabase.auth.signOut.mockImplementation(async () => {
    persistida = null
    emitir('SIGNED_OUT')
    return { error: null }
  })
  consulta = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: cliente, error: null }) }
  consulta.select.mockReturnValue(consulta)
  consulta.eq.mockReturnValue(consulta)
  supabase.from.mockReturnValue(consulta)
})
afterEach(cleanup)

describe('login de cliente vinculado y orden de eventos Auth', () => {
  it('login correcto carga el cliente y conserva sesión sin signOut', async () => {
    render(entrada())
    await eventosPendientes()
    await login()
    await screen.findByText('¡Bienvenido de nuevo!')
    await eventosPendientes()
    expect(screen.getByTestId('cliente')).toHaveTextContent(cliente.id)
    expect(consulta.eq).toHaveBeenCalledWith('usuario_web_id', usuario.id)
    expect(persistida.user.id).toBe(usuario.id)
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('INITIAL_SESSION nulo posterior no pisa un cliente ya encontrado', async () => {
    render(entrada())
    await eventosPendientes()
    await login()
    await screen.findByText('¡Bienvenido de nuevo!')
    act(() => emitir('INITIAL_SESSION', null))
    await eventosPendientes()
    expect(screen.getByTestId('cliente')).toHaveTextContent(cliente.id)
    expect(screen.queryByRole('button', { name: 'Ingresar', exact: true })).not.toBeInTheDocument()
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('INITIAL_SESSION atrasado durante la carga no cancela el SIGNED_IN más reciente', async () => {
    let resolver
    consulta.maybeSingle.mockImplementation(() => new Promise(resolve => { resolver = resolve }))
    render(entrada())
    await eventosPendientes()
    await login()
    await waitFor(() => expect(consulta.maybeSingle).toHaveBeenCalledOnce())
    act(() => emitir('INITIAL_SESSION', null))
    await eventosPendientes()
    await act(async () => resolver({ data: cliente, error: null }))
    await waitFor(() => expect(screen.getByTestId('cliente')).toHaveTextContent(cliente.id))
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('SIGNED_IN repetido e ingresar comparten una única carga', async () => {
    let resolver
    consulta.maybeSingle.mockImplementation(() => new Promise(resolve => { resolver = resolve }))
    render(entrada())
    await eventosPendientes()
    await login()
    await waitFor(() => expect(consulta.maybeSingle).toHaveBeenCalledOnce())
    act(() => { emitir('SIGNED_IN'); emitir('SIGNED_IN') })
    await eventosPendientes()
    await act(async () => resolver({ data: cliente, error: null }))
    await screen.findByText('¡Bienvenido de nuevo!')
    expect(consulta.maybeSingle).toHaveBeenCalledOnce()
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('remontar como en una recarga recupera el cliente de la sesión persistida', async () => {
    const primera = render(entrada())
    await eventosPendientes()
    await login()
    await screen.findByText('¡Bienvenido de nuevo!')
    primera.unmount()
    render(entrada())
    await screen.findByText('¡Bienvenido de nuevo!')
    expect(screen.getByTestId('cliente')).toHaveTextContent(cliente.id)
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledOnce()
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('un error de red al buscar el cliente no debe destruir la sesión Auth válida', async () => {
    consulta.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('Error de red consultando cliente') })
    render(entrada())
    await eventosPendientes()
    await login()
    await screen.findByText('Error de red consultando cliente')
    expect(persistida?.user.id).toBe(usuario.id)
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('SIGNED_OUT limpia el cliente y un INITIAL_SESSION viejo no lo restaura', async () => {
    render(entrada())
    await eventosPendientes()
    await login()
    await screen.findByText('¡Bienvenido de nuevo!')
    await act(async () => { await supabase.auth.signOut() })
    await eventosPendientes()
    expect(screen.getByTestId('cliente')).toHaveTextContent('sin-cliente')
    act(() => emitir('INITIAL_SESSION', { user: usuario }))
    await eventosPendientes()
    expect(screen.getByTestId('cliente')).toHaveTextContent('sin-cliente')
    expect(screen.getByRole('button', { name: 'Ingresar', exact: true })).toBeInTheDocument()
  })

  it('una cuenta realmente sin cliente muestra el error de cuenta no vinculada', async () => {
    consulta.maybeSingle.mockResolvedValue({ data: null, error: null })
    render(entrada())
    await eventosPendientes()
    await login()
    await screen.findByText('Tu usuario no tiene una cuenta de cliente en la tienda.')
    expect(screen.getByTestId('cliente')).toHaveTextContent('sin-cliente')
  })
})
