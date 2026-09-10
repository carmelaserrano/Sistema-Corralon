import { useEffect, useState, useMemo } from 'react'
import {
  getOrdenesCompra,
  createOrdenCompra,
  updateOrdenCompra,
  puedeCrearOrdenes,
  puedeModificarOrdenes,
  cancelarOrdenCompra,
  puedeCancelarOrdenes,
  getOrdenCompraById,
  getHistorialModificaciones,
} from '../api/ordenesCompraApi'
import { getProveedores, CONDICIONES_PAGO } from '../../proveedores/api/proveedoresApi'
import { getDepositos } from '../../stock/api/depositosApi'
import { getArticulos } from '../../stock/api/articulosApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

function formatearFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR')
}

function formatearFechaCorta(isoDateString) {
  if (!isoDateString) return '—'
  const [yyyy, mm, dd] = isoDateString.split('-')
  return `${dd}/${mm}/${yyyy}`
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(valor)
}

function EstadoBadge({ estado }) {
  const mapClasses = {
    pendiente: 'estado-badge-inactivo', // Amarillo/Gris
    parcialmente_recibida: 'estado-badge-advertencia', // Quizas naranja si existiera, fallback a warning
    recibida: 'estado-badge-activo', // Verde
    cancelada: 'estado-badge-error', // Rojo
  }
  const cls = mapClasses[estado] || 'estado-badge-inactivo'
  return <span className={`estado-badge ${cls}`}>{estado.replace('_', ' ')}</span>
}

const cabeceraInicial = {
  proveedor_id: '',
  deposito_destino_id: '',
  condicion_pago: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  fecha_entrega_estimada: '',
  observaciones: '',
}

