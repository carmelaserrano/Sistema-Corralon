import { useEffect, useState } from 'react'
import {
  createFactura,
  ETIQUETAS_ESTADO,
  ESTADOS,
  getFacturaById,
  getFacturas,
  getOrdenesCompraDelProveedor,
  getRecepcionesConfirmadasDelProveedor,
  calcularDiferenciaImporte,
  calcularDiferenciaOc,
  tieneDesglose,
  LETRAS,
  normalizarSucursal,
  normalizarNumero,
  puedeRegistrarFacturas,
} from '../api/facturasProveedorApi'
import { getProveedores } from '../../proveedores/api/proveedoresApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

function formatearFechaCorta(isoDateString) {
  if (!isoDateString) return '—'
  const [yyyy, mm, dd] = isoDateString.split('-')
  return `${dd}/${mm}/${yyyy}`
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(valor || 0)
}

function EstadoBadge({ estado }) {
  const mapClasses = {
    pendiente: 'estado-badge-inactivo',
    parcialmente_pagada: 'estado-badge-advertencia',
    pagada: 'estado-badge-activo',
    anulada: 'estado-badge-inactivo',
  }
  const cls = mapClasses[estado] || 'estado-badge-inactivo'
  return <span className={`estado-badge ${cls}`}>{ETIQUETAS_ESTADO[estado] || estado}</span>
}

const cabeceraInicial = {
  proveedor_id: '',
  letra: '',
  sucursal: '',
  numero: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  fecha_vencimiento: '',
  importe_neto: '',
  impuestos: '',
  importe_total: '',
  orden_compra_id: '',
  recepcion_id: '',
}

const filtrosIniciales = {
  proveedorId: '',
  fechaDesde: '',
  fechaHasta: '',
  estado: '',
}

