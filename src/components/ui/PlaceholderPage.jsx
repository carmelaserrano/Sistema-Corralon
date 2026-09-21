import { Construction } from 'lucide-react'

/**
 * Pantalla provisoria para una página cuya issue todavía no se mergeó.
 * S3-00 registra el ítem de navegación y esta placeholder para que el resto
 * del sprint pueda avanzar en paralelo (CA-03); cada issue dueña la
 * reemplaza por su implementación real sin tocar `App.jsx` ni `navigation.js`.
 *
 * @param {string} issue Código de la issue dueña (ej. "S3-01").
 * @param {string} [titulo] Título a mostrar; por defecto usa `issue`.
 */
export default function PlaceholderPage({ issue, titulo }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <Construction size={22} />
      </span>
      <strong>{titulo || issue}</strong>
      <p>En construcción — {issue}</p>
    </div>
  )
}
