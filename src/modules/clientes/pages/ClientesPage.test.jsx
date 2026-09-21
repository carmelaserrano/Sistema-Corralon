import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClientesPage from './ClientesPage'
import {
  actualizarCliente,
  crearCliente,
  listarClientes,
  listarCondicionesIva,
  listarTiposCliente,
  puedeAltaClientes,
  puedeModificarClientes,
} from '../api/clientesApi'

vi.mock('../api/clientesApi', () => ({
  TIPOS_PERSONA: [
    { value: 'fisica', label: 'Física' },
    { value: 'juridica', label: 'Jurídica' },
  ],
  TIPOS_DOCUMENTO: [
    { value: 'DNI', label: 'DNI' },
    { value: 'CUIT', label: 'CUIT' },
  ],
  actualizarCliente: vi.fn(),
  crearCliente: vi.fn(),
  listarClientes: vi.fn(),
  listarCondicionesIva: vi.fn(),
  listarTiposCliente: vi.fn(),
  puedeAltaClientes: vi.fn(),
  puedeModificarClientes: vi.fn(),
}))

function errorDeApi(mensaje, status, campo) {
  const error = new Error(mensaje)
  error.status = status
  if (campo) error.campo = campo
  return error
}

const anaGomez = {
  id: 'c1',
  numero: 12,
  tipo_persona: 'fisica',
  nombre: 'Ana',
  apellido: 'Gómez',
  razon_social: null,
  tipo_documento: 'DNI',
  numero_documento: '30111222',
  condicion_iva_id: 'iva-1',
  tipo_cliente_id: 'tipo-1',
  telefono: '387-4001122',
  email: 'ana@correo.com',
  estado: 'Activo',
  origen: 'Mostrador',
}

const listaBase = {
  clientes: [anaGomez],
  total: 1,
  pagina: 1,
  pageSize: 20,
  totalPaginas: 1,
}

const condicionesIvaMock = [{ id: 'iva-1', nombre: 'Consumidor Final', activo: true }]
const tiposClienteMock = [{ id: 'tipo-1', nombre: 'Minorista', activo: true }]

async function completarFisica({
  nombre = 'Bruno',
  apellido = 'Díaz',
  dni = '30222333',
  telefono = '387-5551122',
} = {}) {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: nombre } })
  fireEvent.change(screen.getByLabelText('Apellido'), {
    target: { value: apellido },
  })
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: dni } })
  fireEvent.change(screen.getByLabelText('Condición frente al IVA'), {
    target: { value: 'iva-1' },
  })
  fireEvent.change(screen.getByLabelText('Tipo de cliente'), {
    target: { value: 'tipo-1' },
  })
  fireEvent.change(screen.getByLabelText('Teléfono'), {
    target: { value: telefono },
  })
}

