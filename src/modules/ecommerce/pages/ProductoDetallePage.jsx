import { useEffect, useState } from 'react'
import { ArrowLeft, ShoppingCart } from 'lucide-react'
import { obtenerProducto } from '../api/catalogoApi'
import { useCarrito } from '../context/CarritoContext'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { EtiquetaDisponibilidad, ImagenProducto } from './CatalogoPage'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export default function ProductoDetallePage({ productoId, onVolver }) {
  const { agregar } = useCarrito()
  const [producto, setProducto] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [agregando, setAgregando] = useState(false)
  const [confirmacion, setConfirmacion] = useState('')
  const [errorCarrito, setErrorCarrito] = useState('')

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setError('')
    setProducto(null)
    obtenerProducto(productoId)
      .then((datos) => { if (vigente) setProducto(datos) })
      .catch((err) => { if (vigente) setError(err.message || 'No pudimos cargar el producto') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [productoId])

  const numero = Number(cantidad)
  const cantidadValida = Number.isInteger(numero) && numero > 0

  async function agregarAlCarrito(event) {
    event.preventDefault()
    setConfirmacion('')
    setErrorCarrito('')
    if (!cantidadValida) {
      setErrorCarrito('Ingresá una cantidad entera mayor a cero.')
      return
    }
    setAgregando(true)
    try {
      await agregar(producto.id, numero)
      setConfirmacion(`Agregamos ${numero} × ${producto.nombre} al carrito.`)
    } catch (err) {
      setErrorCarrito(err.message || 'No pudimos agregar el producto al carrito.')
    } finally {
      setAgregando(false)
    }
  }

  return (
    <section aria-busy={cargando} style={{ maxWidth: 1000, margin: '24px auto', padding: '0 16px' }}>
      <Button type="button" variant="ghost" icon={ArrowLeft} onClick={onVolver}>Volver al catálogo</Button>

      {cargando && <Feedback>Cargando producto…</Feedback>}
      {error && <Feedback tone="error">{error}</Feedback>}

      {producto && (
        <article aria-labelledby="titulo-producto" style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 16 }}>
          <ImagenProducto url={producto.imagen_url} nombre={producto.nombre} alto={360} />
          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <h1 id="titulo-producto" style={{ margin: 0 }}>{producto.nombre}</h1>
            <small>
              {[producto.marca_nombre, producto.categoria_nombre, `SKU ${producto.sku}`].filter(Boolean).join(' · ')}
            </small>
            <strong style={{ fontSize: 28 }}>
              {moneda.format(producto.precio)}
              {producto.unidad_medida && <span style={{ fontSize: 16, fontWeight: 400 }}> por {producto.unidad_medida.toLowerCase()}</span>}
            </strong>
            <EtiquetaDisponibilidad disponible={producto.disponible} />
            {producto.unidad_medida && (
              <p style={{ margin: 0 }}>
                Unidad de medida: {producto.unidad_medida}{producto.unidad_abreviatura ? ` (${producto.unidad_abreviatura})` : ''}
              </p>
            )}
            <p style={{ whiteSpace: 'pre-line' }}>{producto.descripcion || 'Este producto no tiene descripción.'}</p>

            <form onSubmit={agregarAlCarrito} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <label style={{ display: 'grid', gap: 4 }}>
                Cantidad
                <input type="number" min="1" step="1" inputMode="numeric" value={cantidad} style={{ width: 110 }}
                  disabled={!producto.disponible || agregando} aria-invalid={!cantidadValida}
                  onChange={(event) => { setCantidad(event.target.value); setConfirmacion('') }} />
              </label>
              <Button type="submit" icon={ShoppingCart} loading={agregando} loadingLabel="Agregando…"
                disabled={!producto.disponible || !cantidadValida}>
                Agregar al carrito
              </Button>
            </form>
            {!producto.disponible && <Feedback>Este producto está sin stock por el momento.</Feedback>}
            {confirmacion && <Feedback tone="success">{confirmacion}</Feedback>}
            {errorCarrito && <Feedback tone="error">{errorCarrito}</Feedback>}
          </div>
        </article>
      )}
    </section>
  )
}
