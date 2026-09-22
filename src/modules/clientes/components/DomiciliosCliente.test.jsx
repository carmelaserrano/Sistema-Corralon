import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DomiciliosCliente from './DomiciliosCliente'
import {
  actualizarDomicilio,
  crearDomicilio,
  darDeBaja,
  listarDomicilios,
  marcarPrincipal,
} from '../api/domiciliosApi'

vi.mock('../api/domiciliosApi', () => ({
  actualizarDomicilio: vi.fn(),
  crearDomicilio: vi.fn(),
  darDeBaja: vi.fn(),
  listarDomicilios: vi.fn(),
  marcarPrincipal: vi.fn(),
}))

const obra = {
  id: 'd1',
  cliente_id: 'c1',
  alias: 'Obra Tres Cerritos',
  calle: 'Av. Tavella',
  numero: '1200',
  localidad: 'Salta',
  provincia: 'Salta',
  codigo_postal: null,
  referencias: null,
  es_principal: true,
  activo: true,
}

const oficina = {
  id: 'd2',
  cliente_id: 'c1',
  alias: 'Oficina Centro',
  calle: 'Caseros',
  numero: '850',
  localidad: 'Salta',
  provincia: 'Salta',
  codigo_postal: '4400',
  referencias: 'Timbre 3B',
  es_principal: false,
  activo: true,
}

async function completarFormulario({
  alias = 'Depósito Norte',
  calle = 'Av. Bolivia',
  numero = '2500',
  localidad = 'Salta',
  provincia = 'Salta',
} = {}) {
  fireEvent.change(screen.getByLabelText('Alias'), { target: { value: alias } })
  fireEvent.change(screen.getByLabelText('Calle'), { target: { value: calle } })
  fireEvent.change(screen.getByLabelText('Número'), {
    target: { value: numero },
  })
  fireEvent.change(screen.getByLabelText('Localidad'), {
    target: { value: localidad },
  })
  fireEvent.change(screen.getByLabelText('Provincia'), {
    target: { value: provincia },
  })
}

