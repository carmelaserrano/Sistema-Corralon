import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import GraficoBarras from './GraficoBarras'

afterEach(cleanup)

const series = [
  { id: 'norte', label: 'Norte', color: '#2a78d6' },
  { id: 'sin', label: 'Sin sucursal', color: '#eb6834' },
]

function dibujar(valores, modo = 'agrupado') {
  const { container } = render(
    <GraficoBarras
      categorias={[{ id: 'oct', label: 'oct 2026' }]}
      series={series}
      valor={(c, s) => valores[s]}
      modo={modo}
      formato={String}
      titulo="Resultado por sucursal"
    />,
  )
  const barras = Object.fromEntries([...container.querySelectorAll('path')].map((p) => [p.getAttribute('fill'), p.getAttribute('d')]))
  const base = container.querySelector('.grafico-base')
  const ejes = [...container.querySelectorAll('.grafico-eje')].map((t) => t.textContent)
  return { barras, ceroY: Number(base.getAttribute('y1')), ejes }
}

// Mayor y menor coordenada vertical de una ruta SVG.
function extremosY(ruta) {
  const ys = [...ruta.matchAll(/-?[\d.]+,(-?[\d.]+)/g)].map((m) => Number(m[1]))
  return { arriba: Math.min(...ys), abajo: Math.max(...ys) }
}

describe('GraficoBarras', () => {
  it('dibuja las barras negativas hacia abajo del cero', () => {
    const { barras, ceroY, ejes } = dibujar({ norte: 5000, sin: -80000 })

    expect(barras['#2a78d6']).not.toBe('')
    expect(barras['#eb6834']).not.toBe('')
    expect(extremosY(barras['#2a78d6']).abajo).toBeCloseTo(ceroY)
    expect(extremosY(barras['#eb6834']).arriba).toBeCloseTo(ceroY)
    expect(extremosY(barras['#eb6834']).abajo).toBeGreaterThan(ceroY)
    // El eje incluye montos negativos.
    expect(ejes).toContain('-$ 100 k')
  })

  it('sin negativos, el cero queda abajo y el eje va de 0 al tope en cuartos', () => {
    const { ceroY, ejes } = dibujar({ norte: 5000, sin: 3000 })
    expect(ceroY).toBe(240)
    expect(ejes.slice(0, 5)).toEqual(['$ 0', '$ 1,3 k', '$ 2,5 k', '$ 3,8 k', '$ 5 k'])
  })
})
