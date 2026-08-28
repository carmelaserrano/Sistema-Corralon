import { useState } from 'react'
import { useAuth } from './lib/AuthContext'
import LoginPage from './modules/auth/pages/LoginPage'
import StockPage from './modules/stock/pages/StockPage'
import DepositosPage from './modules/stock/pages/DepositosPage'
import CategoriasPage from './modules/stock/pages/CategoriasPage'
import MarcasPage from './modules/stock/pages/MarcasPage'
import UnidadesMedidaPage from './modules/stock/pages/UnidadesMedidaPage'
import ArticulosPage from './modules/stock/pages/ArticulosPage'
import MovimientosPage from './modules/stock/pages/MovimientosPage'
import ConfiguracionStockPage from './modules/stock/pages/ConfiguracionStockPage'
import InventarioFisicoPage from './modules/stock/pages/InventarioFisicoPage'
import HistorialMovimientosPage from './modules/stock/pages/HistorialMovimientosPage'
import AlertasStockPage from './modules/stock/pages/AlertasStockPage'
import RecepcionesPage from './modules/stock/pages/RecepcionesPage'
import ReportesPage from './modules/stock/pages/ReportesPage'
import AppShell from './components/layout/AppShell'

function App() {
  const { session, loading, signOut } = useAuth()
  const [pagina, setPagina] = useState('stock')

  if (loading) {
    return (
      <div className="app-loading" role="status">
        <span className="loading-mark" />
        <strong>Cargando Sistema Corralón…</strong>
      </div>
    )
  }
  if (!session) return <LoginPage />

  return (
    <AppShell
      activePage={pagina}
      email={session.user.email}
      onNavigate={setPagina}
      onSignOut={signOut}
    >
      {pagina === 'stock' && <StockPage />}
      {pagina === 'depositos' && <DepositosPage />}
      {pagina === 'categorias' && <CategoriasPage />}
      {pagina === 'marcas' && <MarcasPage />}
      {pagina === 'unidades' && <UnidadesMedidaPage />}
      {pagina === 'articulos' && <ArticulosPage />}
      {pagina === 'movimientos' && (
        <MovimientosPage
          onVerHistorial={() => setPagina('historial-movimientos')}
        />
      )}
      {pagina === 'historial-movimientos' && (
        <HistorialMovimientosPage
          onVolver={() => setPagina('movimientos')}
        />
      )}
      {pagina === 'configuracion-stock' && <ConfiguracionStockPage />}
      {pagina === 'inventario-fisico' && <InventarioFisicoPage />}
      {pagina === 'alertas-stock' && <AlertasStockPage />}
      {pagina === 'recepciones' && <RecepcionesPage />}
      {pagina === 'reportes' && <ReportesPage />}
    </AppShell>
  )
}

export default App
