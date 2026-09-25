import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { obtenerPedido } from '../api/checkoutApi'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export default function PagoResultadoPage({ pedidoId, resultado, onReintentar, onIrCatalogo }) {
  const [pedido, setPedido] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [reintentando, setReintentando] = useState(false)
  const [error, setError] = useState('')
  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try { setPedido(await obtenerPedido(pedidoId)) }
    catch (err) { setError(err.message || 'No pudimos consultar el pedido') }
    finally { setCargando(false) }
  }, [pedidoId])
  useEffect(() => { cargar() }, [cargar])

  const aprobado = pedido?.estado === 'Pagado'
  const cancelado = pedido?.estado === 'Cancelado'
  const fallo = ['rejected', 'cancelled'].includes(pedido?.pago_estado) || ['rechazado', 'cancelado'].includes(resultado)
  const Icono = aprobado ? CheckCircle2 : fallo || cancelado ? XCircle : Clock3
  const titulo = aprobado ? '¡Pago aprobado!' : cancelado ? 'El pedido venció' : fallo ? 'El pago no se completó' : 'Estamos confirmando el pago'

  async function reintentar() {
    setReintentando(true)
    setError('')
    try { await onReintentar?.(pedidoId) }
    catch (err) { setError(err.message || 'No pudimos reiniciar el pago') }
    finally { setReintentando(false) }
  }

  return <section style={{ maxWidth: 680, margin: '40px auto', padding: 24, textAlign: 'center', background: 'var(--surface-panel)', border: '1px solid var(--border-default)', borderRadius: 16 }}>
    <Icono size={54} aria-hidden="true" color={aprobado ? 'var(--color-success)' : fallo || cancelado ? 'var(--color-danger)' : 'var(--color-info)'} />
    <h1>{titulo}</h1>
    {cargando && <Feedback>Consultando el estado del pedido…</Feedback>}
    {error && <Feedback tone="error">{error}</Feedback>}
    {pedido && <p>Pedido <strong>#{pedido.numero}</strong> · {moneda.format(Number(pedido.total))}</p>}
    {aprobado && <Feedback tone="success">Recibimos el pago y vaciamos tu carrito.</Feedback>}
    {!aprobado && !cancelado && fallo && <Feedback tone="error">{pedido?.pago_motivo || 'La pasarela rechazó o canceló el pago.'} El pedido sigue pendiente y podés reintentar.</Feedback>}
    {!aprobado && !cancelado && !fallo && <Feedback>La notificación puede demorar unos segundos. Actualizá el estado antes de volver a pagar.</Feedback>}
    {cancelado && <Feedback tone="error">Pasaron más de 60 minutos y liberamos el stock reservado.</Feedback>}
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 24 }}>
      {!aprobado && !cancelado && <Button type="button" loading={reintentando} onClick={reintentar}>Reintentar pago</Button>}
      {!aprobado && !cancelado && <Button type="button" variant="ghost" disabled={cargando} onClick={cargar}>Actualizar estado</Button>}
      <Button type="button" variant="ghost" onClick={onIrCatalogo}>Volver a la tienda</Button>
    </div>
  </section>
}
