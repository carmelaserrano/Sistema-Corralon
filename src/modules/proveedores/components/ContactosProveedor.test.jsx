import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ContactosProveedor from './ContactosProveedor'
import {
  createContacto,
  deleteContacto,
  getContactosDeProveedor,
  updateContacto,
} from '../api/contactosApi'

vi.mock('../api/contactosApi', () => ({
  createContacto: vi.fn(),
  deleteContacto: vi.fn(),
  getContactosDeProveedor: vi.fn(),
  updateContacto: vi.fn(),
}))

function errorDeApi(mensaje, status) {
  const error = new Error(mensaje)
  error.status = status
  return error
}

const juan = {
  id: 'c1',
  proveedor_id: 'p1',
  nombre: 'Juan Pérez',
  cargo: 'Encargado de ventas',
  telefono: '387-4001122',
  email: 'juan@corralon.com',
  principal: true,
}

const ana = {
  id: 'c2',
  proveedor_id: 'p1',
  nombre: 'Ana Gómez',
  cargo: null,
  telefono: '387-4003344',
  email: null,
  principal: false,
}

async function completarContacto({
  nombre = 'Ana Gómez',
  telefono = '387-4003344',
  email = '',
} = {}) {
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: nombre },
  })
  fireEvent.change(screen.getByLabelText('Teléfono'), {
    target: { value: telefono },
  })
  if (email) {
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: email },
    })
  }
}

