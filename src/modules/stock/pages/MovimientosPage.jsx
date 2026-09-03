import { useEffect, useMemo, useState } from 'react'
import { TIPOS, createMovimientoMultiarticulo } from '../api/movimientosApi'
import { getDepositos } from '../api/depositosApi'
import { getArticulos } from '../api/articulosApi'
import { getStockByDeposito } from '../api/stockApi'

const inicial = { deposito_id: '', tipo: '', deposito_destino_id: '', comprobante: '', observaciones: '' }

function MovimientosPage({ onVerHistorial }) {
  const [depositos, setDepositos] = useState([])
  const [articulos, setArticulos] = useState([])
  const [stock, setStock] = useState(new Map())
  const [form, setForm] = useState(inicial)
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [cargandoStock, setCargandoStock] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  useEffect(() => {
    Promise.all([getDepositos(), getArticulos({ estado: 'activo', pageSize: 200 })])
      .then(([deps, arts]) => { setDepositos(deps); setArticulos(arts.articulos) })
      .catch((err) => setError(err.message || 'No se pudieron cargar los datos'))
      .finally(() => setLoading(false))
  }, [])

  async function cargarStock(depositoId) {
    if (!depositoId) return setStock(new Map())
    try {
      setCargandoStock(true)
      const filas = await getStockByDeposito(depositoId)
      setStock(new Map(filas.map((fila) => [fila.producto.id, fila.disponible])))
    } catch (err) {
      setError(err.message || 'No se pudo consultar el stock del depósito')
    } finally { setCargandoStock(false) }
  }

  async function cambiarDeposito(event) {
    const id = event.target.value
    setForm({ ...inicial, deposito_id: id })
    setItems([]); setProductoId(''); setCantidad(''); setError(''); setExito('')
    await cargarStock(id)
  }

  function cambiarCampo(event) {
    const { name, value } = event.target
    setForm((actual) => ({ ...actual, [name]: value,
      ...(name === 'tipo' && value !== TIPOS.TRANSFERENCIA ? { deposito_destino_id: '' } : {}) }))
    if (name === 'tipo') setItems([])
    setError(''); setExito('')
  }

  const disponibles = useMemo(() => articulos.filter(
    (articulo) => !items.some((item) => item.producto_id === articulo.id),
  ), [articulos, items])

  function agregarArticulo() {
    setError('')
    const articulo = articulos.find((item) => item.id === productoId)
    const numero = Number(cantidad)
    if (!articulo) return setError('Seleccioná un artículo')
    if (!Number.isInteger(numero) || numero <= 0) {
      return setError('La cantidad debe ser un número entero mayor a 0')
    }
    const disponible = stock.get(productoId) ?? 0
    if (form.tipo !== TIPOS.INGRESO && numero > disponible) {
      return setError(`Stock insuficiente: hay ${disponible} unidades disponibles`)
    }
    setItems((actuales) => [...actuales, { producto_id: articulo.id, sku: articulo.sku,
      nombre: articulo.nombre, cantidad: numero, stock_actual: disponible }])
    setProductoId(''); setCantidad('')
  }

  async function confirmar(event) {
    event.preventDefault()
    if (items.length === 0) return setError('Agregá al menos un artículo antes de confirmar')
    try {
      setEnviando(true); setError('')
      await createMovimientoMultiarticulo({ ...form, items })
      setItems([]); setProductoId(''); setCantidad('')
      setExito('Movimiento confirmado. El stock se actualizó correctamente.')
      await cargarStock(form.deposito_id)
    } catch (err) { setError(err.message || 'No se pudo confirmar el movimiento') }
    finally { setEnviando(false) }
  }

  if (loading) return <p role="status">Cargando movimientos...</p>
  return <main className="movements-page">
    <header className="movements-header"><div><p className="eyebrow">Operación de stock</p><h1>Nuevo movimiento</h1>
      <p>Elegí el depósito, definí la operación y agregá todos los artículos antes de confirmar.</p></div>
      <button type="button" className="secondary-action" onClick={onVerHistorial}>Ver historial</button></header>
    {error && <p role="alert">{error}</p>}{exito && <p role="status">{exito}</p>}
    <section className="movement-card"><form className="movements-form" onSubmit={confirmar}>
      <div className="movement-step"><span className="step-number">1</span><div className="step-content"><h2>Depósito</h2><p>Seleccioná dónde se realizará el movimiento.</p>
      <label htmlFor="deposito_id">Depósito de operación</label>
      <select id="deposito_id" value={form.deposito_id} onChange={cambiarDeposito} required>
        <option value="">Seleccionar depósito...</option>
        {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
      </select></div></div>
      <div className={`movement-step ${!form.deposito_id ? 'is-disabled' : ''}`}><span className="step-number">2</span><div className="step-content"><h2>Tipo de movimiento</h2><p>Indicá cómo se modificará el stock del depósito.</p>
      <label htmlFor="tipo">Operación</label>
      <select id="tipo" name="tipo" value={form.tipo} onChange={cambiarCampo} disabled={!form.deposito_id} required>
        <option value="">Seleccionar tipo...</option><option value={TIPOS.INGRESO}>Ingreso al depósito</option>
        <option value={TIPOS.EGRESO}>Egreso del depósito</option>
        <option value={TIPOS.TRANSFERENCIA}>Transferencia a otro depósito</option>
      </select>
      {form.tipo === TIPOS.TRANSFERENCIA && <><label htmlFor="deposito_destino_id">Depósito destino</label>
        <select id="deposito_destino_id" name="deposito_destino_id" value={form.deposito_destino_id} onChange={cambiarCampo} required>
          <option value="">Seleccionar destino...</option>{depositos.filter((d) => d.id !== form.deposito_id).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select></>}</div></div>
      <fieldset className="movement-step articles-step" disabled={!form.tipo || cargandoStock}><legend><span className="step-number">3</span><span><strong>Artículos</strong><small>Armá el detalle del movimiento.</small></span></legend>
        {cargandoStock ? <p role="status">Consultando stock...</p> : <div className="article-entry">
          <div className="article-field"><label htmlFor="articulo_id">Artículo</label><select id="articulo_id" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            <option value="">Seleccionar artículo...</option>{disponibles.map((a) => <option key={a.id} value={a.id}>{a.sku} — {a.nombre}</option>)}</select></div>
          <div className="quantity-field"><label htmlFor="cantidad">Cantidad</label><input id="cantidad" type="number" min="1" step="1" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>
          <p className="stock-indicator">Stock actual: <strong>{productoId ? (stock.get(productoId) ?? 0) : '-'}</strong></p>
          <button type="button" onClick={agregarArticulo}>Agregar artículo</button></div>}
      </fieldset>
      <div className="cart-section"><div className="cart-heading"><div><span className="step-number">4</span><div><h2>Detalle del movimiento</h2><p>{items.length} artículo{items.length === 1 ? '' : 's'} agregado{items.length === 1 ? '' : 's'}</p></div></div></div>
      {items.length === 0 ? <p className="empty-cart">Todavía no agregaste artículos al movimiento.</p> : <table><thead><tr><th>Artículo</th><th>Stock actual</th><th>Cantidad</th><th>Acción</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.producto_id}><td>{item.sku} — {item.nombre}</td><td>{item.stock_actual}</td><td>{item.cantidad}</td>
          <td><button type="button" className="danger-action" onClick={() => setItems((lista) => lista.filter((i) => i.producto_id !== item.producto_id))}>Quitar</button></td></tr>)}</tbody></table>}</div>
      <div className="movement-meta"><div><label htmlFor="comprobante">Comprobante</label><input id="comprobante" name="comprobante" value={form.comprobante} onChange={cambiarCampo} required /></div>
      <div><label htmlFor="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones" value={form.observaciones} onChange={cambiarCampo} /></div></div>
      <footer className="movement-actions"><p>Se aplicará el stock de todos los artículos en una única operación.</p><button type="submit" disabled={enviando || !form.tipo}>{enviando ? 'Confirmando...' : `Confirmar movimiento${items.length ? ` (${items.length})` : ''}`}</button></footer>
    </form></section>
  </main>
}

export default MovimientosPage
