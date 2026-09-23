import { useEffect, useRef, useState } from 'react'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'
import {
  buscarClientes,
  getHistorialCliente,
  obtenerDetalleVenta,
} from '../api/historialClienteApi'

const SOLAPAS = [
  ['ventas', 'Ventas'],
  ['comprobantes', 'Comprobantes'],
  ['cobros', 'Cobros'],
  ['pedidosWeb', 'Pedidos web'],
  ['acopios', 'Acopios'],
]

const VACIOS = {
  ventas: 'No hay ventas en el período',
  comprobantes: 'No hay comprobantes en el período',
  cobros: 'No hay cobros en el período',
  pedidosWeb: 'No hay pedidos web en el período',
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
  )
}

function TablaComprobantes({ comprobantes }) {
  if (!comprobantes.length) return <EstadoVacio tipo="comprobantes" />
  return (
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
  )
}

function TablaCobros({ cobros }) {
  if (!cobros.length) return <EstadoVacio tipo="cobros" />
  return (
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
  )
}

function TablaPedidosWeb({ pedidos }) {
  if (!pedidos.length) return <EstadoVacio tipo="pedidosWeb" />
  return (
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
                  <td>{item.cantidad}</td>
                  <td>{formatearMoneda(item.precio_unitario)}</td>
                  <td>{formatearMoneda(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default function ClienteHistorialPage() {
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

  useEffect(() => {
    if (!clienteId) {
      setHistorial(null)
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

    return () => {
      vigente = false
    }
  }, [clienteId, filtros])

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
  const movimientos = Array.isArray(historial?.[solapa]) ? historial[solapa] : []

  return (
    <main>
      <h1>Historial de cliente</h1>

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
              </tbody>
            </table>
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
    </main>
  )
}
