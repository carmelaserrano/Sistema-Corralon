import { useEffect, useState } from 'react'
import { LogOut, UserRound } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import DomiciliosCliente from '../../clientes/components/DomiciliosCliente'
import { useClienteWeb } from '../context/ClienteWebContext'
import { actualizarTelefono } from '../api/clienteWebApi'

function TelefonoForm({ cliente }) {
  const [telefono, setTelefono] = useState(cliente.telefono ?? '')
  const [guardado, setGuardado] = useState(cliente.telefono ?? '')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(event) {
    event.preventDefault()
    setError('')
    setAviso('')
    setGuardando(true)
    try {
      const actualizado = await actualizarTelefono(telefono)
      setTelefono(actualizado.telefono)
      setGuardado(actualizado.telefono)
      setAviso('Teléfono actualizado')
    } catch (err) {
      setError(err.message || 'No se pudo actualizar tu teléfono')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} noValidate aria-busy={guardando}>
      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}
      <label htmlFor="mis-datos-telefono">Teléfono</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <input id="mis-datos-telefono" type="tel" value={telefono} autoComplete="tel"
          onChange={(event) => setTelefono(event.target.value)} />
        <Button type="submit" loading={guardando} loadingLabel="Guardando…"
          disabled={telefono.trim() === guardado.trim()}>
          Guardar teléfono
        </Button>
      </div>
    </form>
  )
}

export default function MisDatosPage({ onNavigate }) {
  const { cliente, cargando, salir } = useClienteWeb()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!cargando && !cliente) onNavigate?.('ingresar')
  }, [cargando, cliente, onNavigate])

  async function cerrarSesion() {
    setError('')
    try {
      await salir()
      onNavigate?.('catalogo')
    } catch {
      setError('No se pudo cerrar la sesión. Intentá de nuevo.')
    }
  }

  const contenedor = { maxWidth: 900, margin: '24px auto', padding: '0 16px' }
  if (cargando || !cliente) {
    return <section style={contenedor}><Feedback>Cargando tus datos…</Feedback></section>
  }

  return (
    <section aria-labelledby="titulo-mis-datos" style={contenedor}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 id="titulo-mis-datos"><UserRound size={26} aria-hidden="true" /> Mis datos</h1>
        <Button type="button" variant="ghost" icon={LogOut} onClick={cerrarSesion}>Salir</Button>
      </div>
      {error && <Feedback tone="error">{error}</Feedback>}

      <dl>
        <dt>Nombre</dt>
        <dd>{cliente.razon_social || `${cliente.nombre} ${cliente.apellido}`}</dd>
        <dt>{cliente.tipo_documento}</dt>
        <dd>{cliente.numero_documento}</dd>
        <dt>Email</dt>
        <dd>{cliente.email || '—'}</dd>
      </dl>
      <p><small>Para cambiar tu nombre o tu documento, consultá en una sucursal.</small></p>

      <h2>Contacto</h2>
      <TelefonoForm key={cliente.id} cliente={cliente} />

      <h2>Domicilios de entrega</h2>
      <DomiciliosCliente clienteId={cliente.id} />
    </section>
  )
}
