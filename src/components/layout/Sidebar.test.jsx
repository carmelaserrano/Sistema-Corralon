import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'
import { navigationGroups, pageModules } from './navigation'

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

// El título de cada sección es el botón que tiene aria-expanded.
function seccion(nombre) {
  return screen
    .getAllByRole('button', { name: nombre })
    .find((boton) => boton.hasAttribute('aria-expanded'))
}

function grupo(nombre) {
  return seccion(nombre).closest('.nav-group')
}

beforeEach(() => {
  localStorage.clear()
})

describe('Sidebar', () => {
  it('CORR-03: mantiene el acceso a Movimientos sin un menú de pendientes', () => {
    const { props } = renderSidebar()

    expect(screen.queryByRole('button', { name: /pendientes?/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /pendientes?/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Movimientos' }))
    expect(props.onNavigate).toHaveBeenCalledWith('movimientos')
  })

  it('muestra las siete secciones y abre solo la de la página actual', () => {
    renderSidebar({ activePage: 'ventas' })

    const titulos = navigationGroups.map((g) => g.label)
    expect(titulos).toEqual([
      'Stock',
      'Artículos',
      'Control y ajustes',
      'Compras',
      'Clientes',
      'Ventas',
      'E-commerce',
    ])
    for (const titulo of titulos) {
      expect(seccion(titulo)).toHaveAttribute(
        'aria-expanded',
        titulo === 'Ventas' ? 'true' : 'false',
      )
    }
    expect(screen.getByRole('button', { name: 'Nueva venta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Proveedores' })).not.toBeInTheDocument()
  })

  it('despliega y pliega una sección y cierra la anterior', () => {
    renderSidebar({ activePage: 'stock' })

    fireEvent.click(seccion('Compras'))
    expect(seccion('Compras')).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(grupo('Compras')).getAllByRole('button').map((b) => b.textContent),
    ).toEqual([
      'Compras',
      'Proveedores',
      'Rubros',
      'Órdenes de Compra',
      'Recepciones',
      'Notas de Crédito/Débito',
      'Facturas de Proveedor',
      'Órdenes de Pago',
    ])
    expect(seccion('Stock')).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(seccion('Compras'))
    expect(seccion('Compras')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Rubros' })).not.toBeInTheDocument()
  })

  it('al remontar abre solo la sección de la página activa', () => {
    const { unmount } = renderSidebar({ activePage: 'stock' })
    fireEvent.click(seccion('Clientes'))
    unmount()

    const { container } = renderSidebar({ activePage: 'stock' })
    expect(seccion('Clientes')).toHaveAttribute('aria-expanded', 'false')
    expect(seccion('Stock')).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('corralon.sidebar.secciones-abiertas'))).toBe('stock')
  })

  it('abre la sección de la página activa aunque estuviera cerrada', () => {
    const { rerender, props, container } = renderSidebar({ activePage: 'stock' })
    expect(seccion('Ventas')).toHaveAttribute('aria-expanded', 'false')

    rerender(<Sidebar {...props} activePage="descuentos" />)

    expect(seccion('Ventas')).toHaveAttribute('aria-expanded', 'true')
    expect(seccion('Stock')).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(1)
    expect(container.querySelectorAll('.nav-group-panel[aria-hidden="false"]')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('corralon.sidebar.secciones-abiertas'))).toBe('ventas')
    expect(grupo('Ventas')).toHaveClass('has-active')
    expect(screen.getByRole('button', { name: 'Descuentos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('nunca abre más de una sección al alternarlas', () => {
    const { container } = renderSidebar()
    for (const { label } of navigationGroups) {
      fireEvent.click(seccion(label))
      expect(container.querySelectorAll('[aria-expanded="true"]').length).toBeLessThanOrEqual(1)
      fireEvent.click(seccion(label))
      expect(container.querySelectorAll('[aria-expanded="true"]').length).toBeLessThanOrEqual(1)
    }
  })

  it('mantiene los paneles montados para animar el cierre y bloquea los cerrados', () => {
    const { container } = renderSidebar()
    const stock = container.querySelector('#nav-seccion-stock')
    const articulos = container.querySelector('#nav-seccion-articulos')
    fireEvent.click(seccion('Artículos'))
    expect(container.querySelector('#nav-seccion-stock')).toBe(stock)
    expect(stock).toHaveAttribute('aria-hidden', 'true')
    expect(stock).toHaveAttribute('inert')
    expect(articulos).toHaveAttribute('aria-hidden', 'false')
    expect(articulos).not.toHaveAttribute('inert')
    expect(screen.queryByRole('button', { name: 'Movimientos' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('.nav-group-panel')).toHaveLength(navigationGroups.length)
  })

  it('mantiene una sola sección accesible al cambiar rápido en mobile y navegar', () => {
    const { container, props, rerender } = renderSidebar({ isOpen: true })
    for (const titulo of ['Artículos', 'Control y ajustes', 'Stock', 'Compras']) {
      fireEvent.click(seccion(titulo))
      expect(container.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(1)
      expect(container.querySelectorAll('.nav-group-panel:not([inert])')).toHaveLength(1)
    }
    rerender(<Sidebar {...props} activePage="descuentos" />)
    expect(seccion('Ventas')).toHaveAttribute('aria-expanded', 'true')
    expect(seccion('Compras')).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelectorAll('.nav-group-panel:not([inert])')).toHaveLength(1)
    expect(container.querySelector('.sidebar')).toHaveClass('is-open')
  })

  it('normaliza varias secciones guardadas y abre la página activa', () => {
    localStorage.setItem('corralon.sidebar.secciones-abiertas', JSON.stringify(
      navigationGroups.map(({ id }) => id),
    ))
    const { container } = renderSidebar({ activePage: 'ventas' })
    expect(seccion('Ventas')).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('corralon.sidebar.secciones-abiertas'))).toBe('ventas')
  })

  it('cierra Stock al abrir Artículos y cierra Artículos al abrir Control y ajustes', () => {
    const { container } = renderSidebar()
    for (const titulo of ['Stock', 'Artículos', 'Control y ajustes']) {
      if (titulo !== 'Stock') fireEvent.click(seccion(titulo))
      expect(container.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(1)
      expect(container.querySelectorAll('.nav-group-panel[aria-hidden="false"]')).toHaveLength(1)
      for (const { label } of navigationGroups) {
        expect(seccion(label)).toHaveAttribute('aria-expanded', label === titulo ? 'true' : 'false')
      }
    }
  })

  it('normaliza datos viejos a un único id y lo conserva al recargar sin sección activa', () => {
    localStorage.setItem('corralon.sidebar.secciones-abiertas', JSON.stringify(
      ['inexistente', 'articulos', 'stock', 'control'],
    ))
    const primera = renderSidebar({ activePage: 'inicio' })
    expect(seccion('Artículos')).toHaveAttribute('aria-expanded', 'true')
    expect(primera.container.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('corralon.sidebar.secciones-abiertas'))).toBe('articulos')
    primera.unmount()
    const segunda = renderSidebar({ activePage: 'inicio' })
    expect(seccion('Artículos')).toHaveAttribute('aria-expanded', 'true')
    expect(segunda.container.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(1)
  })

  it('restaura una sección guardada si la página no tiene sección', () => {
    const { unmount } = renderSidebar({ activePage: 'inicio' })
    fireEvent.click(seccion('Clientes'))
    unmount()
    const { container } = renderSidebar({ activePage: 'inicio' })
    expect(seccion('Clientes')).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1)
  })

  it('marca la página activa y agrupa el historial con Movimientos', () => {
    renderSidebar({ activePage: 'historial-movimientos' })

    expect(screen.getByRole('button', { name: 'Movimientos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(grupo('Stock')).toHaveClass('has-active')
  })

  it('navega y cierra el drawer al seleccionar una opción', () => {
    const { props } = renderSidebar({ isOpen: true })

    fireEvent.click(seccion('Artículos'))
    fireEvent.click(within(grupo('Artículos')).getByRole('button', { name: 'Marcas' }))

    expect(props.onNavigate).toHaveBeenCalledWith('marcas')
    expect(props.onClose).toHaveBeenCalled()
  })

  it('abre la tienda en una pestaña nueva sin reemplazar la navegación del backoffice', () => {
    const { props } = renderSidebar({ isOpen: true })
    fireEvent.click(seccion('E-commerce'))
    const opciones = Array.from(grupo('E-commerce').querySelectorAll('.nav-item'))
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

  it('conserva el módulo del encabezado de las pantallas que cambiaron de sección', () => {
    expect(pageModules.recepciones).toBe('Compras')
    expect(pageModules.proveedores).toBe('Proveedores')
    expect(pageModules['ordenes-pago']).toBe('Tesorería')
    expect(pageModules['alertas-stock']).toBe('Stock')
    expect(pageModules['historial-movimientos']).toBe('Stock')
  })

  it('expone la apertura móvil y permite cerrarla', () => {
    const { props, container } = renderSidebar({ isOpen: true })

    expect(container.querySelector('.sidebar')).toHaveClass('is-open')
    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar menú' })[0])
    expect(props.onClose).toHaveBeenCalled()
  })
})
