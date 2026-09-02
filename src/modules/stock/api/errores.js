// Helpers compartidos por los módulos de catálogo del bloque Stock.
//
// El proyecto no tiene un backend HTTP propio: el navegador habla directo
// con Supabase. Para poder respetar igual los contratos de las historias
// (400 / 409 / 422), cada función de la capa de datos lanza un Error con
// la propiedad `status`, y las pantallas leen ese número para decidir qué
// mensaje mostrar. Es el mismo patrón que usa depositosApi.js.

export function errorDeApi(mensaje, status) {
  const error = new Error(mensaje)
  error.status = status
  return error
}

// Códigos de error de PostgreSQL que nos interesa traducir.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
export const CODIGO_DUPLICADO = '23505' // unique_violation
export const CODIGO_FK_VIOLADA = '23503' // foreign_key_violation
export const CODIGO_CHECK_VIOLADO = '23514' // check_violation
export const CODIGO_UUID_INVALIDO = '22P02' // invalid_text_representation
export const CODIGO_RESTRICT = '23001' // restrict_violation

// PostgREST, no PostgreSQL: lo devuelve .single() cuando la consulta no
// trajo exactamente una fila. En un INSERT o UPDATE suele significar que la
// RLS filtró la fila, no que el registro no exista.
export const CODIGO_SIN_FILAS = 'PGRST116'
