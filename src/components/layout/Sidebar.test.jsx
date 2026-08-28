import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'

function renderSidebar(overrides = {}) {
  const props = {
    activePage: 'stock',
    isOpen: false,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<Sidebar {...props} />) }
}

describe('Sidebar', () => {
  it('agrupa todas las opciones de navegación', () => {
    renderSidebar()

    expect(screen.getByText('Operación')).toBeInTheDocument()
    expect(screen.getByText('Catálogos')).toBeInTheDocument()
    expect(screen.getByText('Control')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stock' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reportes' })).toBeInTheDocument()
  })

  it('marca la página activa y agrupa el historial con Movimientos', () => {
    renderSidebar({ activePage: 'historial-movimientos' })

    expect(screen.getByRole('button', { name: 'Movimientos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('navega y cierra el drawer al seleccionar una opción', () => {
    const { props } = renderSidebar({ isOpen: true })

    fireEvent.click(screen.getByRole('button', { name: 'Artículos' }))

    expect(props.onNavigate).toHaveBeenCalledWith('articulos')
    expect(props.onClose).toHaveBeenCalled()
  })

  it('expone la apertura móvil y permite cerrarla', () => {
    const { props, container } = renderSidebar({ isOpen: true })

    expect(container.querySelector('.sidebar')).toHaveClass('is-open')
    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar menú' })[0])
    expect(props.onClose).toHaveBeenCalled()
  })
})
