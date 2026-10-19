import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InformeEgresosPage from './InformeEgresosPage'
import { obtenerEgresos } from '../api/informesApi'

vi.mock('../api/informesApi', () => ({
  obtenerEgresos: vi.fn(),
  listarSucursalesInforme: vi.fn(() => Promise.resolve([
    { id: 'n', nombre: 'Sucursal Norte' },
    { id: 's', nombre: 'Sucursal Sur' },
  ])),
  listarMediosEgresos: vi.fn(() => Promise.resolve(['Efectivo', 'Cheque'])),
}))

const fila = (inicio, fin, fuente, monto, sucursalId = 'n', sucursal = 'Sucursal Norte') => ({
  periodo_inicio: inicio, periodo_fin: fin, sucursal_id: sucursalId, sucursal_nombre: sucursal, fuente, medio_pago: 'Efectivo', monto,
})

beforeEach(() => {
  vi.clearAllMocks()
  obtenerEgresos.mockResolvedValue([
    fila('2026-09-01', '2026-09-30', 'proveedores', 1000, null, 'Sin sucursal'),
    fila('2026-10-01', '2026-10-31', 'proveedores', 2000, null, 'Sin sucursal'),
    fila('2026-10-01', '2026-10-31', 'caja', 500, 's', 'Sucursal Sur'),
  ])
})
afterEach(cleanup)

describe('InformeEgresosPage', () => {
  it('muestra indicadores, gráfico y detalle del modo evolución, con las notas', async () => {
    render(<InformeEgresosPage />)

    expect(await screen.findByText('Total pagado')).toBeInTheDocument()
    expect(screen.getAllByText('$ 3.500,00').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Egresos por fuente y período' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Detalle por mes' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Pagos a proveedores' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Egresos de caja' })).toBeInTheDocument()
    expect(screen.getByText(/ya se cuentan solas/)).toBeInTheDocument()
    expect(screen.getByText(/traslados de dinero/)).toBeInTheDocument()
    // Las aclaraciones vienen plegadas: una sola línea hasta que se abren.
    const callout = screen.getByText('¿Qué incluye este informe?').closest('details')
    expect(callout).not.toHaveAttribute('open')
    expect(obtenerEgresos).toHaveBeenCalledWith(expect.objectContaining({ agrupacion: 'mes', sucursales: [], medios: [] }))
  })

  it('cierra el detalle con una fila de totales por columna y alinea los importes a la derecha', async () => {
    render(<InformeEgresosPage />)
    await screen.findByText('Total pagado')

    const pie = document.querySelector('tfoot tr')
    expect(pie).toBeInTheDocument()
    const celdas = [...pie.querySelectorAll('th, td')].map((c) => c.textContent.replace(/\s/g, ' '))
    // Proveedores 1000 + 2000, caja 500, total general 3500.
    expect(celdas).toEqual(['Total', '$ 3.000,00', '$ 500,00', '$ 3.500,00'])
    expect(screen.getByRole('columnheader', { name: 'Pagos a proveedores' })).toHaveClass('informe-num')
    expect(pie.querySelectorAll('td.informe-num')).toHaveLength(3)
  })

  it('al elegir un atajo y una sucursal vuelve a consultar y avisa de los pagos a proveedores', async () => {
    render(<InformeEgresosPage />)
    await screen.findByText('Total pagado')
    expect(screen.queryByText(/no tienen sucursal/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Últimas 8 semanas' }))
    await waitFor(() => expect(obtenerEgresos).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: 'semana' })))

    fireEvent.click(await screen.findByRole('button', { name: 'Sucursal Sur' }))
    await waitFor(() => expect(obtenerEgresos).toHaveBeenLastCalledWith(expect.objectContaining({ sucursales: ['s'] })))
    expect(screen.getByText(/no tienen sucursal/)).toBeInTheDocument()
  })

  it('compara sucursales con una barra por sucursal', async () => {
    render(<InformeEgresosPage />)
    await screen.findByText('Total pagado')
    fireEvent.click(screen.getByLabelText('Comparar sucursales'))
    expect(await screen.findByRole('img', { name: 'Egresos por sucursal y período' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Sucursal Sur' })).toBeInTheDocument()
  })

  it('compara dos períodos: más egresos es la variación desfavorable', async () => {
    render(<InformeEgresosPage />)
    await screen.findByText('Total pagado')
    // Al pasar a Comparar se consulta una vez por período (A y B).
    obtenerEgresos.mockReset()
    obtenerEgresos
      .mockResolvedValueOnce([fila('2026-08-01', '2026-08-31', 'proveedores', 1000)])
      .mockResolvedValueOnce([fila('2026-10-01', '2026-10-31', 'proveedores', 1500)])

    fireEvent.click(screen.getByRole('tab', { name: /Comparar períodos/ }))

    expect(await screen.findByText('Variación de B contra A')).toBeInTheDocument()
    expect(obtenerEgresos).toHaveBeenCalledWith(expect.objectContaining({ agrupacion: 'total' }))
    expect(screen.getAllByText('+50 %').length).toBeGreaterThan(0)
    expect(screen.getByText('Total pagado', { selector: 'td' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Egresos por fuente, período A contra período B' })).toBeInTheDocument()
    expect(document.querySelector('.kpi-card-danger')).toBeInTheDocument()
    expect(document.querySelector('td.informe-negativo')).toBeInTheDocument()
  })

  it('avisa cuando no hay egresos con esos filtros', async () => {
    obtenerEgresos.mockResolvedValue([])
    render(<InformeEgresosPage />)
    expect(await screen.findByText('No hay egresos registrados con estos filtros.')).toBeInTheDocument()
  })

  it('muestra el error de permisos de la base', async () => {
    obtenerEgresos.mockRejectedValue(new Error('No tenés permiso para ver informes'))
    render(<InformeEgresosPage />)
    expect(await screen.findByText('No tenés permiso para ver informes')).toBeInTheDocument()
  })
})
