import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MovimientosPage from './MovimientosPage'
import { puedeAjustarInventario } from '../api/movimientosApi'
import { getDepositos } from '../api/depositosApi'
import { getArticulos } from '../api/articulosApi'

vi.mock('../api/movimientosApi', () => ({
  TIPOS: {
    INGRESO: 'ingreso',
    EGRESO: 'egreso',
    TRANSFERENCIA: 'transferencia',
    AJUSTE: 'ajuste',
  },
  createMovimiento: vi.fn(),
  puedeAjustarInventario: vi.fn(),
}))

vi.mock('../api/depositosApi', () => ({
  getDepositos: vi.fn(),
}))

vi.mock('../api/articulosApi', () => ({
  getArticulos: vi.fn(),
}))

describe('MovimientosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDepositos.mockResolvedValue([])
    getArticulos.mockResolvedValue({ articulos: [] })
  })

  it('no muestra el panel de movimientos pendientes', async () => {
    puedeAjustarInventario.mockResolvedValue(false)

    render(<MovimientosPage onVerHistorial={vi.fn()} />)

    await screen.findByRole('heading', { name: 'Nuevo movimiento' })
    expect(screen.queryByText(/movimientos pendientes/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull()
  })

  it('mantiene disponible el ajuste para usuarios autorizados', async () => {
    puedeAjustarInventario.mockResolvedValue(true)

    render(<MovimientosPage onVerHistorial={vi.fn()} />)

    expect(await screen.findByRole('option', { name: 'Ajuste de inventario' })).toBeTruthy()
  })
})
