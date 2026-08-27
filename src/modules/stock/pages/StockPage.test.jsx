import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StockPage from './StockPage'
import {
  getDepositos,
  getStockDisponibles,
  subscribeToStockChanges,
} from '../api/stockApi'

vi.mock('../api/stockApi', () => ({
  getDepositos: vi.fn(),
  getStockDisponibles: vi.fn(),
  subscribeToStockChanges: vi.fn(),
}))

const DEPOSITO_ID = '11111111-1111-4111-8111-111111111111'

function crearItem(id, nombre) {
  return {
    articulo_id: id,
    articulo_sku: `SKU-${id}`,
    articulo_nombre: nombre,
    fisico: 10,
    comprometido: 2,
    disponible: 8,
    producto: {},
  }
}

function promesaControlada() {
  let resolve
  let reject
  const promise = new Promise((resolver, rechazar) => {
    resolve = resolver
    reject = rechazar
  })

  return { promise, resolve, reject }
}

describe('StockPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDepositos.mockResolvedValue([
      { id: DEPOSITO_ID, nombre: 'Depósito Central' },
    ])
    subscribeToStockChanges.mockReturnValue({ unsubscribe: vi.fn() })
  })

  it('permite recorrer todas las páginas del stock', async () => {
    getStockDisponibles
      .mockResolvedValueOnce({
        items: [crearItem('1', 'Producto de página 1')],
        total: 51,
      })
      .mockResolvedValueOnce({
        items: [crearItem('51', 'Producto de página 2')],
        total: 51,
      })

    render(<StockPage />)

    await screen.findByText('Producto de página 1')
    expect(screen.getByText('Página 1 de 2 (51 productos)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText('Producto de página 2')
    expect(getStockDisponibles).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, pageSize: 50 }),
    )
  })

  it('ignora respuestas anteriores cuando cambia la búsqueda', async () => {
    const solicitudAnterior = promesaControlada()
    const solicitudActual = promesaControlada()

    getStockDisponibles
      .mockReturnValueOnce(solicitudAnterior.promise)
      .mockReturnValueOnce(solicitudActual.promise)

    render(<StockPage />)

    await waitFor(() => expect(getStockDisponibles).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'actual' },
    })

    await waitFor(() => expect(getStockDisponibles).toHaveBeenCalledTimes(2))

    await act(async () => {
      solicitudActual.resolve({
        items: [crearItem('2', 'Resultado actual')],
        total: 1,
      })
    })
    await screen.findByText('Resultado actual')

    await act(async () => {
      solicitudAnterior.resolve({
        items: [crearItem('1', 'Resultado anterior')],
        total: 1,
      })
    })

    expect(screen.queryByText('Resultado anterior')).toBeNull()
    expect(screen.getByText('Resultado actual')).toBeTruthy()
  })
})
