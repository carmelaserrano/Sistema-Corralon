import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InformeBalancePage from './InformeBalancePage'
import { obtenerEgresos, obtenerIngresos } from '../api/informesApi'

vi.mock('../api/informesApi', () => ({
  obtenerIngresos: vi.fn(),
  obtenerEgresos: vi.fn(),
  listarSucursalesInforme: vi.fn(() => Promise.resolve([
    { id: 'n', nombre: 'Sucursal Norte' },
    { id: 's', nombre: 'Sucursal Sur' },
  ])),
}))

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
  obtenerEgresos.mockResolvedValue([
    fila('2026-09-01', '2026-09-30', 'proveedores', 300, null, 'Sin sucursal'),
    fila('2026-10-01', '2026-10-31', 'caja', 800),
  ])
})
afterEach(cleanup)

describe('InformeBalancePage', () => {
  it('muestra indicadores, gráficos y detalle del modo evolución, con el callout plegado', async () => {
    render(<InformeBalancePage />)

    expect(await screen.findByText('Total ingresos')).toBeInTheDocument()
    expect(screen.getAllByText('$ 3.500,00').length).toBeGreaterThan(0) // total ingresos: 1000 + 2000 + 500
    expect(screen.getAllByText('$ 1.100,00').length).toBeGreaterThan(0) // total egresos: 300 + 800
    expect(screen.getAllByText('$ 2.400,00').length).toBeGreaterThan(0) // resultado: 3500 - 1100
    expect(screen.getByRole('img', { name: 'Ingresos y egresos por período' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ingresos y egresos del rango seleccionado' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Detalle por mes' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Ingresos' })).toHaveClass('informe-num')
    expect(screen.getByRole('columnheader', { name: 'Egresos' })).toHaveClass('informe-num')
    expect(screen.getByRole('columnheader', { name: 'Resultado' })).toHaveClass('informe-num')
    expect(screen.getByText(/ya se cuenta sola/)).toBeInTheDocument()
    expect(screen.getByText(/traslados de dinero/)).toBeInTheDocument()
    const callout = screen.getByText('¿Qué incluye este panel?').closest('details')
    expect(callout).not.toHaveAttribute('open')
    expect(obtenerIngresos).toHaveBeenCalledWith(expect.objectContaining({ agrupacion: 'mes', sucursales: [] }))
    expect(obtenerEgresos).toHaveBeenCalledWith(expect.objectContaining({ agrupacion: 'mes', sucursales: [] }))
  })

  it('cierra el detalle con una fila de totales por columna', async () => {
    render(<InformeBalancePage />)
    await screen.findByText('Total ingresos')

    const pie = document.querySelector('tfoot tr')
    const celdas = [...pie.querySelectorAll('th, td')].map((c) => c.textContent.replace(/\s/g, ' '))
    expect(celdas).toEqual(['Total', '$ 3.500,00', '$ 1.100,00', '$ 2.400,00'])
  })

  it('al elegir un atajo y una sucursal vuelve a consultar ambos informes con esos filtros', async () => {
    render(<InformeBalancePage />)
    await screen.findByText('Total ingresos')
    expect(screen.queryByText(/sucursal solo se ven los egresos de caja\./)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Últimas 8 semanas' }))
    await waitFor(() => expect(obtenerIngresos).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: 'semana' })))
    expect(obtenerEgresos).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: 'semana' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Sucursal Sur' }))
    await waitFor(() => expect(obtenerIngresos).toHaveBeenLastCalledWith(expect.objectContaining({ sucursales: ['s'] })))
    expect(obtenerEgresos).toHaveBeenLastCalledWith(expect.objectContaining({ sucursales: ['s'] }))
    expect(screen.getByText(/sucursal solo se ven los egresos de caja\./)).toBeInTheDocument()
  })

  it('compara sucursales con el resultado neto por sucursal', async () => {
    render(<InformeBalancePage />)
    await screen.findByText('Total ingresos')
    fireEvent.click(screen.getByLabelText('Comparar sucursales'))
    expect(await screen.findByRole('img', { name: 'Resultado neto por sucursal y período' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Sucursal Sur' })).toBeInTheDocument()
  })

  it('compara dos períodos: variación del resultado neto de B contra A', async () => {
    render(<InformeBalancePage />)
    await screen.findByText('Total ingresos')

    obtenerIngresos.mockReset()
    obtenerEgresos.mockReset()
    obtenerIngresos
      .mockResolvedValueOnce([fila('2026-08-01', '2026-08-31', 'mostrador', 1000)])
      .mockResolvedValueOnce([fila('2026-10-01', '2026-10-31', 'mostrador', 1500)])
    obtenerEgresos
      .mockResolvedValueOnce([fila('2026-08-01', '2026-08-31', 'proveedores', 200)])
      .mockResolvedValueOnce([fila('2026-10-01', '2026-10-31', 'caja', 300)])

    fireEvent.click(screen.getByRole('tab', { name: /Comparar períodos/ }))

    expect(await screen.findByText('Variación de B contra A')).toBeInTheDocument()
    expect(obtenerIngresos).toHaveBeenCalledWith(expect.objectContaining({ agrupacion: 'total' }))
    expect(obtenerEgresos).toHaveBeenCalledWith(expect.objectContaining({ agrupacion: 'total' }))
    // Resultado A = 1000 - 200 = 800; Resultado B = 1500 - 300 = 1200; variación +50 %.
    expect(screen.getAllByText('$ 800,00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$ 1.200,00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('+50 %').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Ingresos, egresos y resultado, período A contra período B' })).toBeInTheDocument()
  })

  it('avisa cuando no hay ingresos ni egresos con esos filtros', async () => {
    obtenerIngresos.mockResolvedValue([])
    obtenerEgresos.mockResolvedValue([])
    render(<InformeBalancePage />)
    expect(await screen.findByText('No hay ingresos ni egresos registrados con estos filtros.')).toBeInTheDocument()
  })

  it('muestra el error de permisos de la base', async () => {
    obtenerIngresos.mockRejectedValue(new Error('No tenés permiso para ver informes'))
    render(<InformeBalancePage />)
    expect(await screen.findByText('No tenés permiso para ver informes')).toBeInTheDocument()
  })
})
