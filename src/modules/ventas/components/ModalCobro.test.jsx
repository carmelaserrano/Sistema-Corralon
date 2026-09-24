import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ModalCobro from './ModalCobro'
import { listarMediosPago, registrarCobro } from '../api/cobrosApi'

vi.mock('../api/cobrosApi', () => ({
  listarMediosPago: vi.fn(),
  registrarCobro: vi.fn(),
  esEfectivo: (medio) => medio?.nombre?.trim().toLowerCase() === 'efectivo',
  esTarjeta: (medio) => medio?.nombre?.trim().toLowerCase().startsWith('tarjeta'),
  esTransferencia: (medio) =>
    medio?.nombre?.trim().toLowerCase().startsWith('transferencia'),
  esCuentaCorriente: (medio) =>
    medio?.nombre?.trim().toLowerCase() === 'cuenta corriente',
}))

const medios = [
  { id: 'efectivo', nombre: 'Efectivo', activo: true },
  { id: 'transferencia', nombre: 'Transferencia bancaria', activo: true },
  { id: 'tarjeta', nombre: 'Tarjeta de crédito', activo: true },
  { id: 'cuenta', nombre: 'Cuenta corriente', activo: true },
  { id: 'otro', nombre: 'Otro', activo: true },
]

const ventaPendiente = {
  id: 'venta-1',
  numero: 101,
  estado: 'Pendiente',
  total: 1000,
  cliente: { habilita_cta_cte: false },
}

function renderModal(venta = ventaPendiente, props = {}) {
  return render(
    <ModalCobro
      abierto
      venta={venta}
      onCobrado={vi.fn()}
      onCancelar={vi.fn()}
      {...props}
    />,
  )
}

async function seleccionarMedio(numero, id) {
  const selector = await screen.findByLabelText(`Medio de pago ${numero}`)
  fireEvent.change(selector, { target: { value: id } })
}

function ingresarImporte(numero, valor) {
  fireEvent.change(screen.getByLabelText(`Importe ${numero}`), {
    target: { value: valor },
  })
}

