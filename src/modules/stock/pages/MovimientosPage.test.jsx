import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MovimientosPage from './MovimientosPage'
import { createMovimientoMultiarticulo } from '../api/movimientosApi'
import { getDepositos } from '../api/depositosApi'
import { getArticulos } from '../api/articulosApi'
import { getStockByDeposito } from '../api/stockApi'

vi.mock('../api/movimientosApi', () => ({
  TIPOS: { INGRESO: 'ingreso', EGRESO: 'egreso', TRANSFERENCIA: 'transferencia' },
  createMovimientoMultiarticulo: vi.fn(),
}))
vi.mock('../api/depositosApi', () => ({ getDepositos: vi.fn() }))
vi.mock('../api/articulosApi', () => ({ getArticulos: vi.fn() }))
vi.mock('../api/stockApi', () => ({ getStockByDeposito: vi.fn() }))

const articulos = [
  { id: 'art-1', sku: 'CEM', nombre: 'Cemento Portland' },
  { id: 'art-2', sku: 'ARE', nombre: 'Arena' },
]

describe('MovimientosPage multiartículo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDepositos.mockResolvedValue([{ id: 'dep-1', nombre: 'Centro' }])
    getArticulos.mockResolvedValue({ articulos })
    getStockByDeposito.mockResolvedValue([
      { producto: articulos[0], disponible: 25 },
      { producto: articulos[1], disponible: 40 },
    ])
    createMovimientoMultiarticulo.mockResolvedValue({ id: 'mov-1' })
  })

  it('exige elegir primero el depósito', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)
    const tipo = await screen.findByLabelText('Operación')
    expect(tipo.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Depósito de operación'), { target: { value: 'dep-1' } })
    await waitFor(() => expect(tipo.disabled).toBe(false))
    expect(getStockByDeposito).toHaveBeenCalledWith('dep-1')
  })

  it('agrega dos artículos y los confirma como un único movimiento', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Depósito de operación'), { target: { value: 'dep-1' } })
    fireEvent.change(screen.getByLabelText('Operación'), { target: { value: 'egreso' } })
    await waitFor(() => expect(screen.getByText(/Stock actual:/).textContent).toContain('-'))

    for (const [id, cantidad] of [['art-1', '10'], ['art-2', '10']]) {
      fireEvent.change(screen.getByLabelText('Artículo'), { target: { value: id } })
      expect(screen.getByText(/Stock actual:/).textContent).toContain(
        String(id === 'art-1' ? 25 : 40),
      )
      fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: cantidad } })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar artículo' }))
    }

    fireEvent.change(screen.getByLabelText('Comprobante'), { target: { value: 'REM-10' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar movimiento/ }))

    await waitFor(() => expect(createMovimientoMultiarticulo).toHaveBeenCalledWith(
      expect.objectContaining({
        deposito_id: 'dep-1', tipo: 'egreso',
        items: [
          expect.objectContaining({ producto_id: 'art-1', cantidad: 10 }),
          expect.objectContaining({ producto_id: 'art-2', cantidad: 10 }),
        ],
      }),
    ))
  })

  it('impide confirmar con el carrito vacío', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Depósito de operación'), { target: { value: 'dep-1' } })
    fireEvent.change(screen.getByLabelText('Operación'), { target: { value: 'ingreso' } })
    fireEvent.change(screen.getByLabelText('Comprobante'), { target: { value: 'FC-1' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar movimiento/ }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Agregá al menos un artículo',
    )
    expect(createMovimientoMultiarticulo).not.toHaveBeenCalled()
  })
})
