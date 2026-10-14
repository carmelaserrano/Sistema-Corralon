import { useState } from 'react'
import { LogIn, Package, ShoppingBag, UserRound } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import CuentaExitoCard from '../components/CuentaExitoCard'
import { useClienteWeb } from '../context/ClienteWebContext'

export default function IngresarPage({ onNavigate }) {
  const { cliente, ingresar, pendiente } = useClienteWeb()
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
  if (pendiente) return <section className="tienda-auth-card"><Feedback>Tu cuenta tiene un registro pendiente.</Feedback><Button onClick={() => onNavigate?.('registrarme')}>Completar registro</Button></section>

  if (cliente) {
    const nombre = cliente.nombre?.trim() || cliente.razon_social?.trim()
    return (
      <CuentaExitoCard
        tituloId="titulo-ingresar"
        titulo="¡Bienvenido de nuevo!"
        saludo={nombre ? `Hola, ${nombre}` : 'Hola'}
        descripcion="Ingresaste correctamente a tu cuenta. Ya podés continuar comprando y consultar tus pedidos."
        acciones={[
          { texto: 'Ir al catálogo', principal: true, onClick: () => onNavigate?.('catalogo') },
          { texto: 'Mis datos', onClick: () => onNavigate?.('mis-datos') },
          { texto: 'Mis pedidos', onClick: () => onNavigate?.('mis-pedidos') },
        ]}
        beneficios={[
          { texto: 'Consultar tus pedidos', icono: Package },
          { texto: 'Revisar tus datos', icono: UserRound },
          { texto: 'Continuar comprando', icono: ShoppingBag },
        ]}
      />
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
