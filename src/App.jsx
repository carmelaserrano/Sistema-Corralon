import { useState } from 'react'
import { useAuth } from './lib/AuthContext'
import LoginPage from './modules/auth/pages/LoginPage'
import StockPage from './modules/stock/pages/StockPage'
import DepositosPage from './modules/stock/pages/DepositosPage'
import CategoriasPage from './modules/stock/pages/CategoriasPage'
import MarcasPage from './modules/stock/pages/MarcasPage'
import UnidadesMedidaPage from './modules/stock/pages/UnidadesMedidaPage'
import ArticulosPage from './modules/stock/pages/ArticulosPage'
import ConfiguracionStockPage from './modules/stock/pages/ConfiguracionStockPage'

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
        
        <button type="button" onClick={() => setPagina('configuracion-stock')}>
          Configuración de stock
        </button>

      </nav>

      {pagina === 'stock' && <StockPage />}
      {pagina === 'depositos' && <DepositosPage />}
      {pagina === 'categorias' && <CategoriasPage />}
      {pagina === 'marcas' && <MarcasPage />}
      {pagina === 'unidades' && <UnidadesMedidaPage />}
      {pagina === 'articulos' && <ArticulosPage />}
      {pagina === 'configuracion-stock' && <ConfiguracionStockPage />}
    </div>
  )
}

export default App