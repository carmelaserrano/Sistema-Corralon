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
  it('CORR-03: mantiene el acceso a Movimientos sin un menú de pendientes', () => {
    const { props } = renderSidebar()

    expect(screen.queryByRole('button', { name: /pendientes?/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /pendientes?/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Movimientos' }))
    expect(props.onNavigate).toHaveBeenCalledWith('movimientos')
  })

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

  it('abre la tienda en una pestaña nueva sin reemplazar la navegación del backoffice', () => {
    const { props } = renderSidebar({ isOpen: true })
    const grupoEcommerce = screen.getByText('E-commerce').closest('.nav-group')
    const opciones = Array.from(grupoEcommerce.querySelectorAll('.nav-item'))
    const enlaceTienda = screen.getByRole('link', { name: 'Ver tienda' })

    // El badge (p. ej. «Web») no forma parte del nombre de la opción.
    expect(opciones.map((opcion) => opcion.querySelector('span:not(.nav-badge)').textContent)).toEqual([
      'Ver tienda',
      'Publicación web',
      'Pedidos web',
    ])
    expect(enlaceTienda).toHaveAttribute('href', '/tienda')
    expect(enlaceTienda).toHaveAttribute('target', '_blank')
    expect(enlaceTienda).toHaveAttribute('rel', 'noopener noreferrer')

    fireEvent.click(enlaceTienda)

    expect(props.onNavigate).not.toHaveBeenCalled()
    expect(props.onClose).toHaveBeenCalled()
  })

  it('expone la apertura móvil y permite cerrarla', () => {
    const { props, container } = renderSidebar({ isOpen: true })

    expect(container.querySelector('.sidebar')).toHaveClass('is-open')
    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar menú' })[0])
    expect(props.onClose).toHaveBeenCalled()
  })
})
