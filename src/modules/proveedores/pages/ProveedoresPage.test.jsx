import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProveedoresPage from './ProveedoresPage'
import {
  createProveedor,
  getProveedores,
  puedeAltaProveedores,
} from '../api/proveedoresApi'
import { getRubros } from '../api/rubrosApi'

vi.mock('../api/proveedoresApi', () => ({
  CONDICIONES_FISCALES: [
    { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
    { value: 'monotributista', label: 'Monotributista' },
    { value: 'exento', label: 'Exento' },
    { value: 'consumidor_final', label: 'Consumidor Final' },
  ],
  CONDICIONES_PAGO: [
    { value: 'contado', label: 'Contado' },
    { value: '15_dias', label: '15 días' },
    { value: '30_dias', label: '30 días' },
    { value: '60_dias', label: '60 días' },
    { value: '30_60_dias', label: '30/60 días' },
    { value: 'anticipado', label: 'Anticipado' },
  ],
  createProveedor: vi.fn(),
  getProveedores: vi.fn(),
  puedeAltaProveedores: vi.fn(),
}))

vi.mock('../api/rubrosApi', () => ({
  getRubros: vi.fn(),
}))

function errorDeApi(mensaje, status) {
  const error = new Error(mensaje)
  error.status = status
  return error
}

const corralon = {
  id: 'p1',
  razon_social: 'Corralón San Martín S.A.',
  cuit: '20123456786',
  condicion_fiscal: 'responsable_inscripto',
  condicion_pago_habitual: '30_dias',
  localidad: 'Salta',
  estado: 'activo',
  rubro: { id: 'r1', nombre: 'Cemento' },
}

async function completarCamposObligatorios(razonSocial = 'Ferretería del Sur') {
  fireEvent.change(screen.getByLabelText('Razón Social'), {
    target: { value: razonSocial },
  })
  fireEvent.change(screen.getByLabelText('CUIT'), {
    target: { value: '20123456786' },
  })
  fireEvent.change(screen.getByLabelText('Condición Fiscal'), {
    target: { value: 'responsable_inscripto' },
  })
}

describe('ProveedoresPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    puedeAltaProveedores.mockResolvedValue(true)
    getProveedores.mockResolvedValue([corralon])
    getRubros.mockResolvedValue([{ id: 'r1', nombre: 'Cemento' }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // CA: el formulario muestra los campos del padrón
  it('muestra todos los campos del alta', async () => {
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    for (const campo of [
      'Razón Social',
      'Nombre de Fantasía',
      'CUIT',
      'Condición Fiscal',
      'Rubro',
      'Domicilio',
      'Localidad',
      'Provincia',
      'Teléfono',
      'Email',
      'Observaciones',
    ]) {
      expect(screen.getByLabelText(campo)).toBeInTheDocument()
    }
  })

  it('ofrece la condición de pago como desplegable opcional', async () => {
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    const select = screen.getByLabelText('Condición de Pago Habitual')
    expect(select).toHaveValue('')
    expect(
      screen.getByRole('option', { name: '30/60 días' }),
    ).toBeInTheDocument()

    fireEvent.change(select, { target: { value: '30_dias' } })
    expect(select).toHaveValue('30_dias')
  })

  it('lista los proveedores existentes con su rubro y condición de pago', async () => {
    render(<ProveedoresPage />)

    const fila = (await screen.findByText('Corralón San Martín S.A.')).closest(
      'tr',
    )
    expect(fila).toHaveTextContent('Cemento')
    expect(fila).toHaveTextContent('Responsable Inscripto')
    expect(fila).toHaveTextContent('30 días')
  })

  it('muestra un guion cuando el proveedor no tiene condición de pago', async () => {
    getProveedores.mockResolvedValue([
      { ...corralon, condicion_pago_habitual: null },
    ])
    render(<ProveedoresPage />)

    const fila = (await screen.findByText('Corralón San Martín S.A.')).closest(
      'tr',
    )
    expect(fila).toHaveTextContent('—')
  })

  // CA: Razón Social obligatoria
  it('muestra el mensaje cuando la razón social es obligatoria', async () => {
    createProveedor.mockRejectedValue(
      errorDeApi('La Razón Social es obligatoria', 400),
    )
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.click(screen.getByRole('button', { name: 'Crear proveedor' }))

    expect(
      await screen.findByText('La Razón Social es obligatoria'),
    ).toBeInTheDocument()
  })

  // CA: formato y dígito verificador de CUIT al perder el foco
  it('valida el CUIT al perder el foco', async () => {
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    const cuit = screen.getByLabelText('CUIT')
    fireEvent.change(cuit, { target: { value: '20-12345678-0' } })
    fireEvent.blur(cuit)

    expect(await screen.findByText('CUIT inválido')).toBeInTheDocument()
    expect(createProveedor).not.toHaveBeenCalled()
  })

  it('no marca error de CUIT mientras el campo está vacío', async () => {
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.blur(screen.getByLabelText('CUIT'))

    expect(screen.queryByText('CUIT inválido')).not.toBeInTheDocument()
  })

  // CA: alta válida, confirmación y listado actualizado sin recargar
  it('crea el proveedor, muestra la confirmación y refresca el listado', async () => {
    createProveedor.mockResolvedValue({
      ...corralon,
      id: 'p2',
      razon_social: 'Ferretería del Sur',
    })
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    await completarCamposObligatorios('Ferretería del Sur')
    fireEvent.change(screen.getByLabelText('Rubro'), {
      target: { value: 'r1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear proveedor' }))

    expect(
      await screen.findByText('Proveedor "Ferretería del Sur" creado'),
    ).toBeInTheDocument()
    expect(createProveedor).toHaveBeenCalledWith(
      expect.objectContaining({ razon_social: 'Ferretería del Sur' }),
      'r1',
    )
    expect(getProveedores).toHaveBeenCalledTimes(2)
  })

  // CA: CUIT ya registrado, con la razón social del proveedor existente
  it('muestra el rechazo por CUIT duplicado con la razón social existente', async () => {
    createProveedor.mockRejectedValue(
      errorDeApi(
        'Ya existe un proveedor con ese CUIT: Corralón San Martín S.A.',
        409,
      ),
    )
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    await completarCamposObligatorios()
    fireEvent.click(screen.getByRole('button', { name: 'Crear proveedor' }))

    expect(
      await screen.findByText(
        'Ya existe un proveedor con ese CUIT: Corralón San Martín S.A.',
      ),
    ).toBeInTheDocument()
  })

  it('oculta el formulario a quien no tiene el permiso de alta', async () => {
    puedeAltaProveedores.mockResolvedValue(false)
    render(<ProveedoresPage />)

    expect(await screen.findByText(/Sólo podés consultar/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Razón Social')).not.toBeInTheDocument()
  })

  it('muestra el estado vacío cuando no hay proveedores', async () => {
    getProveedores.mockResolvedValue([])
    render(<ProveedoresPage />)

    expect(
      await screen.findByText('Todavía no hay proveedores'),
    ).toBeInTheDocument()
  })
})