export default function FacturasProveedorPage() {
  const [vista, setVista] = useState('listado') // 'listado', 'nueva', 'detalle'

  // Listado
  const [facturas, setFacturas] = useState([])
  const [loadingListado, setLoadingListado] = useState(true)
  const [filtros, setFiltros] = useState(filtrosIniciales)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [puedeRegistrar, setPuedeRegistrar] = useState(false)

  // Datos maestros
  const [proveedores, setProveedores] = useState([])

  // Nueva factura
  const [form, setForm] = useState(cabeceraInicial)
  const [ordenesProveedor, setOrdenesProveedor] = useState([])
  const [recepcionesProveedor, setRecepcionesProveedor] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [diferenciaPendiente, setDiferenciaPendiente] = useState(null)

  // Detalle
  const [facturaActiva, setFacturaActiva] = useState(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  useEffect(() => {
    cargarPermisos()
    cargarMaestros()
  }, [])

  useEffect(() => {
    if (vista === 'listado') cargarDatosListado()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, filtros])

  useEffect(() => {
    if (!form.proveedor_id) {
      setOrdenesProveedor([])
      setRecepcionesProveedor([])
      return
    }
    cargarVinculosProveedor(form.proveedor_id)
  }, [form.proveedor_id])

  async function cargarPermisos() {
    try {
      setPuedeRegistrar(await puedeRegistrarFacturas())
    } catch {
      // Ignorar, asume falso por seguridad
    }
  }

  async function cargarMaestros() {
    try {
      setProveedores(await getProveedores({ estado: 'activo', soloActivos: true }))
    } catch (err) {
      console.error('Error cargando proveedores', err)
    }
  }

  async function cargarVinculosProveedor(proveedorId) {
    try {
      const [ordenes, recepciones] = await Promise.all([
        getOrdenesCompraDelProveedor(proveedorId),
        getRecepcionesConfirmadasDelProveedor(proveedorId),
      ])
      setOrdenesProveedor(ordenes)
      setRecepcionesProveedor(recepciones)
    } catch (err) {
      console.error('Error cargando OC/recepciones del proveedor', err)
    }
  }

  async function cargarDatosListado() {
    try {
      setLoadingListado(true)
      const resp = await getFacturas({
        proveedorId: filtros.proveedorId,
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
        estado: filtros.estado,
      })
      setFacturas(resp.facturas)
    } catch (err) {
      setError(err.message || 'Error al cargar las facturas de proveedor')
    } finally {
      setLoadingListado(false)
    }
  }

  function cambiarFiltro(e) {
    const { name, value } = e.target
    setFiltros((f) => ({ ...f, [name]: value }))
  }

  async function verDetalle(id) {
    try {
      setVista('detalle')
      setLoadingDetalle(true)
      setError('')
      setAviso('')
      const data = await getFacturaById(id)
      setFacturaActiva(data)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el detalle de la factura')
      setVista('listado')
    } finally {
      setLoadingDetalle(false)
    }
  }

  // ---- ALTA DE FACTURA ----
  function cambiarCampo(e) {
    const { name, value } = e.target
    setDiferenciaPendiente(null)
    setForm((f) => ({ ...f, [name]: value }))
  }

  function normalizarAlPerderFoco(e) {
    const { name, value } = e.target
    if (!value) return
    const normalizado = name === 'sucursal' ? normalizarSucursal(value) : normalizarNumero(value)
    setForm((f) => ({ ...f, [name]: normalizado }))
  }

  const ordenSeleccionada = ordenesProveedor.find((o) => o.id === form.orden_compra_id) || null
  const diferenciaImporte = tieneDesglose(form)
    ? calcularDiferenciaImporte(form.importe_neto, form.impuestos, form.importe_total)
    : 0
  const diferenciaOc = form.importe_total
    ? calcularDiferenciaOc(form.importe_total, ordenSeleccionada)
    : null

  async function guardarFactura(e, forzarDiferencia = false) {
    e?.preventDefault?.()
    try {
      setGuardando(true)
      setError('')
      const creada = await createFactura({ ...form, forzarDiferencia })
      setAviso(`Factura ${creada.letra} ${creada.sucursal}-${creada.numero} registrada correctamente.`)
      setDiferenciaPendiente(null)
      setForm(cabeceraInicial)
      setVista('listado')
      setFiltros(filtrosIniciales)
    } catch (err) {
      if (err.requiereConfirmacion) {
        setDiferenciaPendiente(err.diferenciaImporte)
      } else {
        setError(err.message || 'Error al guardar la factura')
      }
    } finally {
      setGuardando(false)
    }
  }

  function volverListado() {
    setVista('listado')
    setFacturaActiva(null)
    setError('')
    setAviso('')
  }

  function irANueva() {
    setForm(cabeceraInicial)
    setDiferenciaPendiente(null)
    setError('')
    setAviso('')
    setVista('nueva')
  }

  // --- RENDER: NUEVA FACTURA ---
  if (vista === 'nueva') {
    return (
      <main>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>Nueva Factura de Proveedor</h1>
          <Button type="button" variant="ghost" onClick={volverListado}>Volver</Button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}

        <form className="stacked-form" onSubmit={(e) => guardarFactura(e, false)}>
          <section>
            <h2>Comprobante</h2>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label htmlFor="proveedor_id">Proveedor *</label>
                <select id="proveedor_id" name="proveedor_id" value={form.proveedor_id} onChange={cambiarCampo} required>
                  <option value="">Seleccione un proveedor</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.razon_social} (CUIT {p.cuit})</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="letra">Letra *</label>
                <select id="letra" name="letra" value={form.letra} onChange={cambiarCampo} required>
                  <option value="">Seleccione</option>
                  {LETRAS.map((letra) => <option key={letra} value={letra}>{letra}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="sucursal">Sucursal *</label>
                <input
                  id="sucursal"
                  name="sucursal"
                  value={form.sucursal}
                  onChange={cambiarCampo}
                  onBlur={normalizarAlPerderFoco}
                  maxLength={4}
                  placeholder="0001"
                  required
                />
              </div>

              <div>
                <label htmlFor="numero">Número *</label>
                <input
                  id="numero"
                  name="numero"
                  value={form.numero}
                  onChange={cambiarCampo}
                  onBlur={normalizarAlPerderFoco}
                  maxLength={8}
                  placeholder="00001234"
                  required
                />
              </div>

              <div>
                <label htmlFor="fecha_emision">Fecha de Emisión *</label>
                <input id="fecha_emision" name="fecha_emision" type="date" value={form.fecha_emision} onChange={cambiarCampo} required />
              </div>

              <div>
                <label htmlFor="fecha_vencimiento">Fecha de Vencimiento</label>
                <input id="fecha_vencimiento" name="fecha_vencimiento" type="date" value={form.fecha_vencimiento} onChange={cambiarCampo} min={form.fecha_emision} />
              </div>
            </div>
          </section>

          <section style={{ marginTop: '2rem' }}>
            <h2>Importes</h2>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div>
                <label htmlFor="importe_neto">Importe Neto</label>
                <input id="importe_neto" name="importe_neto" type="number" min="0" step="0.01" value={form.importe_neto} onChange={cambiarCampo} />
              </div>
              <div>
                <label htmlFor="impuestos">Impuestos</label>
                <input id="impuestos" name="impuestos" type="number" min="0" step="0.01" value={form.impuestos} onChange={cambiarCampo} />
              </div>
              <div>
                <label htmlFor="importe_total">Importe Total *</label>
                <input id="importe_total" name="importe_total" type="number" min="0" step="0.01" value={form.importe_total} onChange={cambiarCampo} required />
              </div>
            </div>

            {diferenciaImporte !== 0 && (
              <Feedback tone={diferenciaPendiente !== null ? 'error' : 'info'}>
                El importe total difiere de neto + impuestos por {formatearMoneda(diferenciaImporte)}.
                {diferenciaPendiente !== null && (
                  <>
                    {' '}
                    <Button type="button" variant="ghost" loading={guardando} onClick={(e) => guardarFactura(e, true)}>
                      Confirmar y guardar igual
                    </Button>
                  </>
                )}
              </Feedback>
            )}
          </section>

          <section style={{ marginTop: '2rem' }}>
            <h2>Vínculo opcional (CA 4)</h2>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label htmlFor="orden_compra_id">Orden de Compra</label>
                <select
                  id="orden_compra_id"
                  name="orden_compra_id"
                  value={form.orden_compra_id}
                  onChange={cambiarCampo}
                  disabled={!form.proveedor_id}
                >
                  <option value="">Sin vincular</option>
                  {ordenesProveedor.map((oc) => (
                    <option key={oc.id} value={oc.id}>#{oc.numero} — {formatearMoneda(oc.total)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="recepcion_id">Recepción</label>
                <select
                  id="recepcion_id"
                  name="recepcion_id"
                  value={form.recepcion_id}
                  onChange={cambiarCampo}
                  disabled={!form.proveedor_id}
                >
                  <option value="">Sin vincular</option>
                  {recepcionesProveedor.map((rec) => (
                    <option key={rec.id} value={rec.id}>#{rec.numero} — {formatearFechaCorta(rec.fecha_recepcion)}</option>
                  ))}
                </select>
              </div>
            </div>

            {diferenciaOc !== null && diferenciaOc !== 0 && (
              <Feedback tone="info">
                El total de la factura difiere en {formatearMoneda(diferenciaOc)} del total de la Orden de Compra #{ordenSeleccionada?.numero}.
              </Feedback>
            )}
          </section>

          <div style={{ marginTop: '2rem' }}>
            <Button type="submit" loading={guardando} disabled={diferenciaPendiente !== null}>
              Registrar Factura
            </Button>
          </div>
        </form>
      </main>
    )
  }

  // --- RENDER: DETALLE ---
  if (vista === 'detalle') {
    if (loadingDetalle) return <main><p role="status">Cargando detalle...</p></main>
    if (!facturaActiva) return <main><p>Factura no encontrada</p><Button onClick={volverListado}>Volver</Button></main>

    return (
      <main>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>Factura {facturaActiva.letra} {facturaActiva.sucursal}-{facturaActiva.numero}</h1>
          <Button type="button" onClick={volverListado}>Volver</Button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}
        {aviso && <Feedback tone="success">{aviso}</Feedback>}

        <section>
          <h2>Datos Generales</h2>
          <table>
            <tbody>
              <tr><th>Proveedor</th><td>{facturaActiva.proveedor?.razon_social} (CUIT {facturaActiva.proveedor?.cuit})</td></tr>
              <tr><th>Comprobante</th><td>{facturaActiva.letra} {facturaActiva.sucursal}-{facturaActiva.numero}</td></tr>
              <tr><th>Fecha de Emisión</th><td>{formatearFechaCorta(facturaActiva.fecha_emision)}</td></tr>
              <tr><th>Fecha de Vencimiento</th><td>{formatearFechaCorta(facturaActiva.fecha_vencimiento)}</td></tr>
              <tr><th>Importe Neto</th><td>{formatearMoneda(facturaActiva.importe_neto)}</td></tr>
              <tr><th>Impuestos</th><td>{formatearMoneda(facturaActiva.impuestos)}</td></tr>
              <tr><th>Importe Total</th><td>{formatearMoneda(facturaActiva.importe_total)}</td></tr>
              <tr><th>Saldo Pendiente</th><td>{formatearMoneda(facturaActiva.saldo_pendiente)}</td></tr>
              <tr><th>Estado</th><td><EstadoBadge estado={facturaActiva.estado} /></td></tr>
              <tr><th>Orden de Compra</th><td>{facturaActiva.orden_compra ? `#${facturaActiva.orden_compra.numero}` : '—'}</td></tr>
              <tr>
                <th>Recepciones</th>
                <td>
                  {facturaActiva.recepciones?.length
                    ? facturaActiva.recepciones.map((r) => `#${r.numero}`).join(', ')
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    )
  }

  // --- RENDER: LISTADO ---
  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Facturas de Proveedor</h1>
        {puedeRegistrar && (
          <Button type="button" onClick={irANueva}>Nueva Factura</Button>
        )}
      </header>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}

      <section style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="proveedorId">Proveedor</label>
          <select id="proveedorId" name="proveedorId" value={filtros.proveedorId} onChange={cambiarFiltro}>
            <option value="">Todos</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fechaDesde">Desde</label>
          <input id="fechaDesde" name="fechaDesde" type="date" value={filtros.fechaDesde} onChange={cambiarFiltro} />
        </div>
        <div>
          <label htmlFor="fechaHasta">Hasta</label>
          <input id="fechaHasta" name="fechaHasta" type="date" value={filtros.fechaHasta} onChange={cambiarFiltro} min={filtros.fechaDesde} />
        </div>
        <div>
          <label htmlFor="estado">Estado</label>
          <select id="estado" name="estado" value={filtros.estado} onChange={cambiarFiltro}>
            <option value="">Todos</option>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>{ETIQUETAS_ESTADO[estado]}</option>
            ))}
          </select>
        </div>
      </section>

      <section>
        {loadingListado && <p role="status">Cargando facturas...</p>}

        {!loadingListado && facturas.length === 0 && (
          <EmptyState title="No hay facturas registradas" description="Todavía no se registró ninguna factura de proveedor con estos filtros." />
        )}

        {!loadingListado && facturas.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Comprobante</th>
                <th>Proveedor</th>
                <th>Fecha Emisión</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Saldo Pendiente</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((factura) => (
                <tr key={factura.id}>
                  <td><strong>{factura.letra} {factura.sucursal}-{factura.numero}</strong></td>
                  <td>{factura.proveedor?.razon_social}</td>
                  <td>{formatearFechaCorta(factura.fecha_emision)}</td>
                  <td style={{ textAlign: 'right' }}>{formatearMoneda(factura.importe_total)}</td>
                  <td style={{ textAlign: 'right' }}>{formatearMoneda(factura.saldo_pendiente)}</td>
                  <td><EstadoBadge estado={factura.estado} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <Button type="button" variant="ghost" onClick={() => verDetalle(factura.id)}>Ver detalle</Button>
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
