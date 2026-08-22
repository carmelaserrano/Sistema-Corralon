import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import LoginPage from './modules/auth/pages/LoginPage'
import HomePage from './modules/inicio/pages/HomePage'
import StockPage from './modules/stock/pages/StockPage'

function RutaProtegida({ children }) {
  const { session, loading, signOut } = useAuth()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/">← Inicio</Link>
        <span>{session.user.email}</span>
        <button onClick={signOut}>Salir</button>
      </header>
      {children}
    </div>
  )
}

function App() {
  const { loading } = useAuth()

  if (loading) return null

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/stock"
        element={
          <RutaProtegida>
            <StockPage />
          </RutaProtegida>
        }
      />
    </Routes>
  )
}

export default App