describe('ContactosProveedor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getContactosDeProveedor.mockResolvedValue([juan, ana])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // CA 2
  it('lista los contactos con nombre, cargo, teléfono, email y principal', async () => {
    const { container } = render(<ContactosProveedor proveedorId="p1" />)

    const fila = (await screen.findByText('Juan Pérez')).closest('tr')
    expect(fila).toHaveTextContent('Encargado de ventas')
    expect(fila).toHaveTextContent('387-4001122')
    expect(fila).toHaveTextContent('juan@corralon.com')
    expect(container.querySelector('.estado-badge-principal')).toHaveTextContent(
      'Principal',
    )
  })

  it('pide los contactos del proveedor que recibe', async () => {
    render(<ContactosProveedor proveedorId="p9" />)

    await waitFor(() =>
      expect(getContactosDeProveedor).toHaveBeenCalledWith('p9'),
    )
  })

  // CA 7
  it('muestra el estado vacío con la acción de agregar el primero', async () => {
    getContactosDeProveedor.mockResolvedValue([])
    render(<ContactosProveedor proveedorId="p1" />)

    expect(
      await screen.findByText('Este proveedor no tiene contactos'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Agregar el primer contacto' }),
    ).toBeInTheDocument()
  })

  it('no ofrece la acción del estado vacío a quien no puede gestionar', async () => {
    getContactosDeProveedor.mockResolvedValue([])
    render(<ContactosProveedor proveedorId="p1" puedeGestionar={false} />)

    expect(
      await screen.findByText('Este proveedor no tiene contactos'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Agregar el primer contacto' }),
    ).not.toBeInTheDocument()
  })

  // CA 1
  it('agrega un contacto al proveedor', async () => {
    createContacto.mockResolvedValue(ana)
    render(<ContactosProveedor proveedorId="p1" />)
    await screen.findByText('Juan Pérez')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar contacto' }))
    await completarContacto()
    fireEvent.click(
      screen.getByRole('button', { name: 'Agregar contacto', hidden: false }),
    )

    await waitFor(() =>
      expect(createContacto).toHaveBeenCalledWith('p1', {
        nombre: 'Ana Gómez',
        cargo: '',
        telefono: '387-4003344',
        email: '',
        principal: false,
      }),
    )
    expect(await screen.findByText(/agregado/)).toBeInTheDocument()
  })

  it('permite cargar varios contactos seguidos', async () => {
    getContactosDeProveedor.mockResolvedValue([juan])
    createContacto.mockResolvedValue(ana)
    render(<ContactosProveedor proveedorId="p1" />)
    await screen.findByText('Juan Pérez')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar contacto' }))
    await completarContacto()
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar contacto' })[0])

    await screen.findByText(/agregado/)
    // El formulario se cierra y el botón vuelve a estar disponible.
    expect(
      await screen.findByRole('button', { name: 'Agregar contacto' }),
    ).toBeInTheDocument()
  })

  // CA 3
  it('muestra el mensaje exacto cuando el email es inválido', async () => {
    createContacto.mockRejectedValue(
      errorDeApi('Formato de correo electrónico inválido', 400),
    )
    render(<ContactosProveedor proveedorId="p1" />)
    await screen.findByText('Juan Pérez')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar contacto' }))
    await completarContacto({ email: 'ana@corralon' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar contacto' })[0])

    expect(
      await screen.findByText('Formato de correo electrónico inválido'),
    ).toBeInTheDocument()
  })

  // CA 4
  it('muestra el error cuando falta el teléfono', async () => {
    createContacto.mockRejectedValue(errorDeApi('El teléfono es obligatorio', 400))
    render(<ContactosProveedor proveedorId="p1" />)
    await screen.findByText('Juan Pérez')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar contacto' }))
    await completarContacto({ telefono: '' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar contacto' })[0])

    expect(
      await screen.findByText('El teléfono es obligatorio'),
    ).toBeInTheDocument()
  })

  // CA 5
  it('recarga el listado al marcar un contacto como principal', async () => {
    updateContacto.mockResolvedValue({ ...ana, principal: true })
    render(<ContactosProveedor proveedorId="p1" />)
    await screen.findByText('Ana Gómez')

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[1])
    fireEvent.click(screen.getByLabelText('Es el contacto principal'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(updateContacto).toHaveBeenCalledWith(
        'c2',
        expect.objectContaining({ principal: true }),
      ),
    )
    // Dos llamadas: la carga inicial y la recarga posterior, necesaria porque
    // el trigger de la base desmarcó al principal anterior.
    await waitFor(() =>
      expect(getContactosDeProveedor).toHaveBeenCalledTimes(2),
    )
  })

  // CA 6
  it('edita un contacto precargando sus datos', async () => {
    updateContacto.mockResolvedValue(juan)
    render(<ContactosProveedor proveedorId="p1" />)
    await screen.findByText('Juan Pérez')

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0])

    expect(screen.getByLabelText('Nombre')).toHaveValue('Juan Pérez')
    expect(screen.getByLabelText('Cargo')).toHaveValue('Encargado de ventas')
    expect(screen.getByLabelText('Es el contacto principal')).toBeChecked()

    fireEvent.change(screen.getByLabelText('Cargo'), {
      target: { value: 'Gerente' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(updateContacto).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ cargo: 'Gerente' }),
      ),
    )
  })

  it('elimina un contacto tras confirmar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteContacto.mockResolvedValue(undefined)
    render(<ContactosProveedor proveedorId="p1" />)
    await screen.findByText('Ana Gómez')

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1])

    await waitFor(() => expect(deleteContacto).toHaveBeenCalledWith('c2'))
    expect(await screen.findByText(/eliminado/)).toBeInTheDocument()
  })

  it('no elimina si se cancela la confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ContactosProveedor proveedorId="p1" />)
    await screen.findByText('Juan Pérez')

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0])

    expect(deleteContacto).not.toHaveBeenCalled()
  })

  it('muestra el error cuando falla la carga', async () => {
    getContactosDeProveedor.mockRejectedValue(new Error('sin conexión'))
    render(<ContactosProveedor proveedorId="p1" />)

    expect(await screen.findByText('sin conexión')).toBeInTheDocument()
    expect(
      screen.queryByText('Este proveedor no tiene contactos'),
    ).not.toBeInTheDocument()
  })

  it('oculta las acciones a quien no puede gestionar', async () => {
    render(<ContactosProveedor proveedorId="p1" puedeGestionar={false} />)
    await screen.findByText('Juan Pérez')

    expect(screen.getByText(/Sólo podés consultar los contactos/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Agregar contacto' }),
    ).not.toBeInTheDocument()
  })
})
