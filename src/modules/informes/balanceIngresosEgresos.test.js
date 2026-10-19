import { describe, expect, it } from 'vitest'
import { totalesDe } from './informeIngresos'
import {
  combinarPorPeriodo,
  combinarPorSucursal,
  filasComparacionBalance,
  finDePeriodo,
  indicadoresBalance,
} from './balanceIngresosEgresos'

const fila = (inicio, fin, fuente, monto, sucursal = 'Sucursal Norte', medio = 'Efectivo', sucursalId = 'n') => ({
  periodo_inicio: inicio, periodo_fin: fin, fuente, monto, sucursal_nombre: sucursal, sucursal_id: sucursalId, medio_pago: medio,
})

describe('finDePeriodo', () => {
  it('calcula el fin de semana, de mes, y devuelve el mismo día para "total"', () => {
    expect(finDePeriodo('2026-10-05', 'semana')).toBe('2026-10-11')
    expect(finDePeriodo('2026-10-01', 'mes')).toBe('2026-10-31')
    expect(finDePeriodo('2026-02-01', 'mes')).toBe('2026-02-28')
    expect(finDePeriodo('2026-10-15', 'total')).toBe('2026-10-15')
  })
})

describe('combinarPorPeriodo', () => {
  const filasIngresos = [
    fila('2026-10-01', '2026-10-31', 'mostrador', 1000),
    fila('2026-09-01', '2026-09-30', 'mostrador', 200),
  ]
  const filasEgresos = [
    fila('2026-10-01', '2026-10-31', 'proveedores', 300),
    fila('2026-11-01', '2026-11-30', 'caja', 150),
  ]

  it('une los períodos de ambos datasets y calcula el resultado neto', () => {
    const periodos = combinarPorPeriodo(filasIngresos, filasEgresos, 'mes')
    expect(periodos).toEqual([
      { inicio: '2026-09-01', fin: '2026-09-30', ingreso: 200, egreso: 0, resultado: 200 },
      { inicio: '2026-10-01', fin: '2026-10-31', ingreso: 1000, egreso: 300, resultado: 700 },
      { inicio: '2026-11-01', fin: '2026-11-30', ingreso: 0, egreso: 150, resultado: -150 },
    ])
  })

  it('devuelve vacío cuando no hay filas de ningún lado', () => {
    expect(combinarPorPeriodo([], [], 'mes')).toEqual([])
  })
})

describe('combinarPorSucursal', () => {
  const filasIngresos = [
    fila('2026-10-01', '2026-10-31', 'mostrador', 1000, 'Sucursal Norte', 'Efectivo', 'n'),
    fila('2026-10-01', '2026-10-31', 'tienda', 500, 'Sucursal Sur', 'Pago online', 's'),
  ]
  const filasEgresos = [
    fila('2026-10-01', '2026-10-31', 'caja', 300, 'Sucursal Norte', 'Efectivo', 'n'),
    fila('2026-10-01', '2026-10-31', 'proveedores', 200, 'Sin sucursal', 'Transferencia bancaria', null),
  ]

  it('agrupa el resultado neto por sucursal y período, con "Sin sucursal" al final', () => {
    const { sucursales, periodos } = combinarPorSucursal(filasIngresos, filasEgresos, 'mes')
    expect(sucursales.map((s) => s.nombre)).toEqual(['Sucursal Norte', 'Sucursal Sur', 'Sin sucursal'])
    expect(periodos).toHaveLength(1)
    expect(periodos[0].porSucursal).toEqual({
      n: { ingreso: 1000, egreso: 300, resultado: 700 },
      s: { ingreso: 500, egreso: 0, resultado: 500 },
      'sin-sucursal': { ingreso: 0, egreso: 200, resultado: -200 },
    })
  })
})

