// CA-03: el estado se muestra con un indicador visual, no sólo con texto.
// Bloqueado reutiliza el tono "error" del sistema de badges: es el estado
// que más atención necesita, sobre el resto de la pantalla no hay nada rojo
// compitiendo con él.
const TONOS = {
  Activo: 'activo',
  Bloqueado: 'error',
  Inactivo: 'inactivo',
}

/**
 * Indicador visual del estado de un cliente (Activo / Inactivo / Bloqueado).
 *
 * @param {Object} props
 * @param {'Activo'|'Inactivo'|'Bloqueado'} props.estado
 */
export default function EstadoClienteBadge({ estado }) {
  const tono = TONOS[estado] ?? 'inactivo'

  return <span className={`estado-badge estado-badge-${tono}`}>{estado}</span>
}
