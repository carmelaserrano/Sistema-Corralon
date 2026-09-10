import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  getOrdenesCompra,
  createOrdenCompra,
  puedeCrearOrdenes,
  cancelarOrdenCompra,
  puedeCancelarOrdenes,
  getOrdenCompraById,
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

const estadosOC = {
  pendiente: { label: 'Pendiente', clase: 'estado-badge-principal' },
  parcialmente_recibida: { label: 'Parcial', clase: 'estado-oc-parcial' },
  recibida: { label: 'Recibida', clase: 'estado-badge-activo' },
  cancelada: { label: 'Cancelada', clase: 'estado-badge-inactivo' },
}

function EstadoBadge({ estado }) {
  const config = estadosOC[estado]
  return <span className={`estado-badge ${config?.clase || 'estado-badge-inactivo'}`}>{config?.label || estado || '—'}</span>
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
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const solicitudListado = useRef(0)
  const [loadingListado, setLoadingListado] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [puedeCrear, setPuedeCrear] = useState(false)
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

  useEffect(() => {
    cargarPermisos()
    cargarMaestros()
  }, [])

  async function cargarPermisos() {
    try {
      setPuedeCrear(await puedeCrearOrdenes())
      setPuedeCancelar(await puedeCancelarOrdenes())
    } catch {
      // Ignorar, asume falso por seguridad
    }
  }

  const cargarDatosListado = useCallback(async () => {
    const solicitud = ++solicitudListado.current
    try {
      setLoadingListado(true)
      setError('')
      const resp = await getOrdenesCompra({ estado: estadoFiltro, page: pagina })
      if (solicitud !== solicitudListado.current) return
      setOrdenes(resp.ordenes)
      setTotalPaginas(resp.totalPaginas)
    } catch (err) {
      if (solicitud !== solicitudListado.current) return
      setOrdenes([])
      setError(err.message || 'Error al cargar las órdenes de compra')
    } finally {
      if (solicitud === solicitudListado.current) setLoadingListado(false)
    }
  }, [estadoFiltro, pagina])

  useEffect(() => {
    cargarDatosListado()
    return () => { solicitudListado.current += 1 }
  }, [cargarDatosListado])

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
      const data = await getOrdenCompraById(id)
      setOrdenActiva(data)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el detalle de la orden')
      setVista('listado')
    } finally {
      setLoadingDetalle(false)
    }
  }

  async function anularOrden(id) {
    const motivo = prompt('Motivo de la anulación:')
    if (!motivo) return
    
    try {
      setError('')
      await cancelarOrdenCompra(id, motivo)
      setAviso(`Orden anulada correctamente.`)
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
      const cabecera = await createOrdenCompra({ ...form, items })
      setAviso(`Orden #${cabecera.numero} creada correctamente.`)
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
    cargarDatosListado()
  }

  // --- RENDER ---
  if (vista === 'nueva') {
    return (
      <main>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>Nueva Orden de Compra</h1>
          <Button type="button" variant="ghost" onClick={volverListado}>Volver</Button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}

        <form onSubmit={guardarOrden}>
          <section>
            <h2>Datos de la Orden</h2>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
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

          <section style={{ marginTop: '2rem' }}>
            <h2>Detalle de Artículos</h2>
            
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div style={{ flex: 1 }}>
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
                    <th>SKU</th>
                    <th>Artículo</th>
                    <th style={{ textAlign: 'right' }}>Cant.</th>
                    <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                    <th style={{ width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.producto_id}>
                      <td>{item.sku}</td>
                      <td>{item.nombre}</td>
                      <td style={{ textAlign: 'right' }}>{item.cantidad}</td>
                      <td style={{ textAlign: 'right' }}>{formatearMoneda(item.precio_unitario)}</td>
                      <td style={{ textAlign: 'right' }}>{formatearMoneda(item.subtotal)}</td>
                      <td>
                        <Button type="button" variant="ghost" onClick={() => eliminarItem(idx)}>X</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan="4" style={{ textAlign: 'right' }}>Total:</th>
                    <th style={{ textAlign: 'right' }}>{formatearMoneda(totalOrden)}</th>
                    <th></th>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p>No hay artículos agregados a la orden.</p>
            )}
          </section>

          <div style={{ marginTop: '2rem' }}>
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
            {puedeCancelar && ordenActiva.estado !== 'cancelada' && (
              <Button type="button" variant="ghost" onClick={() => anularOrden(ordenActiva.id)}>Anular</Button>
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
                  <th>SKU</th>
                  <th>Artículo</th>
                  <th style={{ textAlign: 'right' }}>Cant. Pedida</th>
                  <th style={{ textAlign: 'right' }}>Recibida</th>
                  <th style={{ textAlign: 'right' }}>Pendiente</th>
                  <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {ordenActiva.detalles.map(d => (
                  <tr key={d.id}>
                    <td>{d.producto?.sku}</td>
                    <td>{d.producto?.nombre}</td>
                    <td style={{ textAlign: 'right' }}>{d.cantidad}</td>
                    <td style={{ textAlign: 'right' }}>{d.cantidad_recibida ?? 0}</td>
                    <td style={{ textAlign: 'right' }}>{Number(d.cantidad) - Number(d.cantidad_recibida ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{formatearMoneda(d.precio_unitario)}</td>
                    <td style={{ textAlign: 'right' }}>{formatearMoneda(d.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan="6" style={{ textAlign: 'right' }}>Total:</th>
                  <th style={{ textAlign: 'right' }}>{formatearMoneda(ordenActiva.total)}</th>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p>La orden no tiene detalle.</p>
          )}
        </section>
      </main>
    )
  }

  // --- VISTA LISTADO ---
  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Órdenes de Compra</h1>
        {puedeCrear && (
          <Button type="button" style={{ padding: '12px 20px', fontSize: '1rem' }} onClick={() => { setVista('nueva'); setError(''); setAviso('') }}>
            Nueva Orden de Compra
          </Button>
        )}
      </header>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}

      <section>
        <h2>Historial de órdenes de compra</h2>
        <label htmlFor="estado-oc">Filtrar por estado</label>
        <select id="estado-oc" value={estadoFiltro} onChange={e => { setEstadoFiltro(e.target.value); setPagina(1) }}>
          <option value="">Todos los estados</option>
          {Object.entries(estadosOC).map(([valor, config]) => <option key={valor} value={valor}>{config.label}</option>)}
        </select>
        <Button type="button" variant="ghost" disabled={loadingListado} onClick={cargarDatosListado}>Actualizar</Button>
        {loadingListado && <p role="status">Cargando órdenes...</p>}
        
        {!loadingListado && !error && ordenes.length === 0 && (
          <EmptyState title="No hay órdenes de compra" description={estadoFiltro ? 'No hay órdenes con el estado seleccionado.' : 'Aún no se ha registrado ninguna orden de compra en el sistema.'} />
        )}

        {!loadingListado && !error && ordenes.length > 0 && (
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
        {!loadingListado && !error && totalPaginas > 1 && (
          <nav aria-label="Paginación de órdenes" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Button type="button" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
            <span>Página {pagina} de {totalPaginas}</span>
            <Button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>Siguiente</Button>
          </nav>
        )}
      </section>
    </main>
  )
}
