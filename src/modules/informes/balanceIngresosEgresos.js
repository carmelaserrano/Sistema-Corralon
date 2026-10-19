// Cálculos de la pantalla Informes → Balance: cruza las filas de
// informe_ingresos (0068) e informe_egresos (0069) para mostrar, por el
// mismo rango y agrupación, cuánto entró, cuánto salió y el resultado neto
// (ingreso - egreso). Sin dependencias de React ni de Supabase, para poder
// testearlos aparte. No modifica informeIngresos.js: ingresos y egresos
// siguen sin cambiar de comportamiento.
import {
  FUENTES,
  FUENTES_EGRESO,
  aISO,
  agruparPorPeriodo,
  agruparPorSucursal,
  deISO,
  variacion,
} from './informeIngresos'

const redondear = (n) => Math.round(n * 100) / 100

/** Fin de un período a partir de su inicio, réplica de informe_fin_periodo (0068). */
export function finDePeriodo(inicioIso, agrupacion) {
  const inicio = deISO(inicioIso)
  if (agrupacion === 'semana') {
    const fin = new Date(inicio)
    fin.setDate(fin.getDate() + 6)
    return aISO(fin)
  }
  if (agrupacion === 'mes') return aISO(new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0))
  return inicioIso
}

/**
 * Ingreso, egreso y resultado neto por período (unión de los períodos de
 * ambos datasets: puede haber un período con ingresos y sin egresos, o
 * viceversa).
 * @returns {Array<{inicio, fin, ingreso, egreso, resultado}>}
 */
export function combinarPorPeriodo(filasIngresos, filasEgresos, agrupacion) {
  const porIngreso = new Map(agruparPorPeriodo(filasIngresos).map((p) => [p.inicio, p]))
  const porEgreso = new Map(agruparPorPeriodo(filasEgresos).map((p) => [p.inicio, p]))
  const claves = [...new Set([...porIngreso.keys(), ...porEgreso.keys()])].sort((a, b) => a.localeCompare(b))

  return claves.map((inicio) => {
    const ingreso = porIngreso.get(inicio)?.total ?? 0
    const egreso = porEgreso.get(inicio)?.total ?? 0
    const fin = porIngreso.get(inicio)?.fin ?? porEgreso.get(inicio)?.fin ?? finDePeriodo(inicio, agrupacion)
    return { inicio, fin, ingreso: redondear(ingreso), egreso: redondear(egreso), resultado: redondear(ingreso - egreso) }
  })
}

/**
 * Resultado neto por período y sucursal, para el toggle "Comparar sucursales".
 * @returns {{sucursales: Array<{id, nombre}>, periodos: Array<{inicio, fin, porSucursal: Object<string, {ingreso, egreso, resultado}>}>}}
 */
export function combinarPorSucursal(filasIngresos, filasEgresos, agrupacion) {
  const ingresos = agruparPorSucursal(filasIngresos)
  const egresos = agruparPorSucursal(filasEgresos)

  const sucursalesPorId = new Map()
  for (const s of [...ingresos.sucursales, ...egresos.sucursales]) {
    if (!sucursalesPorId.has(s.id)) sucursalesPorId.set(s.id, s)
  }
  const sucursales = [...sucursalesPorId.values()].sort((a, b) =>
    a.id === 'sin-sucursal' ? 1 : b.id === 'sin-sucursal' ? -1 : a.nombre.localeCompare(b.nombre, 'es'))

  const porIngreso = new Map(ingresos.periodos.map((p) => [p.inicio, p]))
  const porEgreso = new Map(egresos.periodos.map((p) => [p.inicio, p]))
  const claves = [...new Set([...porIngreso.keys(), ...porEgreso.keys()])].sort((a, b) => a.localeCompare(b))

  const periodos = claves.map((inicio) => {
    const pIngreso = porIngreso.get(inicio)
    const pEgreso = porEgreso.get(inicio)
    const fin = pIngreso?.fin ?? pEgreso?.fin ?? finDePeriodo(inicio, agrupacion)
    const porSucursal = {}
    for (const s of sucursales) {
      const ingreso = pIngreso?.porSucursal[s.id] ?? 0
      const egreso = pEgreso?.porSucursal[s.id] ?? 0
      porSucursal[s.id] = { ingreso: redondear(ingreso), egreso: redondear(egreso), resultado: redondear(ingreso - egreso) }
    }
    return { inicio, fin, porSucursal }
  })

  return { sucursales, periodos }
}

