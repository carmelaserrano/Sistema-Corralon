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

function App() {
  const { session, loading, signOut } = useAuth()
  const [pagina, setPagina] = useState('stock')

  if (loading) return null
  if (!session) return <LoginPage />

  return (
    <div>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{session.user.email}</span>
        <button onClick={signOut}>Salir</button>
      </header>

      <nav style={{ display: 'flex', gap: '8px', margin: '16px 0' }}>
        <button type="button" onClick={() => setPagina('stock')}>
          Stock
        </button>

        <button type="button" onClick={() => setPagina('depositos')}>
          Depósitos
        </button>

        <button type="button" onClick={() => setPagina('categorias')}>
          Categorías
        </button>

        <button type="button" onClick={() => setPagina('marcas')}>
          Marcas
        </button>

        <button type="button" onClick={() => setPagina('unidades')}>
          Unidades de medida
        </button>

        <button type="button" onClick={() => setPagina('articulos')}>
          Artículos
        </button>

        <button type="button" onClick={() => setPagina('movimientos')}>
          Movimientos
        </button>

        <button type="button" onClick={() => setPagina('configuracion-stock')}>
          Configuración de stock
        </button>


        <button type="button" onClick={() => setPagina('inventario-fisico')}>
          Inventario físico
        </button>

        <button type="button" onClick={() => setPagina('alertas-stock')}>
          Alertas Stock
        </button>

        <button type="button" onClick={() => setPagina('recepciones')}>
          Recepciones
        </button>

      </nav>

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
    </div>
  )
}

export default App