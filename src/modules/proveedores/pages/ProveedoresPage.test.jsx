import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProveedoresPage from './ProveedoresPage'
import {
  createProveedor,
  getHistorialEstadoProveedor,
  getProveedores,
  puedeAltaProveedores,
  puedeCambiarEstadoProveedores,
  puedeModificarProveedores,
  setEstadoProveedor,
  updateProveedor,
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
  ESTADOS: ['activo', 'inactivo'],
  createProveedor: vi.fn(),
  getHistorialEstadoProveedor: vi.fn(),
  getProveedores: vi.fn(),
  puedeAltaProveedores: vi.fn(),
  puedeCambiarEstadoProveedores: vi.fn(),
  puedeModificarProveedores: vi.fn(),
  setEstadoProveedor: vi.fn(),
  updateProveedor: vi.fn(),
}))

vi.mock('../api/rubrosApi', () => ({
  getRubros: vi.fn(),
}))

vi.mock('../api/contactosApi', () => ({
  createContacto: vi.fn(),
  deleteContacto: vi.fn(),
  getContactosDeProveedor: vi.fn(() => Promise.resolve([])),
  updateContacto: vi.fn(),
}))

function errorDeApi(mensaje, status) {
  const error = new Error(mensaje)
  error.status = status
  return error
}

