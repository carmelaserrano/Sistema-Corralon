import { useState } from 'react'
import { useAuth } from './lib/AuthContext'
import LoginPage from './modules/auth/pages/LoginPage'
import StockPage from './modules/stock/pages/StockPage'
import CategoriasPage from './modules/stock/pages/CategoriasPage'

function App() {
  const { session, loading, signOut } = useAuth()
  const [pagina, setPagina] = useState('stock')

  if (loading) return null
  if (!session) return <LoginPage />

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{session.user.email}</span>
        <button onClick={signOut}>Salir</button>
      </header>

      <nav style={{ display: 'flex', gap: '8px', margin: '16px 0' }}>
        <button type="button" onClick={() => setPagina('stock')}>
          Stock
        </button>
        <button type="button" onClick={() => setPagina('categorias')}>
          Categorías
        </button>
      </nav>

      {pagina === 'stock' && <StockPage />}
      {pagina === 'categorias' && <CategoriasPage />}
    </div>
  )
}

export default App
