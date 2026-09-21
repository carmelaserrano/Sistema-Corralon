import '@testing-library/jest-dom'

import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RecepcionesPage from './RecepcionesPage'

import * as api from '../api/recepcionesApi'
import { getDepositos } from '../api/depositosApi'

vi.mock('../api/recepcionesApi', () => ({
  createRecepcion: vi.fn(),
  getRecepcionById: vi.fn(),
  getRecepciones: vi.fn(),
  getOrdenesRecepcion: vi.fn(),
  getDetalleOrdenRecepcion: vi.fn(),
  puedeRegistrarRecepciones: vi.fn(),
  errorCantidadRecepcion: vi.fn((item) => {
    const cantidad = Number(item?.cantidad)
    const pendiente = Number(item?.pendiente)

    if (!Number.isFinite(cantidad) || cantidad < 0) {
      return 'La cantidad debe ser mayor o igual a 0'
    }

    if (cantidad > pendiente) {
      return `Cantidad máxima admitida para Cemento: ${pendiente}`
    }

    return ''
  }),
}))

vi.mock('../api/depositosApi', () => ({
  getDepositos: vi.fn(),
}))

afterEach(cleanup)

beforeEach(() => {
  vi.resetAllMocks()

  api.puedeRegistrarRecepciones.mockResolvedValue(true)

  api.getOrdenesRecepcion.mockResolvedValue([
    {
      id: 'oc-1',
      numero: 7,
      estado: 'pendiente',
      deposito_destino_id: 'dep-1',
      proveedor: {
        razon_social: 'Proveedor',
      },
    },
  ])

  getDepositos.mockResolvedValue([
    {
      id: 'dep-1',
      nombre: 'Centro',
    },
    {
      id: 'dep-2',
      nombre: 'Norte',
    },
  ])

  api.getDetalleOrdenRecepcion.mockResolvedValue([
    {
      id: 'd-1',
      cantidad: 10,
      cantidad_recibida: 4,
      pendiente: 6,
      precio_unitario: 120,
      producto: {
        nombre: 'Cemento',
        sku: 'CEM',
      },
    },
  ])

  api.getRecepciones.mockResolvedValue({
    recepciones: [],
    page: 1,
    totalPaginas: 1,
  })

  api.createRecepcion.mockResolvedValue({
    numero: 23,
  })
})

async function seleccionar() {
  render(<RecepcionesPage />)

  fireEvent.change(
    await screen.findByLabelText('Orden de compra'),
    {
      target: {
        value: 'oc-1',
      },
    }
  )

  return screen.findByLabelText('Cantidad recibida de Cemento')
}

