import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RubrosPage from './RubrosPage'
import {
  createRubro,
  darDeBajaRubro,
  getRubros,
  puedeGestionarRubros,
  reactivarRubro,
  updateRubro,
} from '../api/rubrosApi'

vi.mock('../api/rubrosApi', () => ({
  createRubro: vi.fn(),
  darDeBajaRubro: vi.fn(),
  getRubros: vi.fn(),
  puedeGestionarRubros: vi.fn(),
  reactivarRubro: vi.fn(),
  updateRubro: vi.fn(),
}))

const cemento = {
  id: 'r1',
  nombre: 'Cemento',
  activo: true,
  proveedores_asociados: 2,
}

const hierros = {
  id: 'r2',
  nombre: 'Hierros',
  activo: true,
  proveedores_asociados: 0,
}

function errorDeApi(mensaje, status) {
  const error = new Error(mensaje)
  error.status = status
  return error
}

describe('RubrosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    puedeGestionarRubros.mockResolvedValue(true)
    getRubros.mockResolvedValue([cemento, hierros])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // CA 6
  it('lista los rubros con la cantidad de proveedores asociados', async () => {
    render(<RubrosPage />)

    const filaCemento = (await screen.findByText('Cemento')).closest('tr')
    expect(filaCemento).toHaveTextContent('2')

    const filaHierros = screen.getByText('Hierros').closest('tr')
    expect(filaHierros).toHaveTextContent('0')
  })

  it('respeta el orden alfabético que devuelve la capa de datos', async () => {
    render(<RubrosPage />)

    await screen.findByText('Cemento')
    const nombres = screen
      .getAllByRole('row')
      .slice(1)
      .map((fila) => fila.querySelector('td').textContent)

    expect(nombres).toEqual(['Cemento', 'Hierros'])
  })

  // CA 1
  it('crea un rubro y vuelve a cargar el listado', async () => {
    createRubro.mockResolvedValue({ ...hierros, nombre: 'Áridos' })
    render(<RubrosPage />)

    await screen.findByText('Cemento')

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Áridos' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear rubro' }))

    expect(await screen.findByText(/Rubro "Áridos" creado/)).toBeInTheDocument()
    expect(createRubro).toHaveBeenCalledWith({ nombre: 'Áridos' })
    expect(getRubros).toHaveBeenCalledTimes(2)
  })

  // CA 3
  it('muestra el mensaje cuando el nombre es obligatorio', async () => {
    createRubro.mockRejectedValue(errorDeApi('El nombre es obligatorio', 400))
    render(<RubrosPage />)

    await screen.findByText('Cemento')
    fireEvent.click(screen.getByRole('button', { name: 'Crear rubro' }))

    expect(
      await screen.findByText('El nombre es obligatorio'),
    ).toBeInTheDocument()
  })

  // CA 2
  it('muestra el rechazo por nombre duplicado', async () => {
    createRubro.mockRejectedValue(
      errorDeApi('Ya existe un rubro con ese nombre', 409),
    )
    render(<RubrosPage />)

    await screen.findByText('Cemento')

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: '  cemento  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear rubro' }))

    expect(
      await screen.findByText('Ya existe un rubro con ese nombre'),
    ).toBeInTheDocument()
  })

  it('permite editar un rubro existente', async () => {
    updateRubro.mockResolvedValue({ ...cemento, nombre: 'Cementos' })
    render(<RubrosPage />)

    await screen.findByText('Cemento')
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0])

    expect(screen.getByLabelText('Nombre')).toHaveValue('Cemento')

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Cementos' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(updateRubro).toHaveBeenCalledWith('r1', { nombre: 'Cementos' }),
    )
  })

  // CA 4
  it('informa la cantidad de proveedores al intentar eliminar un rubro en uso', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    darDeBajaRubro.mockRejectedValue(
      errorDeApi('No se puede eliminar el rubro: 2 proveedores lo usan', 409),
    )
    render(<RubrosPage />)

    await screen.findByText('Cemento')
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0])

    expect(
      await screen.findByText(
        'No se puede eliminar el rubro: 2 proveedores lo usan',
      ),
    ).toBeInTheDocument()
  })

  // CA 5
  it('elimina un rubro sin proveedores y refresca el listado', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    darDeBajaRubro.mockResolvedValue({ ...hierros, activo: false })
    getRubros.mockResolvedValueOnce([cemento, hierros]).mockResolvedValue([
      cemento,
    ])
    render(<RubrosPage />)

    await screen.findByText('Hierros')
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1])

    await waitFor(() => expect(darDeBajaRubro).toHaveBeenCalledWith('r2'))
    await waitFor(() =>
      expect(screen.queryByText('Hierros')).not.toBeInTheDocument(),
    )
  })

  it('no elimina si el usuario cancela la confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<RubrosPage />)

    await screen.findByText('Cemento')
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0])

    expect(darDeBajaRubro).not.toHaveBeenCalled()
  })

  it('permite reactivar un rubro dado de baja', async () => {
    getRubros.mockResolvedValue([{ ...hierros, activo: false }])
    reactivarRubro.mockResolvedValue(hierros)
    render(<RubrosPage />)

    await screen.findByText('Hierros')
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }))

    await waitFor(() => expect(reactivarRubro).toHaveBeenCalledWith('r2'))
  })

  it('oculta el formulario y las acciones a quien no puede gestionar', async () => {
    puedeGestionarRubros.mockResolvedValue(false)
    render(<RubrosPage />)

    expect(await screen.findByText(/Sólo podés consultar/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Eliminar' }),
    ).not.toBeInTheDocument()
  })

  it('no afirma falta de permiso cuando la verificación falló', async () => {
    puedeGestionarRubros.mockRejectedValue(new Error('función inexistente'))
    render(<RubrosPage />)

    expect(
      await screen.findByText(/No se pudo verificar tu permiso/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Sólo podés consultar/)).not.toBeInTheDocument()
    // Las acciones quedan a la vista: decide la base, no una suposición.
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
  })

  it('muestra el estado vacío cuando no hay rubros', async () => {
    getRubros.mockResolvedValue([])
    render(<RubrosPage />)

    expect(await screen.findByText('Todavía no hay rubros')).toBeInTheDocument()
    expect(screen.getByText(/Creá el primer rubro/)).toBeInTheDocument()
  })

  it('aclara el estado vacío cuando la búsqueda no trajo resultados', async () => {
    render(<RubrosPage />)
    await screen.findByText('Cemento')

    getRubros.mockResolvedValue([])
    fireEvent.change(screen.getByLabelText('Nombre del rubro'), {
      target: { value: 'Pintura' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(
      await screen.findByText('Ningún rubro coincide con "Pintura".'),
    ).toBeInTheDocument()
  })

  it('no muestra el estado vacío cuando la carga falló', async () => {
    getRubros.mockRejectedValue(new Error('column rubros.created_by does not exist'))
    render(<RubrosPage />)

    expect(
      await screen.findByText('column rubros.created_by does not exist'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Todavía no hay rubros')).not.toBeInTheDocument()
  })

  it('incluye los rubros eliminados cuando se tilda la opción', async () => {
    render(<RubrosPage />)
    await screen.findByText('Cemento')

    fireEvent.click(screen.getByLabelText('Mostrar rubros eliminados'))

    await waitFor(() =>
      expect(getRubros).toHaveBeenLastCalledWith(
        expect.objectContaining({ soloActivos: false }),
      ),
    )
  })
})
