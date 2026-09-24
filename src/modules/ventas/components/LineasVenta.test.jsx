import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LineasVenta from './LineasVenta'
import {
  buscarArticulos,
  calcularPrecioVenta,
  validarDescuentoManual,
} from '../api/ventasApi'

vi.mock('../api/ventasApi', () => ({
  buscarArticulos: vi.fn(),
  calcularPrecioVenta: vi.fn(),
  validarDescuentoManual: vi.fn(),
  agregarArticuloALineas: vi.fn((lineas, art, cant, precio) => [
    ...lineas,
    {
      producto_id: art.id || art.producto_id,
      nombre: art.nombre,
      sku: art.sku,
      unidad_medida: art.unidad_medida || 'un.',
      stock_disponible: art.stock_disponible ?? 10,
      cantidad: cant,
      precio_unitario: precio,
      descuento_pct: 0,
      autorizacion_descuento_id: null,
      subtotal: cant * precio,
    },
  ]),
}))

function TestHarness({ inicialLineas = [], onLineasChange, onRecalculandoChange, ...props }) {
  const [lineas, setLineas] = useState(inicialLineas)

  return (
    <LineasVenta
      depositoId="dep-1"
      clienteId="cli-1"
      lineas={lineas}
      onLineasChange={(nuevas) => {
        setLineas(nuevas)
        onLineasChange?.(nuevas)
      }}
      onRecalculandoChange={onRecalculandoChange}
      {...props}
    />
  )
}

describe('LineasVenta', () => {
  const lineasMock = [
    {
      producto_id: 'p1',
      nombre: 'Cemento Portland',
      sku: 'CEM-01',
      unidad_medida: 'bolsa',
      stock_disponible: 20,
      cantidad: 1,
      precio_unitario: 1000,
      descuento_pct: 0,
      autorizacion_descuento_id: null,
      subtotal: 1000,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    buscarArticulos.mockResolvedValue([])
    calcularPrecioVenta.mockResolvedValue(1000)
    validarDescuentoManual.mockResolvedValue({ requiere_autorizacion: false, limite: null })
  })

  it('muestra mensaje cuando no hay líneas', () => {
    render(
      <LineasVenta
        depositoId="dep-1"
        clienteId="cli-1"
        lineas={[]}
        onLineasChange={vi.fn()}
      />,
    )

    expect(
      screen.getByText('No hay artículos agregados a la venta. Buscá y seleccioná un producto arriba.'),
    ).toBeInTheDocument()
  })

  it('renderiza la tabla con los artículos cargados', () => {
    render(
      <LineasVenta
        depositoId="dep-1"
        clienteId="cli-1"
        lineas={lineasMock}
        onLineasChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Cemento Portland')).toBeInTheDocument()
    expect(screen.getByText('SKU: CEM-01')).toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad de Cemento Portland')).toHaveValue(1)
  })

  it('descarta respuestas fuera de orden al cambiar cantidades rápidamente (race condition)', async () => {
    const onLineasChange = vi.fn()
    const onRecalculandoChange = vi.fn()

    render(
      <TestHarness
        inicialLineas={lineasMock}
        onLineasChange={onLineasChange}
        onRecalculandoChange={onRecalculandoChange}
      />,
    )

    // Esperar a que el efecto inicial de clienteId termine
    await waitFor(() => {
      expect(calcularPrecioVenta).toHaveBeenCalled()
    })
    calcularPrecioVenta.mockClear()
    onLineasChange.mockClear()

    let resolverReq1
    let resolverReq2

    const promReq1 = new Promise((resolve) => {
      resolverReq1 = resolve
    })
    const promReq2 = new Promise((resolve) => {
      resolverReq2 = resolve
    })

    // Primera llamada (cantidad 2) tarda, segunda llamada (cantidad 3) resuelve antes
    calcularPrecioVenta
      .mockReturnValueOnce(promReq1)
      .mockReturnValueOnce(promReq2)

    const inputCantidad = screen.getByLabelText('Cantidad de Cemento Portland')

    // 1. Tipea 2
    fireEvent.change(inputCantidad, { target: { value: '2' } })
    expect(onRecalculandoChange).toHaveBeenCalledWith(true)

    // 2. Antes de que termine req 1, tipea 3
    fireEvent.change(inputCantidad, { target: { value: '3' } })

    // 3. Resuelve req 2 (cantidad 3) con precio 900
    resolverReq2(900)
    await waitFor(() => {
      expect(onLineasChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            producto_id: 'p1',
            cantidad: 3,
            precio_unitario: 900,
          }),
        ]),
      )
    })

    // 4. Ahora resuelve req 1 (tardía para cantidad 2) con precio 1000
    onLineasChange.mockClear()
    resolverReq1(1000)

    // No debe sobreescribir con la respuesta vieja de cantidad 2
    await new Promise((r) => setTimeout(r, 50))
    expect(onLineasChange).not.toHaveBeenCalled()
  })

  it('descarta respuesta pendiente si el artículo fue eliminado del carrito', async () => {
    const onLineasChange = vi.fn()
    const onRecalculandoChange = vi.fn()

    render(
      <TestHarness
        inicialLineas={lineasMock}
        onLineasChange={onLineasChange}
        onRecalculandoChange={onRecalculandoChange}
      />,
    )

    await waitFor(() => {
      expect(calcularPrecioVenta).toHaveBeenCalled()
    })
    calcularPrecioVenta.mockClear()
    onLineasChange.mockClear()

    let resolverReq
    const promReq = new Promise((resolve) => {
      resolverReq = resolve
    })
    calcularPrecioVenta.mockReturnValueOnce(promReq)

    const inputCantidad = screen.getByLabelText('Cantidad de Cemento Portland')
    fireEvent.change(inputCantidad, { target: { value: '5' } })

    // El usuario elimina el artículo mientras la promesa de precio está pendiente
    const botonEliminar = screen.getByTitle('Quitar artículo')
    fireEvent.click(botonEliminar)

    onLineasChange.mockClear()
    resolverReq(800)

    await new Promise((r) => setTimeout(r, 50))
    // No debe restaurar el artículo eliminado
    expect(onLineasChange).not.toHaveBeenCalled()
  })

  it('quita una línea al presionar el botón de eliminar', () => {
    const onLineasChange = vi.fn()

    render(
      <LineasVenta
        depositoId="dep-1"
        clienteId="cli-1"
        lineas={lineasMock}
        onLineasChange={onLineasChange}
      />,
    )

    const botonEliminar = screen.getByTitle('Quitar artículo')
    fireEvent.click(botonEliminar)

    expect(onLineasChange).toHaveBeenCalledWith([])
  })
})
