import { Boxes, X } from 'lucide-react'
import { navigationGroups } from './navigation'

export default function Sidebar({ activePage, isOpen, onClose, onNavigate }) {
  const activeNavigationPage =
    activePage === 'historial-movimientos' ? 'movimientos' : activePage

  function navigate(pageId) {
    onNavigate(pageId)
    onClose()
  }

  return (
    <>
      <button
        className={`sidebar-backdrop ${isOpen ? 'is-visible' : ''}`}
        type="button"
        aria-label="Cerrar menú"
        onClick={onClose}
      />
      <aside className={`sidebar ${isOpen ? 'is-open' : ''}`} aria-label="Menú principal">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            <Boxes size={21} strokeWidth={2.2} />
          </span>
          <span>
            <strong>Sistema Corralón</strong>
            <small>Gestión de stock</small>
          </span>
          <button
            className="sidebar-close"
            type="button"
            aria-label="Cerrar menú"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map(({ id, label, icon: Icon }) => {
                const active = activeNavigationPage === id
                return (
                  <button
                    className={`nav-item ${active ? 'is-active' : ''}`}
                    type="button"
                    key={id}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => navigate(id)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          Sistema conectado
        </div>
      </aside>
    </>
  )
}

