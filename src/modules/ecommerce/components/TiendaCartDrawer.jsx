import { useEffect } from 'react'
import {
  ArrowRight,
  Minus,
  PackageCheck,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import { useCarrito } from '../context/CarritoContext'
import Button from '../../../components/ui/Button'
import { ImagenProducto } from '../pages/CatalogoPage'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export default function TiendaCartDrawer({ abierto, onCerrar, onIrCheckout, onIrCarritoCompleto }) {
  const { items, cantidadTotal, total, actualizar, quitar, vaciar } = useCarrito()

  // Cerrar con Escape
  useEffect(() => {
    function manejarTecla(e) {
      if (e.key === 'Escape') onCerrar()
    }
    if (abierto) {
      window.addEventListener('keydown', manejarTecla)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', manejarTecla)
      document.body.style.overflow = ''
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div className="tienda-drawer-root" role="dialog" aria-modal="true" aria-label="Carrito de compras">
      <div className="tienda-drawer-overlay" onClick={onCerrar} aria-hidden="true" />

      <aside className="tienda-cart-drawer">
        {/* Header del Drawer */}
        <div className="tienda-cart-drawer-header">
          <div className="tienda-cart-drawer-title">
            <ShoppingCart size={20} />
            <h3>Tu Carrito</h3>
            <span className="tienda-cart-count-chip">{cantidadTotal}</span>
          </div>
          <button
            type="button"
            className="tienda-drawer-close-btn"
            onClick={onCerrar}
            aria-label="Cerrar carrito"
          >
            <X size={20} />
          </button>
        </div>

        {/* Lista de Items */}
        <div className="tienda-cart-drawer-body">
          {items.length === 0 ? (
            <div className="tienda-cart-drawer-empty">
              <div className="tienda-cart-empty-icon">
                <ShoppingCart size={40} />
              </div>
              <h4>Tu carrito está vacío</h4>
              <p>Agregá materiales de construcción para tu obra y recibilos con logística directa.</p>
              <Button type="button" onClick={onCerrar}>
                Explorar catálogo
              </Button>
            </div>
          ) : (
            <ul className="tienda-cart-drawer-list">
              {items.map((item) => (
                <li key={item.productoId} className="tienda-cart-drawer-item">
                  <div className="tienda-cart-item-thumb">
                    <ImagenProducto url={item.imagenUrl} nombre={item.nombre} alto={64} />
                  </div>

                  <div className="tienda-cart-item-details">
                    <h5 className="tienda-cart-item-nombre" title={item.nombre}>
                      {item.nombre}
                    </h5>
                    <div className="tienda-cart-item-precio-unit">
                      {moneda.format(item.precio)} c/u
                    </div>

                    <div className="tienda-cart-item-actions">
                      <div className="tienda-qty-selector">
                        <button
                          type="button"
                          className="tienda-qty-btn"
                          disabled={item.cantidad <= 1}
                          onClick={() => actualizar(item.productoId, item.cantidad - 1)}
                          aria-label={`Reducir cantidad de ${item.nombre}`}
                        >
                          <Minus size={13} />
                        </button>
                        <span className="tienda-qty-value">{item.cantidad}</span>
                        <button
                          type="button"
                          className="tienda-qty-btn"
                          onClick={() => actualizar(item.productoId, item.cantidad + 1)}
                          aria-label={`Aumentar cantidad de ${item.nombre}`}
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <strong className="tienda-cart-item-subtotal">
                        {moneda.format(item.subtotal)}
                      </strong>

                      <button
                        type="button"
                        className="tienda-cart-item-remove"
                        onClick={() => quitar(item.productoId)}
                        title="Eliminar producto"
                        aria-label={`Eliminar ${item.nombre} del carrito`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer con Totales y Checkout */}
        {items.length > 0 && (
          <div className="tienda-cart-drawer-footer">
            <div className="tienda-cart-summary-line">
              <span>Subtotal:</span>
              <strong>{moneda.format(total)}</strong>
            </div>
            <div className="tienda-cart-summary-envio">
              <span>Entrega:</span>
              <small>Envío a obra o retiro en sucursal (se elige al pagar)</small>
            </div>
            <div className="tienda-cart-summary-total">
              <span>Total Estimado:</span>
              <span className="tienda-total-amount">{moneda.format(total)}</span>
            </div>

            <div className="tienda-cart-drawer-buttons">
              <Button
                type="button"
                className="tienda-btn-drawer-checkout"
                icon={PackageCheck}
                onClick={() => {
                  onCerrar()
                  onIrCheckout()
                }}
              >
                Continuar al Checkout
              </Button>

              <div className="tienda-cart-secondary-actions">
                <Button
                  type="button"
                  variant="ghost"
                  icon={ArrowRight}
                  onClick={() => {
                    onCerrar()
                    onIrCarritoCompleto()
                  }}
                >
                  Ver carrito completo
                </Button>
                <button
                  type="button"
                  className="tienda-btn-vaciar-drawer"
                  onClick={vaciar}
                >
                  Vaciar
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
