import { useState } from 'react'
import { useAuth } from '../../../lib/AuthContext'
import { LockKeyhole, Mail } from 'lucide-react'
import logoCorralon from '../../../assets/logo-corralon-norte.png'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel" aria-label="Corralón Norte">
        <div className="login-logo-card">
          <img src={logoCorralon} alt="Corralón Norte" className="login-logo" />
        </div>
        <div className="login-hero-copy">
          <span className="eyebrow">BIENVENIDO A CORRALÓN NORTE</span>
          <h1>Materiales en orden, obras a tiempo.</h1>
          <p>
            El sistema de gestión del corralón: stock, ventas, compras y tienda
            online. Controlá existencias, pedidos y entregas para que cada cliente
            reciba lo que necesita cuando lo necesita.
          </p>
        </div>      </section>

      <section className="login-form-panel">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="eyebrow">ACCESO AL SISTEMA</span>
            <h2>Ingresar</h2>
            <p>Usá tus credenciales para acceder al sistema.</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              <span>Email</span>
              <span className="input-with-icon">
                <Mail size={17} aria-hidden="true" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@empresa.com"
                  autoComplete="email"
                  required
                />
              </span>
            </label>
            <label>
              <span>Contraseña</span>
              <span className="input-with-icon">
                <LockKeyhole size={17} aria-hidden="true" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresá tu contraseña"
                  autoComplete="current-password"
                  required
                />
              </span>
            </label>
            {error && (
              <Feedback tone="error">{error}</Feedback>
            )}
            <Button
              className="login-submit"
              type="submit"
              loading={loading}
              loadingLabel="Ingresando..."
            >
              Ingresar
            </Button>
          </form>
          <p className="login-help">Si no podés ingresar, contactá al administrador.</p>
        </div>
      </section>
    </main>
  )
}
