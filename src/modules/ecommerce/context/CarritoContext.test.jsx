import { useState } from 'react'
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CarritoProvider, useCarrito } from './CarritoContext'
import { useClienteWeb } from './ClienteWebContext'
import { obtenerCarrito, validarItems } from '../api/carritoApi'

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

  it('omite las líneas inválidas y agrega las válidas al reordenar', async () => {
    await montarCarrito()
    validarItems.mockClear()

    await act(async () => {
      await carritoActual.agregarVarios([
        { productoId: 'p1', cantidad: 1.5 },
        { productoId: 'p2', cantidad: 2 },
      ])
    })

    expect(validarItems).toHaveBeenCalledWith([{ productoId: 'p2', cantidad: 2 }])
  })

  it.each([1, 2, 3])('acepta la cantidad entera positiva %s', async (cantidad) => {
    await montarCarrito()
    validarItems.mockClear()

    await act(async () => {
      await carritoActual.agregarVarios([{ productoId: 'p1', cantidad }])
    })

    expect(validarItems).toHaveBeenCalledWith([{ productoId: 'p1', cantidad }])
  })
})

it('cambiar de visitante a cliente reinicia carrito sin desmontar consumidores', async () => {
  sessionStorage.clear()
  useClienteWeb.mockReturnValue({ cliente: null, cargando: false })
  validarItems.mockResolvedValue([])
  obtenerCarrito.mockResolvedValue([])
  function Formulario() {
    const [nombre, setNombre] = useState('')
    useCarrito()
    return <input aria-label="nombre persistente" value={nombre} onChange={event => setNombre(event.target.value)} />
  }
  const vista = render(<CarritoProvider><Formulario /></CarritoProvider>)
  const input = screen.getByLabelText('nombre persistente')
  fireEvent.change(input, { target: { value: 'Ana' } })
  useClienteWeb.mockReturnValue({ cliente: { id: 'c1' }, cargando: false })
  vista.rerender(<CarritoProvider><Formulario /></CarritoProvider>)
  await waitFor(() => expect(obtenerCarrito).toHaveBeenCalledWith('c1'))
  expect(screen.getByLabelText('nombre persistente')).toBe(input)
  expect(input).toHaveValue('Ana')
})
