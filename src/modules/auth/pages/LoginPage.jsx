import { useState } from 'react'
import { useAuth } from '../../../lib/AuthContext'
import { Boxes, LockKeyhole, Mail } from 'lucide-react'
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
      <section className="login-brand-panel" aria-label="Sistema Corralón">
        <div className="login-brand">
          <span className="brand-mark brand-mark-large">
            <Boxes size={28} strokeWidth={2.2} />
          </span>
          <span>
            <strong>Sistema Corralón</strong>
            <small>Gestión integral de stock</small>
          </span>
        </div>
        <div className="login-hero-copy">
          <span className="eyebrow">OPERACIÓN CENTRALIZADA</span>
          <h1>Control preciso para cada movimiento.</h1>
          <p>
            Existencias, recepciones e inventario en una interfaz clara,
            confiable y preparada para el trabajo diario.
          </p>
        </div>
        <span className="login-version">Módulo Stock · Sprint 1</span>
      </section>

      <section className="login-form-panel">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="eyebrow">BIENVENIDO</span>
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
