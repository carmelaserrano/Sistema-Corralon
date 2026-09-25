import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { obtenerPedido, reconciliarPago } from '../api/checkoutApi'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const POLL_INTERVALS = [0, 3000, 5000, 7000, 10000, 15000]
const ESTADOS_FINALES = ['Pagado', 'Cancelado']
const PAGO_ESTADOS_FINALES = ['approved', 'rejected', 'cancelled']

export default function PagoResultadoPage({ pedidoId, resultado, onReintentar, onIrCatalogo }) {
  const [pedido, setPedido] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [reconciliando, setReconciliando] = useState(false)
  const [reintentando, setReintentando] = useState(false)
  const [error, setError] = useState('')
  const [mensajeReconciliacion, setMensajeReconciliacion] = useState('')
  const timersRef = useRef([])
  const desmontadoRef = useRef(false)

  // Cancel all pending timers
  const cancelarTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const data = await obtenerPedido(pedidoId)
      if (!desmontadoRef.current) setPedido(data)
      return data
    } catch (err) {
      if (!desmontadoRef.current) setError(err.message || 'No pudimos consultar el pedido')
      return null
    } finally {
      if (!desmontadoRef.current) setCargando(false)
    }
  }, [pedidoId])

  // Reconcile + reload
  const actualizarEstado = useCallback(async () => {
    if (desmontadoRef.current) return
    setReconciliando(true)
    setError('')
    setMensajeReconciliacion('')
    try {
      const resp = await reconciliarPago(pedidoId)
      if (resp?.mensaje && !desmontadoRef.current) {
        setMensajeReconciliacion(resp.mensaje)
      }
    } catch (err) {
      if (!desmontadoRef.current) setError(err.message || 'No pudimos reconciliar el pago')
    }
    // Always reload the order after reconciliation attempt
    await cargar()
    if (!desmontadoRef.current) setReconciliando(false)
  }, [pedidoId, cargar])

  // Auto-polling on mount: reconcile immediately, then poll a few times
  useEffect(() => {
    desmontadoRef.current = false
    cancelarTimers()

    let cancelado = false

    async function poll(intentoIdx) {
      if (cancelado || desmontadoRef.current) return

      // First attempt: reconcile
      if (intentoIdx === 0) {
        setReconciliando(true)
        try {
          const resp = await reconciliarPago(pedidoId)
          if (resp?.mensaje && !desmontadoRef.current) {
            setMensajeReconciliacion(resp.mensaje)
          }
        } catch {
          // Reconciliation failed silently on first load, we'll just load the order
        }
        if (!desmontadoRef.current) setReconciliando(false)
      }

      const data = await cargar()
      if (cancelado || desmontadoRef.current) return

      // Stop polling if we reached a terminal state
      if (data && (ESTADOS_FINALES.includes(data.estado) || PAGO_ESTADOS_FINALES.includes(data.pago_estado))) {
        return
      }

      // Schedule next poll if there are more intervals
      const nextIdx = intentoIdx + 1
      if (nextIdx < POLL_INTERVALS.length) {
        const timer = setTimeout(() => poll(nextIdx), POLL_INTERVALS[nextIdx])
        timersRef.current.push(timer)
      }
    }

    poll(0)

    return () => {
      cancelado = true
      desmontadoRef.current = true
      cancelarTimers()
    }
  }, [pedidoId, cargar, cancelarTimers])

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
    {mensajeReconciliacion && !aprobado && !error && <Feedback>{mensajeReconciliacion}</Feedback>}
    {pedido && <p>Pedido <strong>#{pedido.numero}</strong> · {moneda.format(Number(pedido.total))}</p>}
    {aprobado && <Feedback tone="success">Recibimos el pago y vaciamos tu carrito.</Feedback>}
    {!aprobado && !cancelado && fallo && <Feedback tone="error">{pedido?.pago_motivo || 'La pasarela rechazó o canceló el pago.'} El pedido sigue pendiente y podés reintentar.</Feedback>}
    {!aprobado && !cancelado && !fallo && <Feedback>La notificación puede demorar unos segundos. Actualizá el estado antes de volver a pagar.</Feedback>}
    {cancelado && <Feedback tone="error">Pasaron más de 60 minutos y liberamos el stock reservado.</Feedback>}
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 24 }}>
      {!aprobado && !cancelado && <Button type="button" loading={reintentando} disabled={reconciliando} onClick={reintentar}>Reintentar pago</Button>}
      {!aprobado && !cancelado && <Button type="button" variant="ghost" disabled={cargando || reconciliando} onClick={actualizarEstado}>{reconciliando ? 'Reconciliando…' : 'Actualizar estado'}</Button>}
      <Button type="button" variant="ghost" onClick={onIrCatalogo}>Volver a la tienda</Button>
    </div>
  </section>
}
