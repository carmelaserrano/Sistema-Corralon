import { isValidElement } from 'react'
import Button from './Button'

// `actions` acepta un nodo de React o una lista de descriptores
// { label, icon, onClick, variant, disabled } que se muestran como botones.
function renderAcciones(actions) {
  if (!Array.isArray(actions)) return actions
  return actions.map((accion, idx) => {
    if (isValidElement(accion) || accion === null || typeof accion !== 'object') return accion
    const { label, ...props } = accion
    return (
      <Button key={label ?? idx} type="button" variant="secondary" {...props}>
        {label}
      </Button>
    )
  })
}

export default function PageHeader({
  actions,
  breadcrumbs,
  children,
  className = '',
  description,
  kicker,
  title,
}) {
  return (
    <div className={`page-header-card ${className}`.trim()}>
      <div className="page-header-main">
        <div className="page-header-title-group">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="page-header-breadcrumbs" aria-label="Ruta de navegación">
              {breadcrumbs.map((crumb, idx) => (
                <span key={idx} className="breadcrumb-item">
                  {crumb.onClick ? (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      className="breadcrumb-link"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="breadcrumb-current">{crumb.label}</span>
                  )}
                  {idx < breadcrumbs.length - 1 && (
                    <span className="breadcrumb-separator" aria-hidden="true">/</span>
                  )}
                </span>
              ))}
            </nav>
          )}

          {kicker && <span className="page-header-kicker">{kicker}</span>}
          {title && <h1 className="page-header-title">{title}</h1>}
          {description && <p className="page-header-description">{description}</p>}
        </div>

        {actions && <div className="page-header-actions">{renderAcciones(actions)}</div>}
      </div>

      {children && <div className="page-header-extra">{children}</div>}
    </div>
  )
}
