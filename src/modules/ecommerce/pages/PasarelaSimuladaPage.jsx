import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { resolverPagoSimulado } from '../api/checkoutApi'
import { useCarrito } from '../context/CarritoContext'

export default function PasarelaSimuladaPage({ pedidoId, onResultado }) {
  const { vaciar } = useCarrito()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function resolver(estado) {
    setCargando(true)
    setError('')
    try {
      await resolverPagoSimulado(pedidoId, estado)
      if (estado === 'approved') await vaciar()
      onResultado?.(pedidoId, estado)
    } catch (err) {
      setError(err.message || 'No pudimos procesar la simulación')
    } finally { setCargando(false) }
  }

  return <section style={{ maxWidth: 620, margin: '40px auto', padding: 28, textAlign: 'center', background: 'var(--surface-panel)', border: '2px dashed var(--color-info)', borderRadius: 16 }}>
    <CreditCard size={48} aria-hidden="true" />
    <h1>Pasarela simulada</h1>
    <Feedback>Modo exclusivo para QA. No se solicitan ni procesan datos de tarjeta.</Feedback>
    <p>Pedido: <strong>{pedidoId}</strong></p>
    {error && <Feedback tone="error">{error}</Feedback>}
    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
      <Button type="button" loading={cargando} onClick={() => resolver('approved')}>Aprobar</Button>
      <Button type="button" variant="ghost" disabled={cargando} onClick={() => resolver('rejected')}>Rechazar</Button>
    </div>
  </section>
}
