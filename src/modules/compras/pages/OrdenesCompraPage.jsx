import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  getHistorialOC,
  createOrdenCompra,
  updateOrdenCompra,
  puedeCrearOrdenes,
  puedeModificarOrdenes,
  cancelarOrdenCompra,
  puedeCancelarOrdenes,
  getOrdenCompraById,
  getHistorialModificaciones,
  getDetalleHistorialOC,
} from '../api/ordenesCompraApi'
import { 
  getProveedores, 
  CONDICIONES_PAGO, 
  CONDICIONES_FISCALES,
  puedeModificarProveedores,
  getProveedorById,
  updateProveedor
} from '../../proveedores/api/proveedoresApi'
import { getDepositos } from '../../stock/api/depositosApi'
import { getArticulos } from '../../stock/api/articulosApi'
import ContactosProveedor from '../../proveedores/components/ContactosProveedor'
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
  return (
    <span className={`estado-badge ${config?.clase || 'estado-badge-inactivo'}`}>
      {config?.label || estado || '—'}
    </span>
  )
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
  const [filtros, setFiltros] = useState({ proveedorId: '', fechaDesde: '', fechaHasta: '', orden: 'created_at', ascendente: false })
  const [resumen, setResumen] = useState({ total: 0, importeTotal: 0 })
  const [proveedoresHistorial, setProveedoresHistorial] = useState([])
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const solicitudListado = useRef(0)
  const [loadingListado, setLoadingListado] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [puedeCrear, setPuedeCrear] = useState(false)
  const [puedeModificar, setPuedeModificar] = useState(false)
  const [puedeCancelar, setPuedeCancelar] = useState(false)
  const [puedeModificarProv, setPuedeModificarProv] = useState(false)

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

  // Proveedor Modal
  const [mostrarModalProveedor, setMostrarModalProveedor] = useState(false)
  const [proveedorDetalle, setProveedorDetalle] = useState(null)
  const [solapaProveedor, setSolapaProveedor] = useState('datos')
  const [formProveedor, setFormProveedor] = useState({})
  const [guardandoProveedor, setGuardandoProveedor] = useState(false)

  useEffect(() => {
    cargarPermisos()
    cargarMaestros()
  }, [])

  async function cargarPermisos() {
    try {
      setPuedeCrear(await puedeCrearOrdenes())
      setPuedeModificar(await puedeModificarOrdenes())
      setPuedeCancelar(await puedeCancelarOrdenes())
      setPuedeModificarProv(await puedeModificarProveedores())
    } catch {
      // Ignorar, asume falso por seguridad
    }
  }

  const cargarDatosListado = useCallback(async () => {
    const solicitud = ++solicitudListado.current
    try {
      setLoadingListado(true)
      setError('')
      const resp = await getHistorialOC({ ...filtros, estado: estadoFiltro, page: pagina })
      if (solicitud !== solicitudListado.current) return
      setOrdenes(resp.ordenes)
      setTotalPaginas(resp.totalPaginas)
      setResumen({ total: resp.total, importeTotal: resp.importeTotal })
    } catch (err) {
      if (solicitud !== solicitudListado.current) return
      setOrdenes([])
      setError(err.message || 'Error al cargar las órdenes de compra')
    } finally {
      if (solicitud === solicitudListado.current) setLoadingListado(false)
    }
  }, [estadoFiltro, pagina, filtros])

  useEffect(() => {
    cargarDatosListado()
    return () => { solicitudListado.current += 1 }
  }, [cargarDatosListado])

  async function cargarMaestros() {
    try {
      const [provs, deps, arts, todosProvs] = await Promise.all([
        getProveedores({ estado: 'activo', soloActivos: true }),
        getDepositos(),
        getArticulos({ estado: 'activo', pageSize: 1000 }),
        getProveedores({ soloActivos: false }),
      ])
      setProveedores(provs)
      setDepositos(deps)
      setArticulos(arts.articulos)
      setProveedoresHistorial(todosProvs)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los proveedores y artículos. Recargá la página.')
    }
  }

  async function verDetalle(id) {
    try {
      setVista('detalle')
      setLoadingDetalle(true)
      setError('')
      setAviso('')
      setHistorial([])
      await Promise.all([
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
      const data = await getDetalleHistorialOC(id)
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
        const data = await getDetalleHistorialOC(id)
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

  // ---- MODAL PROVEEDOR ----
  async function abrirModalProveedor(proveedorId) {
    try {
      setLoadingDetalle(true)
      const prov = await getProveedorById(proveedorId)
      setProveedorDetalle(prov)
      setFormProveedor({
        razon_social: prov.razon_social || '',
        nombre_fantasia: prov.nombre_fantasia || '',
        condicion_fiscal: prov.condicion_fiscal || '',
        condicion_pago_habitual: prov.condicion_pago_habitual || '',
        domicilio: prov.domicilio || '',
        localidad: prov.localidad || '',
        provincia: prov.provincia || '',
        telefono: prov.telefono || '',
        email: prov.email || '',
        observaciones: prov.observaciones || ''
      })
      setSolapaProveedor('datos')
      setMostrarModalProveedor(true)
    } catch(err) {
      setError(err.message || 'No se pudo cargar el proveedor')
    } finally {
      setLoadingDetalle(false)
    }
  }

  async function guardarProveedor(e) {
    e.preventDefault()
    try {
      setGuardandoProveedor(true)
      const provActualizado = await updateProveedor(proveedorDetalle.id, formProveedor, proveedorDetalle.rubro?.id)
      setProveedorDetalle(provActualizado)
      setAviso(`Proveedor actualizado correctamente.`)
      
      if (ordenActiva && ordenActiva.proveedor.id === provActualizado.id) {
        setOrdenActiva({
          ...ordenActiva,
          proveedor: {
            ...ordenActiva.proveedor,
            razon_social: provActualizado.razon_social,
            cuit: provActualizado.cuit
          }
        })
      }
      setMostrarModalProveedor(false)
    } catch(err) {
      setError(err.message || 'Error al guardar el proveedor')
    } finally {
      setGuardandoProveedor(false)
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
    cargarDatosListado()
  }

  function cambiarFiltro(campo, valor) {
    setFiltros(f => ({ ...f, [campo]: valor }))
    setPagina(1)
  }

  function limpiarFiltros() {
    setEstadoFiltro('')
    setFiltros(f => ({ ...f, proveedorId: '', fechaDesde: '', fechaHasta: '' }))
    setPagina(1)
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
              <tr>
                <th>Proveedor</th>
                <td style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{ordenActiva.proveedor?.razon_social} (CUIT {ordenActiva.proveedor?.cuit})</span>
                  <Button type="button" variant="ghost" onClick={() => abrirModalProveedor(ordenActiva.proveedor?.id)}>Administrar Proveedor</Button>
                </td>
              </tr>
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

        <section style={{ marginTop: '2rem' }}>
          <h2>Recepciones asociadas</h2>
          {ordenActiva.recepciones?.length ? (
            <table>
              <thead><tr><th>Número</th><th>Fecha</th><th>Depósito</th><th>Estado</th></tr></thead>
              <tbody>
                {ordenActiva.recepciones.map(r => (
                  <tr key={r.id}>
                    <td>#{r.numero}</td>
                    <td>{formatearFechaCorta(r.fecha_recepcion)}</td>
                    <td>{r.deposito?.nombre}</td>
                    <td>{r.estado_recepcion === 'confirmada' ? 'Confirmada' : 'Pendiente'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>No hay recepciones asociadas.</p>}
        </section>

        <section style={{ marginTop: '2rem' }}>
          <h2>Comprobantes asociados</h2>
          {ordenActiva.facturas?.length ? ordenActiva.facturas.map(f => (
            <div key={f.id} style={{ marginBottom: '1.5rem' }}>
              <h3>Factura {f.letra} {f.sucursal}-{f.numero}</h3>
              <p>Fecha: {formatearFechaCorta(f.fecha_emision)} · Total: {formatearMoneda(f.importe_total)} · Estado: {f.estado.replaceAll('_', ' ')}</p>
              {f.imputaciones?.length ? (
                <table>
                  <thead><tr><th>Tipo</th><th>Número</th><th>Fecha</th><th>Importe nota</th><th>Aplicado a esta factura</th><th>Estado</th></tr></thead>
                  <tbody>
                    {f.imputaciones.map(i => (
                      <tr key={i.id}>
                        <td>{i.nota.tipo === 'CREDITO' ? 'Nota de Crédito' : 'Nota de Débito'}</td>
                        <td>{i.nota.letra} {i.nota.sucursal}-{i.nota.numero}</td>
                        <td>{formatearFechaCorta(i.nota.fecha)}</td>
                        <td>{formatearMoneda(i.nota.importe)}</td>
                        <td>{formatearMoneda(i.importe_imputado)}</td>
                        <td>{i.nota.estado.replaceAll('_', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p>Sin notas de crédito o débito vinculadas.</p>}
            </div>
          )) : <p>No hay facturas asociadas.</p>}
        </section>

        {mostrarModalProveedor && proveedorDetalle && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', zIndex: 1000, padding: '2rem 1rem' }}>
            <div style={{ background: 'var(--color-bg, white)', padding: '2rem', borderRadius: '8px', width: '100%', maxWidth: '800px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>Administrar Proveedor: {proveedorDetalle.razon_social}</h2>
                <Button type="button" variant="ghost" onClick={() => setMostrarModalProveedor(false)}>Cerrar</Button>
              </div>

              <div className="tabs" role="tablist" style={{ marginBottom: '1.5rem' }}>
                <button type="button" role="tab" aria-selected={solapaProveedor === 'datos'} onClick={() => setSolapaProveedor('datos')}>Datos Básicos</button>
                <button type="button" role="tab" aria-selected={solapaProveedor === 'contactos'} onClick={() => setSolapaProveedor('contactos')}>Contactos</button>
              </div>

              {solapaProveedor === 'datos' && (
                <form onSubmit={guardarProveedor}>
                  <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1.5rem' }}>
                    <div>
                      <label htmlFor="prov_razon_social">Razón Social</label>
                      <input id="prov_razon_social" value={formProveedor.razon_social} onChange={e => setFormProveedor(f => ({...f, razon_social: e.target.value}))} disabled={!puedeModificarProv} required />
                    </div>
                    <div>
                      <label htmlFor="prov_nombre_fantasia">Nombre de Fantasía</label>
                      <input id="prov_nombre_fantasia" value={formProveedor.nombre_fantasia} onChange={e => setFormProveedor(f => ({...f, nombre_fantasia: e.target.value}))} disabled={!puedeModificarProv} />
                    </div>
                    <div>
                      <label>CUIT</label>
                      <input value={proveedorDetalle.cuit} disabled />
                    </div>
                    <div>
                      <label htmlFor="prov_condicion_fiscal">Condición Fiscal</label>
                      <select id="prov_condicion_fiscal" value={formProveedor.condicion_fiscal} onChange={e => setFormProveedor(f => ({...f, condicion_fiscal: e.target.value}))} disabled={!puedeModificarProv}>
                        <option value="">Seleccione</option>
                        {CONDICIONES_FISCALES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="prov_condicion_pago">Condición de Pago</label>
                      <select id="prov_condicion_pago" value={formProveedor.condicion_pago_habitual} onChange={e => setFormProveedor(f => ({...f, condicion_pago_habitual: e.target.value}))} disabled={!puedeModificarProv}>
                        <option value="">A convenir</option>
                        {CONDICIONES_PAGO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="prov_email">Email</label>
                      <input id="prov_email" type="email" value={formProveedor.email} onChange={e => setFormProveedor(f => ({...f, email: e.target.value}))} disabled={!puedeModificarProv} />
                    </div>
                    <div>
                      <label htmlFor="prov_telefono">Teléfono</label>
                      <input id="prov_telefono" value={formProveedor.telefono} onChange={e => setFormProveedor(f => ({...f, telefono: e.target.value}))} disabled={!puedeModificarProv} />
                    </div>
                    <div>
                      <label htmlFor="prov_domicilio">Domicilio</label>
                      <input id="prov_domicilio" value={formProveedor.domicilio} onChange={e => setFormProveedor(f => ({...f, domicilio: e.target.value}))} disabled={!puedeModificarProv} />
                    </div>
                    <div>
                      <label htmlFor="prov_localidad">Localidad</label>
                      <input id="prov_localidad" value={formProveedor.localidad} onChange={e => setFormProveedor(f => ({...f, localidad: e.target.value}))} disabled={!puedeModificarProv} />
                    </div>
                    <div>
                      <label htmlFor="prov_provincia">Provincia</label>
                      <input id="prov_provincia" value={formProveedor.provincia} onChange={e => setFormProveedor(f => ({...f, provincia: e.target.value}))} disabled={!puedeModificarProv} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor="prov_observaciones">Observaciones</label>
                      <textarea id="prov_observaciones" value={formProveedor.observaciones} onChange={e => setFormProveedor(f => ({...f, observaciones: e.target.value}))} disabled={!puedeModificarProv} />
                    </div>
                  </div>
                  {puedeModificarProv && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                      <Button type="button" variant="ghost" onClick={() => setMostrarModalProveedor(false)}>Cancelar</Button>
                      <Button type="submit" loading={guardandoProveedor}>Guardar cambios</Button>
                    </div>
                  )}
                </form>
              )}

              {solapaProveedor === 'contactos' && (
                <ContactosProveedor
                  proveedorId={proveedorDetalle.id}
                  puedeGestionar={puedeModificarProv}
                  mostrarAvisoPermiso={false}
                />
              )}
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
          <Button type="button" style={{ padding: '12px 20px', fontSize: '1rem' }} onClick={() => { setVista('nueva'); setError(''); setAviso('') }}>
            Nueva Orden de Compra
          </Button>
        )}
      </header>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}

      <section>
        <h2>Historial de órdenes de compra</h2>
        <div className="historial-oc-filtros">
          <div><label htmlFor="proveedor-filtro">Proveedor</label>
            <select id="proveedor-filtro" value={filtros.proveedorId} onChange={e => cambiarFiltro('proveedorId', e.target.value)}>
              <option value="">Todos los proveedores</option>
              {proveedoresHistorial.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
            </select>
          </div>
          <div><label htmlFor="fecha-desde">Creada desde</label><input id="fecha-desde" type="date" value={filtros.fechaDesde} max={filtros.fechaHasta || undefined} onChange={e => cambiarFiltro('fechaDesde', e.target.value)} /></div>
          <div><label htmlFor="fecha-hasta">Creada hasta</label><input id="fecha-hasta" type="date" value={filtros.fechaHasta} min={filtros.fechaDesde || undefined} onChange={e => cambiarFiltro('fechaHasta', e.target.value)} /></div>
        </div>
        <label htmlFor="estado-oc">Filtrar por estado</label>
        <select id="estado-oc" value={estadoFiltro} onChange={e => { setEstadoFiltro(e.target.value); setPagina(1) }}>
          <option value="">Todos los estados</option>
          {Object.entries(estadosOC).map(([valor, config]) => <option key={valor} value={valor}>{config.label}</option>)}
        </select>
        <div className="historial-oc-filtros">
          <div><label htmlFor="orden-oc">Ordenar por</label><select id="orden-oc" value={filtros.orden} onChange={e => cambiarFiltro('orden', e.target.value)}><option value="created_at">Fecha de creación</option><option value="total">Total</option></select></div>
          <div><label htmlFor="direccion-oc">Dirección</label><select id="direccion-oc" value={String(filtros.ascendente)} onChange={e => cambiarFiltro('ascendente', e.target.value === 'true')}><option value="false">Descendente</option><option value="true">Ascendente</option></select></div>
        </div>
        <Button type="button" variant="ghost" onClick={limpiarFiltros}>Limpiar filtros</Button>
        <Button type="button" variant="ghost" disabled={loadingListado} onClick={cargarDatosListado}>Actualizar</Button>
        {loadingListado && <p role="status">Cargando órdenes...</p>}
        {!loadingListado && !error && <p>{resumen.total} registros · Importe total del período filtrado: <strong>{formatearMoneda(resumen.importeTotal)}</strong> (excluye canceladas)</p>}

        {!loadingListado && !error && ordenes.length === 0 && (
          <EmptyState title="No hay órdenes de compra" description={estadoFiltro || filtros.proveedorId || filtros.fechaDesde || filtros.fechaHasta ? 'No hay órdenes que coincidan con los filtros aplicados.' : 'Aún no se ha registrado ninguna orden de compra en el sistema.'} />
        )}

        {!loadingListado && !error && ordenes.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nº Orden</th>
                <th>Fecha de creación</th>
                <th>Proveedor</th>
                <th>Depósito</th>
                <th>Estado</th>
                <th>Recepciones</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map(orden => (
                <tr key={orden.id} onClick={() => verDetalle(orden.id)} style={{ cursor: 'pointer' }}>
                  <td><strong>#{orden.numero}</strong></td>
                  <td>{orden.created_at ? new Date(orden.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—'}</td>
                  <td>{orden.proveedor?.razon_social}</td>
                  <td>{orden.deposito_destino?.nombre}</td>
                  <td><EstadoBadge estado={orden.estado} /></td>
                  <td>{orden.cantidad_recepciones ?? 0}</td>
                  <td style={{ textAlign: 'right' }}>{formatearMoneda(orden.total)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Button type="button" variant="ghost" onClick={e => { e.stopPropagation(); verDetalle(orden.id) }}>Ver detalle</Button>
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