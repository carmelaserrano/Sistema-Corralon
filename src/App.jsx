import { useState } from 'react'
import { useAuth } from './lib/AuthContext'
import LoginPage from './modules/auth/pages/LoginPage'
import StockPage from './modules/stock/pages/StockPage'
import DepositosPage from './modules/stock/pages/DepositosPage'

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

      <nav
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '16px',
          marginBottom: '16px',
        }}
      >
        <button type="button" onClick={() => setPagina('stock')}>
          Stock
        </button>

        <button type="button" onClick={() => setPagina('depositos')}>
          Depósitos
        </button>
      </nav>

      {pagina === 'stock' && <StockPage />}
      {pagina === 'depositos' && <DepositosPage />}
    </div>
  )
}

export default App