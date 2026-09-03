import { describe, expect, it } from 'vitest'
import { cuitEsValido, formatearCuit, limpiarCuit } from './cuit'

describe('limpiarCuit', () => {
  it('deja solo los dígitos', () => {
    expect(limpiarCuit('20-12345678-6')).toBe('20123456786')
  })

  it('trunca a 11 dígitos', () => {
    expect(limpiarCuit('201234567869999')).toBe('20123456786')
  })

  it('tolera undefined', () => {
    expect(limpiarCuit(undefined)).toBe('')
  })
})

describe('formatearCuit', () => {
  it('arma XX-XXXXXXXX-X con 11 dígitos', () => {
    expect(formatearCuit('20123456786')).toBe('20-12345678-6')
  })

  it('no guiona mientras el CUIT está incompleto', () => {
    expect(formatearCuit('2012345')).toBe('2012345')
  })

  it('formatea aunque el valor ya tenga guiones', () => {
    expect(formatearCuit('20-12345678-6')).toBe('20-12345678-6')
  })
})

describe('cuitEsValido', () => {
  // CUITs con dígito verificador válido (módulo 11), calculado a mano.
  it.each(['20123456786', '27289132266', '30500000011'])(
    'acepta un CUIT con dígito verificador correcto (%s)',
    (cuit) => {
      expect(cuitEsValido(cuit)).toBe(true)
    },
  )

  it('acepta el mismo CUIT formateado con guiones', () => {
    expect(cuitEsValido('20-12345678-6')).toBe(true)
  })

  it('rechaza un dígito verificador incorrecto', () => {
    expect(cuitEsValido('20123456780')).toBe(false)
  })

  it('rechaza menos de 11 dígitos', () => {
    expect(cuitEsValido('2012345678')).toBe(false)
  })

  it('rechaza vacío', () => {
    expect(cuitEsValido('')).toBe(false)
  })
})