describe('DomiciliosCliente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarDomicilios.mockResolvedValue([obra, oficina])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // CA-01
  it('lista los domicilios con alias, dirección completa y marca de principal', async () => {
    const { container } = render(<DomiciliosCliente clienteId="c1" />)

    const filaObra = (await screen.findByText('Obra Tres Cerritos')).closest('tr')
    expect(filaObra).toHaveTextContent('Av. Tavella 1200, Salta, Salta')
    expect(
      filaObra.querySelector('.estado-badge-principal'),
    ).toHaveTextContent('Principal')

    const filaOficina = screen.getByText('Oficina Centro').closest('tr')
    expect(filaOficina).toHaveTextContent('CP 4400')
    expect(container.querySelectorAll('.estado-badge-principal')).toHaveLength(1)
  })

  it('pide los domicilios del cliente que recibe', async () => {
    render(<DomiciliosCliente clienteId="c9" />)

    await waitFor(() => expect(listarDomicilios).toHaveBeenCalledWith('c9'))
  })

  it('muestra el estado vacío con la acción de agregar el primero', async () => {
    listarDomicilios.mockResolvedValue([])
    render(<DomiciliosCliente clienteId="c1" />)

    expect(
      await screen.findByText('Este cliente no tiene domicilios cargados'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Agregar el primer domicilio' }),
    ).toBeInTheDocument()
  })

  it('muestra el error cuando falla la carga', async () => {
    listarDomicilios.mockRejectedValue(new Error('sin conexión'))
    render(<DomiciliosCliente clienteId="c1" />)

    expect(await screen.findByText('sin conexión')).toBeInTheDocument()
    expect(
      screen.queryByText('Este cliente no tiene domicilios cargados'),
    ).not.toBeInTheDocument()
  })

  // CA-02
  it('agrega un domicilio con todos los campos obligatorios', async () => {
    crearDomicilio.mockResolvedValue({ ...oficina, id: 'd3', alias: 'Depósito Norte' })
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Obra Tres Cerritos')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar domicilio' }))
    await completarFormulario()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Agregar domicilio' })[0],
    )

    await waitFor(() =>
      expect(crearDomicilio).toHaveBeenCalledWith('c1', {
        alias: 'Depósito Norte',
        calle: 'Av. Bolivia',
        numero: '2500',
        localidad: 'Salta',
        provincia: 'Salta',
        codigo_postal: '',
        referencias: '',
      }),
    )
    expect(await screen.findByText(/agregado/)).toBeInTheDocument()
  })

  it('muestra el error de un campo obligatorio faltante', async () => {
    crearDomicilio.mockRejectedValue(
      Object.assign(new Error('La calle es obligatoria'), {
        status: 400,
        campo: 'calle',
      }),
    )
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Obra Tres Cerritos')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar domicilio' }))
    await completarFormulario({ calle: 'x' })
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Agregar domicilio' })[0],
    )

    expect(
      await screen.findByText('La calle es obligatoria'),
    ).toBeInTheDocument()
  })

  // CA-04
  it('avisa cuando el domicilio creado queda como principal automáticamente', async () => {
    listarDomicilios.mockResolvedValue([])
    crearDomicilio.mockResolvedValue({ ...obra, es_principal: true })
    render(<DomiciliosCliente clienteId="c1" />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Agregar el primer domicilio' }),
    )
    await completarFormulario()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Agregar domicilio' })[0],
    )

    expect(
      await screen.findByText(/agregado como principal/),
    ).toBeInTheDocument()
  })

  // CA-03
  it('marca un domicilio como principal', async () => {
    marcarPrincipal.mockResolvedValue({ ...oficina, es_principal: true })
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Oficina Centro')

    fireEvent.click(
      screen.getByRole('button', { name: 'Marcar como principal' }),
    )

    await waitFor(() => expect(marcarPrincipal).toHaveBeenCalledWith('d2'))
    expect(
      await screen.findByText(/ahora es el domicilio principal/),
    ).toBeInTheDocument()
  })

  it('no ofrece "Marcar como principal" sobre el que ya lo es', async () => {
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Obra Tres Cerritos')

    expect(
      screen.getAllByRole('button', { name: 'Marcar como principal' }),
    ).toHaveLength(1)
  })

  it('permite editar un domicilio precargando sus datos', async () => {
    actualizarDomicilio.mockResolvedValue(oficina)
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Oficina Centro')

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[1])

    expect(screen.getByLabelText('Alias')).toHaveValue('Oficina Centro')
    expect(screen.getByLabelText('Código postal')).toHaveValue('4400')

    fireEvent.change(screen.getByLabelText('Referencias'), {
      target: { value: 'Portón verde' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(actualizarDomicilio).toHaveBeenCalledWith(
        'd2',
        expect.objectContaining({ referencias: 'Portón verde' }),
      ),
    )
  })

  // CA-05
  it('elimina directamente un domicilio que no es principal', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    darDeBaja.mockResolvedValue(undefined)
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Oficina Centro')

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1])

    await waitFor(() => expect(darDeBaja).toHaveBeenCalledWith('d2'))
    expect(await screen.findByText('Domicilio eliminado')).toBeInTheDocument()
  })

  it('no elimina si se cancela la confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Oficina Centro')

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1])

    expect(darDeBaja).not.toHaveBeenCalled()
  })

  it('elimina el único domicilio sin pedir reemplazo aunque sea principal', async () => {
    listarDomicilios.mockResolvedValue([obra])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    darDeBaja.mockResolvedValue(undefined)
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Obra Tres Cerritos')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(darDeBaja).toHaveBeenCalledWith('d1'))
    expect(marcarPrincipal).not.toHaveBeenCalled()
  })

  it('pide elegir un reemplazo antes de eliminar el principal si quedan otros', async () => {
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Obra Tres Cerritos')

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0])

    expect(
      await screen.findByText(/es el domicilio principal/),
    ).toBeInTheDocument()
    expect(darDeBaja).not.toHaveBeenCalled()
  })

  it('marca el reemplazo principal antes de dar de baja al anterior', async () => {
    marcarPrincipal.mockResolvedValue({ ...oficina, es_principal: true })
    darDeBaja.mockResolvedValue(undefined)
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Obra Tres Cerritos')

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0])
    await screen.findByText(/es el domicilio principal/)

    fireEvent.change(screen.getByLabelText('Nuevo domicilio principal'), {
      target: { value: 'd2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y eliminar' }))

    await waitFor(() => {
      expect(marcarPrincipal).toHaveBeenCalledWith('d2')
      expect(darDeBaja).toHaveBeenCalledWith('d1')
    })

    const ordenMarcar = marcarPrincipal.mock.invocationCallOrder[0]
    const ordenBaja = darDeBaja.mock.invocationCallOrder[0]
    expect(ordenMarcar).toBeLessThan(ordenBaja)
  })

  it('exige elegir un reemplazo antes de confirmar', async () => {
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Obra Tres Cerritos')

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0])
    await screen.findByText(/es el domicilio principal/)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y eliminar' }))

    expect(
      await screen.findByText('Elegí qué domicilio va a ser el nuevo principal'),
    ).toBeInTheDocument()
    expect(darDeBaja).not.toHaveBeenCalled()
  })

  it('cancela la elección de reemplazo sin llamar a la API', async () => {
    render(<DomiciliosCliente clienteId="c1" />)
    await screen.findByText('Obra Tres Cerritos')

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0])
    await screen.findByText(/es el domicilio principal/)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(
      screen.queryByText(/es el domicilio principal/),
    ).not.toBeInTheDocument()
    expect(darDeBaja).not.toHaveBeenCalled()
    expect(marcarPrincipal).not.toHaveBeenCalled()
  })
})
