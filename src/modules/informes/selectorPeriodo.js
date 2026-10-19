// Helpers de los períodos del modo Comparar, compartidos por los informes.
import { MESES_LARGOS, deISO, rangoDeMes, rangoDeSemana } from './informeIngresos'

/** Opciones de mes para el modo Comparar: los últimos 18 meses. */
export function opcionesDeMes(hoy = new Date()) {
  return Array.from({ length: 18 }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    return { valor: `${fecha.getFullYear()}-${fecha.getMonth()}`, label: `${MESES_LARGOS[fecha.getMonth()]} ${fecha.getFullYear()}` }
  })
}

/** Rango de un período del modo Comparar según cómo se eligió. */
export function rangoDePeriodo(periodo) {
  if (periodo.tipo === 'mes') {
    const [anio, mes] = periodo.mes.split('-').map(Number)
    return rangoDeMes(anio, mes)
  }
  if (periodo.tipo === 'semana') return rangoDeSemana(deISO(periodo.fecha))
  return { desde: periodo.desde, hasta: periodo.hasta }
}
