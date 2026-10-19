import { describe, expect, it } from 'vitest'
import {
  agruparPorPeriodo,
  agruparPorSucursal,
  diasDelRango,
  etiquetaPeriodo,
  etiquetaRango,
  FUENTES_EGRESO,
  filasComparacion,
  indicadores,
  rangoDeAtajo,
  rangoDeMes,
  rangoDeSemana,
  resumenFacturado,
  totalesDe,
  variacion,
} from './informeIngresos'

const fila = (inicio, fin, fuente, monto, sucursal = 'Sucursal Norte', medio = 'Efectivo', sucursalId = 'n') => ({
  periodo_inicio: inicio, periodo_fin: fin, fuente, monto, sucursal_nombre: sucursal, sucursal_id: sucursalId, medio_pago: medio,
})

describe('rangos', () => {
  const hoy = new Date(2026, 9, 16) // viernes 16/10/2026

  it('arma los atajos hasta hoy', () => {
    expect(rangoDeAtajo('este-mes', hoy)).toEqual({ desde: '2026-10-01', hasta: '2026-10-16', agrupacion: 'semana' })
    expect(rangoDeAtajo('ultimos-3-meses', hoy)).toEqual({ desde: '2026-08-01', hasta: '2026-10-16', agrupacion: 'mes' })
    expect(rangoDeAtajo('este-anio', hoy).desde).toBe('2026-01-01')
    // 8 semanas: arranca el lunes de hace 7 semanas.
    expect(rangoDeAtajo('ultimas-8-semanas', hoy).desde).toBe('2026-08-24')
  })

  it('calcula meses y semanas de lunes a domingo', () => {
    expect(rangoDeMes(2026, 1)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(rangoDeSemana(new Date(2026, 9, 11))).toEqual({ desde: '2026-10-05', hasta: '2026-10-11' })
    expect(rangoDeSemana(new Date(2026, 9, 12))).toEqual({ desde: '2026-10-12', hasta: '2026-10-18' })
  })

  it('cuenta los días incluidos', () => {
    expect(diasDelRango('2026-10-01', '2026-10-31')).toBe(31)
    expect(diasDelRango('2026-10-05', '2026-10-11')).toBe(7)
  })

  it('arma etiquetas legibles', () => {
    expect(etiquetaPeriodo('2026-10-01', '2026-10-31', 'mes')).toBe('oct 2026')
    expect(etiquetaPeriodo('2026-10-05', '2026-10-11', 'semana')).toBe('05/10 – 11/10')
    expect(etiquetaRango('2026-08-01', '2026-08-31')).toBe('agosto 2026')
    expect(etiquetaRango('2026-10-01', '2026-10-15')).toBe('01/10/2026 – 15/10/2026')
  })
})

describe('agrupaciones', () => {
  const filas = [
    fila('2026-10-01', '2026-10-31', 'mostrador', 1000),
    fila('2026-10-01', '2026-10-31', 'tienda', 500, 'Sucursal Sur', 'Pago online', 's'),
    fila('2026-09-01', '2026-09-30', 'mostrador', 200),
    fila('2026-10-01', '2026-10-31', 'cuenta_corriente', 300, 'Sin sucursal', 'Transferencia bancaria', null),
  ]

  it('agrupa por período en orden y desglosa por fuente', () => {
    const periodos = agruparPorPeriodo(filas)
    expect(periodos.map((p) => [p.inicio, p.total])).toEqual([['2026-09-01', 200], ['2026-10-01', 1800]])
    expect(periodos[1].porFuente).toEqual({ mostrador: 1000, tienda: 500, cuenta_corriente: 300 })
  })

  it('agrupa por sucursal con "Sin sucursal" al final', () => {
    const { sucursales, periodos } = agruparPorSucursal(filas)
    expect(sucursales.map((s) => s.nombre)).toEqual(['Sucursal Norte', 'Sucursal Sur', 'Sin sucursal'])
    expect(periodos[1].porSucursal).toEqual({ n: 1000, s: 500, 'sin-sucursal': 300 })
  })

  it('calcula total, promedio por período y el mejor período', () => {
    const k = indicadores(agruparPorPeriodo(filas))
    expect(k.total).toBe(2000)
    expect(k.promedio).toBe(1000)
    expect(k.mejor.inicio).toBe('2026-10-01')
    expect(indicadores([])).toEqual({ total: 0, promedio: 0, mejor: null })
  })

  it('resume lo facturado con el neto', () => {
    const resumen = resumenFacturado([
      { periodo_inicio: '2026-10-01', periodo_fin: '2026-10-31', tipo: 'factura', monto: 2500 },
      { periodo_inicio: '2026-10-01', periodo_fin: '2026-10-31', tipo: 'nota_credito', monto: 600 },
    ])
    expect(resumen).toEqual([{ inicio: '2026-10-01', fin: '2026-10-31', factura: 2500, nota_credito: 600, nota_debito: 0, neto: 1900 }])
  })
})

describe('comparación de períodos', () => {
  it('calcula la variación de B respecto de A', () => {
    expect(variacion(1000, 1250)).toBe(25)
    expect(variacion(1000, 500)).toBe(-50)
    expect(variacion(0, 500)).toBeNull()
  })

  it('arma total, promedio por día y desgloses lado a lado', () => {
    const a = totalesDe([fila('2026-08-01', '2026-08-31', 'mostrador', 3100)])
    const b = totalesDe([
      fila('2026-10-05', '2026-10-11', 'mostrador', 1400),
      fila('2026-10-05', '2026-10-11', 'tienda', 700, 'Sucursal Sur', 'Pago online', 's'),
    ])
    const filas = filasComparacion(a, b, 31, 7)
    expect(filas[0]).toMatchObject({ concepto: 'Total cobrado', a: 3100, b: 2100, diferencia: -1000 })
    // Promedio por día: 100/día contra 300/día → +200 %.
    expect(filas[1]).toMatchObject({ concepto: 'Promedio por día', a: 100, b: 300, variacion: 200 })
    expect(filas.find((f) => f.concepto === 'Tienda online')).toMatchObject({ a: 0, b: 700, variacion: null })
    expect(filas.find((f) => f.grupo === 'Por medio de pago' && f.concepto === 'Pago online').b).toBe(700)
    expect(filas.find((f) => f.grupo === 'Por sucursal' && f.concepto === 'Sucursal Sur').b).toBe(700)
  })

  it('arma la comparación de egresos con sus fuentes y la etiqueta del total', () => {
    const a = totalesDe([fila('2026-08-01', '2026-08-31', 'proveedores', 1000)])
    const b = totalesDe([
      fila('2026-10-01', '2026-10-31', 'proveedores', 1000),
      fila('2026-10-01', '2026-10-31', 'caja', 500),
    ])
    const filas = filasComparacion(a, b, 31, 31, { fuentes: FUENTES_EGRESO, etiquetaTotal: 'Total pagado' })
    expect(filas[0]).toMatchObject({ concepto: 'Total pagado', a: 1000, b: 1500, diferencia: 500, variacion: 50 })
    const porFuente = filas.filter((f) => f.grupo === 'Por fuente').map((f) => f.concepto)
    expect(porFuente).toEqual(['Pagos a proveedores', 'Egresos de caja'])
    expect(filas.find((f) => f.concepto === 'Egresos de caja')).toMatchObject({ a: 0, b: 500, variacion: null })
  })
})
