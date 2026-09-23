import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VentasPage from './VentasPage'
import { listarVentas, getVentaById } from '../api/consultaVentasApi'
import { puedeFacturarVentas, puedeAnularVentas } from '../api/comprobantesApi'

vi.mock('../api/consultaVentasApi', () => ({
  listarVentas: vi.fn(),
  getVentaById: vi.fn(),
}))

vi.mock('../api/comprobantesApi', () => ({
  emitirComprobante: vi.fn(),
  descargarComprobantePdf: vi.fn(),
  puedeFacturarVentas: vi.fn(),
  puedeAnularVentas: vi.fn(),
  determinarLetraComprobante: vi.fn(() => 'B'),
  calcularDesgloseIva: vi.fn((total) => ({ total, neto: total / 1.21, iva: total - total / 1.21 })),
}))

const ventasMock = [
  {
    id: 'v-1',
    numero: 101,
    estado: 'Pendiente',
    total: 5000,
    created_at: '2026-03-10T10:00:00Z',
    cliente: {
      id: 'c-1',
      tipo_persona: 'juridica',
      razon_social: 'Constructora Andes SRL',
      tipo_documento: 'CUIT',
      numero_documento: '20123456786',
      condicion_iva: { nombre: 'Responsable Inscripto' },
    },
    cobros: [{ id: 'cob-1', total: 5000, detalle: [] }],
    comprobantes: [],
  },
  {
    id: 'v-2',
    numero: 102,
    estado: 'Facturada',
    total: 2420,
    created_at: '2026-03-12T15:00:00Z',
    cliente: {
      id: 'c-2',
      tipo_persona: 'fisica',
      nombre: 'Juan',
      apellido: 'Pérez',
      tipo_documento: 'DNI',
      numero_documento: '30111222',
      condicion_iva: { nombre: 'Consumidor Final' },
    },
    cobros: [],
    comprobantes: [
      {
        id: 'comp-1',
        tipo_comprobante: 'factura',
        letra: 'B',
        numero: 1,
        total: 2420,
        punto_venta: { numero: '0001' },
      },
    ],
  },
]

describe('VentasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarVentas.mockResolvedValue(ventasMock)
    getVentaById.mockResolvedValue({
      ...ventasMock[0],
      detalle: [],
      totalCobrado: 5000,
      estaCobrada: true,
      tieneCuentaCorriente: false,
    })
    puedeFacturarVentas.mockResolvedValue(true)
    puedeAnularVentas.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renderiza el título y el listado de ventas', async () => {
    render(<VentasPage />)

    expect(screen.getByText('Ventas y Facturación')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('#101')).toBeInTheDocument()
      expect(screen.getByText('Constructora Andes SRL')).toBeInTheDocument()
      expect(screen.getByText('#102')).toBeInTheDocument()
      expect(screen.getByText('Pérez Juan')).toBeInTheDocument()
    })
  })

  it('muestra comprobante emitido si la venta ya está Facturada', async () => {
    render(<VentasPage />)

    await waitFor(() => {
      expect(screen.getByText(/Factura B 0001-00000001/i)).toBeInTheDocument()
    })
  })

  it('aplica filtros de estado y rango de fechas', async () => {
    render(<VentasPage />)

    await waitFor(() => {
      expect(screen.getByText('#101')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/Estado/i), { target: { value: 'Pendiente' } })
    fireEvent.change(screen.getByLabelText(/Desde/i), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText(/Hasta/i), { target: { value: '2026-03-15' } })

    fireEvent.click(screen.getByRole('button', { name: /Filtrar/i }))

    await waitFor(() => {
      expect(listarVentas).toHaveBeenCalledWith({
        estado: 'Pendiente',
        desde: '2026-03-01',
        hasta: '2026-03-15',
      })
    })
  })

  it('el botón Limpiar reinicia los filtros y recarga la lista', async () => {
    render(<VentasPage />)

    await waitFor(() => {
      expect(screen.getByText('#101')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/Estado/i), { target: { value: 'Facturada' } })
    fireEvent.click(screen.getByRole('button', { name: /Limpiar/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Estado/i)).toHaveValue('')
      expect(listarVentas).toHaveBeenCalledWith({})
    })
  })

  it('filtra localmente por texto de búsqueda (número o cliente)', async () => {
    render(<VentasPage />)

    await waitFor(() => {
      expect(screen.getByText('#101')).toBeInTheDocument()
      expect(screen.getByText('#102')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/Ej: 42 o Andes/i), { target: { value: 'Andes' } })

    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(screen.queryByText('#102')).not.toBeInTheDocument()
  })

  it('muestra estado vacío si ninguna venta coincide', async () => {
    listarVentas.mockResolvedValue([])
    render(<VentasPage />)

    await waitFor(() => {
      expect(screen.getByText('No se encontraron ventas')).toBeInTheDocument()
    })
  })

  it('abre el modal de detalle al hacer clic en Ver detalle y lo cierra', async () => {
    render(<VentasPage />)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Ver detalle/i })[0]).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /Ver detalle/i })[0])

    await waitFor(() => {
      expect(screen.getByText('Venta Nº 101 — Constructora Andes SRL')).toBeInTheDocument()
    })

    // Cerrar modal
    fireEvent.click(screen.getByRole('button', { name: /Cerrar/i }))

    await waitFor(() => {
      expect(screen.queryByText('Venta Nº 101 — Constructora Andes SRL')).not.toBeInTheDocument()
    })
  })
})