describe('ModalCobro', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarMediosPago.mockResolvedValue(medios)
    registrarCobro.mockResolvedValue({
      venta_id: 'venta-1',
      cobro_id: 'cobro-1',
      numero: 55,
      cobrada: true,
      estado_venta: 'Pendiente',
    })
  })

  it('registra un cobro con dos medios cuya suma coincide con la venta', async () => {
    const onCobrado = vi.fn()
    renderModal({ ...ventaPendiente, total: 150000 }, { onCobrado })

    await seleccionarMedio(1, 'efectivo')
    ingresarImporte(1, '50000')
    fireEvent.change(screen.getByLabelText('Monto recibido 1'), {
      target: { value: '60000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar medio de pago' }))
    await seleccionarMedio(2, 'transferencia')
    ingresarImporte(2, '100000')
    fireEvent.change(screen.getByLabelText('Referencia 2'), {
      target: { value: 'TRX-99' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cobro' }))

    await waitFor(() =>
      expect(registrarCobro).toHaveBeenCalledWith('venta-1', [
        {
          medio_pago_id: 'efectivo',
          monto: 50000,
          monto_recibido: '60000',
          referencia: '',
        },
        {
          medio_pago_id: 'transferencia',
          monto: 100000,
          monto_recibido: '',
          referencia: 'TRX-99',
        },
      ]),
    )
    expect(onCobrado).toHaveBeenCalledWith(
      expect.objectContaining({ cobrada: true, estado_venta: 'Pendiente' }),
    )
  })

  it('calcula el vuelto sin descontarlo del total aplicado', async () => {
    renderModal({ ...ventaPendiente, total: 50000 })
    await seleccionarMedio(1, 'efectivo')
    ingresarImporte(1, '50000')
    fireEvent.change(screen.getByLabelText('Monto recibido 1'), {
      target: { value: '60000' },
    })

    expect(screen.getByText(/Vuelto:.*10[.\s]?000/)).toBeInTheDocument()
    expect(screen.getByText('Total aplicado').nextElementSibling).toHaveTextContent(
      /50[.\s]?000,00/,
    )
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeEnabled()
  })

  it('rechaza efectivo cuando lo recibido es menor al importe aplicado', async () => {
    renderModal()
    await seleccionarMedio(1, 'efectivo')
    ingresarImporte(1, '1000')
    fireEvent.change(screen.getByLabelText('Monto recibido 1'), {
      target: { value: '900' },
    })

    expect(
      screen.getByText('El monto recibido debe cubrir el importe aplicado'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled()
  })

  it('para tarjeta conserva sólo los últimos cuatro dígitos', async () => {
    renderModal()
    await seleccionarMedio(1, 'tarjeta')
    ingresarImporte(1, '1000')
    const referencia = screen.getByLabelText('Últimos 4 dígitos 1')

    fireEvent.change(referencia, { target: { value: '4111111111111234' } })

    expect(referencia).toHaveValue('1234')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cobro' }))
    await waitFor(() => expect(registrarCobro).toHaveBeenCalledOnce())
    expect(registrarCobro.mock.calls[0][1][0].referencia).toBe('1234')
  })

  it('bloquea tarjeta sin los últimos cuatro dígitos', async () => {
    renderModal()
    await seleccionarMedio(1, 'tarjeta')
    ingresarImporte(1, '1000')

    expect(
      screen.getByText('Ingrese únicamente los últimos 4 dígitos de la tarjeta'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled()
  })

  it('exige referencia para transferencia', async () => {
    renderModal()
    await seleccionarMedio(1, 'transferencia')
    ingresarImporte(1, '1000')

    expect(
      screen.getByText('La referencia de la transferencia es obligatoria'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled()
  })

  it('no ofrece cuenta corriente a un cliente no habilitado', async () => {
    renderModal()

    const opcion = await screen.findByRole('option', {
      name: 'Cuenta corriente (no habilitado)',
    })
    expect(opcion).toBeDisabled()
  })

  it('permite cuenta corriente cuando el cliente está habilitado', async () => {
    renderModal({
      ...ventaPendiente,
      cliente: { habilita_cta_cte: true },
    })
    await seleccionarMedio(1, 'cuenta')
    ingresarImporte(1, '1000')

    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeEnabled()
  })

  it('informa diferencia y no confirma si la suma no coincide', async () => {
    renderModal()
    await seleccionarMedio(1, 'otro')
    ingresarImporte(1, '900')

    expect(screen.getByText('Restante').nextElementSibling).toHaveTextContent(/100,00/)
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled()
    expect(registrarCobro).not.toHaveBeenCalled()
  })

  it('informa excedente y bloquea una suma superior al total', async () => {
    renderModal()
    await seleccionarMedio(1, 'otro')
    ingresarImporte(1, '1100')

    expect(screen.getByText('Excedente').nextElementSibling).toHaveTextContent(/100,00/)
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled()
  })

  it('bloquea una venta ya cobrada', async () => {
    renderModal({ ...ventaPendiente, cobrada: true })
    await screen.findByLabelText('Medio de pago 1')

    expect(
      screen.getByText('Esta venta ya tiene un cobro registrado.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled()
  })

  it('evita doble envío mientras el backend está procesando', async () => {
    let resolver
    registrarCobro.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve
      }),
    )
    renderModal()
    await seleccionarMedio(1, 'otro')
    ingresarImporte(1, '1000')
    const confirmar = screen.getByRole('button', { name: 'Confirmar cobro' })

    fireEvent.click(confirmar)
    fireEvent.click(confirmar)

    expect(registrarCobro).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Registrando…' })).toBeDisabled()
    resolver({
      venta_id: 'venta-1',
      cobro_id: 'c1',
      numero: 1,
      cobrada: true,
      estado_venta: 'Pendiente',
    })
    await screen.findByText('Cobro N.º 1 registrado correctamente')
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled()
  })

  it('muestra el error del backend y permite reintentar', async () => {
    registrarCobro.mockRejectedValueOnce(new Error('La venta ya tiene un cobro'))
    renderModal()
    await seleccionarMedio(1, 'otro')
    ingresarImporte(1, '1000')

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cobro' }))

    expect(await screen.findByText('La venta ya tiene un cobro')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeEnabled()
  })
})
