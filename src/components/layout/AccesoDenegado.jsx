import { ShieldAlert } from 'lucide-react'
import Button from '../ui/Button'

// CA-03: se muestra en vez de la página pedida cuando el rol del usuario
// autenticado no está habilitado para verla (navegación forzada por URL o
// por estado, no solo por un clic que el Sidebar ya filtra).
export default function AccesoDenegado({ onVolver }) {
  return (
    <div className="empty-state" role="alert">
      <span className="empty-state-icon" aria-hidden="true">
        <ShieldAlert size={22} />
      </span>
      <strong>Acceso denegado (403)</strong>
      <p>No tenés permiso para ver esta pantalla con tu rol actual.</p>
      {onVolver && (
        <Button type="button" variant="ghost" onClick={onVolver}>
          Volver al inicio
        </Button>
      )}
    </div>
  )
}
