import { useEffect } from 'react'
import { CheckCircle2, ShoppingCart, X } from 'lucide-react'

export default function TiendaToast({ mensaje, productoNombre, onVerCarrito, onCerrar }) {
  useEffect(() => {
    if (!mensaje) return
    const timer = setTimeout(() => {
      onCerrar?.()
    }, 4000)
    return () => clearTimeout(timer)
  }, [mensaje, onCerrar])

  if (!mensaje) return null

  return (
    <div className="tienda-toast" role="status" aria-live="polite">
      <div className="tienda-toast-content">
        <span className="tienda-toast-icon">
          <CheckCircle2 size={20} />
        </span>
        <div className="tienda-toast-text">
          <strong>¡Agregado al carrito!</strong>
          {productoNombre && <span>{productoNombre}</span>}
        </div>
      </div>
      <div className="tienda-toast-actions">
        {onVerCarrito && (
          <button type="button" className="tienda-toast-btn" onClick={onVerCarrito}>
            <ShoppingCart size={14} />
            Ver carrito
          </button>
        )}
        <button type="button" className="tienda-toast-close" onClick={onCerrar} aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
