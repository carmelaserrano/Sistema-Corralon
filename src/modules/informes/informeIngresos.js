// Cálculos de la pantalla Informes → Ingresos sobre las filas que devuelve
// informe_ingresos (0068): {periodo_inicio, periodo_fin, sucursal_id,
// sucursal_nombre, fuente, medio_pago, monto}. Sin dependencias de React ni
// de Supabase, para poder testearlos aparte.

// Paleta categórica validada (dataviz, orden fijo: azul, naranja, aguamarina,
// amarillo, magenta…). El color sigue a la serie, nunca a su posición en el
// ranking. Aguamarina y amarillo tienen poco contraste sobre blanco: por eso
// la pantalla siempre muestra la leyenda con nombres y la tabla de detalle.
export const COLORES_SERIE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

// Orden fijo de las fuentes = orden de los colores del gráfico.
export const FUENTES = [
  { id: 'mostrador', label: 'Mostrador' },
  { id: 'cuenta_corriente', label: 'Cobranzas cta. cte.' },
  { id: 'tienda', label: 'Tienda online' },
  { id: 'caja_manual', label: 'Ingresos de caja' },
]

export const ETIQUETA_FUENTE = Object.fromEntries(FUENTES.map((f) => [f.id, f.label]))

// Fuentes del informe de egresos (informe_egresos, 0069).
export const FUENTES_EGRESO = [
  { id: 'proveedores', label: 'Pagos a proveedores' },
  { id: 'caja', label: 'Egresos de caja' },
]

