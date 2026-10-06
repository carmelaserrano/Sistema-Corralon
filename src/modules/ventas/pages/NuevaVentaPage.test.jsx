import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NuevaVentaPage from './NuevaVentaPage'
import {
  buscarClientes,
  calcularPrecioVenta,
  listarDepositos,
  registrarVenta,
} from '../api/ventasApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getUser: vi.fn() } },
}))

// La grilla de líneas tiene sus propios tests: acá sólo se precarga una línea.
vi.mock('../components/LineasVenta', () => ({
  default: ({ lineas, onLineasChange }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onLineasChange([
            {
              producto_id: 'p-1',
              nombre: 'Cemento',
              sku: 'CEM-1',
              unidad_medida: 'un.',
              stock_disponible: 10,
              cantidad: 2,
              backorder: false,
              precio_unitario: 100,
              descuento_pct: 0,
              autorizacion_descuento_id: null,
              subtotal: 200,
            },
          ])
        }
      >
        Cargar línea
      </button>
      {lineas.map((l) => (
        <p key={l.producto_id}>
          precio {l.precio_unitario} subtotal {l.subtotal}
        </p>
      ))}
    </div>
  ),
}))

vi.mock('../api/ventasApi', () => ({
  CODIGO_PRECIO_DESACTUALIZADO: 'PRECIO_DESACTUALIZADO',
  listarDepositos: vi.fn(),
  buscarClientes: vi.fn(),
  registrarVenta: vi.fn(),
  calcularPrecioVenta: vi.fn(),
  calcularTotalesVenta: vi.fn((lineas) => ({
    total: lineas.reduce((acc, l) => acc + l.subtotal, 0),
    totalArticulos: lineas.reduce((acc, l) => acc + l.cantidad, 0),
    cantidadItems: lineas.length,
  })),
  redondear: (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100,
}))

async function prepararVenta() {
  listarDepositos.mockResolvedValue([{ id: 'dep-1', nombre: 'Central', localidad: 'Salta' }])
  buscarClientes.mockResolvedValue([
    {
      id: 'cli-1',
      tipo_persona: 'juridica',
      razon_social: 'Constructora Andes SRL',
      tipo_documento: 'CUIT',
      numero_documento: '20123456786',
      estado: 'Activo',
    },
  ])

  render(<NuevaVentaPage />)

  fireEvent.change(await screen.findByLabelText('Buscar cliente'), { target: { value: 'andes' } })
  fireEvent.click(await screen.findByText('Constructora Andes SRL'))
  fireEvent.click(await screen.findByRole('button', { name: 'Cargar línea' }))
}

describe('NuevaVentaPage · errores de la base al confirmar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('ante PRECIO_DESACTUALIZADO muestra un mensaje sin ids y actualiza los precios de las líneas', async () => {
    registrarVenta.mockRejectedValue(
      Object.assign(
        new Error(
          'El precio de un artículo cambió. Actualizamos los precios; revisá la venta y confirmá nuevamente.',
        ),
        { code: 'PRECIO_DESACTUALIZADO', status: 409 },
      ),
    )
    calcularPrecioVenta.mockResolvedValue(120)

    await prepararVenta()
    expect(screen.getByText('precio 100 subtotal 200')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar venta' }))

    expect(await screen.findByText(/precio de un artículo cambió/)).toBeInTheDocument()
    await waitFor(() => {
      expect(calcularPrecioVenta).toHaveBeenCalledWith('p-1', 'cli-1', 2)
      expect(screen.getByText('precio 120 subtotal 240')).toBeInTheDocument()
    })
  })

  it('ante otros errores no recalcula precios y conserva las líneas', async () => {
    registrarVenta.mockRejectedValue(
      Object.assign(new Error('El cliente no está habilitado para operar ventas'), { status: 400 }),
    )

    await prepararVenta()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar venta' }))

    expect(await screen.findByText('El cliente no está habilitado para operar ventas')).toBeInTheDocument()
    expect(calcularPrecioVenta).not.toHaveBeenCalled()
    expect(screen.getByText('precio 100 subtotal 200')).toBeInTheDocument()
  })
})
