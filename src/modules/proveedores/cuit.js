// Utilidades de CUIT compartidas entre el formulario (formato al tipear y
// validación al perder el foco) y proveedoresApi (normalización antes de
// guardar). La base sólo exige 11 dígitos (chk_proveedor_cuit); el dígito
// verificador y el guionado son responsabilidad del cliente.

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

/**
 * Deja solo los dígitos de un CUIT, sin guiones ni espacios.
 *
 * @param {string} valor CUIT tal como lo escribió el usuario.
 * @returns {string} Hasta 11 dígitos.
 */
export function limpiarCuit(valor) {
  return (valor ?? '').replace(/\D/g, '').slice(0, 11)
}

/**
 * Da formato XX-XXXXXXXX-X. Si todavía no hay 11 dígitos, devuelve lo que
 * haya sin guionar, para no interrumpir al usuario mientras escribe.
 *
 * @param {string} valor CUIT completo o parcial.
 * @returns {string} CUIT formateado.
 */
export function formatearCuit(valor) {
  const digitos = limpiarCuit(valor)

  if (digitos.length < 11) return digitos

  return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`
}

/**
 * Valida el formato de 11 dígitos y el dígito verificador (módulo 11).
 *
 * Un resto de 10 no tiene dígito verificador válido en el algoritmo
 * estándar: se considera CUIT inválido, no se fuerza a 9.
 *
 * @param {string} valor CUIT completo o parcial, con o sin guiones.
 * @returns {boolean} true si el CUIT es válido.
 */
export function cuitEsValido(valor) {
  const digitos = limpiarCuit(valor)

  if (digitos.length !== 11) return false

  const numeros = digitos.split('').map(Number)
  const suma = numeros
    .slice(0, 10)
    .reduce((acumulado, digito, indice) => acumulado + digito * PESOS[indice], 0)
  const resto = 11 - (suma % 11)
  const verificador = resto === 11 ? 0 : resto

  if (resto === 10) return false
  return verificador === numeros[10]
}
