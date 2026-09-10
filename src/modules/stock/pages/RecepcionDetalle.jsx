import { useEffect, useState } from 'react'
import { getRecepcionById, getDetalleOrdenRecepcion } from '../api/recepcionesApi'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import EmptyState from '../../../components/ui/EmptyState'

const moneda = (valor) => Number(valor).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const estadoOrden = (estado) => ({ pendiente: 'Pendiente', parcialmente_recibida: 'Parcial', recibida: 'Recibida', cancelada: 'Cancelada' }[estado] || 'No disponible')

export default function RecepcionDetalle({ id, onVolver }) {
  const [recepcion, setRecepcion] = useState(null)
  const [renglones, setRenglones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    async function cargar() {
      setLoading(true)
      setError('')
      try {
        const rec = await getRecepcionById(id)
        const detalleOC = rec.orden_compra_id ? await getDetalleOrdenRecepcion(rec.orden_compra_id) : []
        if (vigente) { setRecepcion(rec); setRenglones(detalleOC) }
      } catch (err) {
        if (vigente) setError(err.message || 'No se pudo cargar el detalle de la recepción')
      } finally { if (vigente) setLoading(false) }
    }
    cargar()
    return () => { vigente = false }
  }, [id, intento])

  return <main className="recepciones-page">
    <header className="recepcion-detalle-header">
      <h1>Detalle de recepción{recepcion ? ` N.º ${recepcion.numero}` : ''}</h1>
      <Button variant="secondary" onClick={onVolver}>Volver a recepciones</Button>
    </header>
    {loading ? <Feedback>Cargando detalle de recepción...</Feedback> : error ? <>
      <Feedback tone="error">{error}</Feedback>
      <Button onClick={() => setIntento((actual) => actual + 1)}>Reintentar</Button>
    </> : recepcion && <>
      <section>
        <h2>Datos de la recepción</h2>
        <dl className="recepcion-datos">
          <div><dt>Estado de la recepción</dt><dd>Confirmada</dd></div>
          <div><dt>Orden de compra</dt><dd>OC #{recepcion.orden?.numero || '—'}</dd></div>
          <div><dt>Estado actual de la OC</dt><dd>{estadoOrden(recepcion.orden?.estado)}</dd></div>
          <div><dt>Proveedor</dt><dd>{recepcion.orden?.proveedor?.razon_social || '—'}</dd></div>
          <div><dt>Depósito de destino</dt><dd>{recepcion.destino?.nombre || '—'}</dd></div>
          <div><dt>Fecha y hora de confirmación</dt><dd>{new Date(recepcion.confirmado_at || recepcion.created_at).toLocaleString('es-AR')}</dd></div>
          <div><dt>Usuario que confirmó</dt><dd>{recepcion.confirmado_by || recepcion.created_by}</dd></div>
          <div><dt>Observaciones</dt><dd>{recepcion.observaciones || 'Sin observaciones'}</dd></div>
        </dl>
        <Feedback>Esta recepción registra los productos que ingresaron al depósito. La OC queda completa cuando se recibe todo lo pendiente.</Feedback>
      </section>
      <section>
        <h2>Artículos recibidos en esta recepción</h2>
        {!(recepcion.detalle ?? []).length ? <EmptyState title="No hay artículos registrados" description="Esta recepción no tiene detalle disponible." /> :
          <table><thead><tr><th>Artículo</th><th>Cantidad recibida</th><th>Costo unitario</th><th>Subtotal</th></tr></thead>
            <tbody>{recepcion.detalle.map((item) => <tr key={item.id}>
              <td>{item.producto?.sku} — {item.producto?.nombre}</td><td>{item.cantidad}</td>
              <td>{moneda(item.costo_unitario)}</td><td>{moneda(Number(item.cantidad) * Number(item.costo_unitario))}</td>
            </tr>)}</tbody></table>}
      </section>
      <section>
        <h2>Seguimiento actual de la orden de compra</h2>
        <p>Incluye todas las recepciones confirmadas de esta OC, también las posteriores a esta recepción.</p>
        {!renglones.length ? <Feedback>No hay detalle de la OC disponible.</Feedback> :
          <table><thead><tr><th>Artículo</th><th>Cantidad pedida en la OC</th><th>Total recibido</th><th>Pendiente de recibir</th></tr></thead>
            <tbody>{renglones.map((item) => <tr key={item.id}>
              <td>{item.producto?.sku} — {item.producto?.nombre}</td><td>{item.cantidad}</td>
              <td>{item.cantidad_recibida}</td><td>{item.pendiente}</td>
            </tr>)}</tbody></table>}
      </section>
    </>}
  </main>
}
