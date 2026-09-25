import { useEffect, useRef, useState } from 'react'
import { MapPin, PackageCheck, Store } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { crearDomicilio, actualizarDomicilio, listarDomicilios } from '../../clientes/api/domiciliosApi'
import { crearPedidoWeb, iniciarPago } from '../api/checkoutApi'
import { useCarrito } from '../context/CarritoContext'
import { useClienteWeb } from '../context/ClienteWebContext'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const VACIO = { alias: '', calle: '', numero: '', localidad: 'Salta Capital', provincia: 'Salta', codigo_postal: '', referencias: '' }

export default function CheckoutPage({ onPasarelaSimulada, onVolverCarrito }) {
  const { cliente } = useClienteWeb()
  const { items, total } = useCarrito()
  const checkoutId = useRef(crypto.randomUUID())
  const [tipo, setTipo] = useState('retiro')
  const [domicilios, setDomicilios] = useState([])
  const [domicilioId, setDomicilioId] = useState('')
  const [formulario, setFormulario] = useState(VACIO)
  const [editando, setEditando] = useState(null)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return undefined
    listarDomicilios(cliente.id).then((lista) => {
      if (!activo) return
      setDomicilios(lista)
      setDomicilioId(lista.find((d) => d.es_principal)?.id || lista[0]?.id || '')
    }).catch((err) => activo && setError(err.message || 'No pudimos cargar tus domicilios'))
    return () => { activo = false }
  }, [cliente?.id])

  function cambiarCampo(event) {
    setFormulario((actual) => ({ ...actual, [event.target.name]: event.target.value }))
  }

  function abrirNuevo() {
    setEditando(null)
    setFormulario(VACIO)
    setMostrarFormulario(true)
  }

  function abrirEdicion(domicilio) {
    setEditando(domicilio.id)
    setFormulario(Object.fromEntries(Object.keys(VACIO).map((campo) => [campo, domicilio[campo] || ''])))
    setMostrarFormulario(true)
  }

  async function guardarDomicilio(event) {
    event.preventDefault()
    setCargando(true)
    setError('')
    try {
      const guardado = editando
        ? await actualizarDomicilio(editando, formulario)
        : await crearDomicilio(cliente.id, formulario)
      const lista = await listarDomicilios(cliente.id)
      setDomicilios(lista)
      setDomicilioId(guardado.id)
      setMostrarFormulario(false)
    } catch (err) {
      setError(err.message || 'No pudimos guardar el domicilio')
    } finally {
      setCargando(false)
    }
  }

  async function confirmar() {
    setCargando(true)
    setError('')
    try {
      const pedido = await crearPedidoWeb({ checkoutId: checkoutId.current, tipoEntrega: tipo, domicilioId })
      if (import.meta.env.VITE_PAGO_SIMULADO === 'true') {
        onPasarelaSimulada?.(pedido.id)
      } else {
        const preferencia = await iniciarPago(pedido.id)
        window.location.assign(preferencia.init_point)
      }
    } catch (err) {
      setError(err.message || 'No pudimos crear el pedido')
    } finally {
      setCargando(false)
    }
  }

  if (!cliente) return <Feedback tone="error">Necesitás iniciar sesión para completar la compra.</Feedback>
  if (!items.length) return <section style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}><h1>Checkout</h1><Feedback>Tu carrito está vacío.</Feedback></section>

  return (
    <section aria-labelledby="checkout-titulo" aria-busy={cargando} style={{ maxWidth: 960, margin: '24px auto', padding: '0 16px' }}>
      <h1 id="checkout-titulo"><PackageCheck size={28} aria-hidden="true" /> Checkout</h1>
      <p>Elegí cómo querés recibir el pedido. La sucursal que lo prepara se asigna automáticamente según el stock.</p>
      {error && <Feedback tone="error">{error}</Feedback>}

      <div style={{ display: 'grid', gap: 12, margin: '24px 0' }}>
        <label style={{ padding: 16, border: `2px solid ${tipo === 'retiro' ? 'var(--color-brand)' : 'var(--border-default)'}`, borderRadius: 12, background: 'var(--surface-panel)' }}>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="radio" name="entrega" checked={tipo === 'retiro'} onChange={() => setTipo('retiro')} /><Store size={20} /> <strong>Retiro en sucursal</strong></span>
          <small>Te avisaremos cuál sucursal prepara el pedido.</small>
        </label>
        <label style={{ padding: 16, border: `2px solid ${tipo === 'envio' ? 'var(--color-brand)' : 'var(--border-default)'}`, borderRadius: 12, background: 'var(--surface-panel)' }}>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="radio" name="entrega" checked={tipo === 'envio'} onChange={() => setTipo('envio')} /><MapPin size={20} /> <strong>Envío</strong></span>
          <small>Envío gratis en Salta Capital.</small>
        </label>
      </div>

      {tipo === 'envio' && <div style={{ padding: 20, border: '1px solid var(--border-default)', borderRadius: 12, background: 'var(--surface-panel)' }}>
        <h2 style={{ marginTop: 0 }}>Domicilio de entrega</h2>
        {domicilios.map((domicilio) => <div key={domicilio.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-default)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="radio" name="domicilio" checked={domicilioId === domicilio.id} onChange={() => setDomicilioId(domicilio.id)} />
            <span><strong>{domicilio.alias}</strong><br /><small>{domicilio.calle} {domicilio.numero}, {domicilio.localidad}</small></span>
          </label>
          <Button type="button" variant="ghost" onClick={() => abrirEdicion(domicilio)}>Modificar</Button>
        </div>)}
        <Button type="button" variant="ghost" onClick={abrirNuevo} style={{ marginTop: 12 }}>Agregar domicilio</Button>

        {mostrarFormulario && <form onSubmit={guardarDomicilio} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginTop: 20 }}>
          {['alias', 'calle', 'numero', 'localidad', 'provincia', 'codigo_postal', 'referencias'].map((campo) => <label key={campo}>{campo.replace('_', ' ')}
            <input name={campo} value={formulario[campo]} required={!['codigo_postal', 'referencias'].includes(campo)} onChange={cambiarCampo} />
          </label>)}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
            <Button type="submit" loading={cargando}>Guardar domicilio</Button>
            <Button type="button" variant="ghost" onClick={() => setMostrarFormulario(false)}>Cancelar</Button>
          </div>
        </form>}
      </div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginTop: 24 }}>
        <Button type="button" variant="ghost" onClick={onVolverCarrito}>Volver al carrito</Button>
        <div><small>{items.length} producto(s)</small><br /><strong style={{ fontSize: 24 }}>Total: {moneda.format(total)}</strong></div>
        <Button type="button" loading={cargando} loadingLabel="Reservando stock…" disabled={tipo === 'envio' && !domicilioId} onClick={confirmar}>Confirmar y pagar</Button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>El pago se realiza en la pasarela segura. El sistema no recibe ni guarda datos de tu tarjeta.</p>
    </section>
  )
}
