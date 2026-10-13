import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CreditCard, LoaderCircle } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { obtenerPedido, resolverPagoSimulado } from '../api/checkoutApi'
import { useCarrito } from '../context/CarritoContext'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export default function PasarelaSimuladaPage({ pedidoId, onNavigate }) {
  const { vaciar } = useCarrito()
  const [pedido, setPedido] = useState(null)
  const [fase, setFase] = useState('cargando')
  const [error, setError] = useState('')
  const bloqueado = useRef(false)
  const activo = useRef(false)

  useEffect(() => {
    activo.current = true
    obtenerPedido(pedidoId).then((data) => {
      if (!activo.current) return
      if (!data) throw new Error('Pedido no disponible')
      setPedido(data)
      setFase(data.estado === 'Pagado' ? 'aprobado' : 'formulario')
    }).catch((err) => activo.current && setError(err.message))
    return () => { activo.current = false }
  }, [pedidoId])

  async function resolver(estado) {
    if (bloqueado.current || fase !== 'formulario') return
    bloqueado.current = true
    setFase('procesando')
    setError('')
    try {
      const [actualizado] = await Promise.all([
        resolverPagoSimulado(pedidoId, estado),
        new Promise((resolve) => setTimeout(resolve, 650)),
      ])
      if (!activo.current) return
      setPedido(actualizado)
      if (actualizado.estado === 'Pagado') {
        setFase('aprobado')
        // El servidor ya vació el carrito; sincronizar la vista sin condicionar el pago.
        try { await vaciar() } catch { /* El pago confirmado permanece aprobado. */ }
      } else {
        setFase('formulario')
        setError('Pago rechazado de forma simulada. Podés volver a intentar.')
      }
    } catch (err) {
      if (activo.current) {
        setError(err.message || 'No pudimos confirmar el pago')
        setFase('formulario')
      }
    } finally { bloqueado.current = false }
  }

  return <section className="tienda-pago-mock" aria-busy={fase === 'procesando'}>
    <span className="tienda-chip">Demostración · sin cobros reales</span>
    {error && <Feedback tone="error">{error}</Feedback>}
    <div key={fase} className="tienda-pago-mock-fase" role="status" aria-live="polite">
      {fase === 'cargando' && <p>Consultando pedido…</p>}
      {fase === 'formulario' && <>
        <CreditCard size={36} aria-hidden="true" />
        <h1>Completá tu pago</h1>
        <p>Resumen del pedido <strong>#{pedido?.numero}</strong></p>
        <p>{pedido?.tipo_entrega === 'envio' ? 'Envío a domicilio' : 'Retiro en sucursal'}</p>
        <p>Total a pagar</p>
        <strong className="tienda-pago-mock-total">{moneda.format(Number(pedido?.total))}</strong>
        <div className="tienda-pago-mock-tarjeta">
          <CreditCard aria-hidden="true" /><strong>Tarjeta de demostración</strong>
          <span>•••• •••• •••• 4242</span><small>TITULAR DEMO · 12/30</small>
        </div>
        <p>No ingreses números de tarjeta ni CVV. Todos los datos son ficticios.</p>
        <div className="tienda-pago-mock-acciones">
          <Button type="button" onClick={() => resolver('approved')}>Pagar</Button>
          <Button type="button" variant="ghost" onClick={() => resolver('rejected')}>Simular rechazo</Button>
        </div>
      </>}
      {fase === 'procesando' && <>
        <LoaderCircle className="tienda-pago-mock-spinner" size={48} aria-hidden="true" />
        <h1>Procesando pago...</h1><p>Estamos confirmando tu pedido.</p>
      </>}
      {fase === 'aprobado' && <>
        <CheckCircle2 className="tienda-pago-mock-check" size={64} aria-hidden="true" />
        <h1>Pago aprobado</h1>
        <p>¡Tu compra fue exitosa! Ya recibimos el pago simulado.</p>
        <p>Pedido <strong>#{pedido?.numero}</strong></p>
        <strong className="tienda-pago-mock-total">{moneda.format(Number(pedido?.total))}</strong>
        <div className="tienda-pago-mock-acciones">
          <Button type="button" onClick={() => onNavigate?.('mis-pedidos')}>Mis pedidos</Button>
          <Button type="button" variant="ghost" onClick={() => onNavigate?.('catalogo')}>Volver a la tienda</Button>
        </div>
      </>}
    </div>
  </section>
}