describe('RecepcionesPage', () => {
  it('precarga pendiente y depósito de OC, sin remito ni costo editable', async () => {
    const cantidad = await seleccionar()

    expect(cantidad).toHaveValue(6)
    expect(cantidad).toHaveAttribute('step', '1')

    expect(
      screen.getByLabelText('Depósito de destino')
    ).toHaveValue('dep-1')

    expect(
      screen.queryByLabelText(/remito/i)
    ).not.toBeInTheDocument()

    expect(
      screen.queryByLabelText(/costo/i)
    ).not.toBeInTheDocument()
  })

  it('confirma parcialmente en otro depósito y muestra el número', async () => {
    const cantidad = await seleccionar()

    fireEvent.change(cantidad, {
      target: {
        value: '2',
      },
    })

    fireEvent.change(
      screen.getByLabelText('Depósito de destino'),
      {
        target: {
          value: 'dep-2',
        },
      }
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirmar recepción',
      })
    )

    await screen.findByText(/Recepción N.º 23 confirmada/)

    expect(api.createRecepcion).toHaveBeenCalledWith(
      expect.objectContaining({
        orden_compra_id: 'oc-1',
        deposito_destino_id: 'dep-2',
        items: [
          expect.objectContaining({
            cantidad: '2',
            pendiente: 6,
          }),
        ],
      })
    )
  })

  it('muestra el máximo actualizado que rechaza la base y conserva la carga', async () => {
    await seleccionar()

    api.createRecepcion.mockRejectedValue(
      new Error('Cantidad máxima admitida para Cemento: 3')
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirmar recepción',
      })
    )

    expect(
      await screen.findByRole('alert')
    ).toHaveTextContent(
      'Cantidad máxima admitida para Cemento: 3'
    )

    expect(
      screen.getByLabelText('Cantidad recibida de Cemento')
    ).toHaveValue(6)
  })

  it('impide doble envío mientras confirma', async () => {
    await seleccionar()

    let resolver

    api.createRecepcion.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve
      })
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirmar recepción',
      })
    )

    expect(
      screen.getByRole('button', {
        name: 'Confirmando...',
      })
    ).toBeDisabled()

    expect(api.createRecepcion).toHaveBeenCalledTimes(1)

    resolver({
      numero: 24,
    })

    await screen.findByText(/Recepción N.º 24/)
  })

  it('muestra estado vacío sin órdenes', async () => {
    api.getOrdenesRecepcion.mockResolvedValue([])

    render(<RecepcionesPage />)

    expect(
      await screen.findByText(
        'No hay órdenes pendientes de recibir'
      )
    ).toBeInTheDocument()
  })

  it('oculta alta a quien no tiene permiso', async () => {
    api.puedeRegistrarRecepciones.mockResolvedValue(false)

    render(<RecepcionesPage />)

    await screen.findByText(
      'No tenés permiso para registrar recepciones.'
    )

    expect(
      screen.queryByRole('button', {
        name: 'Confirmar recepción',
      })
    ).not.toBeInTheDocument()
  })

  it('permite reintentar carga fallida', async () => {
    api.getOrdenesRecepcion.mockRejectedValueOnce(
      new Error('Sin conexión')
    )

    render(<RecepcionesPage />)

    expect(
      await screen.findByRole('alert')
    ).toHaveTextContent('Sin conexión')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Actualizar',
      })
    )

    await screen.findByLabelText('Orden de compra')
  })

  it('descarta respuestas tardías de otra selección', async () => {
    let resolver

    api.getDetalleOrdenRecepcion.mockReturnValueOnce(
      new Promise((resolve) => {
        resolver = resolve
      })
    )

    render(<RecepcionesPage />)

    const selector =
      await screen.findByLabelText('Orden de compra')

    fireEvent.change(selector, {
      target: {
        value: 'oc-1',
      },
    })

    fireEvent.change(selector, {
      target: {
        value: '',
      },
    })

    resolver([
      {
        id: 'tardio',
        pendiente: 4,
      },
    ])

    await waitFor(() => {
      expect(
        screen.queryByRole('spinbutton')
      ).not.toBeInTheDocument()
    })
  })

  it('avisa entrega parcial al escribir menos y permite confirmar sin otro paso', async () => {
    const cantidad = await seleccionar()

    expect(
      screen.getByRole('columnheader', {
        name: 'Cantidad esperada',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByRole('columnheader', {
        name: 'Cantidad recibida',
      })
    ).toBeInTheDocument()

    expect(
      screen.queryByText(/Los productos recibidos son menos/)
    ).not.toBeInTheDocument()

    fireEvent.change(cantidad, {
      target: {
        value: '5',
      },
    })

    expect(
      screen.getByText(/Los productos recibidos son menos/)
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: 'Confirmar recepción',
      })
    ).toBeEnabled()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirmar recepción',
      })
    )

    await screen.findByText(/Recepción N.º 23 confirmada/)

    expect(api.createRecepcion).toHaveBeenCalledTimes(1)
  })

  it('indica el máximo y bloquea el exceso antes de enviar; se recupera al corregirlo', async () => {
    const cantidad = await seleccionar()

    fireEvent.change(cantidad, {
      target: {
        value: '7',
      },
    })

    expect(
      screen.getByRole('alert')
    ).toHaveTextContent(
      'Cantidad máxima admitida para Cemento: 6'
    )

    expect(cantidad).toHaveAttribute(
      'aria-invalid',
      'true'
    )

    const confirmar = screen.getByRole('button', {
      name: 'Confirmar recepción',
    })

    expect(confirmar).toBeDisabled()

    fireEvent.click(confirmar)

    expect(api.createRecepcion).not.toHaveBeenCalled()

    fireEvent.change(cantidad, {
      target: {
        value: '6',
      },
    })

    expect(confirmar).toBeEnabled()

    expect(
      screen.queryByRole('alert')
    ).not.toBeInTheDocument()

    expect(
      screen.queryByText(/Los productos recibidos son menos/)
    ).not.toBeInTheDocument()
  })

  it('impide confirmar una recepción sin cantidades recibidas', async () => {
    const cantidad = await seleccionar()

    fireEvent.change(cantidad, {
      target: {
        value: '0',
      },
    })

    expect(
      screen.getByText(
        'Debe recibir al menos un producto para confirmar.'
      )
    ).toBeInTheDocument()

    const confirmar = screen.getByRole('button', {
      name: 'Confirmar recepción',
    })

    expect(confirmar).toBeDisabled()

    expect(api.createRecepcion).not.toHaveBeenCalled()
  })

  function prepararDetalle() {
    const rec = {
      id: 'rec-1',
      numero: 23,
      orden_compra_id: 'oc-1',
      orden: {
        numero: 7,
        estado: 'parcialmente_recibida',
        proveedor: {
          razon_social: 'Proveedor',
        },
      },
      destino: {
        nombre: 'Centro',
      },
      confirmado_at: '2026-09-09T12:00:00Z',
      confirmado_by: 'usuario-qa',
      observaciones: 'Entrega de prueba',
      detalle: [
        {
          id: 'dr-1',
          cantidad: 4,
          costo_unitario: 120,
          producto: {
            sku: 'CEM',
            nombre: 'Cemento',
          },
        },
      ],
    }

    api.getRecepciones.mockResolvedValue({
      recepciones: [rec],
      page: 1,
      totalPaginas: 1,
    })

    api.getRecepcionById.mockResolvedValue(rec)
  }

  it('abre detalle de recepción y distingue lo recibido del saldo actual de la OC', async () => {
    prepararDetalle()

    render(<RecepcionesPage />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Ver detalle',
      })
    )

    await screen.findByRole('heading', {
      name: 'Detalle de recepción N.º 23',
    })

    expect(
      screen.getByRole('heading', {
        name: 'Artículos recibidos en esta recepción',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByRole('heading', {
        name: 'Seguimiento actual de la orden de compra',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByText('Parcial', {
        exact: true,
      })
    ).toBeInTheDocument()

    expect(
      screen.getByText('Entrega de prueba')
    ).toBeInTheDocument()

    expect(
      screen.getByRole('columnheader', {
        name: 'Pendiente de recibir',
      })
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('button', {
        name: /editar|eliminar/i,
      })
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Volver a recepciones',
      })
    )

    expect(
      screen.getByRole('heading', {
        name: 'Recepciones confirmadas',
      })
    ).toBeInTheDocument()
  })

  it('muestra error y permite reintentar la consulta del detalle', async () => {
    prepararDetalle()

    api.getRecepcionById.mockRejectedValueOnce(
      new Error('No se pudo leer la recepción')
    )

    render(<RecepcionesPage />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Ver detalle',
      })
    )

    expect(
      await screen.findByRole('alert')
    ).toHaveTextContent(
      'No se pudo leer la recepción'
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reintentar',
      })
    )

    await screen.findByRole('heading', {
      name: 'Detalle de recepción N.º 23',
    })
  })
})