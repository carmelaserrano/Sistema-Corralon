import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MovimientosPage from './MovimientosPage'
import {
  getMovimientos,
  puedeAjustarInventario,
} from '../api/movimientosApi'
import { getDepositos } from '../api/depositosApi'
import { getArticulos } from '../api/articulosApi'

vi.mock('../api/movimientosApi', () => ({
  TIPOS: {
    INGRESO: 'ingreso',
    EGRESO: 'egreso',
    TRANSFERENCIA: 'transferencia',
    AJUSTE: 'ajuste',
  },
  cancelarMovimiento: vi.fn(),
  confirmarMovimiento: vi.fn(),
  createMovimiento: vi.fn(),
  getMovimientos: vi.fn(),
  puedeAjustarInventario: vi.fn(),
}))

vi.mock('../api/depositosApi', () => ({
  getDepositos: vi.fn(),
}))

vi.mock('../api/articulosApi', () => ({
  getArticulos: vi.fn(),
}))

const ajustePendiente = {
  id: 'ajuste-1',
  fecha: '2026-08-27T20:00:00.000Z',
  tipo: { codigo: 'ajuste', nombre: 'Ajuste' },
  detalle: [
    {
      cantidad: 3,
      producto: { sku: 'CEM-1', nombre: 'Cemento' },
    },
  ],
  origen: { nombre: 'Depósito Central' },
  destino: null,
}

describe('MovimientosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDepositos.mockResolvedValue([])
    getArticulos.mockResolvedValue({ articulos: [] })
    getMovimientos.mockResolvedValue({ movimientos: [ajustePendiente] })
  })

  it('oculta las acciones de un ajuste a usuarios sin permiso', async () => {
    puedeAjustarInventario.mockResolvedValue(false)

    render(<MovimientosPage onVerHistorial={vi.fn()} />)

    await screen.findByText('Sin permiso para procesar el ajuste')
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  })

  it('habilita confirmar y cancelar ajustes a usuarios autorizados', async () => {
    puedeAjustarInventario.mockResolvedValue(true)

    render(<MovimientosPage onVerHistorial={vi.fn()} />)

    expect(await screen.findByRole('button', { name: 'Confirmar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy()
  })
})

describe('formulario con habilitación progresiva', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    puedeAjustarInventario.mockResolvedValue(false)
    getDepositos.mockResolvedValue([
      { id: 'dep-1', nombre: 'Depósito Central' },
    ])
    getArticulos.mockResolvedValue({ articulos: [] })
    getMovimientos.mockResolvedValue({ movimientos: [] })
  })

  it('deshabilita Tipo hasta que se selecciona el depósito', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)

    const selectTipo = await screen.findByLabelText('Tipo')
    expect(selectTipo).toBeDisabled()
  })

  it('habilita Tipo al seleccionar un depósito', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)

    const selectDeposito = await screen.findByLabelText('Depósito')
    fireEvent.change(selectDeposito, { target: { value: 'dep-1' } })

    expect(screen.getByLabelText('Tipo')).not.toBeDisabled()
  })

  it('deshabilita el Artículo al cargar el formulario', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)

    const selectArticulo = await screen.findByLabelText('Artículo')
    expect(selectArticulo).toBeDisabled()
  })

  it('mantiene el Artículo deshabilitado si solo se eligió depósito y tipo', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)

    const selectDeposito = await screen.findByLabelText('Depósito')
    fireEvent.change(selectDeposito, { target: { value: 'dep-1' } })

    const selectTipo = screen.getByLabelText('Tipo')
    fireEvent.change(selectTipo, { target: { value: 'egreso' } })

    expect(screen.getByLabelText('Artículo')).toBeDisabled()
  })

  it('habilita el Artículo al completar depósito, tipo y comprobante', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)

    const selectDeposito = await screen.findByLabelText('Depósito')
    fireEvent.change(selectDeposito, { target: { value: 'dep-1' } })

    const selectTipo = screen.getByLabelText('Tipo')
    fireEvent.change(selectTipo, { target: { value: 'egreso' } })

    const inputComprobante = screen.getByLabelText('Comprobante')
    fireEvent.change(inputComprobante, { target: { value: 'REM-001' } })

    expect(screen.getByLabelText('Artículo')).not.toBeDisabled()
  })

  it('preserva el depósito al cambiar de tipo', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)

    // Seleccionar depósito con tipo vacío (usa deposito_origen_id internamente)
    const selectDeposito = await screen.findByLabelText('Depósito')
    fireEvent.change(selectDeposito, { target: { value: 'dep-1' } })

    // Cambiar a Ingreso (el depósito se reasigna a deposito_destino_id)
    const selectTipo = screen.getByLabelText('Tipo')
    fireEvent.change(selectTipo, { target: { value: 'ingreso' } })

    // El tipo debe habilitarse y el Comprobante también (tipo ya elegido)
    expect(selectTipo).not.toBeDisabled()
    expect(screen.getByLabelText('Comprobante')).not.toBeDisabled()
  })
})