const corralon = {
  id: 'p1',
  razon_social: 'Corralón San Martín S.A.',
  nombre_fantasia: 'El Corralón',
  cuit: '20123456786',
  condicion_fiscal: 'responsable_inscripto',
  condicion_pago_habitual: '30_dias',
  domicilio: 'Av. Siempre Viva 123',
  localidad: 'Salta',
  provincia: 'Salta',
  telefono: '387-4000000',
  email: 'contacto@corralon.com',
  observaciones: 'Cliente frecuente',
  estado: 'activo',
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-02T15:30:00Z',
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
    puedeModificarProveedores.mockResolvedValue(true)
    puedeCambiarEstadoProveedores.mockResolvedValue(true)
    getProveedores.mockResolvedValue([corralon])
    getHistorialEstadoProveedor.mockResolvedValue([])
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

    expect(
      await screen.findByText(/no tenés permiso para dar de alta/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Razón Social')).not.toBeInTheDocument()
  })

  it('muestra el estado vacío cuando no hay proveedores', async () => {
    getProveedores.mockResolvedValue([])
    render(<ProveedoresPage />)

    expect(
      await screen.findByText('Todavía no hay proveedores'),
    ).toBeInTheDocument()
  })

  // CA: modificar todos los campos menos el CUIT
  it('carga el proveedor en el formulario al editar, con el CUIT deshabilitado', async () => {
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))

    expect(screen.getByLabelText('Razón Social')).toHaveValue(
      'Corralón San Martín S.A.',
    )
    expect(screen.getByLabelText('Localidad')).toHaveValue('Salta')
    expect(screen.getByLabelText('Rubro')).toHaveValue('r1')
    expect(screen.getByLabelText('Condición de Pago Habitual')).toHaveValue(
      '30_dias',
    )
    expect(screen.getByLabelText('CUIT')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
  })

  it('actualiza el proveedor y refresca el listado sin recargar', async () => {
    updateProveedor.mockResolvedValue({
      ...corralon,
      localidad: 'Jujuy',
    })
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Localidad'), {
      target: { value: 'Jujuy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('Proveedor "Corralón San Martín S.A." actualizado'),
    ).toBeInTheDocument()
    expect(updateProveedor).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ localidad: 'Jujuy' }),
      'r1',
    )
    expect(getProveedores).toHaveBeenCalledTimes(2)
  })

  it('no manda el CUIT en el UPDATE al editar', async () => {
    updateProveedor.mockResolvedValue(corralon)
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Localidad'), {
      target: { value: 'Jujuy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await screen.findByText(/actualizado/)
    const [, datosEnviados] = updateProveedor.mock.calls[0]
    expect(datosEnviados.cuit).not.toBe('20123456786')
  })

  it('cancela la edición y vuelve al formulario de alta', async () => {
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByLabelText('Razón Social')).toHaveValue(
      'Corralón San Martín S.A.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByLabelText('Razón Social')).toHaveValue('')
    expect(
      screen.getByRole('button', { name: 'Crear proveedor' }),
    ).toBeInTheDocument()
  })

  it('oculta el botón Editar a quien no tiene el permiso de modificación', async () => {
    puedeModificarProveedores.mockResolvedValue(false)
    render(<ProveedoresPage />)

    expect(
      await screen.findByText(/no tenés permiso para editar y gestionar contactos/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument()
  })

  it('muestra todos los campos del proveedor al ver el detalle', async () => {
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))

    const detalle = (await screen.findByText('Detalle del proveedor'))
      .closest('section')

    for (const valor of [
      'El Corralón',
      'Av. Siempre Viva 123',
      'Salta',
      '387-4000000',
      'contacto@corralon.com',
      'Cliente frecuente',
      'Cemento',
      '30 días',
    ]) {
      expect(detalle).toHaveTextContent(valor)
    }
  })

  it('cierra el detalle del proveedor', async () => {
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
    await screen.findByText('Detalle del proveedor')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(screen.queryByText('Detalle del proveedor')).not.toBeInTheDocument()
  })

  it('no exige el permiso de modificación para ver el detalle', async () => {
    puedeModificarProveedores.mockResolvedValue(false)
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))

    expect(await screen.findByText('Detalle del proveedor')).toBeInTheDocument()
  })

  it('avisa que no hubo cambios en vez de llamar a la API si se guarda sin editar nada', async () => {
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('No se hicieron cambios en "Corralón San Martín S.A."'),
    ).toBeInTheDocument()
    expect(updateProveedor).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Crear proveedor' }),
    ).toBeInTheDocument()
  })

  it('sí llama a la API si se cambia solo el rubro sin tocar otro campo', async () => {
    updateProveedor.mockResolvedValue(corralon)
    render(<ProveedoresPage />)
    await screen.findByText('Corralón San Martín S.A.')

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Rubro'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await screen.findByText(/actualizado/)
    expect(updateProveedor).toHaveBeenCalledWith(
      'p1',
      expect.anything(),
      null,
    )
  })

  // --------------------------------------------------------------------
  // US-PRV-06 · Administración del estado del proveedor
  // --------------------------------------------------------------------

  describe('estado del proveedor', () => {
    const inactivo = { ...corralon, id: 'p2', razon_social: 'Hierros SRL', estado: 'inactivo' }

    // CA 1
    it('desactiva un proveedor activo tras confirmar', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      setEstadoProveedor.mockResolvedValue({ ...corralon, estado: 'inactivo' })
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))

      await screen.findByText(/quedó inactivo/)
      expect(setEstadoProveedor).toHaveBeenCalledWith('p1', 'inactivo')
    })

    // CA 2
    it('activa un proveedor inactivo', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      getProveedores.mockResolvedValue([inactivo])
      setEstadoProveedor.mockResolvedValue({ ...inactivo, estado: 'activo' })
      render(<ProveedoresPage />)
      await screen.findByText('Hierros SRL')

      fireEvent.click(screen.getByRole('button', { name: 'Activar' }))

      await screen.findByText(/quedó activo/)
      expect(setEstadoProveedor).toHaveBeenCalledWith('p2', 'activo')
    })

    it('no cambia el estado si se cancela la confirmación', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))

      expect(setEstadoProveedor).not.toHaveBeenCalled()
    })

    // CA 3
    it('muestra el estado con un indicador visual diferenciado', async () => {
      getProveedores.mockResolvedValue([corralon, inactivo])
      const { container } = render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      expect(container.querySelector('.estado-badge-activo')).toHaveTextContent(
        'Activo',
      )
      expect(
        container.querySelector('.estado-badge-inactivo'),
      ).toHaveTextContent('Inactivo')
    })

    // CA 4
    it('muestra el historial con estado anterior, fecha y usuario', async () => {
      getHistorialEstadoProveedor.mockResolvedValue([
        {
          id: 'h1',
          estado_anterior: 'activo',
          estado_nuevo: 'inactivo',
          cambiado_por: 'usuario-1',
          cambiado_en: '2026-09-03T12:00:00Z',
        },
      ])
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(
        await screen.findByRole('tab', { name: 'Historial de estado' }),
      )

      await screen.findByText('Historial de cambios de estado')
      expect(getHistorialEstadoProveedor).toHaveBeenCalledWith('p1')
      expect(screen.getByText('usuario-1')).toBeInTheDocument()
    })

    it('avisa cuando el proveedor no registra cambios de estado', async () => {
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(
        await screen.findByRole('tab', { name: 'Historial de estado' }),
      )

      expect(
        await screen.findByText('Este proveedor no registra cambios de estado.'),
      ).toBeInTheDocument()
    })

    // CA 6
    it('no ofrece ninguna acción de borrado físico', async () => {
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      expect(
        screen.queryByRole('button', { name: /eliminar|borrar/i }),
      ).not.toBeInTheDocument()
    })

    it('permite filtrar por estado para poder recuperar un inactivo', async () => {
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      fireEvent.change(screen.getByLabelText('Estado'), {
        target: { value: 'inactivo' },
      })

      await waitFor(() =>
        expect(getProveedores).toHaveBeenLastCalledWith(
          expect.objectContaining({ estado: 'inactivo' }),
        ),
      )
    })

    it('oculta la acción a quien no tiene el permiso de estado', async () => {
      puedeCambiarEstadoProveedores.mockResolvedValue(false)
      render(<ProveedoresPage />)

      expect(
        await screen.findByText(/no tenés permiso para activar o desactivar/),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Desactivar' }),
      ).not.toBeInTheDocument()
    })

    it('no afirma falta de permiso cuando la verificación falló', async () => {
      puedeCambiarEstadoProveedores.mockRejectedValue(new Error('rpc caída'))
      render(<ProveedoresPage />)

      expect(
        await screen.findByText(/No se pudo verificar tu permiso sobre el estado/),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Desactivar' }),
      ).toBeInTheDocument()
    })

    it('muestra el error cuando la RLS descarta el cambio', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      setEstadoProveedor.mockRejectedValue(
        errorDeApi('No se pudo guardar el proveedor: no existe o no tenés permiso para modificarlo', 403),
      )
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))

      expect(await screen.findByText(/no tenés permiso/)).toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------
  // US-PRV-05 · Solapas del detalle
  // --------------------------------------------------------------------

  describe('solapas del detalle', () => {
    it('abre el detalle en la solapa de datos', async () => {
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))

      expect(await screen.findByRole('tab', { name: 'Datos' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(screen.getByText('Av. Siempre Viva 123')).toBeInTheDocument()
    })

    // CA 1
    it('muestra la solapa Contactos al seleccionarla', async () => {
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(await screen.findByRole('tab', { name: 'Contactos' }))

      expect(screen.getByRole('tab', { name: 'Contactos' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(
        await screen.findByText('Este proveedor no tiene contactos'),
      ).toBeInTheDocument()
    })

    it('vuelve a la solapa de datos al abrir otro proveedor', async () => {
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(await screen.findByRole('tab', { name: 'Contactos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
      fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))

      expect(await screen.findByRole('tab', { name: 'Datos' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
    it('resume los permisos faltantes en un solo aviso', async () => {
      puedeAltaProveedores.mockResolvedValue(false)
      puedeModificarProveedores.mockResolvedValue(false)
      puedeCambiarEstadoProveedores.mockResolvedValue(false)
      render(<ProveedoresPage />)

      const aviso = await screen.findByText(/Sólo podés consultar el padrón/)
      expect(aviso).toHaveTextContent(
        'dar de alta, editar y gestionar contactos y activar o desactivar',
      )
      // Un solo cartel, no uno por permiso.
      expect(screen.getAllByText(/Sólo podés consultar el padrón/)).toHaveLength(1)
    })

    it('no repite el aviso de permiso dentro de la solapa Contactos', async () => {
      puedeModificarProveedores.mockResolvedValue(false)
      render(<ProveedoresPage />)
      await screen.findByText('Corralón San Martín S.A.')

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(await screen.findByRole('tab', { name: 'Contactos' }))

      expect(
        screen.queryByText(/Sólo podés consultar los contactos/),
      ).not.toBeInTheDocument()
    })
  })
})
