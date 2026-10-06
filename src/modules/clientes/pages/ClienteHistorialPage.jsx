import { useCallback, useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import { CreditCard, DollarSign, Download, FileText, Globe, ShoppingCart } from 'lucide-react'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { useToast } from '../../../components/ui/ToastContext'
import {
  buscarClientes,
  getHistorialCliente,
  obtenerDetalleVenta,
} from '../api/historialClienteApi'
import {
  listarMovimientosCtaCte,
  listarVentasPendientesCtaCte,
  obtenerResumenCtaCte,
} from '../api/cuentaCorrienteClienteApi'
import ModalReciboCobranza from '../components/ModalReciboCobranza'
import ModalConfigurarCredito from '../components/ModalConfigurarCredito'

const SOLAPAS = [
  ['ventas', 'Ventas'],
  ['comprobantes', 'Comprobantes'],
  ['cobros', 'Cobros'],
  ['pedidosWeb', 'Pedidos web'],
  ['cuentaCorriente', 'Cuenta corriente'],
  ['acopios', 'Acopios'],
]

const VACIOS = {
  ventas: 'No hay ventas en el período',
  comprobantes: 'No hay comprobantes en el período',
  cobros: 'No hay cobros en el período',
  pedidosWeb: 'No hay pedidos web en el período',
  cuentaCorriente: 'No hay movimientos de cuenta corriente en el período',
}

const moneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
})

const fecha = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function nombreCliente(cliente) {
  if (!cliente) return '—'
  return cliente.tipo_persona === 'juridica'
    ? cliente.razon_social
    : [cliente.apellido, cliente.nombre].filter(Boolean).join(', ')
}

function documentoCliente(cliente) {
  if (!cliente?.numero_documento) return '—'
  return `${cliente.tipo_documento} ${cliente.numero_documento}`
}

function formatearMoneda(valor) {
  return moneda.format(Number(valor ?? 0))
}

function formatearFecha(valor) {
  return valor ? fecha.format(new Date(valor)) : '—'
}

function nombreTipoComprobante(tipo) {
  return {
    factura: 'Factura',
    nota_credito: 'Nota de crédito',
    nota_debito: 'Nota de débito',
  }[tipo] ?? tipo
}

function EstadoBadge({ estado }) {
  const activo = ['Activo', 'Emitido', 'Entregada', 'Pagado', 'Registrado'].includes(estado)
  return (
    <span className={`estado-badge ${activo ? 'estado-badge-activo' : 'estado-badge-inactivo'}`}>
      {estado}
    </span>
  )
}

function EstadoVacio({ tipo }) {
  return (
    <EmptyState
      title={VACIOS[tipo]}
      description="Probá con otro rango de fechas o revisá el historial completo."
    />
  )
}

