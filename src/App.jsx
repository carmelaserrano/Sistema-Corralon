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
import ProveedoresPage from './modules/proveedores/pages/ProveedoresPage'
import RubrosPage from './modules/proveedores/pages/RubrosPage'
import OrdenesCompraPage from './modules/compras/pages/OrdenesCompraPage'
import NotasProveedorPage from './modules/compras/pages/NotasProveedorPage'
import FacturasProveedorPage from './modules/tesoreria/pages/FacturasProveedorPage'
import OrdenesPagoPage from './modules/tesoreria/pages/OrdenesPagoPage'
import AppShell from './components/layout/AppShell'

function App() {
  const { session, loading, signOut } = useAuth()
  const [pagina, setPagina] = useState('stock')
  const [filtroArticuloId, setFiltroArticuloId] = useState(null)

  if (loading) {
    return (
      <div className="app-loading" role="status">
        <span className="loading-mark" />
        <strong>Cargando Sistema Corralón…</strong>
      </div>
    )
  }
  if (!session) return <LoginPage />

  // Al navegar desde el menú, limpiamos el filtro si es que vamos a historial (opcional)
  // pero lo más seguro es resetearlo en el onNavigate, o simplemente 
  // limpiar el filtroArticuloId si la nueva página no es historial
  const handleNavigate = (nuevaPagina) => {
    if (nuevaPagina !== 'historial-movimientos') {
      setFiltroArticuloId(null)
    }
    setPagina(nuevaPagina)
  }

  return (
    <AppShell
      activePage={pagina}
      email={session.user.email}
      onNavigate={handleNavigate}
      onSignOut={signOut}
    >
      {pagina === 'stock' && <StockPage />}
      {pagina === 'depositos' && <DepositosPage />}
      {pagina === 'categorias' && <CategoriasPage />}
      {pagina === 'marcas' && <MarcasPage />}
      {pagina === 'unidades' && <UnidadesMedidaPage />}
      {pagina === 'articulos' && (
        <ArticulosPage 
          onVerHistorial={(id) => {
            setFiltroArticuloId(id)
            setPagina('historial-movimientos')
          }}
        />
      )}
      {pagina === 'movimientos' && (
        <MovimientosPage
          onVerHistorial={() => setPagina('historial-movimientos')}
        />
      )}
      {pagina === 'historial-movimientos' && (
        <HistorialMovimientosPage
          articuloIdProp={filtroArticuloId}
          onVolver={() => {
            setFiltroArticuloId(null)
            setPagina(filtroArticuloId ? 'articulos' : 'movimientos')
          }}
        />
      )}
      {pagina === 'configuracion-stock' && <ConfiguracionStockPage />}
      {pagina === 'inventario-fisico' && <InventarioFisicoPage />}
      {pagina === 'alertas-stock' && <AlertasStockPage />}
      {pagina === 'recepciones' && <RecepcionesPage />}
      {pagina === 'reportes' && <ReportesPage />}
      {pagina === 'proveedores' && <ProveedoresPage />}
      {pagina === 'rubros' && <RubrosPage />}
      {pagina === 'ordenes-compra' && <OrdenesCompraPage />}
      {pagina === 'notas-proveedor' && <NotasProveedorPage />}
      {pagina === 'facturas-proveedor' && <FacturasProveedorPage />}
      {pagina === 'ordenes-pago' && <OrdenesPagoPage />}
    </AppShell>
  )
}

export default App
