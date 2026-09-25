import { useEffect, useState } from 'react'
import { ImageOff, ShoppingCart, Trash2 } from 'lucide-react'
import { useCarrito, useEstadoCarrito } from '../context/CarritoContext'
import { useClienteWeb } from '../context/ClienteWebContext'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

function CantidadItem({ item, disabled, actualizar }) {
  const [valor, setValor] = useState(String(item.cantidad))
  const [error, setError] = useState('')
  useEffect(() => { setValor(String(item.cantidad)) }, [item.cantidad])

  async function confirmar() {
    const cantidad = Number(valor)
    if (!valor.trim() || !Number.isFinite(cantidad) || cantidad < 0) {
      setError('Ingresá una cantidad mayor o igual a cero.')
      setValor(String(item.cantidad))
      return
    }
    setError('')
    if (cantidad === item.cantidad) return
    try {
      const nuevos = await actualizar(item.productoId, cantidad)
      const guardado = nuevos?.find((linea) => linea.productoId === item.productoId)
      if (guardado) setValor(String(guardado.cantidad))
    } catch {
      setValor(String(item.cantidad))
    }
  }

  return (
    <div>
      <input type="number" min="0" step="any" value={valor}
        aria-label={`Cantidad de ${item.nombre}`} aria-invalid={!!error}
        disabled={disabled} style={{ width: 110 }}
        onChange={(event) => setValor(event.target.value)} onBlur={confirmar}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      {error && <small role="alert" style={{ display: 'block', color: 'var(--color-danger)' }}>{error}</small>}
    </div>
  )
}

function ImagenProducto({ url, nombre }) {
  const [fallo, setFallo] = useState(false)
  useEffect(() => { setFallo(false) }, [url])
  return url && !fallo
    ? <img src={url} alt={nombre} width="64" height="64" style={{ objectFit: 'contain', borderRadius: 8 }} onError={() => setFallo(true)} />
    : <span role="img" aria-label="Sin imagen" style={{ width: 64, height: 64, display: 'inline-grid', placeItems: 'center', background: 'var(--surface-subtle)', borderRadius: 8 }}><ImageOff aria-hidden="true" /></span>
}

export default function CarritoPage({ onFinalizar, onIngresar }) {
  const { items, total, actualizar, quitar, vaciar } = useCarrito()
  const { cargando, error, recargar } = useEstadoCarrito()
  const { cliente } = useClienteWeb()
  const [aviso, setAviso] = useState('')

  // Los precios y la publicación pueden haber cambiado desde el catálogo.
  useEffect(() => { recargar() }, [recargar])

  async function finalizar() {
    setAviso('')
    try {
      const vigentes = await recargar()
      if (!vigentes?.length || vigentes.some((item) => !item.disponible)) {
        setAviso('Quitá los productos no disponibles antes de continuar.')
        return
      }
      const cambiaron = vigentes.some((item) => {
        const previo = items.find((linea) => linea.productoId === item.productoId)
        return !previo || previo.cantidad !== item.cantidad || previo.precioUnitario !== item.precioUnitario
      })
      if (cambiaron) {
        setAviso('Actualizamos precios o cantidades. Revisá el total y volvé a finalizar la compra.')
        return
      }
      if (cliente) onFinalizar?.()
      else onIngresar?.()
    } catch { /* El contexto muestra el error y permite reintentar. */ }
  }

  const noDisponibles = items.some((item) => !item.disponible)
  return (
    <section className="tienda-carrito" aria-labelledby="titulo-carrito" aria-busy={cargando} style={{ maxWidth: 1100, margin: '24px auto', padding: '0 16px' }}>
      <h1 id="titulo-carrito"><ShoppingCart size={26} aria-hidden="true" /> Tu carrito</h1>
      <p>Revisá tus productos antes de finalizar la compra.</p>
      {cargando && <Feedback>Actualizando carrito…</Feedback>}
      {aviso && <Feedback>{aviso}</Feedback>}
      {!items.length && !cargando && !error && <Feedback>Tu carrito está vacío. Agregá productos desde el catálogo.</Feedback>}
      {items.length > 0 && <>
        <div className="tienda-tabla-contenedor" style={{ overflowX: 'auto', background: 'var(--surface-panel)', borderRadius: 12, border: '1px solid var(--border-default)' }}>
          <table style={{ width: '100%' }}>
            <caption style={{ textAlign: 'left', padding: 16 }}>Productos de tu carrito</caption>
            <thead><tr><th scope="col">Producto</th><th scope="col">Precio unitario</th><th scope="col">Cantidad</th><th scope="col">Subtotal</th><th scope="col">Acciones</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.productoId}>
              <td><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ImagenProducto url={item.imagenUrl} nombre={item.nombre} />
                <div><strong>{item.nombre}</strong>{!item.disponible && <small style={{ display: 'block', color: 'var(--color-danger)' }}>{item.motivo} · No suma al total</small>}</div>
              </div></td>
              <td>{item.precioUnitario > 0 ? moneda.format(item.precioUnitario) : '—'}</td>
              <td><CantidadItem item={item} disabled={cargando || !item.disponible} actualizar={actualizar} /></td>
              <td>{item.disponible ? moneda.format(item.subtotal) : '—'}</td>
              <td><Button type="button" variant="ghost" icon={Trash2} disabled={cargando} aria-label={`Quitar ${item.nombre}`} onClick={() => quitar(item.productoId)}>Quitar</Button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 24 }}>
          <Button type="button" variant="ghost" disabled={cargando} onClick={vaciar}>Vaciar carrito</Button>
          <strong style={{ fontSize: 22 }}>Total: {moneda.format(total)}</strong>
          <Button type="button" disabled={cargando || !!error || noDisponibles} onClick={finalizar}>Finalizar compra</Button>
        </div>
        {noDisponibles && <Feedback>Quitá los productos no disponibles para finalizar la compra.</Feedback>}
        {!cliente && <p>Para finalizar la compra, primero vas a ingresar a tu cuenta.</p>}
      </>}
    </section>
  )
}
