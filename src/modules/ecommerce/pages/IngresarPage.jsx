import { useState } from 'react'
import { LogIn } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { useClienteWeb } from '../context/ClienteWebContext'

export default function IngresarPage({ onNavigate }) {
  const { cliente, ingresar } = useClienteWeb()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(event) {
    event.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Ingresá tu email y tu contraseña.')
      return
    }
    setEnviando(true)
    try {
      await ingresar(email, password)
      setPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const contenedor = { maxWidth: 480, margin: '24px auto', padding: '0 16px' }

  // Sin redirección automática: si el ingreso vino del carrito, TiendaApp
  // vuelve al carrito sola al aparecer el cliente.
  if (cliente) {
    return (
      <section className="tienda-auth-card" aria-labelledby="titulo-ingresar" style={contenedor}>
        <h1 id="titulo-ingresar">Hola, {cliente.nombre || cliente.razon_social}</h1>
        <Feedback tone="success">Ya ingresaste a tu cuenta.</Feedback>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Button type="button" onClick={() => onNavigate?.('catalogo')}>Ir al catálogo</Button>
          <Button type="button" variant="ghost" onClick={() => onNavigate?.('mis-datos')}>Mis datos</Button>
        </div>
      </section>
    )
  }

  return (
    <section className="tienda-auth-card" aria-labelledby="titulo-ingresar" style={contenedor}>
      <h1 id="titulo-ingresar"><LogIn size={26} aria-hidden="true" /> Ingresar</h1>
      {error && <Feedback tone="error">{error}</Feedback>}
      <form onSubmit={enviar} noValidate aria-busy={enviando}>
        <div>
          <label htmlFor="ingresar-email">Email</label>
          <input id="ingresar-email" type="email" value={email} autoComplete="email"
            onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div>
          <label htmlFor="ingresar-password">Contraseña</label>
          <input id="ingresar-password" type="password" value={password} autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <Button type="submit" loading={enviando} loadingLabel="Ingresando…">Ingresar</Button>
          <Button type="button" variant="ghost" disabled={enviando} onClick={() => onNavigate?.('registrarme')}>
            Crear una cuenta
          </Button>
        </div>
      </form>
    </section>
  )
}
