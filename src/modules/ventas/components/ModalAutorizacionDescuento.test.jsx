import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModalAutorizacionDescuento from './ModalAutorizacionDescuento'
import { autorizarDescuentoComoSupervisor } from '../api/descuentosApi'

vi.mock('../api/descuentosApi', () => ({
  autorizarDescuentoComoSupervisor: vi.fn(),
}))

function completarCredenciales({ email = 'supervisor@corralon.com', password = '1234' } = {}) {
  fireEvent.change(screen.getByLabelText('Email del supervisor'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } })
}

describe('ModalAutorizacionDescuento', () => {
  const onAutorizado = vi.fn()
  const onCancelar = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('no muestra nada si abierto es false', () => {
    const { container } = render(
      <ModalAutorizacionDescuento
        abierto={false}
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el porcentaje a autorizar', () => {
    render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )
    expect(screen.getByText('Descuento del 25%')).toBeInTheDocument()
  })

  it('enfoca el email al abrirse', () => {
    render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )
    expect(screen.getByLabelText('Email del supervisor')).toHaveFocus()
  })

  it('exige email y contraseña antes de llamar a la API', async () => {
    render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Autorizar' }))

    expect(await screen.findByText(/Completá el email y la contraseña/)).toBeInTheDocument()
    expect(autorizarDescuentoComoSupervisor).not.toHaveBeenCalled()
  })

  it('CA-05: autentica al supervisor y autoriza el porcentaje pedido', async () => {
    autorizarDescuentoComoSupervisor.mockResolvedValue('auth-123')
    render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={30}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    completarCredenciales({ email: '  supervisor@corralon.com  ', password: 'correcta' })
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar' }))

    await waitFor(() => expect(onAutorizado).toHaveBeenCalledWith('auth-123'))
    // El email se manda sin los espacios de sobra.
    expect(autorizarDescuentoComoSupervisor).toHaveBeenCalledWith({
      email: 'supervisor@corralon.com',
      password: 'correcta',
      porcentaje: 30,
    })
  })

  it('muestra "Autorizando…" y deshabilita los campos mientras espera', async () => {
    let resolver
    autorizarDescuentoComoSupervisor.mockReturnValue(new Promise((r) => (resolver = r)))
    render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={30}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    completarCredenciales()
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar' }))

    expect(await screen.findByRole('button', { name: 'Autorizando…' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email del supervisor')).toBeDisabled()
    expect(screen.getByLabelText('Contraseña')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()

    resolver('auth-1')
    await waitFor(() => expect(onAutorizado).toHaveBeenCalled())
  })

  it('CA-06: credenciales incorrectas muestra el error y no autoriza', async () => {
    autorizarDescuentoComoSupervisor.mockRejectedValue(new Error('Email o contraseña incorrectos'))
    render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    completarCredenciales({ password: 'mala' })
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar' }))

    expect(await screen.findByText('Email o contraseña incorrectos')).toBeInTheDocument()
    expect(onAutorizado).not.toHaveBeenCalled()
  })

  it('CA-06: supervisor sin permiso muestra el error de la API', async () => {
    autorizarDescuentoComoSupervisor.mockRejectedValue(
      new Error('Ese usuario no tiene permiso para autorizar descuentos'),
    )
    render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    completarCredenciales()
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar' }))

    expect(
      await screen.findByText('Ese usuario no tiene permiso para autorizar descuentos'),
    ).toBeInTheDocument()
  })

  it('Cancelar llama a onCancelar sin autorizar', () => {
    render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancelar).toHaveBeenCalledTimes(1)
    expect(autorizarDescuentoComoSupervisor).not.toHaveBeenCalled()
  })

  it('tocar el fondo llama a onCancelar; tocar el panel no', () => {
    const { container } = render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onCancelar).not.toHaveBeenCalled()

    fireEvent.mouseDown(container.querySelector('.modal-backdrop'))
    expect(onCancelar).toHaveBeenCalledTimes(1)
  })

  it('la tecla Escape llama a onCancelar', () => {
    render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancelar).toHaveBeenCalledTimes(1)
  })

  it('el botón de cerrar (X) llama a onCancelar', () => {
    render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onCancelar).toHaveBeenCalledTimes(1)
  })

  it('no arrastra el email, la contraseña ni el error de una apertura anterior', async () => {
    autorizarDescuentoComoSupervisor.mockRejectedValue(new Error('Email o contraseña incorrectos'))
    const { rerender } = render(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    completarCredenciales({ email: 'viejo@x.com', password: 'vieja' })
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar' }))
    expect(await screen.findByText('Email o contraseña incorrectos')).toBeInTheDocument()

    // Se cierra (el propio componente sigue montado, como en el uso real).
    rerender(
      <ModalAutorizacionDescuento
        abierto={false}
        porcentaje={25}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )
    // Se vuelve a abrir, para otra línea con otro porcentaje.
    rerender(
      <ModalAutorizacionDescuento
        abierto
        porcentaje={40}
        onAutorizado={onAutorizado}
        onCancelar={onCancelar}
      />,
    )

    expect(screen.queryByText('Email o contraseña incorrectos')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email del supervisor').value).toBe('')
    expect(screen.getByLabelText('Contraseña').value).toBe('')
    expect(screen.getByText('Descuento del 40%')).toBeInTheDocument()
  })
})
