import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RegistroPage from './RegistroPage'
import IngresarPage from './IngresarPage'
import { ClienteWebProvider, useClienteWeb } from '../context/ClienteWebContext'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: {
  auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), onAuthStateChange: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() },
  rpc: vi.fn(), from: vi.fn(),
} }))
const usuario = { id: 'auth-web', user_metadata: {} }
const cliente = { id: 'cliente-web', usuario_web_id: usuario.id, nombre: 'Ana' }
function Cuenta() {
  const { cliente, cargando } = useClienteWeb()
  return <div>{cliente && !cargando ? `Comprando como ${cliente.nombre}` : 'Visitante'}</div>
}
beforeEach(() => {
  vi.resetAllMocks()
  supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  supabase.auth.signUp.mockResolvedValue({ data: { user: usuario, session: { user: usuario } }, error: null })
  supabase.rpc.mockResolvedValue({ data: cliente.id, error: null })
  const consulta = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: cliente, error: null }) }
  consulta.select.mockReturnValue(consulta)
  consulta.eq.mockReturnValue(consulta)
  supabase.from.mockReturnValue(consulta)
})
afterEach(cleanup)

it.each([
  ['Prueba', 'Bienvenido, Prueba'],
  ['', 'Bienvenido'],
  ['   ', 'Bienvenido'],
])('presenta la tarjeta final con saludo para nombre %j y las dos acciones', async (nombre, saludo) => {
  supabase.from().maybeSingle.mockResolvedValue({ data: { ...cliente, nombre }, error: null })
  const navegar = vi.fn()
  registrar(navegar)
  expect(await screen.findByRole('heading', { level: 1, name: '¡Tu cuenta ya está lista!' })).toBeInTheDocument()
  expect(screen.getByText(saludo, { exact: true })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Tu cuenta fue creada correctamente y ya podés empezar a comprar.')
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  for (const beneficio of ['Guardar tus datos de entrega', 'Consultar tus pedidos', 'Comprar más rápido']) {
    expect(screen.getByText(beneficio)).toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole('button', { name: 'Ver mi cuenta' }))
  expect(navegar).toHaveBeenLastCalledWith('mis-datos')
  fireEvent.click(screen.getByRole('button', { name: 'Ir al catálogo' }))
  expect(navegar).toHaveBeenLastCalledWith('catalogo')
})

function registrar(onNavigate = vi.fn()) {
  render(<ClienteWebProvider><RegistroPage onNavigate={onNavigate} /><Cuenta /></ClienteWebProvider>)
  for (const [label, value] of [['Nombre', 'Ana'], ['Apellido', 'Suárez'], ['DNI', '30111222'], ['Email', 'ana@example.com'], ['Teléfono', '3874000002'], ['Contraseña', 'secreta123']]) {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
}
it('registra, vincula y carga el cliente antes de continuar comprando sin confirmación ni usuarios internos', async () => {
  const navegar = vi.fn()
  supabase.auth.signUp.mockImplementation(async () => {
    const callback = supabase.auth.onAuthStateChange.mock.calls[0][0]
    callback('SIGNED_IN', { user: usuario })
    return { data: { user: usuario, session: { user: usuario } }, error: null }
  })
  registrar(navegar)
  expect(await screen.findByText(/Tu cuenta fue creada correctamente/)).toBeInTheDocument()
  expect(screen.getByText('Comprando como Ana')).toBeInTheDocument()
  expect(screen.queryByText('Revisá tu correo')).not.toBeInTheDocument()
  expect(supabase.from).toHaveBeenCalledWith('clientes')
  expect(supabase.from.mock.results[0].value.eq).toHaveBeenCalledWith('usuario_web_id', usuario.id)
  expect(supabase.from.mock.calls.every(([tabla]) => tabla === 'clientes')).toBe(true)
  expect(supabase.rpc).toHaveBeenCalledWith('registrar_cliente_web', { p_datos: {
    nombre: 'Ana', apellido: 'Suárez', tipo_documento: 'DNI', numero_documento: '30111222', telefono: '3874000002',
  } })
  expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Ir al catálogo' }))
  expect(navegar).toHaveBeenCalledWith('catalogo')
})
it('email duplicado muestra el error y no ofrece continuar como registrado', async () => {
  supabase.auth.signUp.mockResolvedValue({ error: { code: 'user_already_exists' } })
  registrar()
  expect(await screen.findByText(/Ese email ya tiene una cuenta/)).toBeInTheDocument()
  expect(screen.queryByText(/Tu cuenta fue creada correctamente/)).not.toBeInTheDocument()
  expect(supabase.rpc).not.toHaveBeenCalled()
})
it('no anuncia éxito si falla la vinculación', async () => {
  supabase.rpc.mockResolvedValue({ error: { code: '23505' } })
  registrar()
  expect((await screen.findAllByText(/No pudimos vincular ese documento/))[0]).toBeInTheDocument()
  expect(screen.queryByText(/Tu cuenta fue creada correctamente/)).not.toBeInTheDocument()
})

it('recupera Auth creado tras conflicto de documento sin repetir signUp', async () => {
  supabase.rpc.mockResolvedValueOnce({ error: { code: '23505' } }).mockResolvedValue({ data: cliente.id, error: null })
  supabase.auth.updateUser.mockResolvedValue({ data: { user: usuario }, error: null })
  registrar()
  const completar = await screen.findByRole('button', { name: 'Completar registro' })
  expect(screen.getByLabelText('Email')).toBeDisabled()
  expect(screen.getByLabelText('DNI')).toHaveValue('30111222')
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '40111222' } })
  fireEvent.click(completar)
  expect(await screen.findByText(/Tu cuenta fue creada correctamente/)).toBeInTheDocument()
  expect(supabase.auth.signUp).toHaveBeenCalledTimes(1)
  expect(supabase.auth.signOut).not.toHaveBeenCalled()
  expect(supabase.auth.updateUser.mock.calls[0][0].data.registro_cliente_web.numero_documento).toBe('40111222')
})
it('recupera pendiente al restaurar sesion y permite corregir el documento', async () => {
  supabase.rpc.mockResolvedValue({ error: { code: '23505' } })
  supabase.from().maybeSingle.mockResolvedValue({ data: null, error: null })
  render(<ClienteWebProvider><RegistroPage /><Cuenta /></ClienteWebProvider>)
  const pendiente = { ...usuario, email: 'ana@example.com', user_metadata: { registro_cliente_web: {
    nombre: 'Ana', apellido: 'Suarez', tipo_documento: 'DNI', numero_documento: '30111222', telefono: '3874000002',
  } } }
  await act(async () => {
    supabase.auth.onAuthStateChange.mock.calls[0][0]('INITIAL_SESSION', { user: pendiente })
    await new Promise(resolve => setTimeout(resolve, 10))
  })
  expect(await screen.findByRole('button', { name: 'Completar registro' })).toBeInTheDocument()
  expect(screen.getByLabelText('DNI')).toHaveValue('30111222')
  expect(supabase.auth.signUp).not.toHaveBeenCalled()
  expect(supabase.auth.signOut).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByText(/Tu cuenta fue creada correctamente/)).not.toBeInTheDocument())
})

it('login de cuenta pendiente conserva sesion y ofrece completar registro', async () => {
  supabase.from().maybeSingle.mockResolvedValue({ data: null, error: null })
  supabase.rpc.mockResolvedValue({ error: { code: '23505' } })
  supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: {
    ...usuario, email: 'ana@example.com', user_metadata: { registro_cliente_web: {
      nombre: 'Ana', apellido: 'Suarez', tipo_documento: 'DNI', numero_documento: '30111222', telefono: '3874000002',
    } },
  } }, error: null })
  const navegar = vi.fn()
  render(<ClienteWebProvider><IngresarPage onNavigate={navegar} /></ClienteWebProvider>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.com' } })
  fireEvent.change(document.getElementById('ingresar-password'), { target: { value: 'secreta123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Completar registro' }))
  expect(navegar).toHaveBeenCalledWith('registrarme')
  expect(supabase.auth.signOut).not.toHaveBeenCalled()
  expect(supabase.auth.signUp).not.toHaveBeenCalled()
})
