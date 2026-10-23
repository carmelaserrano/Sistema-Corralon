// toLocaleString('es-AR') usa reloj de 12 horas sin "a. m."/"p. m." en
// Chrome y Node: 00:10 y 12:10 se ven iguales ("12:10:31"). Forzamos 24 h.
const OPCIONES_FECHA_HORA = { hourCycle: 'h23' }

/**
 * Fecha y hora en formato argentino de 24 horas (p. ej. "16/10/2026, 15:10:31").
 *
 * @param {string|number|Date} valor Fecha ISO, timestamp o Date.
 * @returns {string}
 */
export function formatearFechaHora(valor) {
  return new Date(valor).toLocaleString('es-AR', OPCIONES_FECHA_HORA)
}
