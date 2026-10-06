import { useEffect, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import LogoCasco from '../ui/LogoCasco'
import { navigationGroups } from './navigation'

// Secciones abiertas por el usuario, para conservarlas al recargar.
const CLAVE_SECCIONES = 'corralon.sidebar.secciones-abiertas'

function seccionDePagina(pageId) {
  return navigationGroups.find((group) => group.items.some((item) => item.id === pageId))?.id
}

function leerSecciones() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE_SECCIONES) || 'null')
    return Array.isArray(guardadas) ? guardadas : null
  } catch {
    return null
  }
}

function guardarSecciones(ids) {
  try {
    localStorage.setItem(CLAVE_SECCIONES, JSON.stringify(ids))
  } catch {
    // Sin almacenamiento el menú funciona igual; solo no recuerda el estado.
  }
}

export default function Sidebar({ activePage, isOpen, onClose, onNavigate }) {
  const activeNavigationPage =
    activePage === 'historial-movimientos' ? 'movimientos' : activePage
  const seccionActiva = seccionDePagina(activeNavigationPage)

  // Varias secciones pueden estar abiertas a la vez. La primera vez se abre
  // solo la de la página actual.
  const [abiertas, setAbiertas] = useState(() => {
    const guardadas = leerSecciones()
    const iniciales = new Set(guardadas ?? [])
    if (seccionActiva) iniciales.add(seccionActiva)
    return iniciales
  })

  // Al llegar a una página de una sección cerrada (por ejemplo, desde un
  // botón de otra pantalla), la sección se abre para mostrar dónde estás.
  useEffect(() => {
    if (!seccionActiva) return
    setAbiertas((actuales) => {
      if (actuales.has(seccionActiva)) return actuales
      const nuevas = new Set(actuales).add(seccionActiva)
      guardarSecciones([...nuevas])
      return nuevas
    })
  }, [seccionActiva])

  function alternarSeccion(id) {
    setAbiertas((actuales) => {
      const nuevas = new Set(actuales)
      if (nuevas.has(id)) nuevas.delete(id)
      else nuevas.add(id)
      guardarSecciones([...nuevas])
      return nuevas
    })
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

        <nav className="sidebar-nav">
          {navigationGroups.map(({ id: grupoId, label: grupoLabel, icon: GrupoIcon, items }) => {
            const abierta = abiertas.has(grupoId)
            const contieneActiva = seccionActiva === grupoId
            const panelId = `nav-seccion-${grupoId}`

            return (
              <div
                className={`nav-group ${abierta ? 'is-expanded' : ''} ${contieneActiva ? 'has-active' : ''}`}
                key={grupoId}
              >
                <button
                  className="nav-group-toggle"
                  type="button"
                  aria-expanded={abierta}
                  aria-controls={panelId}
                  onClick={() => alternarSeccion(grupoId)}
                >
                  <GrupoIcon size={18} aria-hidden="true" />
                  <span className="nav-group-label">{grupoLabel}</span>
                  <ChevronRight className="nav-group-chevron" size={16} aria-hidden="true" />
                </button>

                {abierta && (
                  <div className="nav-group-items" id={panelId}>
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
                        </button>
                      )
                    })}
                  </div>
                )}
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
