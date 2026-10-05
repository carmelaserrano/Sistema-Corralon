import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ModalReciboCobranza from './ModalReciboCobranza'
import {
  listarMediosCobranza,
  registrarReciboCobranza,
} from '../api/cuentaCorrienteClienteApi'

vi.mock('../api/cuentaCorrienteClienteApi', () => ({
  listarMediosCobranza: vi.fn(),
  registrarReciboCobranza: vi.fn(),
}))

const clienteMock = {
  id: 'c1',
  numero: 10,
  tipo_persona: 'juridica',
  razon_social: 'Constructora del Norte S.A.',
}

const resumenMock = {
  saldo_deudor: 1000000,
}

const ventasPendientesMock = [
  {
    venta_id: 'v1',
    numero: 101,
    fecha: '2026-08-15',
    comprobante: 'FC-A-0001-00000101',
    total_credito: 400000,
    total_imputado: 0,
    saldo_pendiente: 400000,
  },
  {
    venta_id: 'v2',
    numero: 102,
    fecha: '2026-08-20',
    comprobante: 'FC-A-0001-00000102',
    total_credito: 600000,
    total_imputado: 0,
    saldo_pendiente: 600000,
  },
]

const mediosMock = [
  { id: 'm-efectivo', nombre: 'Efectivo', activo: true },
  { id: 'm-transferencia', nombre: 'Transferencia bancaria', activo: true },
  { id: 'm-cheque', nombre: 'Cheque al día', activo: true },
]

describe('ModalReciboCobranza', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarMediosCobranza.mockResolvedValue(mediosMock)
    registrarReciboCobranza.mockResolvedValue({
      id: 'r1',
      numero: 50,
      total: 1000000,
      total_imputado: 1000000,
      saldo_a_cuenta: 0,
    })
  })

  it('no renderiza cuando abierto es false', () => {
    const { container } = render(
      <ModalReciboCobranza
        abierto={false}
        cliente={clienteMock}
        resumenCtaCte={resumenMock}
        ventasPendientes={ventasPendientesMock}
        onReciboRegistrado={vi.fn()}
        onCerrar={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('permite registrar cobranza con auto-imputación FIFO a múltiples facturas', async () => {
    const onReciboRegistrado = vi.fn()
    const onCerrar = vi.fn()

    render(
      <ModalReciboCobranza
        abierto
        cliente={clienteMock}
        resumenCtaCte={resumenMock}
        ventasPendientes={ventasPendientesMock}
        onReciboRegistrado={onReciboRegistrado}
        onCerrar={onCerrar}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Nuevo Recibo de Cobranza' })).toBeInTheDocument()

    // El selector de medios de cobro no debe incluir Cuenta corriente
    const selectMedio = await screen.findByLabelText('Medio de cobro 1')
    fireEvent.change(selectMedio, { target: { value: 'm-transferencia' } })

    const inputMonto = screen.getByLabelText('Importe 1')
    fireEvent.change(inputMonto, { target: { value: '1000000' } })

    const inputRef = screen.getByLabelText('Referencia 1')
    fireEvent.change(inputRef, { target: { value: 'TRX-BANCARIA-999' } })

    // Presionar botón auto-imputar
    const botonFifo = screen.getByRole('button', { name: /Auto-imputar más antiguas/i })
    fireEvent.click(botonFifo)

    // Debe haber imputado 400.000 a v1 y 600.000 a v2
    expect(screen.getByDisplayValue('400000.00')).toBeInTheDocument()
    expect(screen.getByDisplayValue('600000.00')).toBeInTheDocument()

    // Confirmar recibo
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Emitir Recibo' }))

    await waitFor(() => {
      expect(registrarReciboCobranza).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: 'c1',
          medios: [
            {
              medio_pago_id: 'm-transferencia',
              monto: 1000000,
              referencia: 'TRX-BANCARIA-999',
            },
          ],
          imputaciones: [
            { venta_id: 'v1', monto_imputado: 400000 },
            { venta_id: 'v2', monto_imputado: 600000 },
          ],
        }),
      )
      expect(onReciboRegistrado).toHaveBeenCalled()
      expect(onCerrar).toHaveBeenCalled()
    })
  })

  it('permite registrar cobranza con pago a cuenta (anticipo) si no se imputa el total', async () => {
    const onReciboRegistrado = vi.fn()

    render(
      <ModalReciboCobranza
        abierto
        cliente={clienteMock}
        resumenCtaCte={resumenMock}
        ventasPendientes={ventasPendientesMock}
        onReciboRegistrado={onReciboRegistrado}
        onCerrar={vi.fn()}
      />,
    )

    const selectMedio = await screen.findByLabelText('Medio de cobro 1')
    fireEvent.change(selectMedio, { target: { value: 'm-efectivo' } })

    const inputMonto = screen.getByLabelText('Importe 1')
    fireEvent.change(inputMonto, { target: { value: '500000' } })

    // Imputar solo 200.000 a la primera factura
    const inputImputacion = screen.getAllByPlaceholderText('$ 0,00')[0]
    fireEvent.change(inputImputacion, { target: { value: '200000' } })

    // Saldo a cuenta debe mostrar 300.000
    expect(screen.getByText('Saldo a Cuenta').nextElementSibling).toHaveTextContent(/300\.000/)

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Emitir Recibo' }))

    await waitFor(() => {
      expect(registrarReciboCobranza).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: 'c1',
          medios: [{ medio_pago_id: 'm-efectivo', monto: 500000, referencia: null }],
          imputaciones: [{ venta_id: 'v1', monto_imputado: 200000 }],
        }),
      )
    })
  })

  it('bloquea envío si el importe a imputar supera el total cobrado', async () => {
    render(
      <ModalReciboCobranza
        abierto
        cliente={clienteMock}
        resumenCtaCte={resumenMock}
        ventasPendientes={ventasPendientesMock}
        onReciboRegistrado={vi.fn()}
        onCerrar={vi.fn()}
      />,
    )

    const selectMedio = await screen.findByLabelText('Medio de cobro 1')
    fireEvent.change(selectMedio, { target: { value: 'm-efectivo' } })

    const inputMonto = screen.getByLabelText('Importe 1')
    fireEvent.change(inputMonto, { target: { value: '100000' } })

    // Imputar 200.000 (superior al total cobrado de 100.000)
    const inputImputacion = screen.getAllByPlaceholderText('$ 0,00')[0]
    fireEvent.change(inputImputacion, { target: { value: '200000' } })

    // Botón de submit disabled
    expect(screen.getByRole('button', { name: 'Confirmar y Emitir Recibo' })).toBeDisabled()
    expect(registrarReciboCobranza).not.toHaveBeenCalled()
  })
})