export default function OrdenesCompraPage() {
  const [vista, setVista] = useState('listado') // 'listado', 'nueva', 'detalle'
  
  // Listado
  const [ordenes, setOrdenes] = useState([])
  const [loadingListado, setLoadingListado] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [puedeCrear, setPuedeCrear] = useState(false)
  const [puedeModificar, setPuedeModificar] = useState(false)
  const [puedeCancelar, setPuedeCancelar] = useState(false)

  // Datos maestros
  const [proveedores, setProveedores] = useState([])
  const [depositos, setDepositos] = useState([])
  const [articulos, setArticulos] = useState([])

  // Nueva Orden
  const [form, setForm] = useState(cabeceraInicial)
  const [items, setItems] = useState([])
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Detalle
  const [ordenActiva, setOrdenActiva] = useState(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [mostrarModalAnular, setMostrarModalAnular] = useState(false)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [historial, setHistorial] = useState([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  useEffect(() => {
    cargarPermisos()
    cargarDatosListado()
    cargarMaestros()
  }, [])

  async function cargarPermisos() {
    try {
      setPuedeCrear(await puedeCrearOrdenes())
      setPuedeModificar(await puedeModificarOrdenes())
      setPuedeCancelar(await puedeCancelarOrdenes())
    } catch {
      // Ignorar, asume falso por seguridad
    }
  }

  async function cargarDatosListado() {
    try {
      setLoadingListado(true)
      const resp = await getOrdenesCompra()
      setOrdenes(resp.ordenes)
    } catch (err) {
      setError(err.message || 'Error al cargar las órdenes de compra')
    } finally {
      setLoadingListado(false)
    }
  }

  async function cargarMaestros() {
    try {
      const [provs, deps, arts] = await Promise.all([
        getProveedores({ estado: 'activo', soloActivos: true }),
        getDepositos(),
        getArticulos({ estado: 'activo', pageSize: 1000 })
      ])
      setProveedores(provs)
      setDepositos(deps)
      setArticulos(arts.articulos)
    } catch (err) {
      console.error('Error cargando maestros', err)
    }
  }

  async function verDetalle(id) {
    try {
      setVista('detalle')
      setLoadingDetalle(true)
      setError('')
      setAviso('')
      setHistorial([])
      const [data] = await Promise.all([
        getOrdenCompraById(id),
        (async () => {
          setLoadingHistorial(true)
          try {
            const h = await getHistorialModificaciones(id)
            setHistorial(h)
          } catch {
            // No bloqueamos la vista si falla el historial
          } finally {
            setLoadingHistorial(false)
          }
        })()
      ])
      setOrdenActiva(data)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el detalle de la orden')
      setVista('listado')
    } finally {
      setLoadingDetalle(false)
    }
  }

  function abrirModalAnular() {
    setMotivoAnulacion('')
    setMostrarModalAnular(true)
  }

  async function confirmarAnulacion(id) {
    if (!motivoAnulacion || motivoAnulacion.trim() === '') {
      setError('El motivo de anulación es obligatorio')
      return
    }
    
    try {
      setError('')
      await cancelarOrdenCompra(id, motivoAnulacion)
      setAviso(`Orden anulada correctamente.`)
      setMostrarModalAnular(false)
      // Refrescar el detalle o listado
      if (vista === 'detalle') {
        const data = await getOrdenCompraById(id)
        setOrdenActiva(data)
      } else {
        await cargarDatosListado()
      }
    } catch (err) {
      setError(err.message || 'No se pudo anular la orden')
    }
  }

  async function editarOrden(id) {
    try {
      setError('')
      setAviso('')
      const data = await getOrdenCompraById(id)
      setForm({
        id: data.id,
        proveedor_id: data.proveedor?.id || '',
        deposito_destino_id: data.deposito_destino?.id || '',
        condicion_pago: data.condicion_pago || '',
        fecha_emision: data.fecha_emision,
        fecha_entrega_estimada: data.fecha_entrega_estimada || '',
        observaciones: data.observaciones || '',
      })
      setItems(data.detalles.map(d => ({
        producto_id: d.producto.id,
        nombre: d.producto.nombre,
        sku: d.producto.sku,
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
        subtotal: d.subtotal
      })))
      setVista('nueva')
    } catch (err) {
      setError(err.message || 'Error al cargar la orden para edición')
    }
  }

  // ---- CREACION DE NUEVA ORDEN ----
  function cambiarCampo(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  const articulosDisponibles = useMemo(() => {
    return articulos.filter(a => !items.some(i => i.producto_id === a.id))
  }, [articulos, items])

  function agregarArticulo() {
    setError('')
    const articulo = articulos.find(a => a.id === productoId)
    if (!articulo) return setError('Seleccioná un artículo')
    
    const numCant = Number(cantidad)
    const numPrecio = Number(precio)

    if (!Number.isFinite(numCant) || numCant <= 0) return setError('La cantidad debe ser mayor a 0')
    if (!Number.isFinite(numPrecio) || numPrecio <= 0) return setError('El precio debe ser mayor a 0')

    setItems(actuales => [...actuales, {
      producto_id: articulo.id,
      nombre: articulo.nombre,
      sku: articulo.sku,
      cantidad: numCant,
      precio_unitario: numPrecio,
      subtotal: numCant * numPrecio
    }])
    
    setProductoId('')
    setCantidad('')
    setPrecio('')
  }

  function eliminarItem(index) {
    setItems(actuales => actuales.filter((_, i) => i !== index))
  }

  const totalOrden = items.reduce((acc, item) => acc + item.subtotal, 0)

  async function guardarOrden(e) {
    e.preventDefault()
    if (items.length === 0) return setError('La orden debe tener al menos un artículo')
    try {
      setGuardando(true)
      setError('')
      let cabecera;
      if (form.id) {
        cabecera = await updateOrdenCompra(form.id, { ...form, items })
        setAviso(`Orden #${cabecera.numero} actualizada correctamente.`)
      } else {
        cabecera = await createOrdenCompra({ ...form, items })
        setAviso(`Orden #${cabecera.numero} creada correctamente.`)
      }
      setVista('listado')
      setForm(cabeceraInicial)
      setItems([])
      await cargarDatosListado()
    } catch (err) {
      setError(err.message || 'Error al guardar la orden de compra')
    } finally {
      setGuardando(false)
    }
  }

  function volverListado() {
    setVista('listado')
    setOrdenActiva(null)
    setError('')
    setAviso('')
  }

  // --- RENDER ---
  if (vista === 'nueva') {
    return (
      <main>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>{form.id ? 'Modificar Orden de Compra' : 'Nueva Orden de Compra'}</h1>
          <Button type="button" variant="ghost" onClick={volverListado}>Volver</Button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}

        <form onSubmit={guardarOrden}>
          <section style={{ gridColumn: '1 / -1' }}>
            <h2>Datos de la Orden</h2>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div>
                <label htmlFor="proveedor_id">Proveedor *</label>
                <select id="proveedor_id" name="proveedor_id" value={form.proveedor_id} onChange={cambiarCampo} required>
                  <option value="">Seleccione un proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social} (CUIT {p.cuit})</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="deposito_destino_id">Depósito Destino *</label>
                <select id="deposito_destino_id" name="deposito_destino_id" value={form.deposito_destino_id} onChange={cambiarCampo} required>
                  <option value="">Seleccione un depósito</option>
                  {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="condicion_pago">Condición de Pago</label>
                <select id="condicion_pago" name="condicion_pago" value={form.condicion_pago} onChange={cambiarCampo}>
                  <option value="">A convenir</option>
                  {CONDICIONES_PAGO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="fecha_emision">Fecha de Emisión *</label>
                <input id="fecha_emision" name="fecha_emision" type="date" value={form.fecha_emision} onChange={cambiarCampo} required />
              </div>

              <div>
                <label htmlFor="fecha_entrega_estimada">Entrega Estimada</label>
                <input id="fecha_entrega_estimada" name="fecha_entrega_estimada" type="date" value={form.fecha_entrega_estimada} onChange={cambiarCampo} min={form.fecha_emision} />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="observaciones">Observaciones</label>
                <textarea id="observaciones" name="observaciones" value={form.observaciones} onChange={cambiarCampo} />
              </div>
            </div>
          </section>

          <section style={{ gridColumn: '1 / -1', marginTop: '2rem' }}>
            <h2>Detalle de Artículos</h2>
            
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px', maxWidth: '600px' }}>
                <label htmlFor="productoId">Artículo</label>
                <select id="productoId" value={productoId} onChange={e => setProductoId(e.target.value)}>
                  <option value="">Seleccione un artículo</option>
                  {articulosDisponibles.map(a => <option key={a.id} value={a.id}>[{a.sku}] {a.nombre}</option>)}
                </select>
              </div>
              <div style={{ width: '120px' }}>
                <label htmlFor="cantidad">Cantidad</label>
                <input id="cantidad" type="number" min="1" step="any" value={cantidad} onChange={e => setCantidad(e.target.value)} />
              </div>
              <div style={{ width: '150px' }}>
                <label htmlFor="precio">Precio Unit.</label>
                <input id="precio" type="number" min="0" step="any" value={precio} onChange={e => setPrecio(e.target.value)} />
              </div>
              <Button type="button" onClick={agregarArticulo}>Agregar</Button>
            </div>

            {items.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}>SKU</th>
                    <th style={{ width: '35%' }}>Artículo</th>
                    <th style={{ width: '15%', textAlign: 'right' }}>Cant.</th>
                    <th style={{ width: '15%', textAlign: 'right' }}>Precio Unit.</th>
                    <th style={{ width: '15%', textAlign: 'right' }}>Subtotal</th>
                    <th style={{ width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.producto_id}>
                      <td style={{ width: '15%' }}>{item.sku}</td>
                      <td style={{ width: '35%' }}>{item.nombre}</td>
                      <td style={{ width: '15%', textAlign: 'right' }}>{item.cantidad}</td>
                      <td style={{ width: '15%', textAlign: 'right' }}>{formatearMoneda(item.precio_unitario)}</td>
                      <td style={{ width: '15%', textAlign: 'right' }}>{formatearMoneda(item.subtotal)}</td>
                      <td style={{ width: '50px' }}>
                        <Button type="button" variant="ghost" onClick={() => eliminarItem(idx)}>X</Button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--surface-subtle)' }}>
                    <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>TOTAL:</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--text-primary)' }}>{formatearMoneda(totalOrden)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p>No hay artículos agregados a la orden.</p>
            )}
          </section>

          <div style={{ gridColumn: '1 / -1', marginTop: '2rem' }}>
            <Button type="submit" loading={guardando}>Confirmar Orden de Compra</Button>
          </div>
        </form>
      </main>
    )
  }

  if (vista === 'detalle') {
    if (loadingDetalle) return <main><p>Cargando detalle...</p></main>
    if (!ordenActiva) return <main><p>Orden no encontrada</p><Button onClick={volverListado}>Volver</Button></main>

    return (
      <main>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>Orden de Compra #{ordenActiva.numero}</h1>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {puedeModificar && ordenActiva.estado === 'pendiente' && (
              <Button type="button" variant="ghost" onClick={() => editarOrden(ordenActiva.id)}>Editar</Button>
            )}
            {puedeCancelar && ordenActiva.estado === 'pendiente' && (
              <Button type="button" variant="ghost" onClick={abrirModalAnular}>Anular</Button>
            )}
            <Button type="button" onClick={volverListado}>Volver</Button>
          </div>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}
        {aviso && <Feedback tone="success">{aviso}</Feedback>}

        <section>
          <h2>Datos Generales</h2>
          <table>
            <tbody>
              <tr><th>Proveedor</th><td>{ordenActiva.proveedor?.razon_social} (CUIT {ordenActiva.proveedor?.cuit})</td></tr>
              <tr><th>Depósito Destino</th><td>{ordenActiva.deposito_destino?.nombre}</td></tr>
              <tr><th>Fecha de Emisión</th><td>{formatearFechaCorta(ordenActiva.fecha_emision)}</td></tr>
              <tr><th>Entrega Estimada</th><td>{formatearFechaCorta(ordenActiva.fecha_entrega_estimada)}</td></tr>
              <tr><th>Condición de Pago</th><td>{ordenActiva.condicion_pago || 'A convenir'}</td></tr>
              <tr><th>Estado</th><td><EstadoBadge estado={ordenActiva.estado} /></td></tr>
              {ordenActiva.estado === 'cancelada' && (
                <tr><th>Motivo Cancelación</th><td>{ordenActiva.motivo_cancelacion}</td></tr>
              )}
              <tr><th>Observaciones</th><td>{ordenActiva.observaciones || '—'}</td></tr>
              <tr><th>Creado el</th><td>{formatearFecha(ordenActiva.created_at)}</td></tr>
            </tbody>
          </table>
        </section>

        <section style={{ marginTop: '2rem' }}>
          <h2>Artículos</h2>
          {ordenActiva.detalles && ordenActiva.detalles.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>SKU</th>
                  <th style={{ width: '40%' }}>Artículo</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Cant. Pedida</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Precio Unit.</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {ordenActiva.detalles.map(d => (
                  <tr key={d.id}>
                    <td style={{ width: '15%' }}>{d.producto?.sku}</td>
                    <td style={{ width: '40%' }}>{d.producto?.nombre}</td>
                    <td style={{ width: '15%', textAlign: 'right' }}>{d.cantidad}</td>
                    <td style={{ width: '15%', textAlign: 'right' }}>{formatearMoneda(d.precio_unitario)}</td>
                    <td style={{ width: '15%', textAlign: 'right' }}>{formatearMoneda(d.subtotal)}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-subtle)' }}>
                  <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>TOTAL:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--text-primary)' }}>{formatearMoneda(ordenActiva.total)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p>La orden no tiene detalle.</p>
          )}
        </section>

        {/* Historial de modificaciones */}
        <section style={{ marginTop: '2rem' }}>
          <h2>Historial de modificaciones</h2>
          {loadingHistorial ? (
            <p>Cargando historial...</p>
          ) : historial.length === 0 ? (
            <p style={{ color: 'var(--text-secondary, #666)', fontStyle: 'italic' }}>Sin modificaciones registradas.</p>
          ) : (
            <table style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Valor anterior</th>
                  <th>Valor nuevo</th>
                  <th>Usuario</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {historial.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 'bold', fontSize: '0.82rem', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{h.campo.replace(/_/g, ' ')}</td>
                    <td style={{ color: 'var(--color-error, #c00)', fontSize: '0.82rem', textDecoration: h.valor_anterior ? 'line-through' : 'none', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{h.valor_anterior || '—'}</td>
                    <td style={{ color: 'var(--color-success, #060)', fontSize: '0.82rem', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{h.valor_nuevo || '—'}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #666)', wordBreak: 'break-all' }}>{h.modificado_por_email || '—'}</td>
                    <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{formatearFecha(h.modificado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>


        {mostrarModalAnular && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--color-bg, white)', padding: '2rem', borderRadius: '8px', minWidth: '400px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              <h2 style={{ marginTop: 0 }}>Anular Orden #{ordenActiva.numero}</h2>
              <div style={{ margin: '1.5rem 0' }}>
                <label htmlFor="motivoAnulacion" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Motivo de la anulación:</label>
                <textarea 
                  id="motivoAnulacion" 
                  value={motivoAnulacion} 
                  onChange={e => setMotivoAnulacion(e.target.value)}
                  style={{ width: '100%', minHeight: '100px', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                  placeholder="Ingrese el motivo por el cual se anula esta orden..."
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="ghost" onClick={() => setMostrarModalAnular(false)}>Cancelar</Button>
                <Button type="button" onClick={() => confirmarAnulacion(ordenActiva.id)}>Confirmar Anulación</Button>
              </div>
            </div>
          </div>
        )}
      </main>
    )
  }

  // --- VISTA LISTADO ---
  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Órdenes de Compra</h1>
        {puedeCrear && (
          <Button type="button" onClick={() => { setVista('nueva'); setError(''); setAviso('') }}>
            Nueva Orden
          </Button>
        )}
      </header>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}

      <section>
        {loadingListado && <p role="status">Cargando órdenes...</p>}
        
        {!loadingListado && ordenes.length === 0 && (
          <EmptyState title="No hay órdenes de compra" description="Aún no se ha registrado ninguna orden de compra en el sistema." />
        )}

        {!loadingListado && ordenes.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nº Orden</th>
                <th>Fecha Emisión</th>
                <th>Proveedor</th>
                <th>Depósito</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map(orden => (
                <tr key={orden.id}>
                  <td><strong>#{orden.numero}</strong></td>
                  <td>{formatearFechaCorta(orden.fecha_emision)}</td>
                  <td>{orden.proveedor?.razon_social}</td>
                  <td>{orden.deposito_destino?.nombre}</td>
                  <td><EstadoBadge estado={orden.estado} /></td>
                  <td style={{ textAlign: 'right' }}>{formatearMoneda(orden.total)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Button type="button" variant="ghost" onClick={() => verDetalle(orden.id)}>Ver detalle</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