describe('indicadoresBalance', () => {
  it('calcula totales, resultado, promedio y el mejor/peor período', () => {
    const periodos = [
      { inicio: '2026-09-01', fin: '2026-09-30', ingreso: 200, egreso: 0, resultado: 200 },
      { inicio: '2026-10-01', fin: '2026-10-31', ingreso: 1000, egreso: 300, resultado: 700 },
      { inicio: '2026-11-01', fin: '2026-11-30', ingreso: 0, egreso: 150, resultado: -150 },
    ]
    const k = indicadoresBalance(periodos)
    expect(k.totalIngreso).toBe(1200)
    expect(k.totalEgreso).toBe(450)
    expect(k.resultado).toBe(750)
    expect(k.promedioResultado).toBe(250)
    expect(k.mejor.inicio).toBe('2026-10-01')
    expect(k.peor.inicio).toBe('2026-11-01')
  })

  it('devuelve ceros con un array vacío', () => {
    expect(indicadoresBalance([])).toEqual({ totalIngreso: 0, totalEgreso: 0, resultado: 0, promedioResultado: 0, mejor: null, peor: null })
  })
})

describe('filasComparacionBalance', () => {
  const totIngA = totalesDe([fila('2026-08-01', '2026-08-31', 'mostrador', 3000)])
  const totEgA = totalesDe([fila('2026-08-01', '2026-08-31', 'proveedores', 1000)])
  const totIngB = totalesDe([
    fila('2026-10-05', '2026-10-11', 'mostrador', 1400),
    fila('2026-10-05', '2026-10-11', 'tienda', 700, 'Sucursal Sur', 'Pago online', 's'),
  ])
  const totEgB = totalesDe([fila('2026-10-05', '2026-10-11', 'caja', 300, 'Sucursal Sur', 'Efectivo', 's')])
  const filas = filasComparacionBalance({ totIngA, totEgA, totIngB, totEgB }, 20, 9)

  it('arma el total de ingresos, egresos, resultado y promedio de resultado por día', () => {
    expect(filas[0]).toMatchObject({ concepto: 'Total ingresos', grupo: 'total', a: 3000, b: 2100, diferencia: -900 })
    expect(filas[1]).toMatchObject({ concepto: 'Total egresos', grupo: 'total', a: 1000, b: 300, diferencia: -700 })
    expect(filas[2]).toMatchObject({ concepto: 'Resultado neto', grupo: 'total', a: 2000, b: 1800, diferencia: -200, variacion: -10 })
    // Resultado por día: A = 2000/20 = 100; B = 1800/9 = 200.
    expect(filas[3]).toMatchObject({ concepto: 'Promedio de resultado por día', a: 100, b: 200, variacion: 100 })
  })

  it('desglosa por fuente de ingreso y de egreso', () => {
    const porFuenteIngreso = filas.filter((f) => f.grupo === 'Ingresos por fuente')
    expect(porFuenteIngreso.map((f) => f.concepto)).toEqual(['Mostrador', 'Cobranzas cta. cte.', 'Tienda online', 'Ingresos de caja'])
    expect(porFuenteIngreso.find((f) => f.concepto === 'Mostrador')).toMatchObject({ a: 3000, b: 1400, diferencia: -1600 })
    expect(porFuenteIngreso.find((f) => f.concepto === 'Tienda online')).toMatchObject({ a: 0, b: 700, variacion: null })

    const porFuenteEgreso = filas.filter((f) => f.grupo === 'Egresos por fuente')
    expect(porFuenteEgreso.map((f) => f.concepto)).toEqual(['Pagos a proveedores', 'Egresos de caja'])
    expect(porFuenteEgreso.find((f) => f.concepto === 'Pagos a proveedores')).toMatchObject({ a: 1000, b: 0, diferencia: -1000 })
    expect(porFuenteEgreso.find((f) => f.concepto === 'Egresos de caja')).toMatchObject({ a: 0, b: 300, variacion: null })
  })

  it('calcula el resultado neto por sucursal, unión de ambos lados', () => {
    const porSucursal = filas.filter((f) => f.grupo === 'Resultado por sucursal')
    expect(porSucursal.map((f) => f.concepto)).toEqual(['Sucursal Norte', 'Sucursal Sur'])
    // Norte: A = 3000 - 1000 = 2000; B = 1400 - 0 = 1400.
    expect(porSucursal.find((f) => f.concepto === 'Sucursal Norte')).toMatchObject({ a: 2000, b: 1400, diferencia: -600 })
    // Sur: A = 0 - 0 = 0; B = 700 - 300 = 400.
    expect(porSucursal.find((f) => f.concepto === 'Sucursal Sur')).toMatchObject({ a: 0, b: 400, variacion: null })
  })
})
