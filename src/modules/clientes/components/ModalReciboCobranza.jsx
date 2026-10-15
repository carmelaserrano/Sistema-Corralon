import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Wand2, X } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import {
  listarMediosCobranza,
  registrarReciboCobranza,
} from '../api/cuentaCorrienteClienteApi'
import { obtenerSesionCajaActiva } from '../../tesoreria/api/cajasApi'

const moneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
})

/** '2026-10-06T18:28:28.08+00:00' o '2026-10-06' → '06/10/2026'. */
function formatearFecha(valor) {
  if (!valor) return '—'
  const [anio, mes, dia] = String(valor).slice(0, 10).split('-')
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : String(valor)
}

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
  // La cobranza entra a la caja abierta de quien la registra (0067).
  // undefined = consultando · null = sin caja abierta · objeto = la sesión.
  // Si la consulta falla no se bloquea: registrar_recibo_cobranza valida igual.
  const [sesionCaja, setSesionCaja] = useState(undefined)
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

      setSesionCaja(undefined)
      obtenerSesionCajaActiva()
        .then((sesion) => setSesionCaja(sesion ?? null))
        .catch(() => setSesionCaja({ desconocida: true }))
    }
  }, [abierto])

  const sinCajaAbierta = sesionCaja === null

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

  const restanteSinImputar = totalCobrado - totalImputado
  let estadoResumen
  if (totalCobrado <= 0) {
    estadoResumen = { tono: 'pendiente', texto: 'Cargá cuánto pagó el cliente en el paso 1.' }
  } else if (restanteSinImputar < 0) {
    estadoResumen = {
      tono: 'error',
      texto: `Imputaste ${formatearMoneda(-restanteSinImputar)} más de lo que pagó el cliente. Bajá algún monto del paso 2.`,
    }
  } else if (restanteSinImputar > 0 && ventasPendientes.length > 0) {
    estadoResumen = {
      tono: 'pendiente',
      texto: `${formatearMoneda(restanteSinImputar)} quedan como pago a cuenta (anticipo). Si querés que cancelen deuda, imputalos en el paso 2.`,
    }
  } else {
    estadoResumen = { tono: 'ok', texto: 'Todo listo para emitir el recibo.' }
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
        className="modal-panel page-canvas recibo-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-recibo-cobranza"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Cobranzas a Cuenta Corriente</p>
            <h2 id="titulo-recibo-cobranza">Nuevo Recibo de Cobranza</h2>
            <p>
              #{cliente.numero} · {nombreCliente} · Saldo deudor:{' '}
              <strong className={Number(resumenCtaCte?.saldo_deudor ?? 0) > 0 ? 'recibo-deuda' : undefined}>
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
        {sinCajaAbierta && (
          <Feedback tone="error">
            No tenés una caja abierta. Abrí tu caja en Ventas → Cajas antes de registrar la cobranza.
          </Feedback>
        )}

        <form className="recibo-form" onSubmit={handleSubmit}>
          <div className="recibo-datos">
            <label>
              Fecha del recibo
              <input
                id="recibo-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={guardando}
                required
              />
            </label>
            <label>
              Observaciones (opcional)
              <input
                id="recibo-obs"
                type="text"
                placeholder="Ej.: paga facturas de septiembre"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                disabled={guardando}
              />
            </label>
            {sesionCaja?.caja?.nombre && (
              <p className="recibo-caja">
                Se registra en tu caja abierta: <strong>{sesionCaja.caja.nombre}</strong>
              </p>
            )}
          </div>

          {/* Paso 1: cómo pagó */}
          <div className="recibo-paso">
            <h3><span className="recibo-paso-numero">1</span> ¿Cómo pagó el cliente?</h3>
            <p className="recibo-ayuda">
              Cargá cada medio con el que pagó y cuánto. Si pagó con dos (por ejemplo, efectivo y
              transferencia), agregá otra línea. En transferencias o cheques, anotá el número de
              operación como referencia.
            </p>

            {cargandoMedios && <p className="loading-state">Cargando medios de cobro…</p>}

            {!cargandoMedios && (
              <div className="recibo-medios">
                {lineasMedios.map((linea, index) => (
                  <div key={linea.id} className="recibo-medio-linea">
                    <label>
                      Medio de pago
                      <select
                        aria-label={`Medio de cobro ${index + 1}`}
                        value={linea.medio_pago_id}
                        onChange={(e) => actualizarLineaMedio(linea.id, 'medio_pago_id', e.target.value)}
                        disabled={guardando}
                        required
                      >
                        <option value="">Seleccionar</option>
                        {mediosDisponibles.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Importe
                      <input
                        aria-label={`Importe ${index + 1}`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0,00"
                        value={linea.monto}
                        onChange={(e) => actualizarLineaMedio(linea.id, 'monto', e.target.value)}
                        disabled={guardando}
                        required
                      />
                    </label>
                    <label>
                      Referencia (opcional)
                      <input
                        aria-label={`Referencia ${index + 1}`}
                        type="text"
                        placeholder="N.º de operación o cheque"
                        value={linea.referencia}
                        onChange={(e) => actualizarLineaMedio(linea.id, 'referencia', e.target.value)}
                        disabled={guardando}
                      />
                    </label>
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
                ))}

                <Button
                  type="button"
                  variant="secondary"
                  onClick={agregarLineaMedio}
                  disabled={guardando}
                >
                  <Plus size={16} />
                  Agregar otro medio de pago
                </Button>
              </div>
            )}
          </div>

          {/* Paso 2: qué deuda cancela */}
          <div className="recibo-paso">
            <div className="recibo-paso-encabezado">
              <h3><span className="recibo-paso-numero">2</span> ¿Qué deuda cancela?</h3>
              {ventasPendientes.length > 0 && totalCobrado > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={autoImputarFifo}
                  disabled={guardando}
                  title="Reparte lo cobrado empezando por la deuda más antigua"
                >
                  <Wand2 size={14} />
                  Repartir automáticamente
                </Button>
              )}
            </div>

            {ventasPendientes.length === 0 ? (
              <p className="recibo-ayuda">
                El cliente no tiene facturas pendientes. Todo lo que pague queda como{' '}
                <strong>pago a cuenta</strong> y baja su saldo deudor.
              </p>
            ) : (
              <>
                <p className="recibo-ayuda">
                  Indicá cuánto del pago va a cada factura, o usá «Repartir automáticamente»
                  (empieza por la más antigua). Lo que no imputes queda como pago a cuenta.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Comprobante</th>
                      <th>Total</th>
                      <th>Saldo pendiente</th>
                      <th>Monto a imputar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasPendientes.map((v) => (
                      <tr key={v.venta_id}>
                        <td>{formatearFecha(v.fecha)}</td>
                        <td><strong>{v.comprobante}</strong></td>
                        <td>{formatearMoneda(v.total_credito)}</td>
                        <td><strong className="recibo-deuda">{formatearMoneda(v.saldo_pendiente)}</strong></td>
                        <td>
                          <input
                            aria-label={`Monto a imputar ${v.comprobante}`}
                            className="recibo-imputacion"
                            type="number"
                            min="0"
                            max={v.saldo_pendiente}
                            step="0.01"
                            placeholder="$ 0,00"
                            value={imputaciones[v.venta_id] ?? ''}
                            onChange={(e) => cambiarImputacion(v.venta_id, e.target.value)}
                            disabled={guardando}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          {/* Resumen */}
          <div className="recibo-resumen">
            <dl>
              <div>
                <dt>Total Cobrado</dt>
                <dd>{formatearMoneda(totalCobrado)}</dd>
              </div>
              <div>
                <dt>Total Imputado</dt>
                <dd>{formatearMoneda(totalImputado)}</dd>
              </div>
              <div>
                <dt>Saldo a Cuenta</dt>
                <dd>{formatearMoneda(saldoACuenta)}</dd>
              </div>
            </dl>
            <p className={`recibo-estado recibo-estado--${estadoResumen.tono}`} aria-live="polite">
              {estadoResumen.texto}
            </p>
          </div>

          <div className="modal-actions">
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
              disabled={totalCobrado <= 0 || totalImputado > totalCobrado || sinCajaAbierta}
            >
              Confirmar y Emitir Recibo
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
