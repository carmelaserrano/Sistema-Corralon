import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import IngresarPage from './IngresarPage'
import { useClienteWeb } from '../context/ClienteWebContext'

vi.mock('../context/ClienteWebContext', () => ({ useClienteWeb: vi.fn() }))

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

it.each([
  [{ nombre: ' Ana ' }, 'Hola, Ana'],
  [{ nombre: '', razon_social: 'Empresa Norte' }, 'Hola, Empresa Norte'],
  [{ nombre: '   ' }, 'Hola'],
  [{}, 'Hola'],
])('presenta el éxito con saludo para %j y conserva los destinos de las acciones', (cliente, saludo) => {
  useClienteWeb.mockReturnValue({ cliente, pendiente: null })
  const navegar = vi.fn()
  render(<IngresarPage onNavigate={navegar} />)

  expect(screen.getByRole('heading', { level: 1, name: '¡Bienvenido de nuevo!' })).toBeInTheDocument()
  expect(screen.getByText(saludo, { exact: true })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Ingresaste correctamente a tu cuenta.')
  expect(screen.getByRole('status')).toHaveTextContent('Ya podés continuar comprando y consultar tus pedidos.')
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  for (const beneficio of ['Consultar tus pedidos', 'Revisar tus datos', 'Continuar comprando']) {
    expect(screen.getByText(beneficio)).toBeInTheDocument()
  }
  for (const [texto, destino] of [['Ir al catálogo', 'catalogo'], ['Mis datos', 'mis-datos'], ['Mis pedidos', 'mis-pedidos']]) {
    fireEvent.click(screen.getByRole('button', { name: texto }))
    expect(navegar).toHaveBeenLastCalledWith(destino)
  }
})

it('muestra la tarjeta al cargar el cliente después del login sin navegar automáticamente', async () => {
  const ingresar = vi.fn().mockResolvedValue(undefined)
  const navegar = vi.fn()
  useClienteWeb.mockReturnValue({ cliente: null, pendiente: null, ingresar })
  const vista = render(<IngresarPage onNavigate={navegar} />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.com' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreta123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
  await waitFor(() => expect(ingresar).toHaveBeenCalledExactlyOnceWith('ana@example.com', 'secreta123'))

  useClienteWeb.mockReturnValue({ cliente: { nombre: 'Ana' }, pendiente: null, ingresar })
  vista.rerender(<IngresarPage onNavigate={navegar} />)
  expect(screen.getByRole('heading', { name: '¡Bienvenido de nuevo!' })).toBeInTheDocument()
  expect(navegar).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
})

it('una cuenta pendiente puede completar el registro o salir para usar otra cuenta', () => {
  const salir = vi.fn().mockResolvedValue(undefined)
  const navegar = vi.fn()
  useClienteWeb.mockReturnValue({ cliente: null, pendiente: { id: 'u1', email: 'ana@example.com' }, salir })
  render(<IngresarPage onNavigate={navegar} />)

  expect(screen.getByRole('heading', { level: 1, name: 'Falta completar tu registro' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Completar registro' }))
  expect(navegar).toHaveBeenLastCalledWith('registrarme')
  fireEvent.click(screen.getByRole('button', { name: 'Usar otra cuenta' }))
  expect(salir).toHaveBeenCalledOnce()
})
