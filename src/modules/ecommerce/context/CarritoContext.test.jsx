import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CarritoProvider, useCarrito } from './CarritoContext'
import { useClienteWeb } from './ClienteWebContext'
import { validarItems } from '../api/carritoApi'

vi.mock('./ClienteWebContext', () => ({ useClienteWeb: vi.fn() }))
vi.mock('../api/carritoApi', () => ({
  esCantidadEnteraPositiva: (cantidad) => (
    typeof cantidad === 'number'
    && Number.isFinite(cantidad)
    && Number.isInteger(cantidad)
    && cantidad > 0
  ),
  fusionarCarrito: vi.fn(),
  guardarItems: vi.fn(),
  obtenerCarrito: vi.fn(),
  validarItems: vi.fn(),
}))

let carritoActual

function CapturarCarrito() {
  carritoActual = useCarrito()
  return null
}

async function montarCarrito() {
  render(
    <CarritoProvider>
      <CapturarCarrito />
    </CarritoProvider>,
  )
  await waitFor(() => expect(validarItems).toHaveBeenCalledWith([]))
}

describe('CarritoContext agregarVarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    carritoActual = undefined
    useClienteWeb.mockReturnValue({ cliente: null, cargando: false })
    validarItems.mockImplementation(async (items) => items.map((item) => ({
      ...item,
      nombre: item.productoId,
      precioUnitario: 100,
      subtotal: item.cantidad * 100,
      disponible: true,
      ajustado: false,
    })))
  })

  afterEach(cleanup)

  it.each([1.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza la cantidad inválida %s antes de validar o persistir',
    async (cantidad) => {
      await montarCarrito()
      validarItems.mockClear()

      await act(async () => {
        await expect(carritoActual.agregarVarios([{ productoId: 'p1', cantidad }]))
          .rejects.toThrow('Ingresá una cantidad entera mayor a cero')
      })

      expect(validarItems).not.toHaveBeenCalled()
    },
  )

  it.each([1, 2, 3])('acepta la cantidad entera positiva %s', async (cantidad) => {
    await montarCarrito()
    validarItems.mockClear()

    await act(async () => {
      await carritoActual.agregarVarios([{ productoId: 'p1', cantidad }])
    })

    expect(validarItems).toHaveBeenCalledWith([{ productoId: 'p1', cantidad }])
  })
})