export const ETIQUETA_FUENTE_EGRESO = Object.fromEntries(FUENTES_EGRESO.map((f) => [f.id, f.label]))

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Date local → 'AAAA-MM-DD' (sin pasar por UTC). */
export function aISO(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

/** 'AAAA-MM-DD' → Date local a medianoche. */
export function deISO(iso) {
  const [anio, mes, dia] = iso.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

/** Lunes de la semana de una fecha. */
export function lunesDe(fecha) {
  const lunes = new Date(fecha)
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
  return lunes
}

/** Primer y último día de un mes (mes 0-11). */
export function rangoDeMes(anio, mes) {
  return { desde: aISO(new Date(anio, mes, 1)), hasta: aISO(new Date(anio, mes + 1, 0)) }
}

/** Lunes a domingo de la semana que contiene la fecha. */
export function rangoDeSemana(fecha) {
  const lunes = lunesDe(fecha)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return { desde: aISO(lunes), hasta: aISO(domingo) }
}

export const ATAJOS_RANGO = [
  { id: 'este-mes', label: 'Este mes', agrupacion: 'semana' },
  { id: 'ultimos-3-meses', label: 'Últimos 3 meses', agrupacion: 'mes' },
  { id: 'ultimas-8-semanas', label: 'Últimas 8 semanas', agrupacion: 'semana' },
  { id: 'este-anio', label: 'Este año', agrupacion: 'mes' },
]

/**
 * Rango de un atajo, hasta hoy. La base amplía a semanas o meses completos.
 * @param {string} id
 * @param {Date} [hoy]
 * @returns {{desde: string, hasta: string, agrupacion: 'semana'|'mes'}}
 */
export function rangoDeAtajo(id, hoy = new Date()) {
  const hasta = aISO(hoy)
  const atajo = ATAJOS_RANGO.find((a) => a.id === id) ?? ATAJOS_RANGO[0]
  let desde
  if (atajo.id === 'ultimos-3-meses') desde = aISO(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1))
  else if (atajo.id === 'ultimas-8-semanas') {
    const lunes = lunesDe(hoy)
    lunes.setDate(lunes.getDate() - 7 * 7)
    desde = aISO(lunes)
  } else if (atajo.id === 'este-anio') desde = aISO(new Date(hoy.getFullYear(), 0, 1))
  else desde = aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  return { desde, hasta, agrupacion: atajo.agrupacion }
}

/** Días incluidos en un rango (ambos extremos). */
export function diasDelRango(desde, hasta) {
  return Math.round((deISO(hasta) - deISO(desde)) / 86_400_000) + 1
}

/** Etiqueta corta de un período para el eje y la tabla. */
export function etiquetaPeriodo(inicio, fin, agrupacion) {
  const a = deISO(inicio)
  if (agrupacion === 'mes') return `${MESES[a.getMonth()]} ${a.getFullYear()}`
  const b = deISO(fin)
  const dm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${dm(a)} – ${dm(b)}`
}

/** Etiqueta legible de un rango libre (modo Comparar). */
export function etiquetaRango(desde, hasta) {
  const a = deISO(desde)
  const b = deISO(hasta)
  const esMesCompleto = a.getDate() === 1 && aISO(new Date(b.getFullYear(), b.getMonth() + 1, 0)) === hasta
    && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  if (esMesCompleto) return `${MESES_LARGOS[a.getMonth()]} ${a.getFullYear()}`
  const dma = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  return `${dma(a)} – ${dma(b)}`
}

const sumar = (mapa, clave, valor) => mapa.set(clave, (mapa.get(clave) ?? 0) + valor)
const redondear = (n) => Math.round(n * 100) / 100

/**
 * Totales por período (en orden), con el desglose por fuente.
 * @returns {Array<{inicio, fin, total, porFuente: Object<string, number>}>}
 */
export function agruparPorPeriodo(filas) {
  const periodos = new Map()
  for (const f of filas) {
    const clave = f.periodo_inicio
    if (!periodos.has(clave)) {
      periodos.set(clave, { inicio: f.periodo_inicio, fin: f.periodo_fin, total: 0, porFuente: {} })
    }
    const p = periodos.get(clave)
    const monto = Number(f.monto)
    p.total = redondear(p.total + monto)
    p.porFuente[f.fuente] = redondear((p.porFuente[f.fuente] ?? 0) + monto)
  }
  return [...periodos.values()].sort((x, y) => x.inicio.localeCompare(y.inicio))
}

/**
 * Totales por período y sucursal, para comparar sucursales.
 * @returns {{sucursales: Array<{id, nombre}>, periodos: Array<{inicio, fin, porSucursal}>}}
 */
export function agruparPorSucursal(filas) {
  const sucursales = new Map()
  const periodos = new Map()
  for (const f of filas) {
    const id = f.sucursal_id ?? 'sin-sucursal'
    if (!sucursales.has(id)) sucursales.set(id, { id, nombre: f.sucursal_nombre })
    if (!periodos.has(f.periodo_inicio)) {
      periodos.set(f.periodo_inicio, { inicio: f.periodo_inicio, fin: f.periodo_fin, porSucursal: {} })
    }
    const p = periodos.get(f.periodo_inicio)
    p.porSucursal[id] = redondear((p.porSucursal[id] ?? 0) + Number(f.monto))
  }
  return {
    // "Sin sucursal" al final; el resto por nombre (orden fijo = color fijo).
    sucursales: [...sucursales.values()].sort((a, b) =>
      a.id === 'sin-sucursal' ? 1 : b.id === 'sin-sucursal' ? -1 : a.nombre.localeCompare(b.nombre, 'es')),
    periodos: [...periodos.values()].sort((x, y) => x.inicio.localeCompare(y.inicio)),
  }
}

/** Total general y desgloses por fuente, medio y sucursal. */
export function totalesDe(filas) {
  const porFuente = new Map()
  const porMedio = new Map()
  const porSucursal = new Map()
  let total = 0
  for (const f of filas) {
    const monto = Number(f.monto)
    total += monto
    sumar(porFuente, f.fuente, monto)
    sumar(porMedio, f.medio_pago, monto)
    sumar(porSucursal, f.sucursal_nombre, monto)
  }
  const aObjeto = (mapa) => Object.fromEntries([...mapa].map(([k, v]) => [k, redondear(v)]))
  return { total: redondear(total), porFuente: aObjeto(porFuente), porMedio: aObjeto(porMedio), porSucursal: aObjeto(porSucursal) }
}

/** Indicadores del modo normal: total, promedio por período y mejor período. */
export function indicadores(periodos) {
  if (!periodos.length) return { total: 0, promedio: 0, mejor: null }
  const total = redondear(periodos.reduce((s, p) => s + p.total, 0))
  const mejor = periodos.reduce((m, p) => (p.total > m.total ? p : m), periodos[0])
  return { total, promedio: redondear(total / periodos.length), mejor }
}

/** Variación porcentual de B respecto de A; null si A es 0. */
export function variacion(a, b) {
  if (!a) return null
  // Sobre el valor absoluto: si A es negativo (p. ej. un resultado con
  // pérdida), mejorar hacia B da una variación positiva y empeorar, negativa.
  return Math.round(((b - a) / Math.abs(a)) * 1000) / 10
}

/**
 * Filas de la tabla del modo Comparar: total, promedio por día, cada fuente,
 * cada medio y cada sucursal, con la diferencia (B − A) y su variación.
 * Por defecto arma la de ingresos; el informe de egresos pasa sus fuentes y
 * la etiqueta del total.
 * @param {Object} [opciones]
 * @param {Array<{id: string, label: string}>} [opciones.fuentes]
 * @param {string} [opciones.etiquetaTotal]
 */
export function filasComparacion(totA, totB, diasA, diasB, { fuentes = FUENTES, etiquetaTotal = 'Total cobrado' } = {}) {
  const fila = (concepto, grupo, a, b) => ({
    concepto, grupo, a: redondear(a), b: redondear(b), diferencia: redondear(b - a), variacion: variacion(a, b),
  })
  const claves = (objA, objB) => [...new Set([...Object.keys(objA), ...Object.keys(objB)])]
  const filas = [
    fila(etiquetaTotal, 'total', totA.total, totB.total),
    fila('Promedio por día', 'total', diasA ? totA.total / diasA : 0, diasB ? totB.total / diasB : 0),
  ]
  for (const f of fuentes) {
    filas.push(fila(f.label, 'Por fuente', totA.porFuente[f.id] ?? 0, totB.porFuente[f.id] ?? 0))
  }
  for (const m of claves(totA.porMedio, totB.porMedio).sort((x, y) => x.localeCompare(y, 'es'))) {
    filas.push(fila(m, 'Por medio de pago', totA.porMedio[m] ?? 0, totB.porMedio[m] ?? 0))
  }
  for (const s of claves(totA.porSucursal, totB.porSucursal).sort((x, y) => x.localeCompare(y, 'es'))) {
    filas.push(fila(s, 'Por sucursal', totA.porSucursal[s] ?? 0, totB.porSucursal[s] ?? 0))
  }
  return filas
}

/** Resumen de lo facturado por período: facturas, NC, ND y neto. */
export function resumenFacturado(filas) {
  const periodos = new Map()
  for (const f of filas) {
    if (!periodos.has(f.periodo_inicio)) {
      periodos.set(f.periodo_inicio, { inicio: f.periodo_inicio, fin: f.periodo_fin, factura: 0, nota_credito: 0, nota_debito: 0 })
    }
    const p = periodos.get(f.periodo_inicio)
    p[f.tipo] = redondear((p[f.tipo] ?? 0) + Number(f.monto))
  }
  return [...periodos.values()]
    .map((p) => ({ ...p, neto: redondear(p.factura + p.nota_debito - p.nota_credito) }))
    .sort((x, y) => x.inicio.localeCompare(y.inicio))
}