describe('ClientesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    puedeAltaClientes.mockResolvedValue(true)
    puedeModificarClientes.mockResolvedValue(true)
    listarClientes.mockResolvedValue(listaBase)
    listarCondicionesIva.mockResolvedValue(condicionesIvaMock)
    listarTiposCliente.mockResolvedValue(tiposClienteMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // CA-01
  it('arranca en persona física, con nombre y apellido', async () => {
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    expect(screen.getByLabelText('Tipo de persona')).toHaveValue('fisica')
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Apellido')).toBeInTheDocument()
    expect(screen.queryByLabelText('Razón social')).not.toBeInTheDocument()
  })

  it('muestra Razón social al elegir persona jurídica', async () => {
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    fireEvent.change(screen.getByLabelText('Tipo de persona'), {
      target: { value: 'juridica' },
    })

    expect(screen.getByLabelText('Razón social')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Apellido')).not.toBeInTheDocument()
  })

  it('el documento pide DNI o CUIT según el tipo elegido', async () => {
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    expect(screen.getByLabelText('DNI')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tipo de documento'), {
      target: { value: 'CUIT' },
    })

    expect(screen.getByLabelText('CUIT')).toBeInTheDocument()
  })

  // CA-02
  it('crea un cliente y muestra el número asignado', async () => {
    crearCliente.mockResolvedValue({ ...anaGomez, numero: 13 })
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    await completarFisica()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(await screen.findByText('Cliente Nº 13 creado')).toBeInTheDocument()
    expect(crearCliente).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_persona: 'fisica',
        nombre: 'Bruno',
        apellido: 'Díaz',
        tipo_documento: 'DNI',
        numero_documento: '30222333',
        condicion_iva_id: 'iva-1',
        tipo_cliente_id: 'tipo-1',
        telefono: '387-5551122',
      }),
    )
  })

  it('recarga el listado después de crear', async () => {
    crearCliente.mockResolvedValue(anaGomez)
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    await completarFisica()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await screen.findByText(/creado/)
    expect(listarClientes).toHaveBeenCalledTimes(2)
  })

  // CA-03
  it('muestra el error de DNI en el campo del documento', async () => {
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    await completarFisica({ dni: '123' })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(
      await screen.findByText('El DNI debe tener 7 u 8 dígitos'),
    ).toBeInTheDocument()
    expect(crearCliente).not.toHaveBeenCalled()
  })

  it('muestra el error del backend en el campo que indica', async () => {
    crearCliente.mockRejectedValue(
      errorDeApi('Ya existe un cliente con ese documento', 409, 'numero_documento'),
    )
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    await completarFisica()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    const alerta = await screen.findByText('Ya existe un cliente con ese documento')
    expect(alerta.closest('div')).toContainElement(screen.getByLabelText('DNI'))
  })

  // CA-04
  it('rechaza con 409 un documento duplicado', async () => {
    crearCliente.mockRejectedValue(
      errorDeApi('Ya existe un cliente con ese documento', 409, 'numero_documento'),
    )
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    await completarFisica()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(
      await screen.findByText('Ya existe un cliente con ese documento'),
    ).toBeInTheDocument()
  })

  // CA-05
  it('sólo ofrece condiciones de IVA y tipos de cliente activos', async () => {
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    expect(listarCondicionesIva).toHaveBeenCalled()
    expect(listarTiposCliente).toHaveBeenCalled()
    expect(
      screen.getByRole('option', { name: 'Consumidor Final' }),
    ).toBeInTheDocument()
  })

  it('un error del backend por falta de condición de IVA se ve en ese campo', async () => {
    crearCliente.mockRejectedValue(
      errorDeApi(
        'La condición frente al IVA es obligatoria',
        400,
        'condicion_iva_id',
      ),
    )
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    await completarFisica()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(
      await screen.findByText('La condición frente al IVA es obligatoria'),
    ).toBeInTheDocument()
  })

  // CA-06
  it('el error de email inválido aparece junto al campo email', async () => {
    crearCliente.mockRejectedValue(
      errorDeApi('El email no tiene un formato válido', 400, 'email'),
    )
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    await completarFisica()
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'bruno@correo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(
      await screen.findByText('El email no tiene un formato válido'),
    ).toBeInTheDocument()
  })

  it('el error de teléfono obligatorio aparece junto al campo', async () => {
    // La validación la hace clientesApi; acá se confirma que el error
    // vuelve al campo correcto cuando la API lo rechaza.
    crearCliente.mockRejectedValue(
      errorDeApi('El teléfono es obligatorio', 400, 'telefono'),
    )
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Bruno' },
    })
    fireEvent.change(screen.getByLabelText('Apellido'), {
      target: { value: 'Díaz' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(
      await screen.findByText('El teléfono es obligatorio'),
    ).toBeInTheDocument()
  })

  // CA-07
  it('edita un cliente sin permitir tocar el número', async () => {
    actualizarCliente.mockResolvedValue({ ...anaGomez, telefono: '387-9998877' })
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))

    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana')
    expect(screen.queryByLabelText('Nº de cliente')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Teléfono'), {
      target: { value: '387-9998877' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(actualizarCliente).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ telefono: '387-9998877' }),
      ),
    )
    const payload = actualizarCliente.mock.calls[0][1]
    expect(payload).not.toHaveProperty('numero')
    expect(await screen.findByText('Cliente actualizado')).toBeInTheDocument()
  })

  it('no llama a la API si se guarda sin cambios', async () => {
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('No se hicieron cambios')).toBeInTheDocument()
    expect(actualizarCliente).not.toHaveBeenCalled()
  })

  it('el montaje carga una sola vez, sin duplicar por el debounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<ClientesPage />)
    await vi.waitFor(() => expect(listarClientes).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(300)

    expect(listarClientes).toHaveBeenCalledTimes(1)
  })

  // CA-08
  it('filtra en vivo sin necesidad de un botón Buscar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<ClientesPage />)
    await vi.waitFor(() => expect(listarClientes).toHaveBeenCalledTimes(1))

    expect(
      screen.queryByRole('button', { name: 'Buscar' }),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nombre, razón social, DNI o CUIT'), {
      target: { value: 'gomez' },
    })

    await vi.advanceTimersByTimeAsync(300)

    expect(listarClientes).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'gomez', pagina: 1 }),
    )
  })

  it('pagina de a 20 y permite avanzar', async () => {
    listarClientes.mockResolvedValue({
      clientes: [anaGomez],
      total: 45,
      pagina: 1,
      pageSize: 20,
      totalPaginas: 3,
    })
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() =>
      expect(listarClientes).toHaveBeenLastCalledWith(
        expect.objectContaining({ pagina: 2 }),
      ),
    )
  })

  it('deshabilita Anterior en la primera página', async () => {
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  })

  it('muestra el estado vacío cuando no hay clientes', async () => {
    listarClientes.mockResolvedValue({
      clientes: [],
      total: 0,
      pagina: 1,
      pageSize: 20,
      totalPaginas: 1,
    })
    render(<ClientesPage />)

    expect(await screen.findByText('Todavía no hay clientes')).toBeInTheDocument()
  })

  it('el indicador de estado distingue Activo, Inactivo y Bloqueado', async () => {
    listarClientes.mockResolvedValue({
      clientes: [
        { ...anaGomez, id: 'c1', estado: 'Activo' },
        { ...anaGomez, id: 'c2', estado: 'Inactivo' },
        { ...anaGomez, id: 'c3', estado: 'Bloqueado' },
      ],
      total: 3,
      pagina: 1,
      pageSize: 20,
      totalPaginas: 1,
    })
    const { container } = render(<ClientesPage />)
    await screen.findByText('Bloqueado')

    expect(container.querySelector('.estado-badge-activo')).toBeInTheDocument()
    expect(container.querySelector('.estado-badge-inactivo')).toBeInTheDocument()
    expect(container.querySelector('.estado-badge-error')).toBeInTheDocument()
  })

  it('oculta el formulario de alta a quien no tiene el permiso', async () => {
    puedeAltaClientes.mockResolvedValue(false)
    render(<ClientesPage />)

    expect(
      await screen.findByText(/no tenés permiso para dar de alta/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Tipo de persona')).not.toBeInTheDocument()
  })

  it('oculta Editar a quien no tiene permiso de modificación', async () => {
    puedeModificarClientes.mockResolvedValue(false)
    render(<ClientesPage />)
    await screen.findByText('Gómez, Ana')

    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument()
  })
})
