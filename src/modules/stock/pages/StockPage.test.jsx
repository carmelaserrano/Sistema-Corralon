import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StockPage from './StockPage'
import {
  getDepositos,
  getStockDisponibles,
  subscribeToStockChanges,
} from '../api/stockApi'
import { getHistorialArticuloDeposito } from '../api/movimientosApi'

vi.mock('../api/stockApi', () => ({
  getDepositos: vi.fn(),
  getStockDisponibles: vi.fn(),
  subscribeToStockChanges: vi.fn(),
}))

vi.mock('../api/movimientosApi', () => ({
  getHistorialArticuloDeposito: vi.fn(),
}))

const DEPOSITO_ID = '11111111-1111-4111-8111-111111111111'
const ARTICULO_ID = '22222222-2222-4222-8222-222222222222'

function crearItem(id = ARTICULO_ID, nombre = 'Cemento Portland') {
  return {
    articulo_id: id,
    articulo_sku: `SKU-${id.slice(0, 4)}`,
    articulo_nombre: nombre,
    fisico: 10,
    comprometido: 2,
    disponible: 8,
    producto: {
      id,
      sku: `SKU-${id.slice(0, 4)}`,
      nombre,
      categoria: { nombre: 'Materiales' },
      marca: { nombre: 'Loma Negra' },
      unidad_medida: { abreviatura: 'un' },
    },
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
    getHistorialArticuloDeposito.mockResolvedValue([])
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

  it('CORR-04: muestra un ícono de historial por fila y abre un modal separado', async () => {
    getStockDisponibles.mockResolvedValue({
      items: [crearItem()],
      total: 1,
    })
    getHistorialArticuloDeposito.mockResolvedValue([
      {
        movimiento_id: 'mov-1',
        detalle_id: 'det-1',
        fecha: '2026-09-11T12:00:00.000Z',
        tipo: 'Ingreso',
        deposito_nombre: 'Depósito Central',
        cantidad: 10,
        stock_resultante: 10,
      },
      {
        movimiento_id: 'mov-2',
        detalle_id: 'det-2',
        fecha: '2026-09-11T13:00:00.000Z',
        tipo: 'Egreso',
        deposito_nombre: 'Depósito Central',
        cantidad: 2,
        stock_resultante: 8,
      },
    ])

    render(<StockPage />)

    await screen.findByText('Cemento Portland')

    fireEvent.click(screen.getByRole('button', {
      name: 'Ver historial de Cemento Portland',
    }))

    expect(await screen.findByRole('dialog', {
      name: /SKU-2222 - Cemento Portland/,
    })).toBeTruthy()
    const modal = screen.getByRole('dialog')
    expect(getHistorialArticuloDeposito).toHaveBeenCalledWith({
      articuloId: ARTICULO_ID,
      depositoId: DEPOSITO_ID,
    })
    expect(within(modal).getByText('Ingreso')).toBeTruthy()
    expect(within(modal).getByText('Egreso')).toBeTruthy()
    expect(within(modal).getAllByText('Depósito Central').length).toBeGreaterThan(1)
    expect(within(modal).getByText('8')).toBeTruthy()
  })

  it('CORR-04: muestra estado vacío cuando el artículo no tiene movimientos', async () => {
    getStockDisponibles.mockResolvedValue({
      items: [crearItem()],
      total: 1,
    })
    getHistorialArticuloDeposito.mockResolvedValue([])

    render(<StockPage />)

    await screen.findByText('Cemento Portland')
    fireEvent.click(screen.getByRole('button', {
      name: 'Ver historial de Cemento Portland',
    }))

    expect(await screen.findByText('Sin movimientos registrados')).toBeTruthy()
    expect(screen.queryByRole('table', { name: /historial/i })).toBeNull()
  })

  it('CORR-04: conserva depósito, búsqueda y página al cerrar el modal', async () => {
    getDepositos.mockResolvedValue([
      { id: DEPOSITO_ID, nombre: 'Depósito Central' },
      { id: '33333333-3333-4333-8333-333333333333', nombre: 'Centro' },
    ])
    getStockDisponibles
      .mockResolvedValueOnce({
        items: [crearItem(ARTICULO_ID, 'Producto página 1')],
        total: 51,
      })
      .mockResolvedValueOnce({
        items: [crearItem(ARTICULO_ID, 'Producto página 1 filtrado')],
        total: 51,
      })
      .mockResolvedValueOnce({
        items: [crearItem('44444444-4444-4444-8444-444444444444', 'Producto página 2')],
        total: 51,
      })
    getHistorialArticuloDeposito.mockResolvedValue([])

    render(<StockPage />)

    await screen.findByText('Producto página 1')

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'cemento' },
    })
    await screen.findByText('Producto página 1 filtrado')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText('Producto página 2')
    fireEvent.click(screen.getByRole('button', {
      name: 'Ver historial de Producto página 2',
    }))

    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar historial' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('searchbox').value).toBe('cemento')
    expect(screen.getByText('Producto página 2')).toBeTruthy()
    expect(screen.getByText('Página 2 de 2 (51 productos)')).toBeTruthy()
  })
})
