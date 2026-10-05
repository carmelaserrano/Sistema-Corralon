import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Wand2, X } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import {
  listarMediosCobranza,
  registrarReciboCobranza,
} from '../api/cuentaCorrienteClienteApi'

const moneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
})

function formatearMoneda(valor) {
  return moneda.format(Number(valor ?? 0))
}

const LINEA_MEDIO_INICIAL = {
  id: 1,
  medio_pago_id: '',
  monto: '',
  referencia: '',
}

export default function ModalReciboCobranza({
  abierto,
  cliente,
  resumenCtaCte,
  ventasPendientes = [],
  onReciboRegistrado,
  onCerrar,
}) {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [mediosDisponibles, setMediosDisponibles] = useState([])
  const [lineasMedios, setLineasMedios] = useState([{ ...LINEA_MEDIO_INICIAL }])
  const [imputaciones, setImputaciones] = useState({})
  const [observaciones, setObservaciones] = useState('')
  const [cargandoMedios, setCargandoMedios] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const siguienteId = useRef(2)
  const cerrarRef = useRef(null)

  useEffect(() => {
    if (abierto) {
      setFecha(new Date().toISOString().slice(0, 10))
      setLineasMedios([{ ...LINEA_MEDIO_INICIAL }])
      setImputaciones({})
      setObservaciones('')
      setError('')
      setGuardando(false)
      siguienteId.current = 2
      cerrarRef.current?.focus()

      setCargandoMedios(true)
      listarMediosCobranza()
        .then((medios) => {
          setMediosDisponibles(Array.isArray(medios) ? medios : [])
        })
        .catch((err) => {
          setError(err.message || 'No se pudieron cargar los medios de cobro')
        })
        .finally(() => {
          setCargandoMedios(false)
        })
    }
  }, [abierto])

  useEffect(() => {
    if (!abierto) return undefined
    function manejarTecla(event) {
      if (event.key === 'Escape' && !guardando) onCerrar()
    }
    document.addEventListener('keydown', manejarTecla)
    return () => document.removeEventListener('keydown', manejarTecla)
  }, [abierto, guardando, onCerrar])

  // Total cobrado sumando todos los medios de cobro
  const totalCobrado = useMemo(() => {
    return lineasMedios.reduce((acc, linea) => {
      const m = Number(linea.monto || 0)
      return acc + (Number.isFinite(m) && m > 0 ? m : 0)
    }, 0)
  }, [lineasMedios])

  // Total imputado a facturas pendientes
  const totalImputado = useMemo(() => {
    return Object.values(imputaciones).reduce((acc, monto) => {
      const m = Number(monto || 0)
      return acc + (Number.isFinite(m) && m > 0 ? m : 0)
    }, 0)
  }, [imputaciones])

  const saldoACuenta = Math.max(0, totalCobrado - totalImputado)

  if (!abierto || !cliente) return null

  const nombreCliente =
    cliente.tipo_persona === 'juridica'
      ? cliente.razon_social
      : [cliente.apellido, cliente.nombre].filter(Boolean).join(', ')

  function agregarLineaMedio() {
    setLineasMedios((actuales) => [
      ...actuales,
      { ...LINEA_MEDIO_INICIAL, id: siguienteId.current++ },
    ])
  }

  function quitarLineaMedio(id) {
    if (lineasMedios.length <= 1) return
    setLineasMedios((actuales) => actuales.filter((l) => l.id !== id))
  }

  function actualizarLineaMedio(id, campo, valor) {
    setLineasMedios((actuales) =>
      actuales.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)),
    )
  }

  function cambiarImputacion(ventaId, valor) {
    setImputaciones((actuales) => ({
      ...actuales,
      [ventaId]: valor,
    }))
  }

  /**
   * Distribución automática FIFO:
   * Asigna el total cobrado a las facturas pendientes de la más antigua a la más reciente.
   */
  function autoImputarFifo() {
    let disponible = totalCobrado
    const nuevasImputaciones = {}

    // Ordenar ventas por fecha/creación ascendente
    const ventasOrdenadas = [...ventasPendientes].sort((a, b) =>
      (a.fecha || '').localeCompare(b.fecha || ''),
    )

    for (const venta of ventasOrdenadas) {
      if (disponible <= 0) {
        nuevasImputaciones[venta.venta_id] = ''
        continue
      }
      const saldoVenta = Number(venta.saldo_pendiente || 0)
      const aImputar = Math.min(disponible, saldoVenta)
      nuevasImputaciones[venta.venta_id] = String(aImputar.toFixed(2))
      disponible -= aImputar
    }

    setImputaciones(nuevasImputaciones)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (totalCobrado <= 0) {
      setError('El total recibido en los medios de cobro debe ser mayor a 0')
      return
    }

    // Validar líneas de medios
    for (const linea of lineasMedios) {
      if (!linea.medio_pago_id) {
        setError('Debe seleccionar el medio de pago en todas las líneas')
        return
      }
      if (Number(linea.monto || 0) <= 0) {
        setError('El importe de cada medio de cobro debe ser mayor a 0')
        return
      }
    }

    // Validar imputaciones
    if (totalImputado > totalCobrado) {
      setError(
        `El total imputado (${formatearMoneda(totalImputado)}) no puede superar el total cobrado (${formatearMoneda(totalCobrado)})`,
      )
      return
    }

    const imputacionesPayload = []
    for (const venta of ventasPendientes) {
      const monto = Number(imputaciones[venta.venta_id] || 0)
      if (monto > 0) {
        if (monto > Number(venta.saldo_pendiente || 0)) {
          setError(
            `El monto imputado a ${venta.comprobante} supera su saldo pendiente (${formatearMoneda(venta.saldo_pendiente)})`,
          )
          return
        }
        imputacionesPayload.push({
          venta_id: venta.venta_id,
          monto_imputado: monto,
        })
      }
    }

    try {
      setGuardando(true)
      const recibo = await registrarReciboCobranza({
        clienteId: cliente.id,
        fecha,
        medios: lineasMedios.map((l) => ({
          medio_pago_id: l.medio_pago_id,
          monto: Number(l.monto),
          referencia: l.referencia || null,
        })),
        imputaciones: imputacionesPayload,
        observaciones: observaciones || null,
      })

      onReciboRegistrado(recibo)
      onCerrar()
    } catch (err) {
      setError(err.message || 'No se pudo registrar el recibo de cobranza')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !guardando) onCerrar()
      }}
    >
      <section
        className="modal-panel page-canvas"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-recibo-cobranza"
        style={{ maxWidth: '800px', width: '95%' }}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Cobranzas a Cuenta Corriente</p>
            <h2 id="titulo-recibo-cobranza">Nuevo Recibo de Cobranza</h2>
            <p>
              #{cliente.numero} · {nombreCliente} · Saldo deudor:{' '}
              <strong style={{ color: Number(resumenCtaCte?.saldo_deudor ?? 0) > 0 ? 'var(--color-error, #dc2626)' : 'inherit' }}>
                {formatearMoneda(resumenCtaCte?.saldo_deudor ?? 0)}
              </strong>
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onCerrar}
            disabled={guardando}
            ref={cerrarRef}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}

        <form onSubmit={handleSubmit}>
          {/* 1. Datos generales del recibo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label htmlFor="recibo-fecha">Fecha del recibo</label>
              <input
                id="recibo-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={guardando}
                required
              />
            </div>
            <div>
              <label htmlFor="recibo-obs">Observaciones / Detalle (opcional)</label>
              <input
                id="recibo-obs"
                type="text"
                placeholder="Ej. Transferencia Bco Francés Factura 12"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                disabled={guardando}
              />
            </div>
          </div>

          {/* 2. Medios de pago recibidos */}
          <fieldset style={{ border: '1px solid var(--color-border, #e5e7eb)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
            <legend style={{ padding: '0 0.5rem', fontWeight: 600 }}>Medios de Cobro Recibidos</legend>
            
            {cargandoMedios && <p className="loading-state">Cargando medios de cobro…</p>}

            {!cargandoMedios && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {lineasMedios.map((linea, index) => (
                  <div
                    key={linea.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1.5fr 2fr auto',
                      gap: '0.75rem',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <select
                        aria-label={`Medio de cobro ${index + 1}`}
                        value={linea.medio_pago_id}
                        onChange={(e) => actualizarLineaMedio(linea.id, 'medio_pago_id', e.target.value)}
                        disabled={guardando}
                        required
                      >
                        <option value="">Seleccionar medio</option>
                        {mediosDisponibles.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <input
                        aria-label={`Importe ${index + 1}`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Monto ($)"
                        value={linea.monto}
                        onChange={(e) => actualizarLineaMedio(linea.id, 'monto', e.target.value)}
                        disabled={guardando}
                        required
                      />
                    </div>
                    <div>
                      <input
                        aria-label={`Referencia ${index + 1}`}
                        type="text"
                        placeholder="Referencia / N.º Operación"
                        value={linea.referencia}
                        onChange={(e) => actualizarLineaMedio(linea.id, 'referencia', e.target.value)}
                        disabled={guardando}
                      />
                    </div>
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => quitarLineaMedio(linea.id)}
                        disabled={guardando || lineasMedios.length <= 1}
                        aria-label={`Quitar medio ${index + 1}`}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}

                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={agregarLineaMedio}
                    disabled={guardando}
                  >
                    <Plus size={16} />
                    Agregar otro medio de cobro
                  </Button>
                </div>
              </div>
            )}
          </fieldset>

          {/* 3. Imputación de Facturas Pendientes */}
          <fieldset style={{ border: '1px solid var(--color-border, #e5e7eb)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <legend style={{ padding: '0 0.5rem', fontWeight: 600 }}>Imputación a Facturas Pendientes</legend>
              {ventasPendientes.length > 0 && totalCobrado > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={autoImputarFifo}
                  disabled={guardando}
                  title="Imputar automáticamente por antigüedad (FIFO)"
                >
                  <Wand2 size={14} />
                  Auto-imputar más antiguas
                </Button>
              )}
            </div>

            {ventasPendientes.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary, #6b7280)', margin: '0.5rem 0' }}>
                El cliente no tiene facturas pendientes con saldo adeudado. El total recibido se acreditará como <strong>pago a cuenta</strong> disminuyendo su saldo deudor o generando crédito a favor.
              </p>
            ) : (
              <div className="data-table-card">
                <div className="data-table-scroll-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Comprobante</th>
                        <th>Total Venta</th>
                        <th>Saldo Pendiente</th>
                        <th style={{ width: '160px' }}>Monto a Imputar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventasPendientes.map((v) => {
                        const imputadoActual = imputaciones[v.venta_id] ?? ''
                        return (
                          <tr key={v.venta_id}>
                            <td>{v.fecha}</td>
                            <td>
                              <strong>{v.comprobante}</strong>
                            </td>
                            <td>{formatearMoneda(v.total_credito)}</td>
                            <td>
                              <strong style={{ color: 'var(--color-error, #dc2626)' }}>
                                {formatearMoneda(v.saldo_pendiente)}
                              </strong>
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max={v.saldo_pendiente}
                                step="0.01"
                                placeholder="$ 0,00"
                                value={imputadoActual}
                                onChange={(e) => cambiarImputacion(v.venta_id, e.target.value)}
                                disabled={guardando}
                                style={{ width: '100%' }}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </fieldset>

          {/* 4. Resumen y Balance del Recibo */}
          <div
            style={{
              backgroundColor: 'var(--color-bg-secondary, #f9fafb)',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              textAlign: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary, #6b7280)' }}>Total Cobrado</span>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0 0' }}>{formatearMoneda(totalCobrado)}</p>
            </div>
            <div>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary, #6b7280)' }}>Total Imputado</span>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0 0', color: 'var(--color-brand, #2563eb)' }}>
                {formatearMoneda(totalImputado)}
              </p>
            </div>
            <div>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary, #6b7280)' }}>Saldo a Cuenta</span>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0 0', color: saldoACuenta > 0 ? 'var(--color-success, #16a34a)' : 'inherit' }}>
                {formatearMoneda(saldoACuenta)}
              </p>
            </div>
          </div>

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button
              type="button"
              variant="ghost"
              onClick={onCerrar}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={guardando}
              loadingLabel="Registrando recibo…"
              disabled={totalCobrado <= 0 || totalImputado > totalCobrado}
            >
              Confirmar y Emitir Recibo
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
