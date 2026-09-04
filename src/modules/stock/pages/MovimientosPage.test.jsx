import '@testing-library/jest-dom'
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
    getDepositos.mockResolvedValue([{ id: 'dep-1', nombre: 'Centro' }, { id: 'dep-2', nombre: 'Norte' }])
    getArticulos.mockResolvedValue({ articulos })
    getStockByDeposito.mockResolvedValue([
      { producto: articulos[0], disponible: 25 },
      { producto: articulos[1], disponible: 40 },
    ])
    createMovimientoMultiarticulo.mockResolvedValue({ id: 'mov-1' })
  })

  it('habilita el carrito después de depósito y tipo, y deja los datos para el final', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)
    const tipo = await screen.findByLabelText('Operación')
    const articulo = screen.getByLabelText('Artículo')
    expect(tipo).toBeDisabled(); expect(articulo).toBeDisabled()
    expect(screen.getByLabelText('Comprobante')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Depósito de operación'), { target: { value: 'dep-1' } })
    await waitFor(() => expect(getStockByDeposito).toHaveBeenCalledWith('dep-1'))
    await waitFor(() => expect(screen.getByText(/Stock actual:/)).toBeInTheDocument())
    expect(tipo).toBeEnabled()
    expect(getStockByDeposito).toHaveBeenCalledWith('dep-1')
    fireEvent.change(tipo, { target: { value: 'egreso' } })
    expect(articulo).toBeEnabled()

    fireEvent.change(articulo, { target: { value: 'art-1' } })
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar artículo' }))
    expect(screen.getByLabelText('Comprobante')).toBeEnabled()
    expect(screen.getByLabelText('Observaciones')).toBeEnabled()

    const detalle = screen.getByRole('heading', { name: 'Detalle del movimiento' })
    const datos = screen.getByRole('heading', { name: 'Datos del movimiento' })
    expect(detalle.compareDocumentPosition(datos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('agrega dos artículos y los confirma como un único movimiento', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Depósito de operación'), { target: { value: 'dep-1' } })
    await screen.findByText(/Stock actual:/)
    fireEvent.change(screen.getByLabelText('Operación'), { target: { value: 'egreso' } })

    for (const [id, valor] of [['art-1', '10'], ['art-2', '10']]) {
      fireEvent.change(screen.getByLabelText('Artículo'), { target: { value: id } })
      expect(screen.getByText(/Stock actual:/).textContent).toContain(String(id === 'art-1' ? 25 : 40))
      fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: valor } })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar artículo' }))
    }
    expect(screen.getByText('CEM — Cemento Portland')).toBeInTheDocument()
    expect(screen.getByText('ARE — Arena')).toBeInTheDocument()
    expect(screen.getByText('2 artículos agregados')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Comprobante'), { target: { value: 'REM-10' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar movimiento/ }))
    await waitFor(() => expect(createMovimientoMultiarticulo).toHaveBeenCalledWith(expect.objectContaining({
      deposito_id: 'dep-1', tipo: 'egreso', comprobante: 'REM-10',
      items: [expect.objectContaining({ producto_id: 'art-1', cantidad: 10 }), expect.objectContaining({ producto_id: 'art-2', cantidad: 10 })],
    })))
  })

  it('impide confirmar con el carrito vacío', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Depósito de operación'), { target: { value: 'dep-1' } })
    fireEvent.change(screen.getByLabelText('Operación'), { target: { value: 'ingreso' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar movimiento/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Agregá al menos un artículo')
    expect(createMovimientoMultiarticulo).not.toHaveBeenCalled()
  })

  it('exige otro depósito para una transferencia', async () => {
    render(<MovimientosPage onVerHistorial={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Depósito de operación'), { target: { value: 'dep-1' } })
    await screen.findByText(/Stock actual:/)
    fireEvent.change(screen.getByLabelText('Operación'), { target: { value: 'transferencia' } })
    expect(screen.getByLabelText('Artículo')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Depósito destino'), { target: { value: 'dep-2' } })
    expect(screen.getByLabelText('Artículo')).toBeEnabled()
  })

  it('muestra el error inicial y abandona el estado cargando', async () => {
    getDepositos.mockRejectedValueOnce(new Error('Sin conexión'))
    render(<MovimientosPage onVerHistorial={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
    expect(screen.queryByText('Cargando movimientos...')).not.toBeInTheDocument()
  })
})
