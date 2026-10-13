import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from './AppShell'

function renderAppShell() {
  return render(
    <AppShell
      activePage="stock"
      email="usuario@test.com"
      onNavigate={vi.fn()}
      onSignOut={vi.fn()}
    >
      <div>Pantalla de prueba</div>
    </AppShell>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

describe('AppShell', () => {
  it('oculta y vuelve a mostrar la barra lateral guardando la preferencia', () => {
    const { container } = renderAppShell()

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar barra lateral' }))

    expect(container.querySelector('.app-shell')).toHaveClass('is-sidebar-collapsed')
    expect(screen.getByRole('button', { name: 'Mostrar barra lateral' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(localStorage.getItem('corralon.sidebar.oculta')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar barra lateral' }))

    expect(container.querySelector('.app-shell')).not.toHaveClass('is-sidebar-collapsed')
    expect(localStorage.getItem('corralon.sidebar.oculta')).toBe('false')
  })

  it('restaura la barra lateral oculta al montar nuevamente', () => {
    localStorage.setItem('corralon.sidebar.oculta', 'true')

    const { container } = renderAppShell()

    expect(container.querySelector('.app-shell')).toHaveClass('is-sidebar-collapsed')
    expect(screen.getByRole('button', { name: 'Mostrar barra lateral' })).toBeInTheDocument()
  })
})
