import { useEffect, useRef, useState } from 'react'
import { X, Download } from 'lucide-react'
import { getVentaById } from '../api/consultaVentasApi'
import {
  emitirComprobante,
  descargarComprobantePdf,
  puedeFacturarVentas,
  puedeAnularVentas,
  determinarLetraComprobante,
  calcularDesgloseIva,
} from '../api/comprobantesApi'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'

const TONOS_ESTADO = {
  Pendiente: 'advertencia',
  Facturada: 'principal',
  Entregada: 'activo',
  Anulada: 'error',
}

function EstadoVentaBadge({ estado }) {
  const tono = TONOS_ESTADO[estado] ?? 'inactivo'
  return <span className={`estado-badge estado-badge-${tono}`}>{estado}</span>
}

function nombreCliente(cliente) {
  if (!cliente) return 'Consumidor Final'
  return cliente.tipo_persona === 'juridica'
    ? cliente.razon_social
    : `${cliente.apellido || ''} ${cliente.nombre || ''}`.trim() || 'Consumidor Final'
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(valor || 0)
}

function formatearFecha(fechaIso) {
  if (!fechaIso) return '—'
  return new Date(fechaIso).toLocaleString('es-AR')
}

function formatearComprobanteNumero(pv, numero) {
  const pvStr = String(pv?.numero || pv || '1').padStart(4, '0')
  const numStr = String(numero || 0).padStart(8, '0')
  return `${pvStr}-${numStr}`
}

