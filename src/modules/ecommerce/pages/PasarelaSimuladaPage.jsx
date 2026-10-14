import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CreditCard, LoaderCircle } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { obtenerPedido, resolverPagoSimulado } from '../api/checkoutApi'
import { useCarrito } from '../context/CarritoContext'
import {
  TARJETA_RECHAZO,
  formatearNumeroTarjeta,
  formatearVencimiento,
  validarTarjeta,
} from '../pagoSimulado'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const TARJETA_VACIA = { numero: '', titular: '', vencimiento: '', cvv: '' }

export default function PasarelaSimuladaPage({ pedidoId, onNavigate }) {
  const { vaciar } = useCarrito()
  const [pedido, setPedido] = useState(null)
  const [fase, setFase] = useState('cargando')
  const [error, setError] = useState('')
  const [tarjeta, setTarjeta] = useState(TARJETA_VACIA)
  const [erroresTarjeta, setErroresTarjeta] = useState({})
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

  function actualizarCampo(campo, valor) {
    setTarjeta((actual) => ({ ...actual, [campo]: valor }))
    setErroresTarjeta((actuales) => ({ ...actuales, [campo]: undefined }))
  }

  function pagar(evento) {
    evento.preventDefault()
    const errores = validarTarjeta(tarjeta)
    setErroresTarjeta(errores)
    if (Object.keys(errores).length) return
    const numero = tarjeta.numero.replace(/\D/g, '')
    resolver(numero === TARJETA_RECHAZO ? 'rejected' : 'approved')
  }

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
        // Los datos de la tarjeta no se conservan una vez usados.
        setTarjeta(TARJETA_VACIA)
        // El servidor ya vació el carrito; sincronizar la vista sin condicionar el pago.
        try { await vaciar() } catch { /* El pago confirmado permanece aprobado. */ }
      } else {
        setFase('formulario')
        // Como en un pago real, el código de seguridad se vuelve a pedir.
        setTarjeta((actual) => ({ ...actual, cvv: '' }))
        setError('Pago rechazado. Podés volver a intentar.')
      }
    } catch (err) {
      if (activo.current) {
        setError(err.message || 'No pudimos confirmar el pago')
        setFase('formulario')
      }
    } finally { bloqueado.current = false }
  }

  const digitos = tarjeta.numero.replace(/\D/g, '')

  return <section className="tienda-pago-mock" aria-busy={fase === 'procesando'}>
    {error && <Feedback tone="error">{error}</Feedback>}
    <div key={fase} className="tienda-pago-mock-fase">
      {fase === 'cargando' && <p role="status">Consultando pedido…</p>}
      {fase === 'formulario' && <>
        <CreditCard size={36} aria-hidden="true" />
        <h1>Completá tu pago</h1>
        <p>Resumen del pedido <strong>#{pedido?.numero}</strong></p>
        <p>{pedido?.tipo_entrega === 'envio' ? 'Envío a domicilio' : 'Retiro en sucursal'}</p>
        <p>Total a pagar</p>
        <strong className="tienda-pago-mock-total">{moneda.format(Number(pedido?.total))}</strong>

        <div className="tienda-pago-mock-tarjeta" aria-hidden="true">
          <CreditCard />
          <strong>Tarjeta de crédito o débito</strong>
          <span>{digitos.length ? formatearNumeroTarjeta(digitos).padEnd(19, '•') : '•••• •••• •••• ••••'}</span>
          <small>{(tarjeta.titular.trim() || 'NOMBRE Y APELLIDO').toUpperCase()} · {tarjeta.vencimiento || 'MM/AA'}</small>
        </div>

        <form className="tienda-pago-mock-form" onSubmit={pagar} autoComplete="off" noValidate>
          <label className="tienda-pago-mock-campo tienda-pago-mock-campo-ancho">
            Número de tarjeta
            <input
              inputMode="numeric"
              placeholder="0000 0000 0000 0000"
              maxLength={19}
              value={tarjeta.numero}
              aria-invalid={Boolean(erroresTarjeta.numero)}
              onChange={(e) => actualizarCampo('numero', formatearNumeroTarjeta(e.target.value))}
            />
            {erroresTarjeta.numero && <small role="alert">{erroresTarjeta.numero}</small>}
          </label>
          <label className="tienda-pago-mock-campo tienda-pago-mock-campo-ancho">
            Nombre del titular
            <input
              placeholder="Como figura en la tarjeta"
              maxLength={60}
              value={tarjeta.titular}
              aria-invalid={Boolean(erroresTarjeta.titular)}
              onChange={(e) => actualizarCampo('titular', e.target.value)}
            />
            {erroresTarjeta.titular && <small role="alert">{erroresTarjeta.titular}</small>}
          </label>
          <label className="tienda-pago-mock-campo">
            Vencimiento
            <input
              inputMode="numeric"
              placeholder="MM/AA"
              maxLength={5}
              value={tarjeta.vencimiento}
              aria-invalid={Boolean(erroresTarjeta.vencimiento)}
              onChange={(e) => actualizarCampo('vencimiento', formatearVencimiento(e.target.value))}
            />
            {erroresTarjeta.vencimiento && <small role="alert">{erroresTarjeta.vencimiento}</small>}
          </label>
          <label className="tienda-pago-mock-campo">
            Código de seguridad
            <input
              inputMode="numeric"
              placeholder="CVV"
              maxLength={4}
              type="password"
              value={tarjeta.cvv}
              aria-invalid={Boolean(erroresTarjeta.cvv)}
              onChange={(e) => actualizarCampo('cvv', e.target.value.replace(/\D/g, ''))}
            />
            {erroresTarjeta.cvv && <small role="alert">{erroresTarjeta.cvv}</small>}
          </label>
          <p className="tienda-pago-mock-ayuda">
            Para probar un pago rechazado, usá la tarjeta 0000 0000 0000 0000.
          </p>
          <div className="tienda-pago-mock-acciones">
            <Button type="submit">Pagar {moneda.format(Number(pedido?.total))}</Button>
          </div>
        </form>
      </>}
      {fase === 'procesando' && <div role="status">
        <LoaderCircle className="tienda-pago-mock-spinner" size={48} aria-hidden="true" />
        <h1>Procesando pago...</h1><p>Estamos confirmando tu pedido.</p>
      </div>}
      {fase === 'aprobado' && <>
        <CheckCircle2 className="tienda-pago-mock-check" size={64} aria-hidden="true" />
        <h1>Pago aprobado</h1>
        <p role="status">¡Tu compra fue exitosa! Ya recibimos el pago.</p>
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
