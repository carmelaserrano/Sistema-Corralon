import { useEffect, useState } from 'react'
import { ChevronRight, Search, X } from 'lucide-react'
import LogoCasco from '../ui/LogoCasco'
import { ROL_ADMINISTRADOR, itemsVisiblesDeGrupo, navigationGroups } from './navigation'

// Etiquetas cortas junto a algunas pantallas.
const BADGES = {
  'alertas-stock': { label: 'Alerta', tone: 'warning' },
  'pedidos-web': { label: 'Web', tone: 'info' },
  'nueva-venta': { label: 'POS', tone: 'info' },
}

// Sección abierta por el usuario, para conservarla al recargar.
const CLAVE_SECCIONES = 'corralon.sidebar.secciones-abiertas'

function seccionDePagina(pageId) {
  return navigationGroups.find((group) => group.items.some((item) => item.id === pageId))?.id
}

function leerSeccion() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE_SECCIONES) || 'null')
    const ids = Array.isArray(guardadas) ? guardadas : [guardadas]
    return ids.find((id) => navigationGroups.some((group) => group.id === id)) ?? null
  } catch {
    return null
  }
}

function guardarSeccion(id) {
  try {
    localStorage.setItem(CLAVE_SECCIONES, JSON.stringify(id))
  } catch {
    // Sin almacenamiento el menú funciona igual; solo no recuerda el estado.
  }
}

export default function Sidebar({
  activePage,
  isOpen,
  onClose,
  onNavigate,
  onOpenPalette,
  rol = ROL_ADMINISTRADOR,
}) {
  const activeNavigationPage =
    activePage === 'historial-movimientos' ? 'movimientos' : activePage
  const seccionActiva = seccionDePagina(activeNavigationPage)
  // CA-02: cada grupo se reduce a los ítems que el rol puede ver; un grupo
  // sin ítems visibles no se renderiza (ver más abajo).
  const gruposConItemsVisibles = navigationGroups
    .map((group) => ({ ...group, items: itemsVisiblesDeGrupo(group, rol) }))
    .filter((group) => group.items.length > 0)

  // La página actual tiene prioridad sobre el estado guardado.
  const [seccionAbierta, setSeccionAbierta] = useState(() => seccionActiva ?? leerSeccion())

  // La navegación abre exclusivamente la sección de la nueva página.
  useEffect(() => {
    if (seccionActiva) setSeccionAbierta(seccionActiva)
  }, [activeNavigationPage, seccionActiva])

  useEffect(() => {
    guardarSeccion(seccionAbierta)
  }, [seccionAbierta])

  function alternarSeccion(id) {
    setSeccionAbierta((actual) => (actual === id ? null : id))
  }

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
          <span className="sidebar-logo">
            <LogoCasco size={40} />
          </span>
          <span>
            <strong className="marca-nombre">
              Corralón <span>Norte</span>
            </strong>
            <small>Sistema de gestión</small>
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
          <div className="sidebar-search">
            <button type="button" className="topbar-search-trigger" onClick={onOpenPalette}>
              <span>
                <Search size={14} aria-hidden="true" />
                <span>Buscar módulo…</span>
              </span>
              <kbd>⌘K</kbd>
            </button>
          </div>
        )}

        <nav className="sidebar-nav">
          {gruposConItemsVisibles.map(({ id: grupoId, label: grupoLabel, icon: GrupoIcon, items }) => {
            const expandida = seccionAbierta === grupoId
            const contieneActiva = seccionActiva === grupoId
            const panelId = `nav-seccion-${grupoId}`

            return (
              <div
                className={`nav-group ${expandida ? 'is-expanded' : ''} ${contieneActiva ? 'has-active' : ''}`}
                key={grupoId}
              >
                <button
                  className="nav-group-toggle"
                  type="button"
                  aria-expanded={expandida}
                  aria-controls={panelId}
                  onClick={() => alternarSeccion(grupoId)}
                >
                  <GrupoIcon size={18} aria-hidden="true" />
                  <span className="nav-group-label">{grupoLabel}</span>
                  <ChevronRight className="nav-group-chevron" size={16} aria-hidden="true" />
                </button>

                <div
                  className="nav-group-panel"
                  id={panelId}
                  aria-hidden={!expandida}
                  inert={expandida ? undefined : ''}
                >
                  <div className="nav-group-content">
                    <div className="nav-group-items">
                      {items.map(({ id, label, icon: Icon, href, newTab }) => {
                        const active = activeNavigationPage === id
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
                              <Icon size={16} aria-hidden="true" />
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
                            <Icon size={16} aria-hidden="true" />
                            <span>{label}</span>
                            {BADGES[id] && (
                              <span
                                className={`nav-badge nav-badge-${BADGES[id].tone}`}
                                aria-hidden="true"
                              >
                                {BADGES[id].label}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
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