function TablaVentas({ ventas, onVerDetalle }) {
  if (!ventas.length) return <EstadoVacio tipo="ventas" />
  return (
    <div className="data-table-card">
      <div className="data-table-scroll-container">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Número</th>
              <th>Importe</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((venta) => (
              <tr key={venta.id}>
                <td>{formatearFecha(venta.created_at)}</td>
                <td>#{venta.numero}</td>
                <td>{formatearMoneda(venta.total)}</td>
                <td><EstadoBadge estado={venta.estado} /></td>
                <td>
                  <Button type="button" variant="ghost" onClick={() => onVerDetalle(venta)}>
                    Ver detalle
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TablaComprobantes({ comprobantes }) {
  if (!comprobantes.length) return <EstadoVacio tipo="comprobantes" />
  return (
    <div className="data-table-card">
      <div className="data-table-scroll-container">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Número</th>
              <th>Tipo</th>
              <th>Importe</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {comprobantes.map((comprobante) => (
              <tr key={comprobante.id}>
                <td>{formatearFecha(comprobante.fecha_emision)}</td>
                <td>{comprobante.letra} {comprobante.numero}</td>
                <td>{nombreTipoComprobante(comprobante.tipo_comprobante)}</td>
                <td>{formatearMoneda(comprobante.total)}</td>
                <td><EstadoBadge estado={comprobante.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TablaCobros({ cobros }) {
  if (!cobros.length) return <EstadoVacio tipo="cobros" />
  return (
    <div className="data-table-card">
      <div className="data-table-scroll-container">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Número</th>
              <th>Importe</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cobros.map((cobro) => (
              <tr key={cobro.id}>
                <td>{formatearFecha(cobro.created_at)}</td>
                <td>#{cobro.numero}</td>
                <td>{formatearMoneda(cobro.total)}</td>
                <td><EstadoBadge estado="Registrado" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TablaPedidosWeb({ pedidos }) {
  if (!pedidos.length) return <EstadoVacio tipo="pedidosWeb" />
  return (
    <div className="data-table-card">
      <div className="data-table-scroll-container">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Número</th>
              <th>Importe</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((pedido) => (
              <tr key={pedido.id}>
                <td>{formatearFecha(pedido.created_at)}</td>
                <td>#{pedido.numero}</td>
                <td>{formatearMoneda(pedido.total)}</td>
                <td><EstadoBadge estado={pedido.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TablaCuentaCorriente({ movimientos }) {
  if (!movimientos.length) return <EstadoVacio tipo="cuentaCorriente" />
  return (
    <div className="data-table-card">
      <div className="data-table-scroll-container">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Comprobante</th>
              <th>Referencia / Detalle</th>
              <th style={{ textAlign: 'right' }}>Debe (+)</th>
              <th style={{ textAlign: 'right' }}>Haber (-)</th>
              <th style={{ textAlign: 'right' }}>Saldo acumulado</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m, idx) => {
              const tipoNombre =
                m.tipo_movimiento === 'factura'
                  ? 'Factura'
                  : m.tipo_movimiento === 'recibo'
                  ? 'Recibo'
                  : 'Nota de crédito'
              return (
                <tr key={m.comprobante_id ? `${m.tipo_movimiento}-${m.comprobante_id}` : idx}>
                  <td>{formatearFecha(m.fecha)}</td>
                  <td>
                    <span
                      className={`estado-badge ${
                        m.tipo_movimiento === 'factura'
                          ? 'estado-badge-inactivo'
                          : 'estado-badge-activo'
                      }`}
                    >
                      {tipoNombre}
                    </span>
                  </td>
                  <td>
                    <strong>{m.comprobante}</strong>
                  </td>
                  <td>{m.referencia || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {Number(m.debe) > 0 ? formatearMoneda(m.debe) : '—'}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      color: Number(m.haber) > 0 ? 'var(--color-success, #16a34a)' : 'inherit',
                    }}
                  >
                    {Number(m.haber) > 0 ? formatearMoneda(m.haber) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatearMoneda(m.saldo_acumulado)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ModalDetalleVenta({ venta, onCerrar }) {
  const [detalle, setDetalle] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setError('')

    obtenerDetalleVenta(venta.id)
      .then((renglones) => {
        if (vigente) setDetalle(Array.isArray(renglones) ? renglones : [])
      })
      .catch((err) => {
        if (vigente) setError(err.message || 'No se pudo cargar el detalle de la venta')
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [venta.id])

  useEffect(() => {
    const cerrarConEscape = (event) => {
      if (event.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [onCerrar])

  return (
    <div className="modal-backdrop" onMouseDown={onCerrar}>
      <section
        aria-labelledby="detalle-venta-title"
        aria-modal="true"
        className="modal-panel"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Detalle de venta</p>
            <h2 id="detalle-venta-title">Venta #{venta.numero}</h2>
          </div>
          <Button type="button" variant="ghost" onClick={onCerrar}>Cerrar</Button>
        </header>

        {cargando && <p className="loading-state" role="status">Cargando detalle…</p>}
        {!cargando && error && <Feedback tone="error">{error}</Feedback>}
        {!cargando && !error && detalle.length === 0 && (
          <EmptyState
            title="La venta no tiene artículos"
            description="No hay renglones registrados para esta venta."
          />
        )}
        {!cargando && !error && detalle.length > 0 && (
          <div className="data-table-card">
            <div className="data-table-scroll-container">
              <table>
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Cantidad</th>
                    <th>Precio unitario</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.producto?.nombre ?? 'Artículo no disponible'}</strong>
                        {item.producto?.sku ? ` · ${item.producto.sku}` : ''}
                      </td>
                      <td>
                        {item.cantidad}
                        {Number(item.cantidad_backorder) > 0 && (
                          <div>{item.cantidad_backorder} en backorder</div>
                        )}
                      </td>
                      <td>{formatearMoneda(item.precio_unitario)}</td>
                      <td>{formatearMoneda(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default function ClienteHistorialPage() {
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [clientes, setClientes] = useState([])
  const [buscando, setBuscando] = useState(true)
  const [errorBusqueda, setErrorBusqueda] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [historial, setHistorial] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [solapa, setSolapa] = useState('ventas')
  const [fechas, setFechas] = useState({ desde: '', hasta: '' })
  const [filtros, setFiltros] = useState({ desde: '', hasta: '' })
  const [ventaDetalle, setVentaDetalle] = useState(null)
  const [resumenCtaCte, setResumenCtaCte] = useState(null)
  const [movimientosCtaCte, setMovimientosCtaCte] = useState([])
  const [ventasPendientesCtaCte, setVentasPendientesCtaCte] = useState([])
  const [mostrarModalRecibo, setMostrarModalRecibo] = useState(false)
  const [mostrarModalConfigCredito, setMostrarModalConfigCredito] = useState(false)
  const secuenciaBusqueda = useRef(0)
  const secuenciaHistorial = useRef(0)

  useEffect(() => {
    const secuencia = ++secuenciaBusqueda.current
    const timer = setTimeout(() => {
      setBuscando(true)
      setErrorBusqueda('')
      buscarClientes(busqueda)
        .then((resultado) => {
          if (secuencia === secuenciaBusqueda.current) {
            setClientes(Array.isArray(resultado) ? resultado : [])
          }
        })
        .catch((err) => {
          if (secuencia === secuenciaBusqueda.current) {
            setClientes([])
            setErrorBusqueda(err.message || 'No se pudieron buscar clientes')
          }
        })
        .finally(() => {
          if (secuencia === secuenciaBusqueda.current) setBuscando(false)
        })
    }, 300)

    return () => clearTimeout(timer)
  }, [busqueda])

  const cargarCtaCte = useCallback((id, f = filtros) => {
    if (!id) {
      setResumenCtaCte(null)
      setMovimientosCtaCte([])
      setVentasPendientesCtaCte([])
      return Promise.resolve()
    }
    return Promise.all([
      obtenerResumenCtaCte(id).catch(() => null),
      listarMovimientosCtaCte(id, f).catch(() => []),
      listarVentasPendientesCtaCte(id).catch(() => []),
    ]).then(([resumen, movs, pendientes]) => {
      setResumenCtaCte(resumen)
      setMovimientosCtaCte(Array.isArray(movs) ? movs : [])
      setVentasPendientesCtaCte(Array.isArray(pendientes) ? pendientes : [])
    })
  }, [filtros])

  useEffect(() => {
    if (!clienteId) {
      setHistorial(null)
      setResumenCtaCte(null)
      setMovimientosCtaCte([])
      setVentasPendientesCtaCte([])
      setError('')
      setCargando(false)
      return undefined
    }

    const secuencia = ++secuenciaHistorial.current
    let vigente = true
    setCargando(true)
    setError('')

    getHistorialCliente(clienteId, filtros)
      .then((resultado) => {
        if (vigente && secuencia === secuenciaHistorial.current) setHistorial(resultado)
      })
      .catch((err) => {
        if (vigente && secuencia === secuenciaHistorial.current) {
          setError(err.message || 'No se pudo cargar el historial del cliente')
        }
      })
      .finally(() => {
        if (vigente && secuencia === secuenciaHistorial.current) setCargando(false)
      })

    cargarCtaCte(clienteId, filtros)

    return () => {
      vigente = false
    }
  }, [clienteId, filtros, cargarCtaCte])

  function handleReciboRegistrado(recibo) {
    toast.success(`Recibo N.º ${recibo.numero} registrado con éxito (${formatearMoneda(recibo.total)})`)
    cargarCtaCte(clienteId, filtros)
    getHistorialCliente(clienteId, filtros).then(setHistorial)
  }

  function handleCreditoGuardado(actualizado) {
    toast.success('Condiciones de crédito actualizadas')
    setHistorial((actual) =>
      actual ? { ...actual, cliente: { ...actual.cliente, ...actualizado } } : actual,
    )
    cargarCtaCte(clienteId, filtros)
  }

  function aplicarFechas(event) {
    event.preventDefault()
    setFiltros({ ...fechas })
  }

  function limpiarFechas() {
    const vacias = { desde: '', hasta: '' }
    setFechas(vacias)
    setFiltros({ ...vacias })
  }

  const cliente = historial?.cliente
  const movimientos =
    solapa === 'cuentaCorriente'
      ? movimientosCtaCte
      : Array.isArray(historial?.[solapa])
      ? historial[solapa]
      : []

  function exportarCsv() {
    if (!movimientos.length) return
    let dataParaCsv = []
    if (solapa === 'ventas') {
      dataParaCsv = movimientos.map((v) => ({
        Fecha: formatearFecha(v.created_at),
        Numero: v.numero,
        Importe: v.total,
        Estado: v.estado,
      }))
    } else if (solapa === 'comprobantes') {
      dataParaCsv = movimientos.map((c) => ({
        Fecha: formatearFecha(c.fecha_emision),
        Numero: `${c.letra} ${c.numero}`,
        Tipo: nombreTipoComprobante(c.tipo_comprobante),
        Importe: c.total,
        Estado: c.estado,
      }))
    } else if (solapa === 'cobros') {
      dataParaCsv = movimientos.map((cb) => ({
        Fecha: formatearFecha(cb.created_at),
        Numero: cb.numero,
        Importe: cb.total,
        Estado: 'Registrado',
      }))
    } else if (solapa === 'pedidosWeb') {
      dataParaCsv = movimientos.map((p) => ({
        Fecha: formatearFecha(p.created_at),
        Numero: p.numero,
        Importe: p.total,
        Estado: p.estado,
      }))
    } else if (solapa === 'cuentaCorriente') {
      dataParaCsv = movimientos.map((m) => ({
        Fecha: formatearFecha(m.fecha),
        Tipo:
          m.tipo_movimiento === 'factura'
            ? 'Factura'
            : m.tipo_movimiento === 'recibo'
            ? 'Recibo'
            : 'Nota de crédito',
        Comprobante: m.comprobante,
        Referencia: m.referencia || '',
        Debe: m.debe,
        Haber: m.haber,
        Saldo: m.saldo_acumulado,
      }))
    }

    if (!dataParaCsv.length) return

    const csv = Papa.unparse(dataParaCsv)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `historial_${cliente?.apellido || 'cliente'}_${solapa}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success(`Movimientos exportados a CSV`)
  }

  return (
    <main>
      <PageHeader
        breadcrumbs={[{ label: 'Clientes', to: '/#/clientes' }, { label: 'Historial 360°' }]}
        kicker="Clientes y Cuentas"
        title="Historial de cliente"
        description="Visión integral de compras, facturación, cobranzas y pedidos web por cliente."
        actions={
          movimientos.length > 0 ? (
            <Button variant="secondary" onClick={exportarCsv}>
              <Download size={16} />
              Exportar CSV
            </Button>
          ) : null
        }
      />

      <div className="kpi-grid">
        <KpiCard
          label="Total comprado"
          value={cliente ? formatearMoneda(historial?.totalComprado ?? 0) : '—'}
          icon={DollarSign}
          tone="success"
          helperText={cliente ? 'Histórico acumulado' : 'Seleccioná un cliente'}
        />
        <KpiCard
          label="Ventas registradas"
          value={cliente && historial?.ventas ? historial.ventas.length : '—'}
          icon={ShoppingCart}
          tone="brand"
          helperText="En período consultado"
        />
        <KpiCard
          label="Comprobantes"
          value={cliente && historial?.comprobantes ? historial.comprobantes.length : '—'}
          icon={FileText}
          tone="info"
          helperText="Facturas y notas"
        />
        <KpiCard
          label="Pedidos web"
          value={cliente && historial?.pedidosWeb ? historial.pedidosWeb.length : '—'}
          icon={Globe}
          tone="neutral"
          helperText="Ecommerce vinculado"
        />
      </div>

      <section>
        <h2>Seleccionar cliente</h2>
        <form onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="buscar-cliente">
            Buscar por nombre, razón social, DNI o CUIT
            <input
              autoComplete="off"
              id="buscar-cliente"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
            />
          </label>
          <label htmlFor="cliente-historial">
            Cliente
            <select
              id="cliente-historial"
              value={clienteId}
              onChange={(event) => setClienteId(event.target.value)}
              disabled={buscando && clientes.length === 0}
            >
              <option value="">Seleccioná un cliente</option>
              {clientes.map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {nombreCliente(opcion)} · {documentoCliente(opcion)}
                </option>
              ))}
            </select>
          </label>
        </form>
        {buscando && <p className="loading-state" role="status">Buscando clientes…</p>}
        {!buscando && errorBusqueda && <Feedback tone="error">{errorBusqueda}</Feedback>}
        {!buscando && !errorBusqueda && clientes.length === 0 && (
          <p>No hay clientes que coincidan con la búsqueda.</p>
        )}
      </section>

      {!clienteId && (
        <EmptyState
          title="Seleccioná un cliente"
          description="Buscá un cliente para consultar todas sus operaciones en un solo lugar."
        />
      )}

      {clienteId && cargando && !historial && (
        <p className="loading-state" role="status">Cargando historial…</p>
      )}
      {clienteId && error && <Feedback tone="error">{error}</Feedback>}

      {cliente && (
        <>
          <section>
            <h2>{nombreCliente(cliente)}</h2>
            <div className="data-table-card">
              <div className="data-table-scroll-container">
                <table>
                  <tbody>
                    <tr>
                      <th>Número</th>
                      <td>#{cliente.numero}</td>
                      <th>Documento</th>
                      <td>{documentoCliente(cliente)}</td>
                    </tr>
                    <tr>
                      <th>Estado</th>
                      <td><EstadoBadge estado={cliente.estado} /></td>
                      <th>Tipo de cliente</th>
                      <td>{cliente.tipo_cliente?.nombre ?? '—'}</td>
                    </tr>
                    <tr>
                      <th>Lista de precios</th>
                      <td>{cliente.tipo_cliente?.lista_precio?.nombre ?? 'Sin lista asignada'}</td>
                      <th>Total comprado</th>
                      <td><strong>{formatearMoneda(historial.totalComprado)}</strong></td>
                    </tr>
                    <tr>
                      <th>Contacto</th>
                      <td>{cliente.telefono || '—'}</td>
                      <th>Email</th>
                      <td>{cliente.email || '—'}</td>
                    </tr>
                    <tr>
                      <th>Cuenta corriente</th>
                      <td>
                        <span
                          className={`estado-badge ${
                            (resumenCtaCte?.habilita_cta_cte ?? cliente.habilita_cta_cte)
                              ? 'estado-badge-activo'
                              : 'estado-badge-inactivo'
                          }`}
                        >
                          {(resumenCtaCte?.habilita_cta_cte ?? cliente.habilita_cta_cte)
                            ? 'Habilitada'
                            : 'Inhabilitada'}
                        </span>
                      </td>
                      <th>Límite de crédito</th>
                      <td>
                        {Number(resumenCtaCte?.limite_credito ?? cliente.limite_credito ?? 0) > 0
                          ? `${formatearMoneda(
                              resumenCtaCte?.limite_credito ?? cliente.limite_credito,
                            )} (Plazo: ${resumenCtaCte?.plazo_credito_dias ?? cliente.plazo_credito_dias ?? 30} días)`
                          : 'Sin límite establecido'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <h2>Período</h2>
            <form onSubmit={aplicarFechas}>
              <label htmlFor="historial-desde">
                Desde
                <input
                  id="historial-desde"
                  type="date"
                  value={fechas.desde}
                  onChange={(event) => setFechas((actual) => ({ ...actual, desde: event.target.value }))}
                />
              </label>
              <label htmlFor="historial-hasta">
                Hasta
                <input
                  id="historial-hasta"
                  type="date"
                  value={fechas.hasta}
                  onChange={(event) => setFechas((actual) => ({ ...actual, hasta: event.target.value }))}
                />
              </label>
              <div>
                <Button type="submit" loading={cargando} loadingLabel="Aplicando…">
                  Aplicar fechas
                </Button>
                <Button type="button" variant="ghost" onClick={limpiarFechas} disabled={cargando}>
                  Limpiar
                </Button>
              </div>
            </form>
          </section>

          <section>
            <div className="tabs" role="tablist" aria-label="Movimientos del cliente">
              {SOLAPAS.map(([id, etiqueta]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-controls={`panel-${id}`}
                  aria-selected={solapa === id}
                  onClick={() => setSolapa(id)}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            <div id={`panel-${solapa}`} role="tabpanel">
              {cargando && <p className="loading-state" role="status">Actualizando movimientos…</p>}
              {!cargando && !error && solapa === 'ventas' && (
                <TablaVentas ventas={movimientos} onVerDetalle={setVentaDetalle} />
              )}
              {!cargando && !error && solapa === 'comprobantes' && (
                <TablaComprobantes comprobantes={movimientos} />
              )}
              {!cargando && !error && solapa === 'cobros' && (
                <TablaCobros cobros={movimientos} />
              )}
              {!cargando && !error && solapa === 'pedidosWeb' && (
                <TablaPedidosWeb pedidos={movimientos} />
              )}
              {!cargando && !error && solapa === 'cuentaCorriente' && (
                <div className="cuenta-corriente-tab-content">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1.25rem',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span
                        className={`estado-badge ${
                          (resumenCtaCte?.habilita_cta_cte ?? cliente.habilita_cta_cte)
                            ? 'estado-badge-activo'
                            : 'estado-badge-inactivo'
                        }`}
                      >
                        {(resumenCtaCte?.habilita_cta_cte ?? cliente.habilita_cta_cte)
                          ? 'Cuenta corriente habilitada'
                          : 'Cuenta corriente inhabilitada'}
                      </span>
                      <span style={{ fontSize: '0.875rem' }}>
                        Plazo acordado: <strong>{resumenCtaCte?.plazo_credito_dias ?? cliente.plazo_credito_dias ?? 30} días</strong>
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setMostrarModalConfigCredito(true)}
                      >
                        Configurar crédito
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setMostrarModalRecibo(true)}
                      >
                        <CreditCard size={16} />
                        Registrar recibo de cobranza
                      </Button>
                    </div>
                  </div>

                  <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
                    <KpiCard
                      label="Límite de crédito"
                      value={
                        Number(resumenCtaCte?.limite_credito ?? cliente.limite_credito ?? 0) > 0
                          ? formatearMoneda(resumenCtaCte?.limite_credito ?? cliente.limite_credito)
                          : 'Sin límite'
                      }
                      icon={CreditCard}
                      tone="neutral"
                      helperText="Tope máximo financiado"
                    />
                    <KpiCard
                      label="Saldo deudor (Deuda actual)"
                      value={formatearMoneda(resumenCtaCte?.saldo_deudor ?? 0)}
                      icon={DollarSign}
                      tone={Number(resumenCtaCte?.saldo_deudor ?? 0) > 0 ? 'error' : 'success'}
                      helperText={
                        Number(resumenCtaCte?.saldo_deudor ?? 0) > 0
                          ? 'Deuda total acumulada'
                          : 'Cuenta al día / sin deuda'
                      }
                    />
                    <KpiCard
                      label="Crédito disponible"
                      value={
                        Number(resumenCtaCte?.limite_credito ?? cliente.limite_credito ?? 0) > 0
                          ? formatearMoneda(resumenCtaCte?.credito_disponible ?? 0)
                          : 'Ilimitado'
                      }
                      icon={DollarSign}
                      tone="brand"
                      helperText="Margen para nuevas compras"
                    />
                    <KpiCard
                      label="Facturas pendientes"
                      value={ventasPendientesCtaCte.length}
                      icon={FileText}
                      tone={ventasPendientesCtaCte.length > 0 ? 'warning' : 'neutral'}
                      helperText="Comprobantes con saldo adeudado"
                    />
                  </div>

                  {ventasPendientesCtaCte.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                        Facturas con saldo pendiente de cobro
                      </h3>
                      <div className="data-table-card">
                        <div className="data-table-scroll-container">
                          <table>
                            <thead>
                              <tr>
                                <th>Fecha</th>
                                <th>Comprobante</th>
                                <th>Total venta</th>
                                <th>Total imputado</th>
                                <th>Saldo pendiente</th>
                                <th>Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ventasPendientesCtaCte.map((v) => (
                                <tr key={v.venta_id}>
                                  <td>{v.fecha}</td>
                                  <td><strong>{v.comprobante}</strong></td>
                                  <td>{formatearMoneda(v.total_credito)}</td>
                                  <td>{formatearMoneda(v.total_imputado)}</td>
                                  <td>
                                    <strong style={{ color: 'var(--color-error, #dc2626)' }}>
                                      {formatearMoneda(v.saldo_pendiente)}
                                    </strong>
                                  </td>
                                  <td>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={() => setMostrarModalRecibo(true)}
                                    >
                                      Cobrar factura
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    Libro Mayor de Cuenta Corriente
                  </h3>
                  <TablaCuentaCorriente movimientos={movimientosCtaCte} />
                </div>
              )}
              {!cargando && !error && solapa === 'acopios' && (
                <p>Módulo de Acopio pendiente (E04)</p>
              )}
            </div>
          </section>
        </>
      )}

      {ventaDetalle && (
        <ModalDetalleVenta venta={ventaDetalle} onCerrar={() => setVentaDetalle(null)} />
      )}

      {mostrarModalRecibo && (
        <ModalReciboCobranza
          abierto={mostrarModalRecibo}
          cliente={cliente}
          resumenCtaCte={resumenCtaCte}
          ventasPendientes={ventasPendientesCtaCte}
          onReciboRegistrado={handleReciboRegistrado}
          onCerrar={() => setMostrarModalRecibo(false)}
        />
      )}

      {mostrarModalConfigCredito && (
        <ModalConfigurarCredito
          abierto={mostrarModalConfigCredito}
          cliente={cliente}
          onGuardado={handleCreditoGuardado}
          onCerrar={() => setMostrarModalConfigCredito(false)}
        />
      )}
    </main>
  )
}
