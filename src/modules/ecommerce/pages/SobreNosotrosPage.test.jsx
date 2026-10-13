import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SobreNosotrosPage from './SobreNosotrosPage'

describe('SobreNosotrosPage', () => {
  it('muestra información de contacto y el mapa de la sucursal en Salta', () => {
    render(<SobreNosotrosPage />)

    expect(screen.getByRole('heading', { name: 'Sobre nosotros' })).toBeInTheDocument()
    expect(screen.getByText('Caseros 850, Salta Capital, Salta')).toBeInTheDocument()
    expect(screen.getByTitle('Mapa de Corralón Norte en Salta')).toHaveAttribute(
      'src',
      expect.stringContaining('Salta'),
    )
    expect(screen.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps'),
    )
  })
})
