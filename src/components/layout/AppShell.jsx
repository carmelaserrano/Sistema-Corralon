import { useEffect, useState } from 'react'
import { LogOut, Menu, UserRound } from 'lucide-react'
import Sidebar from './Sidebar'
import { pageTitles } from './navigation'
import Button from '../ui/Button'

export default function AppShell({
  activePage,
  children,
  email,
  onNavigate,
  onSignOut,
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [activePage])

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onNavigate={onNavigate}
      />

      <div className="app-workspace">
        <header className="topbar">
          <div className="topbar-heading">
            <button
              className="menu-trigger"
              type="button"
              aria-label="Abrir menú"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <div>
              <span className="topbar-kicker">Módulo Stock</span>
              <strong>{pageTitles[activePage] ?? 'Stock'}</strong>
            </div>
          </div>

          <div className="topbar-user">
            <span className="user-avatar" aria-hidden="true">
              <UserRound size={18} />
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
        </header>

        <main className="app-main">
          <div className="page-canvas">{children}</div>
        </main>
      </div>
    </div>
  )
}
