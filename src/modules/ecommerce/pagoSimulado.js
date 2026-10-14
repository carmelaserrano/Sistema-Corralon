// Pasarela simulada: cualquier tarjeta con formato válido se aprueba, salvo
// esta, que se rechaza para poder probar el rechazo. Los datos de la tarjeta
// solo se validan acá: nunca se envían a Supabase ni se guardan.
export const TARJETA_RECHAZO = '0000000000000000'

/** Agrupa los dígitos de a 4: "4242424242424242" → "4242 4242 4242 4242". */
export function formatearNumeroTarjeta(valor) {
  return valor.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** Agrega la barra del vencimiento: "1230" → "12/30". */
export function formatearVencimiento(valor) {
  const digitos = valor.replace(/\D/g, '').slice(0, 4)
  return digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos
}

/**
 * Valida los datos de la tarjeta. Devuelve un objeto {campo: mensaje} vacío
 * si todo está bien.
 *
 * @param {{numero: string, titular: string, vencimiento: string, cvv: string}} tarjeta
 * @param {Date} [hoy] Fecha de referencia para el vencimiento.
 * @returns {Object<string, string>}
 */
export function validarTarjeta(tarjeta, hoy = new Date()) {
  const errores = {}
  if (tarjeta.numero.replace(/\D/g, '').length !== 16) {
    errores.numero = 'Ingresá los 16 dígitos de la tarjeta'
  }
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]{3,}$/.test(tarjeta.titular.trim())) {
    errores.titular = 'Ingresá el nombre como figura en la tarjeta'
  }
  const vencimiento = /^(\d{2})\/(\d{2})$/.exec(tarjeta.vencimiento)
  const mes = vencimiento ? Number(vencimiento[1]) : 0
  if (!vencimiento || mes < 1 || mes > 12) {
    errores.vencimiento = 'Usá el formato MM/AA'
  } else {
    // La tarjeta vale hasta el último día del mes de vencimiento.
    const finDeMes = new Date(2000 + Number(vencimiento[2]), mes, 0, 23, 59, 59)
    if (finDeMes < hoy) errores.vencimiento = 'La tarjeta está vencida'
  }
  if (!/^\d{3,4}$/.test(tarjeta.cvv)) {
    errores.cvv = 'El código tiene 3 o 4 dígitos'
  }
  return errores
}