/** Indicadores del modo Evolución: totales, resultado, promedio y mejor/peor período por resultado. */
export function indicadoresBalance(periodos) {
  if (!periodos.length) {
    return { totalIngreso: 0, totalEgreso: 0, resultado: 0, promedioResultado: 0, mejor: null, peor: null }
  }
  const totalIngreso = redondear(periodos.reduce((s, p) => s + p.ingreso, 0))
  const totalEgreso = redondear(periodos.reduce((s, p) => s + p.egreso, 0))
  const resultado = redondear(totalIngreso - totalEgreso)
  const mejor = periodos.reduce((m, p) => (p.resultado > m.resultado ? p : m), periodos[0])
  const peor = periodos.reduce((m, p) => (p.resultado < m.resultado ? p : m), periodos[0])
  return { totalIngreso, totalEgreso, resultado, promedioResultado: redondear(resultado / periodos.length), mejor, peor }
}

/**
 * Filas de la tabla del modo Comparar: total ingresos, total egresos,
 * resultado neto, promedio de resultado por día, cada fuente de ingreso,
 * cada fuente de egreso y el resultado neto por sucursal, con la diferencia
 * (B − A) y su variación. Mismo formato de fila que filasComparacion, para
 * reusar el render de tabla de Ingresos/Egresos.
 * @param {Object} totales
 * @param {ReturnType<import('./informeIngresos').totalesDe>} totales.totIngA
 * @param {ReturnType<import('./informeIngresos').totalesDe>} totales.totEgA
 * @param {ReturnType<import('./informeIngresos').totalesDe>} totales.totIngB
 * @param {ReturnType<import('./informeIngresos').totalesDe>} totales.totEgB
 */
export function filasComparacionBalance({ totIngA, totEgA, totIngB, totEgB }, diasA, diasB) {
  const fila = (concepto, grupo, a, b) => ({
    concepto, grupo, a: redondear(a), b: redondear(b), diferencia: redondear(b - a), variacion: variacion(a, b),
  })
  const claves = (...objetos) => [...new Set(objetos.flatMap((o) => Object.keys(o)))]
  const resultadoA = totIngA.total - totEgA.total
  const resultadoB = totIngB.total - totEgB.total

  const filas = [
    fila('Total ingresos', 'total', totIngA.total, totIngB.total),
    fila('Total egresos', 'total', totEgA.total, totEgB.total),
    fila('Resultado neto', 'total', resultadoA, resultadoB),
    fila('Promedio de resultado por día', 'total', diasA ? resultadoA / diasA : 0, diasB ? resultadoB / diasB : 0),
  ]
  for (const f of FUENTES) {
    filas.push(fila(f.label, 'Ingresos por fuente', totIngA.porFuente[f.id] ?? 0, totIngB.porFuente[f.id] ?? 0))
  }
  for (const f of FUENTES_EGRESO) {
    filas.push(fila(f.label, 'Egresos por fuente', totEgA.porFuente[f.id] ?? 0, totEgB.porFuente[f.id] ?? 0))
  }
  for (const s of claves(totIngA.porSucursal, totIngB.porSucursal, totEgA.porSucursal, totEgB.porSucursal)
    .sort((x, y) => x.localeCompare(y, 'es'))) {
    const a = (totIngA.porSucursal[s] ?? 0) - (totEgA.porSucursal[s] ?? 0)
    const b = (totIngB.porSucursal[s] ?? 0) - (totEgB.porSucursal[s] ?? 0)
    filas.push(fila(s, 'Resultado por sucursal', a, b))
  }
  return filas
}
