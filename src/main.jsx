import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import TiendaApp from './modules/ecommerce/TiendaApp.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'
import './index.css'

const esTienda = window.location.pathname.startsWith('/tienda')

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    {esTienda ? (
      <TiendaApp />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
)
