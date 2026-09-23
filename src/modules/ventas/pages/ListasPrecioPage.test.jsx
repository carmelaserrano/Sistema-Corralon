import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ListasPrecioPage from './ListasPrecioPage'
import {
  listarListasPrecio,
  listarProductosConPrecio,
  listarTiposCliente,
  puedeGestionarPrecios,
} from '../api/preciosApi'

vi.mock('../api/preciosApi', () => ({
  asignarListaATipo: vi.fn(),
  crearListaPrecio: vi.fn(),
  desactivarListaPrecio: vi.fn(),
  editarListaPrecio: vi.fn(),
  guardarPrecio: vi.fn(),
  listarListasPrecio: vi.fn(),
  listarProductosConPrecio: vi.fn(),
  listarTiposCliente: vi.fn(),
  puedeGestionarPrecios: vi.fn(),
}))

describe('ListasPrecioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarListasPrecio.mockResolvedValue([
      {
        id: 'lista-1',
        nombre: 'General',
        activo: true,
        created_at: '2026-09-01T10:00:00Z',
      },
    ])
    listarTiposCliente.mockResolvedValue([
      {
        id: 'tipo-1',
        nombre: 'Consumidor final',
        lista_precio_id: 'lista-1',
        activo: true,
      },
    ])
    listarProductosConPrecio.mockResolvedValue([
      { id: 'p1', sku: 'CEM-01', nombre: 'Cemento', precio: null },
    ])
  })

  it('mantiene la consulta y oculta todas las mutaciones sin permiso', async () => {
    puedeGestionarPrecios.mockResolvedValue(false)
    render(<ListasPrecioPage />)

    expect(await screen.findByText(/Modo solo lectura/)).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Precios de General' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Sin precio')).toBeInTheDocument()
    expect(screen.getByText('Consumidor final')).toBeInTheDocument()

    expect(screen.queryByRole('heading', { name: 'Nueva lista' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar precio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar asignación' })).not.toBeInTheDocument()

    const filaProducto = screen.getByText('Cemento').closest('tr')
    expect(within(filaProducto).queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
