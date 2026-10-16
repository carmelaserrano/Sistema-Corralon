import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InformeIngresosPage from './InformeIngresosPage'
import { obtenerFacturado, obtenerIngresos } from '../api/informesApi'

vi.mock('../api/informesApi', () => ({
  obtenerIngresos: vi.fn(),
  obtenerFacturado: vi.fn(),
  listarSucursalesInforme: vi.fn(() => Promise.resolve([
    { id: 'n', nombre: 'Sucursal Norte' },
    { id: 's', nombre: 'Sucursal Sur' },
  ])),
  listarMediosInforme: vi.fn(() => Promise.resolve(['Efectivo', 'Pago online'])),
}))

vi.mock('../../stock/api/reportesApi', () => ({ descargarCsv: vi.fn() }))

const fila = (inicio, fin, fuente, monto, sucursalId = 'n', sucursal = 'Sucursal Norte') => ({
  periodo_inicio: inicio, periodo_fin: fin, sucursal_id: sucursalId, sucursal_nombre: sucursal, fuente, medio_pago: 'Efectivo', monto,
})

beforeEach(() => {
  vi.clearAllMocks()
  obtenerIngresos.mockResolvedValue([
    fila('2026-09-01', '2026-09-30', 'mostrador', 1000),
    fila('2026-10-01', '2026-10-31', 'mostrador', 2000),
    fila('2026-10-01', '2026-10-31', 'tienda', 500, 's', 'Sucursal Sur'),
  ])
  obtenerFacturado.mockResolvedValue([
    { periodo_inicio: '2026-10-01', periodo_fin: '2026-10-31', tipo: 'factura', monto: 2600, cantidad: 2 },
  ])
})
afterEach(cleanup)

describe('InformeIngresosPage', () => {
  it('muestra indicadores, gráfico, detalle y facturado del modo evolución', async () => {
    render(<InformeIngresosPage />)

    expect(await screen.findByText('Total cobrado')).toBeInTheDocument()
    expect(screen.getAllByText('$ 3.500,00').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Ingresos por fuente y período' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Detalle por mes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Facturado' })).toBeInTheDocument()
    expect(screen.getByText('$ 2.600,00', { selector: 'strong' })).toBeInTheDocument()
    expect(obtenerIngresos).toHaveBeenCalledWith(expect.objectContaining({ agrupacion: 'mes', sucursales: [], medios: [] }))
  })

  it('al elegir un atajo y una sucursal vuelve a consultar con esos filtros', async () => {
    render(<InformeIngresosPage />)
    await screen.findByText('Total cobrado')

    fireEvent.click(screen.getByRole('button', { name: 'Últimas 8 semanas' }))
    await waitFor(() => expect(obtenerIngresos).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: 'semana' })))

    fireEvent.click(await screen.findByRole('button', { name: 'Sucursal Sur' }))
    await waitFor(() => expect(obtenerIngresos).toHaveBeenLastCalledWith(expect.objectContaining({ sucursales: ['s'] })))
  })

  it('compara sucursales con una barra por sucursal', async () => {
    render(<InformeIngresosPage />)
    await screen.findByText('Total cobrado')
    fireEvent.click(screen.getByLabelText('Comparar sucursales'))
    expect(await screen.findByRole('img', { name: 'Ingresos por sucursal y período' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Sucursal Sur' })).toBeInTheDocument()
  })

  it('compara dos períodos con diferencia y variación', async () => {
    render(<InformeIngresosPage />)
    await screen.findByText('Total cobrado')
    // Al pasar a Comparar se consulta una vez por período (A y B).
    obtenerIngresos.mockReset()
    obtenerIngresos
      .mockResolvedValueOnce([fila('2026-08-01', '2026-08-31', 'mostrador', 1000)])
      .mockResolvedValueOnce([fila('2026-10-01', '2026-10-31', 'mostrador', 1500)])

    fireEvent.click(screen.getByRole('tab', { name: /Comparar períodos/ }))

    expect(await screen.findByText('Variación de B contra A')).toBeInTheDocument()
    expect(obtenerIngresos).toHaveBeenCalledWith(expect.objectContaining({ agrupacion: 'total' }))
    expect(screen.getAllByText('+50 %').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Ingresos por fuente, período A contra período B' })).toBeInTheDocument()
  })

  it('avisa cuando no hay ingresos con esos filtros', async () => {
    obtenerIngresos.mockResolvedValue([])
    obtenerFacturado.mockResolvedValue([])
    render(<InformeIngresosPage />)
    expect(await screen.findByText('No hay ingresos registrados con estos filtros.')).toBeInTheDocument()
  })

  it('muestra el error de permisos de la base', async () => {
    obtenerIngresos.mockRejectedValue(new Error('No tenés permiso para ver informes'))
    render(<InformeIngresosPage />)
    expect(await screen.findByText('No tenés permiso para ver informes')).toBeInTheDocument()
  })
})
