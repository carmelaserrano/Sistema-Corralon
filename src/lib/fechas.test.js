import { describe, expect, it } from 'vitest'
import { formatearFechaHora } from './fechas'

// Construidas con la hora local para que el test no dependa del huso horario.
const medianoche = new Date(2026, 9, 16, 0, 10, 31)
const mediodia = new Date(2026, 9, 16, 12, 10, 31)
const tarde = new Date(2026, 9, 16, 15, 10, 31)

describe('formatearFechaHora', () => {
  it('distingue medianoche de mediodía con reloj de 24 horas', () => {
    expect(formatearFechaHora(medianoche)).toBe('16/10/2026, 00:10:31')
    expect(formatearFechaHora(mediodia)).toBe('16/10/2026, 12:10:31')
  })

  it('muestra las horas de la tarde como 13–23', () => {
    expect(formatearFechaHora(tarde)).toBe('16/10/2026, 15:10:31')
  })

  it('acepta una fecha ISO', () => {
    expect(formatearFechaHora(tarde.toISOString())).toBe('16/10/2026, 15:10:31')
  })
})
