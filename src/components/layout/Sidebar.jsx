import { useState } from 'react'
import { Boxes, ChevronDown, Search, X } from 'lucide-react'
import { navigationGroups } from './navigation'

const BADGES = {
  'alertas-stock': { label: 'Alerta', tone: 'warning' },
  'pedidos-web': { label: 'Web', tone: 'info' },
  'nueva-venta': { label: 'POS', tone: 'info' },
}

export default function Sidebar({
  activePage,
  isOpen,
  onClose,
  onNavigate,
  onOpenPalette,
}) {
  const [collapsed, setCollapsed] = useState({})

  const activeNavigationPage =
    activePage === 'historial-movimientos' ? 'movimientos' : activePage

  function navigate(pageId) {
    onNavigate(pageId)
    onClose()
  }

  function toggleGroup(label) {
    setCollapsed((prev) => ({
      ...prev,
      [label]: !prev[label],
    }))
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

        {onOpenPalette && (
          <div style={{ padding: '12px 4px 4px' }}>
            <button
              type="button"
              className="topbar-search-trigger"
              style={{ width: '100%', justifyContent: 'space-between', minHeight: '34px' }}
              onClick={onOpenPalette}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Search size={14} />
                <span>Buscar módulo…</span>
              </span>
              <kbd>⌘K</kbd>
            </button>
          </div>
        )}

        <nav className="sidebar-nav">
          {navigationGroups.map((group) => {
            const hasActiveItem = group.items.some((item) => item.id === activeNavigationPage)
            const isGroupCollapsed = Boolean(collapsed[group.label]) && !hasActiveItem

            return (
              <div className="nav-group" key={group.label}>
                <p
                  className="nav-group-label"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    userSelect: 'none',
                  }}
                  onClick={() => toggleGroup(group.label)}
                  title="Haz clic para contraer o expandir este grupo"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    size={12}
                    style={{
                      transform: isGroupCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 150ms ease',
                    }}
                    aria-hidden="true"
                  />
                </p>

                {!isGroupCollapsed &&
                  group.items.map(({ id, label, icon: Icon, href, newTab }) => {
                    const active = activeNavigationPage === id
                    const badge = BADGES[id]

                    if (href) {
                      return (
                        <a
                          className="nav-item"
                          href={href}
                          key={id}
                          style={{ textDecoration: 'none' }}
                          target={newTab ? '_blank' : undefined}
                          rel={newTab ? 'noopener noreferrer' : undefined}
                          onClick={onClose}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <span>{label}</span>
                        </a>
                      )
                    }

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
                        {badge && (
                          <span className={`nav-badge nav-badge-${badge.tone}`}>
                            {badge.label}
                          </span>
                        )}
                      </button>
                    )
                  })}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          Sistema conectado
        </div>
      </aside>
    </>
  )
}
