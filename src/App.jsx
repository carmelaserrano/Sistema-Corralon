import { useAuth } from './lib/AuthContext'
import LoginPage from './modules/auth/pages/LoginPage'
import StockPage from './modules/stock/pages/StockPage'

function App() {
  const { session, loading, signOut } = useAuth()

  if (loading) return null
  if (!session) return <LoginPage />

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{session.user.email}</span>
        <button onClick={signOut}>Salir</button>
      </header>
      <StockPage />
    </div>
  )
}

export default App
