import { useEffect, useRef, useState } from 'react'
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, UserRound } from 'lucide-react'
import Sidebar from './Sidebar'
import { pageModules, pageTitles } from './navigation'
import Button from '../ui/Button'
import CommandPalette from '../ui/CommandPalette'
import ToastProvider from '../ui/Toast'

const CLAVE_SIDEBAR_OCULTA = 'corralon.sidebar.oculta'

function leerSidebarOculta() {
  try {
    return localStorage.getItem(CLAVE_SIDEBAR_OCULTA) === 'true'
  } catch {
    return false
  }
}

export default function AppShell({
  activePage,
  children,
  email,
  onNavigate,
  onSignOut,
  rol,
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarOculta, setSidebarOculta] = useState(leerSidebarOculta)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const contentRef = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_SIDEBAR_OCULTA, String(sidebarOculta))
    } catch {
      // La preferencia es opcional; el control sigue funcionando sin almacenamiento.
    }
  }, [sidebarOculta])

  useEffect(() => {
    const content = contentRef.current
    if (!content?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const animation = content.animate(
      [
        { transform: 'translateX(10px)', opacity: 0.9 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: 170, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    )

    return () => animation.cancel()
  }, [activePage])

  useEffect(() => {
    setMobileOpen(false)
  }, [activePage])

  // Atajo global Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const initials = email
    ? email.substring(0, 2).toUpperCase()
    : 'US'

  return (
    <ToastProvider>
      <div className={`app-shell ${sidebarOculta ? 'is-sidebar-collapsed' : ''}`}>
        <Sidebar
          activePage={activePage}
          isOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          onNavigate={onNavigate}
          onOpenPalette={() => setPaletteOpen(true)}
          rol={rol}
        />

        <div className="app-workspace">
          <header className="topbar">
            <div className="topbar-heading">
              <button
                className="sidebar-toggle"
                type="button"
                aria-label={sidebarOculta ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
                aria-expanded={!sidebarOculta}
                aria-controls="app-sidebar"
                onClick={() => setSidebarOculta((oculta) => !oculta)}
              >
                {sidebarOculta
                  ? <PanelLeftOpen size={20} aria-hidden="true" />
                  : <PanelLeftClose size={20} aria-hidden="true" />}
              </button>
              <button
                className="menu-trigger"
                type="button"
                aria-label="Abrir menú"
                aria-expanded={mobileOpen}
                aria-controls="app-sidebar"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={21} />
              </button>
              <div>
                <span className="topbar-kicker">
                  Módulo {pageModules[activePage] ?? 'Stock'}
                </span>
                <strong>{pageTitles[activePage] ?? 'Stock'}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                className="topbar-search-trigger"
                onClick={() => setPaletteOpen(true)}
                title="Buscar pantalla o comando (Cmd+K)"
              >
                <Search size={14} aria-hidden="true" />
                <span>Buscar…</span>
                <kbd>⌘K</kbd>
              </button>

              <div className="topbar-user">
                <span className="user-avatar" aria-hidden="true" title={email}>
                  {initials ? <small style={{ fontWeight: 800 }}>{initials}</small> : <UserRound size={18} />}
                </span>
                <span className="user-copy">
                  <small>Sesión activa</small>
                  <strong>{email}</strong>
                </span>
                <Button
                  className="sign-out"
                  type="button"
                  onClick={onSignOut}
                  icon={LogOut}
                  variant="ghost"
                >
                  Salir
                </Button>
              </div>
            </div>
          </header>

          <main className="app-main">
            <div className="page-canvas" ref={contentRef}>{children}</div>
          </main>
        </div>

        <CommandPalette
          isOpen={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNavigate={onNavigate}
        />
      </div>
    </ToastProvider>
  )
}
