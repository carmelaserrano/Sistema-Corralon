import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TiendaCartDrawer from './TiendaCartDrawer'
import { useCarrito } from '../context/CarritoContext'

vi.mock('../context/CarritoContext', () => ({ useCarrito: vi.fn() }))
vi.mock('../pages/CatalogoPage', () => ({
  ImagenProducto: ({ nombre }) => <span>{nombre}</span>,
}))

const item = {
  productoId: 'producto-1',
  nombre: 'Cemento',
  cantidad: 2,
  precioUnitario: 1250,
  subtotal: 2500,
  imagenUrl: null,
}

const operaciones = {
  actualizar: vi.fn(),
  quitar: vi.fn(),
  vaciar: vi.fn(),
}

function renderDrawer() {
  return render(
    <TiendaCartDrawer
      abierto
      onCerrar={vi.fn()}
      onIrCheckout={vi.fn()}
      onIrCarritoCompleto={vi.fn()}
    />,
  )
}

describe('TiendaCartDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const operacion of Object.values(operaciones)) operacion.mockResolvedValue([])
    useCarrito.mockReturnValue({
      items: [item],
      cantidadTotal: 2,
      total: 2500,
      ...operaciones,
    })
  })

  afterEach(cleanup)

  it('muestra precio unitario, subtotal y total con el contrato del carrito', () => {
    renderDrawer()

    const drawer = screen.getByRole('dialog', { name: 'Carrito de compras' })
    const fila = within(drawer).getAllByText('Cemento')[0].closest('li')
    expect(fila).toHaveTextContent('1.250,00 c/u')
    expect(fila).toHaveTextContent('2.500,00')
    expect(within(drawer).getAllByText(/2\.500,00/)).toHaveLength(3)
    expect(within(drawer).queryByText(/NaN/)).not.toBeInTheDocument()
  })

  it('incrementa y disminuye con cantidades enteras', async () => {
    renderDrawer()

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Cemento' }))
    await waitFor(() => expect(operaciones.actualizar).toHaveBeenCalledWith('producto-1', 3))

    fireEvent.click(screen.getByRole('button', { name: 'Reducir cantidad de Cemento' }))
    await waitFor(() => expect(operaciones.actualizar).toHaveBeenCalledWith('producto-1', 1))
  })

  it('permite eliminar una línea y vaciar el carrito', async () => {
    renderDrawer()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Cemento del carrito' }))
    await waitFor(() => expect(operaciones.quitar).toHaveBeenCalledWith('producto-1'))

    fireEvent.click(screen.getByRole('button', { name: 'Vaciar' }))
    await waitFor(() => expect(operaciones.vaciar).toHaveBeenCalledTimes(1))
  })

  it('captura y muestra el error de una operación async', async () => {
    operaciones.actualizar.mockRejectedValue(new Error('No se pudo guardar el carrito'))
    renderDrawer()

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Cemento' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el carrito')
  })
})