export default function VentaDetalle({ ventaId, onCerrar, onComprobanteEmitido }) {
  const [venta, setVenta] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [descargandoId, setDescargandoId] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const [puedeFacturar, setPuedeFacturar] = useState(true)
  const [puedeAnular, setPuedeAnular] = useState(true)

  // Sub-estados para acciones
  const [mostrarConfirmarFactura, setMostrarConfirmarFactura] = useState(false)
  const [mostrarFormNc, setMostrarFormNc] = useState(false)
  const [tipoNc, setTipoNc] = useState('total')
  const [montoNc, setMontoNc] = useState('')

  const cerrarRef = useRef(null)

  async function cargarDatos() {
    try {
      setCargando(true)
      setError('')
      const data = await getVentaById(ventaId)
      setVenta(data)
    } catch (err) {
      setError(err.message || 'No se pudo cargar la venta')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cerrarRef.current?.focus()
    cargarDatos()

    Promise.all([puedeFacturarVentas(), puedeAnularVentas()])
      .then(([facturar, anular]) => {
        setPuedeFacturar(facturar)
        setPuedeAnular(anular)
      })
      .catch(() => {
        setPuedeFacturar(true)
        setPuedeAnular(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaId])

  useEffect(() => {
    function manejarTecla(event) {
      if (event.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', manejarTecla)
    return () => document.removeEventListener('keydown', manejarTecla)
  }, [onCerrar])

  // CA-02: Determinación de la letra según la condición IVA del cliente
  const condicionIvaNombre = venta?.cliente?.condicion_iva?.nombre || ''
  const letraComprobante = determinarLetraComprobante(condicionIvaNombre)
  const desgloseTotal = calcularDesgloseIva(venta?.total || 0)

  // CA-01: Se habilita Facturar si la venta está Pendiente y (cobrada o con medio Cuenta corriente)
  const puedeEmitirFactura =
    venta?.estado === 'Pendiente' &&
    (venta?.estaCobrada || venta?.tieneCuentaCorriente) &&
    puedeFacturar

  // CA-05: Nota de Crédito para ventas Facturadas
  const facturaEmitida = (venta?.comprobantes ?? []).find(
    (c) => c.tipo_comprobante === 'factura' && c.estado === 'Emitido',
  )
  const ncsEmitidas = (venta?.comprobantes ?? []).filter(
    (c) => c.tipo_comprobante === 'nota_credito' && c.estado === 'Emitido',
  )
  const totalNcEmitidas = ncsEmitidas.reduce((acc, c) => acc + Number(c.total || 0), 0)
  const saldoFactura = facturaEmitida ? Math.max(0, Number(facturaEmitida.total || 0) - totalNcEmitidas) : 0
  const puedeEmitirNc = venta?.estado === 'Facturada' && puedeAnular && saldoFactura > 0

  async function handleFacturar() {
    try {
      setProcesando(true)
      setError('')
      setAviso('')
      const comprobante = await emitirComprobante(venta.id, 'factura')
      setAviso(`Factura ${comprobante.letra} emitida con éxito (Nº ${formatearComprobanteNumero(comprobante.punto_venta_id, comprobante.numero)})`)
      setMostrarConfirmarFactura(false)
      await cargarDatos()
      if (onComprobanteEmitido) onComprobanteEmitido()
    } catch (err) {
      setError(err.message || 'Error al emitir la factura')
    } finally {
      setProcesando(false)
    }
  }

  async function handleEmitirNotaCredito(e) {
    e.preventDefault()
    try {
      setProcesando(true)
      setError('')
      setAviso('')

      let itemsParam = null
      if (tipoNc === 'parcial') {
        const montoNum = parseFloat(montoNc)
        if (isNaN(montoNum) || montoNum <= 0) {
          setError('El monto de la nota de crédito debe ser mayor a cero')
          setProcesando(false)
          return
        }
        if (montoNum > saldoFactura) {
          setError(`El monto no puede superar el saldo remanente (${formatearMoneda(saldoFactura)})`)
          setProcesando(false)
          return
        }
        itemsParam = [{ monto: montoNum }]
      }

      const nc = await emitirComprobante(venta.id, 'nota_credito', itemsParam)
      setAviso(`Nota de Crédito ${nc.letra} emitida con éxito por ${formatearMoneda(nc.total)}`)
      setMostrarFormNc(false)
      setMontoNc('')
      await cargarDatos()
      if (onComprobanteEmitido) onComprobanteEmitido()
    } catch (err) {
      setError(err.message || 'Error al emitir la Nota de Crédito')
    } finally {
      setProcesando(false)
    }
  }

  async function handleDescargarPdf(comprobanteId) {
    try {
      setDescargandoId(comprobanteId)
      setError('')
      await descargarComprobantePdf(comprobanteId, true)
    } catch (err) {
      setError(err.message || 'Error al generar o descargar el PDF')
    } finally {
      setDescargandoId(null)
    }
  }

  if (cargando) {
    return (
      <div className="modal-backdrop" onMouseDown={onCerrar}>
        <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
          <p className="loading-state" role="status">
            Cargando detalle de venta…
          </p>
        </div>
      </div>
    )
  }

  if (!venta) {
    return (
      <div className="modal-backdrop" onMouseDown={onCerrar}>
        <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
          {error && <Feedback tone="error">{error}</Feedback>}
          {!error && <p className="empty-state">No se encontró la información de la venta.</p>}
          <Button type="button" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onMouseDown={onCerrar}>
      <section
        aria-labelledby="detalle-venta-heading"
        aria-modal="true"
        className="modal-panel"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Comprobante y Venta</p>
            <h2 id="detalle-venta-heading">
              Venta Nº {venta.numero} — {nombreCliente(venta.cliente)}
            </h2>
            <p>
              {formatearMoneda(venta.total)} · <EstadoVentaBadge estado={venta.estado} /> · {formatearFecha(venta.created_at)}
            </p>
          </div>
          <button
            aria-label="Cerrar"
            className="icon-button"
            onClick={onCerrar}
            ref={cerrarRef}
            title="Cerrar"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}
        {aviso && <Feedback tone="success">{aviso}</Feedback>}

        {/* Información del Cliente */}
        <div style={{ background: 'var(--surface-muted, #f8f9fa)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '13px' }}>
            <strong>Cliente:</strong> {nombreCliente(venta.cliente)} ({venta.cliente?.tipo_documento || 'Doc'}: {venta.cliente?.numero_documento || '—'})
          </p>
          <p style={{ margin: '0 0 4px', fontSize: '13px' }}>
            <strong>Condición frente al IVA:</strong> {condicionIvaNombre || 'Consumidor Final'} → <em>Letra de comprobante: Factura {letraComprobante}</em>
          </p>
          <p style={{ margin: 0, fontSize: '13px' }}>
            <strong>Estado de Cobro:</strong>{' '}
            {venta.estaCobrada ? (
              <span style={{ color: 'var(--color-success, #2e7d32)' }}>Cobrada íntegramente ({formatearMoneda(venta.totalCobrado)})</span>
            ) : venta.tieneCuentaCorriente ? (
              <span style={{ color: 'var(--color-info, #1565c0)' }}>Habilitada con Cuenta corriente</span>
            ) : (
              <span style={{ color: 'var(--color-warning, #d84315)' }}>Cobro pendiente ({formatearMoneda(venta.totalCobrado)} de {formatearMoneda(venta.total)})</span>
            )}
          </p>
        </div>

        {/* ACCIONES PRINCIPALES */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {/* BOTÓN FACTURAR (CA-01) */}
          {venta.estado === 'Pendiente' && (
            <div>
              <Button
                type="button"
                onClick={() => setMostrarConfirmarFactura(true)}
                disabled={!puedeEmitirFactura || procesando}
                title={
                  !puedeEmitirFactura
                    ? 'Requiere que la venta esté cobrada o tenga medio Cuenta corriente para facturar'
                    : 'Emitir comprobante fiscal'
                }
              >
                Facturar (Factura {letraComprobante})
              </Button>
              {!puedeEmitirFactura && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  Requiere estar cobrada o tener Cuenta corriente para facturar.
                </p>
              )}
            </div>
          )}

          {/* BOTÓN NOTA DE CRÉDITO (CA-05) */}
          {puedeEmitirNc && !mostrarFormNc && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMostrarFormNc(true)
                setError('')
              }}
              disabled={procesando}
            >
              Emitir Nota de Crédito
            </Button>
          )}
        </div>

        {/* FORMULARIO DE CONFIRMACIÓN DE FACTURA */}
        {mostrarConfirmarFactura && (
          <div style={{ border: '1px solid var(--border-default)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 8px' }}>Confirmar Emisión de Factura {letraComprobante}</h3>
            <p style={{ fontSize: '13px', margin: '0 0 12px' }}>
              Se generará la <strong>Factura {letraComprobante}</strong> correlativa con CAE simulado (HOMOLOGACIÓN).
            </p>
            <div style={{ fontSize: '13px', marginBottom: '12px' }}>
              <div>Neto Gravado: {formatearMoneda(desgloseTotal.neto)}</div>
              <div>IVA 21%: {formatearMoneda(desgloseTotal.iva)}</div>
              <div><strong>Total a Facturar: {formatearMoneda(desgloseTotal.total)}</strong></div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button type="button" onClick={handleFacturar} loading={procesando} loadingLabel="Emitiendo factura…">
                Confirmar y Emitir
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMostrarConfirmarFactura(false)}
                disabled={procesando}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* FORMULARIO DE NOTA DE CRÉDITO */}
        {mostrarFormNc && (
          <form onSubmit={handleEmitirNotaCredito} style={{ border: '1px solid var(--border-default)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 8px' }}>Emitir Nota de Crédito</h3>
            <p style={{ fontSize: '13px', margin: '0 0 8px' }}>
              Saldo disponible a acreditar de la factura: <strong>{formatearMoneda(saldoFactura)}</strong>
            </p>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <input
                  type="radio"
                  name="tipoNc"
                  value="total"
                  checked={tipoNc === 'total'}
                  onChange={() => setTipoNc('total')}
                />
                Total ({formatearMoneda(saldoFactura)}) — Anulará la venta y liberará stock
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <input
                  type="radio"
                  name="tipoNc"
                  value="parcial"
                  checked={tipoNc === 'parcial'}
                  onChange={() => setTipoNc('parcial')}
                />
                Parcial (monto específico)
              </label>
            </div>

            {tipoNc === 'parcial' && (
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor="monto-nc" style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                  Monto a acreditar:
                </label>
                <input
                  id="monto-nc"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={saldoFactura}
                  value={montoNc}
                  onChange={(e) => setMontoNc(e.target.value)}
                  placeholder={`Hasta ${saldoFactura}`}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc' }}
                  required
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button type="submit" loading={procesando} loadingLabel="Emitiendo NC…">
                Confirmar Nota de Crédito
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMostrarFormNc(false)
                  setMontoNc('')
                }}
                disabled={procesando}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {/* SECCIÓN COMPROBANTES EMITIDOS (CA-03, CA-04, CA-05) */}
        <h3>Comprobantes fiscales emitidos</h3>
        {(venta.comprobantes ?? []).length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            No se han emitido comprobantes fiscales para esta venta todavía.
          </p>
        ) : (
          <table style={{ width: '100%', marginBottom: '20px' }}>
            <thead>
              <tr>
                <th>Tipo y Letra</th>
                <th>Número</th>
                <th>Fecha Emisión</th>
                <th>Neto</th>
                <th>IVA 21%</th>
                <th>Total</th>
                <th>CAE</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(venta.comprobantes ?? []).map((comp) => (
                <tr key={comp.id}>
                  <td>
                    <strong>
                      {comp.tipo_comprobante === 'factura'
                        ? 'Factura'
                        : comp.tipo_comprobante === 'nota_credito'
                          ? 'Nota de Crédito'
                          : 'Nota de Débito'}{' '}
                      {comp.letra}
                    </strong>
                  </td>
                  <td>{formatearComprobanteNumero(comp.punto_venta, comp.numero)}</td>
                  <td>{formatearFecha(comp.fecha_emision)}</td>
                  <td>{formatearMoneda(comp.neto)}</td>
                  <td>{formatearMoneda(comp.iva)}</td>
                  <td><strong>{formatearMoneda(comp.total)}</strong></td>
                  <td>
                    <span style={{ fontSize: '11px', background: '#e0e0e0', padding: '2px 6px', borderRadius: '4px' }}>
                      {comp.cae || 'HOMOLOGACIÓN'}
                    </span>
                  </td>
                  <td>
                    {/* BOTÓN DESCARGAR PDF (CA-04) */}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleDescargarPdf(comp.id)}
                      loading={descargandoId === comp.id}
                      loadingLabel="Generando…"
                      title="Descargar comprobante en PDF"
                    >
                      <Download size={14} style={{ marginRight: '4px' }} />
                      Descargar PDF
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* DETALLE DE ARTÍCULOS */}
        <h3>Artículos de la venta</h3>
        <table style={{ width: '100%', marginBottom: '20px' }}>
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Cantidad</th>
              <th>Precio Unit.</th>
              <th>Descuento</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {(venta.detalle ?? []).map((item) => (
              <tr key={item.id}>
                <td>
                  {item.producto?.codigo ? `[${item.producto.codigo}] ` : ''}
                  {item.producto?.nombre || 'Artículo'}
                </td>
                <td>{item.cantidad}</td>
                <td>{formatearMoneda(item.precio_unitario)}</td>
                <td>{item.descuento_pct > 0 ? `${item.descuento_pct}%` : '—'}</td>
                <td><strong>{formatearMoneda(item.subtotal)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* DETALLE DE COBROS */}
        <h3>Cobros registrados</h3>
        {(venta.cobros ?? []).length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            No registra cobros cargados.
          </p>
        ) : (
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Nº Cobro</th>
                <th>Fecha</th>
                <th>Medio de Pago</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {(venta.cobros ?? []).map((cobro) => (
                <tr key={cobro.id}>
                  <td>Cobro #{cobro.numero || '1'}</td>
                  <td>{formatearFecha(cobro.created_at)}</td>
                  <td>
                    {(cobro.detalle ?? [])
                      .map((d) => d.medio_pago?.nombre || 'Efectivo')
                      .join(', ') || 'Efectivo'}
                  </td>
                  <td><strong>{formatearMoneda(cobro.total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
