import { render, screen } from '@testing-library/react'
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
