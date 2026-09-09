import { useEffect, useRef, useState } from 'react'
import { createRecepcion, getRecepciones, getOrdenesRecepcion, getDetalleOrdenRecepcion, puedeRegistrarRecepciones, errorCantidadRecepcion } from '../api/recepcionesApi'
import { getDepositos } from '../api/depositosApi'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import EmptyState from '../../../components/ui/EmptyState'
import RecepcionDetalle from './RecepcionDetalle'

const inicial = { orden_compra_id: '', deposito_destino_id: '', observaciones: '', items: [] }
const moneda = (valor) => Number(valor).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

export default function RecepcionesPage() {
  const [form, setForm] = useState(inicial)
  const [ordenes, setOrdenes] = useState([])
  const [depositos, setDepositos] = useState([])
  const [listado, setListado] = useState({ recepciones: [], totalPaginas: 1, page: 1 })
  const [permiso, setPermiso] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [detalleId, setDetalleId] = useState(null)
  const solicitud = useRef(0)
  const guardando = useRef(false)
  const erroresCantidad = form.items.map(errorCantidadRecepcion)
  const cantidadesValidas = erroresCantidad.every((mensaje) => !mensaje)
  const entregaParcial = cantidadesValidas && form.items.some((item) => Number(item.cantidad) < item.pendiente)

  async function cargarDatos(page = 1) {
    setLoading(true)
    setError('')
    try {
      const [ocs, deps, recepciones, autorizado] = await Promise.all([
        getOrdenesRecepcion(), getDepositos(), getRecepciones({ estado: 'confirmada', page }), puedeRegistrarRecepciones(),
      ])
      setOrdenes(ocs)
      setDepositos(deps)
      setListado(recepciones)
      setPermiso(autorizado)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las recepciones')
    } finally { setLoading(false) }
  }
  useEffect(() => { cargarDatos() }, [])

  async function seleccionarOrden(id) {
    const version = ++solicitud.current
    const oc = ordenes.find((orden) => orden.id === id)
    setForm({ ...inicial, orden_compra_id: id, deposito_destino_id: oc?.deposito_destino_id || '' })
    setError('')
    setCargandoDetalle(Boolean(id))
    if (!id) return
    try {
      const detalle = await getDetalleOrdenRecepcion(id)
      if (version !== solicitud.current) return
      setForm((actual) => ({ ...actual, items: detalle.map((item) => ({
        orden_compra_detalle_id: item.id, nombre: item.producto?.nombre || item.producto_id,
        sku: item.producto?.sku, pendiente: item.pendiente, cantidad: item.pendiente,
        pedido: item.cantidad, recibido: item.cantidad_recibida, costo: item.precio_unitario,
      })) }))
    } catch (err) {
      if (version === solicitud.current) setError(err.message || 'No se pudo cargar la orden')
    } finally { if (version === solicitud.current) setCargandoDetalle(false) }
  }
  async function confirmar(event) {
    event.preventDefault()
    if (guardando.current) return
    if (!cantidadesValidas) {
      setError(erroresCantidad.find(Boolean))
      return
    }
    guardando.current = true
    setEnviando(true)
    setError('')
    setAviso('')
    try {
      const recepcion = await createRecepcion(form)
      setAviso(`Recepción N.º ${recepcion.numero} confirmada. Se actualizaron el stock y la orden de compra.`)
      setForm(inicial)
      await cargarDatos()
    } catch (err) {
      setError(err.status === 423 ? 'Hay otra operación en proceso. Esperá unos segundos y volvé a intentar.' : err.message)
    } finally { guardando.current = false; setEnviando(false) }
  }
  if (detalleId) return <RecepcionDetalle id={detalleId} onVolver={() => setDetalleId(null)} />

  return <main className="recepciones-page">
    <h1>Recepción de mercadería</h1>
    {error && <Feedback tone="error">{error}</Feedback>}
    {aviso && <Feedback tone="success">{aviso}</Feedback>}
    {loading ? <Feedback>Cargando recepciones...</Feedback> : <>
      <Button type="button" variant="secondary" onClick={() => cargarDatos(listado.page)} disabled={enviando}>Actualizar</Button>
      {permiso ? <section>
        <h2>Nueva recepción</h2>
        {!ordenes.length ? <EmptyState title="No hay órdenes pendientes de recibir" description="Generá una orden de compra para registrar una recepción." /> :
          <form onSubmit={confirmar} noValidate>
            <fieldset disabled={enviando}>
              <label htmlFor="orden_compra_id">Orden de compra</label>
              <select id="orden_compra_id" value={form.orden_compra_id} onChange={(e) => seleccionarOrden(e.target.value)}>
                <option value="">Seleccionar orden...</option>
                {ordenes.map((oc) => <option key={oc.id} value={oc.id}>OC {oc.numero} — {oc.proveedor?.razon_social} — {oc.estado === 'pendiente' ? 'Pendiente' : 'Parcial'}</option>)}
              </select>
              <label htmlFor="deposito_destino_id">Depósito de destino</label>
              <select id="deposito_destino_id" value={form.deposito_destino_id} onChange={(e) => setForm({ ...form, deposito_destino_id: e.target.value })}>
                <option value="">Seleccionar depósito...</option>
                {depositos.map((dep) => <option key={dep.id} value={dep.id}>{dep.nombre}</option>)}
              </select>
              <label htmlFor="observaciones">Observaciones</label>
              <textarea id="observaciones" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
              {cargandoDetalle ? <Feedback>Cargando productos de la orden...</Feedback> : form.items.length > 0 ?
                <table><thead><tr><th>Artículo</th><th>Pedido en la OC</th><th>Recibido anteriormente</th><th>Cantidad esperada</th><th>Costo unitario</th><th>Cantidad recibida</th></tr></thead>
                  <tbody>{form.items.map((item, indice) => <tr key={item.orden_compra_detalle_id}>
                    <td>{item.sku} — {item.nombre}</td><td>{item.pedido}</td><td>{item.recibido}</td><td>{item.pendiente}</td><td>{moneda(item.costo)}</td>
                    <td><input aria-label={`Cantidad recibida de ${item.nombre}`} type="number" min="0" max={item.pendiente} step="1"
                      aria-invalid={Boolean(erroresCantidad[indice])}
                      aria-describedby={erroresCantidad[indice] ? `error-cantidad-${indice}` : undefined}
                      disabled={item.pendiente === 0} value={item.cantidad}
                      onChange={(e) => {
                        setError('')
                        setForm((actual) => ({ ...actual, items: actual.items.map((fila, i) => i === indice ? { ...fila, cantidad: e.target.value } : fila) }))
                      }} />
                      {erroresCantidad[indice] && <p id={`error-cantidad-${indice}`} role="alert" className="recepcion-cantidad-error">{erroresCantidad[indice]}</p>}
                    </td>
                  </tr>)}</tbody></table> : form.orden_compra_id && <Feedback>No se cargaron productos. Volvé a seleccionar la orden para reintentar.</Feedback>}
              {!cargandoDetalle && entregaParcial && <Feedback tone="warning">
                Los productos recibidos son menos que los esperados.{' '}
                {form.items.some((item) => Number(item.cantidad) > 0)
                  ? 'Podés confirmar la recepción; la OC quedará Parcial, con cantidades pendientes.'
                  : 'Debe recibir al menos un producto para confirmar.'}
              </Feedback>}
              <p>La fecha, la hora y el número se asignan automáticamente. Al confirmar se actualiza el stock; la recepción no podrá editarse ni eliminarse.</p>
              <Button type="submit" loading={enviando} loadingLabel="Confirmando..." disabled={cargandoDetalle || !cantidadesValidas}>Confirmar recepción</Button>
            </fieldset>
          </form>}
      </section> : <Feedback>No tenés permiso para registrar recepciones.</Feedback>}
      <section><h2>Recepciones confirmadas</h2>
        <p>Verde: OC completa. Amarillo: OC con cantidades pendientes. El color se actualiza cuando se completa la orden.</p>
        {!listado.recepciones.length ? <EmptyState title="No hay recepciones confirmadas" description="Las recepciones aparecerán aquí después de confirmarlas." /> :
          <table><thead><tr><th>Número</th><th>Fecha y hora</th><th>Usuario</th><th>OC</th><th>Depósito</th><th>Productos</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>{listado.recepciones.map((rec) => <tr key={rec.id}
              className={rec.orden?.estado === 'recibida' ? 'recepcion-fila-completa' : ['pendiente', 'parcialmente_recibida'].includes(rec.orden?.estado) ? 'recepcion-fila-parcial' : undefined}>
              <td>{rec.numero}</td><td>{new Date(rec.confirmado_at || rec.created_at).toLocaleString('es-AR')}</td>
              <td>{rec.confirmado_by || rec.created_by}</td><td>{rec.orden?.numero}</td><td>{rec.destino?.nombre}</td>
              <td>{(rec.detalle ?? []).map((item) => `${item.producto?.nombre}: ${item.cantidad}`).join(', ')}</td>
              <td>Confirmada
                {rec.orden?.estado === 'recibida' && <div><span className="recepcion-etiqueta">OC completa</span></div>}
                {['pendiente', 'parcialmente_recibida'].includes(rec.orden?.estado) && <div><span className="recepcion-etiqueta">OC con pendientes</span></div>}
              </td>
              <td><Button type="button" variant="secondary" onClick={() => setDetalleId(rec.id)} disabled={enviando}>Ver detalle</Button></td>
            </tr>)}</tbody></table>}
        {listado.totalPaginas > 1 && <div>
          <Button variant="secondary" disabled={listado.page === 1 || enviando} onClick={() => cargarDatos(listado.page - 1)}>Anterior</Button>
          <span> Página {listado.page} de {listado.totalPaginas} </span>
          <Button variant="secondary" disabled={listado.page === listado.totalPaginas || enviando} onClick={() => cargarDatos(listado.page + 1)}>Siguiente</Button>
        </div>}
      </section>
    </>}
  </main>
}
