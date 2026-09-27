import { useEffect, useState } from 'react'
import {
  Check,
  LogOut,
  MapPin,
  Phone,
  Shield,
  User,
  UserRound,
} from 'lucide-react'
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
      setAviso('Teléfono actualizado correctamente.')
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
      <label htmlFor="mis-datos-telefono" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
        Teléfono celular de contacto para chofer / logística
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <input
          id="mis-datos-telefono"
          type="tel"
          value={telefono}
          autoComplete="tel"
          placeholder="Ej: 387 412-3456"
          onChange={(event) => setTelefono(event.target.value)}
          style={{
            maxWidth: 320,
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--border-default)',
            fontSize: 14,
          }}
        />
        <Button
          type="submit"
          variant="primary"
          icon={Check}
          loading={guardando}
          loadingLabel="Guardando…"
          disabled={telefono.trim() === guardado.trim()}
        >
          Guardar teléfono
        </Button>
      </div>
      <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
        El chofer de la grúa utilizará este número para llamarte antes de salir hacia la obra.
      </p>
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

  if (cargando || !cliente) {
    return (
      <section className="tienda-datos-page">
        <Feedback>Cargando tus datos de cuenta…</Feedback>
      </section>
    )
  }

  const nombreCompleto = cliente.razon_social || `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim()

  return (
    <section className="tienda-datos-page" aria-labelledby="titulo-mis-datos">
      <div className="tienda-datos-header">
        <div>
          <h1 id="titulo-mis-datos">
            <UserRound size={26} aria-hidden="true" />
            Mi Cuenta y Datos Comerciales
          </h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Administrá tu información de contacto y tus direcciones de obra para envíos.
          </p>
        </div>

        <Button type="button" variant="ghost" icon={LogOut} onClick={cerrarSesion}>
          Cerrar Sesión
        </Button>
      </div>

      {error && <Feedback tone="error">{error}</Feedback>}

      <div className="tienda-datos-grid">
        {/* Tarjeta 1: Información de Identidad */}
        <div className="tienda-datos-card">
          <h2>
            <User size={20} aria-hidden="true" />
            Titular de la cuenta
          </h2>

          <dl className="tienda-datos-dl">
            <dt>Razón Social / Nombre:</dt>
            <dd><strong>{nombreCompleto}</strong></dd>

            <dt>{cliente.tipo_documento || 'Documento'}:</dt>
            <dd>{cliente.numero_documento || '—'}</dd>

            <dt>Condición IVA:</dt>
            <dd>{cliente.condicion_iva?.nombre || cliente.condicion_iva || 'Consumidor Final'}</dd>

            <dt>Email registrado:</dt>
            <dd>{cliente.email || '—'}</dd>
          </dl>

          <p style={{ margin: '14px 0 0 0', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={14} />
            Para modificar el nombre, documento o razón fiscal, comunicate con administración del corralón.
          </p>
        </div>

        {/* Tarjeta 2: Contacto Logístico */}
        <div className="tienda-datos-card">
          <h2>
            <Phone size={20} aria-hidden="true" />
            Contacto de Logística y Despacho
          </h2>
          <TelefonoForm key={cliente.id} cliente={cliente} />
        </div>

        {/* Tarjeta 3: Domicilios de Obra */}
        <div className="tienda-datos-card">
          <h2>
            <MapPin size={20} aria-hidden="true" />
            Direcciones de Obra y Domicilios de Entrega
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Guardá las direcciones de tus obras frecuentes para seleccionarlas rápidamente al momento de comprar.
          </p>
          <DomiciliosCliente clienteId={cliente.id} />
        </div>
      </div>
    </section>
  )
}
