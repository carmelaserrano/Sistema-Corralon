import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import {
  esCuentaCorriente,
  esEfectivo,
  esTarjeta,
  esTransferencia,
  listarMediosPago,
  registrarCobro,
} from '../api/cobrosApi'

const LINEA_INICIAL = {
  id: 1,
  medio_pago_id: '',
  monto: '',
  monto_recibido: '',
  referencia: '',
}

function aCentavos(valor) {
  const numero = Number(valor)
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0
}

function moneda(centavos) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(centavos / 100)
}

function calcularResumenCobro(total, lineas, medios) {
  const totalCentavos = aCentavos(total)
  const aplicadoCentavos = lineas.reduce(
    (suma, linea) => suma + Math.max(0, aCentavos(linea.monto)),
    0,
  )
  const vueltoCentavos = lineas.reduce((suma, linea) => {
    const medio = medios.find((item) => item.id === linea.medio_pago_id)
    if (!esEfectivo(medio)) return suma
    return (
      suma +
      Math.max(0, aCentavos(linea.monto_recibido) - aCentavos(linea.monto))
    )
  }, 0)

  return {
    totalCentavos,
    aplicadoCentavos,
    diferenciaCentavos: totalCentavos - aplicadoCentavos,
    vueltoCentavos,
  }
}

function validarLinea(linea, medio, clienteHabilitado) {
  if (!medio) return 'Seleccione un medio de pago'
  if (aCentavos(linea.monto) <= 0) return 'El importe debe ser mayor a 0'

  if (esEfectivo(medio)) {
    if (aCentavos(linea.monto_recibido) < aCentavos(linea.monto)) {
      return 'El monto recibido debe cubrir el importe aplicado'
    }
  }

  if (esTarjeta(medio) && !/^\d{4}$/.test((linea.referencia ?? '').trim())) {
    return 'Ingrese únicamente los últimos 4 dígitos de la tarjeta'
  }

  if (esTransferencia(medio) && !(linea.referencia ?? '').trim()) {
    return 'La referencia de la transferencia es obligatoria'
  }

  if (esCuentaCorriente(medio) && !clienteHabilitado) {
    return 'El cliente no está habilitado para cuenta corriente'
  }

  return ''
}

/**
 * Modal reutilizable por el detalle de venta de S3-12.
 * `venta.cliente.habilita_cta_cte` determina si se ofrece cuenta corriente.
 */
export default function ModalCobro({ abierto, venta, onCobrado, onCancelar }) {
  const [medios, setMedios] = useState([])
  const [lineas, setLineas] = useState([{ ...LINEA_INICIAL }])
  const [cargandoMedios, setCargandoMedios] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [cobroConfirmado, setCobroConfirmado] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const siguienteId = useRef(2)
  const enviando = useRef(false)

  const clienteHabilitado = Boolean(
    venta?.cliente?.habilita_cta_cte ?? venta?.cliente_habilita_cta_cte,
  )
  const total = Number(venta?.total) || 0
  const ventaCobrada =
    cobroConfirmado ||
    venta?.cobrada === true ||
    Boolean(venta?.cobro) ||
    Boolean(venta?.cobros_venta?.length)

  useEffect(() => {
    if (!abierto) return undefined

    setLineas([{ ...LINEA_INICIAL }])
    setError('')
    setExito('')
    setGuardando(false)
    setCobroConfirmado(false)
    siguienteId.current = 2
    enviando.current = false

    let vigente = true
    setCargandoMedios(true)
    listarMediosPago()
      .then((resultado) => {
        if (vigente) setMedios(resultado)
      })
      .catch((err) => {
        if (vigente) {
          setError(err.message || 'No se pudieron cargar los medios de pago')
        }
      })
      .finally(() => {
        if (vigente) setCargandoMedios(false)
      })

    return () => {
      vigente = false
    }
  }, [abierto, venta?.id])

  useEffect(() => {
    if (!abierto) return undefined
    const cerrarConEscape = (evento) => {
      if (evento.key === 'Escape' && !enviando.current) onCancelar()
    }
    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [abierto, onCancelar])

  const resumen = useMemo(
    () => calcularResumenCobro(total, lineas, medios),
    [total, lineas, medios],
  )

  const erroresLineas = lineas.map((linea) =>
    validarLinea(
      linea,
      medios.find((medio) => medio.id === linea.medio_pago_id),
      clienteHabilitado,
    ),
  )
  const ventaPendiente = venta?.estado === 'Pendiente'
  const formularioValido =
    ventaPendiente &&
    !ventaCobrada &&
    lineas.length > 0 &&
    erroresLineas.every((mensaje) => !mensaje) &&
    resumen.diferenciaCentavos === 0

  if (!abierto) return null

  function actualizarLinea(id, campo, valor) {
    setLineas((actuales) =>
      actuales.map((linea) =>
        linea.id === id ? { ...linea, [campo]: valor } : linea,
      ),
    )
    setError('')
  }

  function cambiarMedio(id, medioId) {
    setLineas((actuales) =>
      actuales.map((linea) =>
        linea.id === id
          ? {
              ...linea,
              medio_pago_id: medioId,
              monto_recibido: '',
              referencia: '',
            }
          : linea,
      ),
    )
    setError('')
  }

  function agregarLinea() {
    setLineas((actuales) => [
      ...actuales,
      { ...LINEA_INICIAL, id: siguienteId.current++ },
    ])
  }

  function quitarLinea(id) {
    setLineas((actuales) => actuales.filter((linea) => linea.id !== id))
  }

  async function confirmarCobro(evento) {
    evento.preventDefault()
    if (enviando.current || !formularioValido) return

    enviando.current = true
    setGuardando(true)
    setError('')
    setExito('')

    try {
      const cobro = await registrarCobro(
        venta.id,
        lineas.map((linea) => ({
          medio_pago_id: linea.medio_pago_id,
          monto: Number(linea.monto),
          monto_recibido: linea.monto_recibido,
          referencia: linea.referencia,
        })),
      )
      setExito(`Cobro N.º ${cobro.numero} registrado correctamente`)
      setCobroConfirmado(true)
      onCobrado(cobro)
    } catch (err) {
      setError(err.message || 'No se pudo registrar el cobro')
    } finally {
      enviando.current = false
      setGuardando(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !enviando.current) {
          onCancelar()
        }
      }}
    >
      <section
        className="modal-panel page-canvas"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-cobro"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Venta N.º {venta?.numero ?? '—'}</p>
            <h2 id="titulo-cobro">Registrar cobro</h2>
            <p>Total de la venta: {moneda(resumen.totalCentavos)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancelar}
            disabled={guardando}
            aria-label="Cerrar cobro"
          >
            Cerrar
          </Button>
        </header>

        {ventaCobrada && (
          <Feedback tone="error">
            Esta venta ya tiene un cobro registrado.
          </Feedback>
        )}
        {!ventaCobrada && !ventaPendiente && (
          <Feedback tone="error">Esta venta no se encuentra pendiente.</Feedback>
        )}
        {cargandoMedios && <Feedback>Cargando medios de pago…</Feedback>}
        {!cargandoMedios && medios.length === 0 && !error && (
          <Feedback tone="error">No hay medios de pago activos.</Feedback>
        )}
        {error && <Feedback tone="error">{error}</Feedback>}
        {exito && <Feedback tone="success">{exito}</Feedback>}

        <form onSubmit={confirmarCobro}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Medio de pago</th>
                  <th>Importe aplicado</th>
                  <th>Datos del medio</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea, indice) => {
                  const medio = medios.find(
                    (item) => item.id === linea.medio_pago_id,
                  )
                  const vuelto = Math.max(
                    0,
                    aCentavos(linea.monto_recibido) - aCentavos(linea.monto),
                  )

                  return (
                    <tr key={linea.id}>
                      <td>
                        <label>
                          <span className="sr-only">Medio de pago {indice + 1}</span>
                          <select
                            aria-label={`Medio de pago ${indice + 1}`}
                            value={linea.medio_pago_id}
                            onChange={(evento) =>
                              cambiarMedio(linea.id, evento.target.value)
                            }
                            disabled={guardando || cargandoMedios}
                          >
                            <option value="">Seleccionar</option>
                            {medios.map((item) => (
                              <option
                                key={item.id}
                                value={item.id}
                                disabled={
                                  esCuentaCorriente(item) && !clienteHabilitado
                                }
                              >
                                {item.nombre}
                                {esCuentaCorriente(item) && !clienteHabilitado
                                  ? ' (no habilitado)'
                                  : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      </td>
                      <td>
                        <label>
                          <span className="sr-only">Importe {indice + 1}</span>
                          <input
                            aria-label={`Importe ${indice + 1}`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={linea.monto}
                            onChange={(evento) =>
                              actualizarLinea(linea.id, 'monto', evento.target.value)
                            }
                            disabled={guardando}
                          />
                        </label>
                      </td>
                      <td>
                        {esEfectivo(medio) && (
                          <>
                            <label>
                              Monto recibido
                              <input
                                aria-label={`Monto recibido ${indice + 1}`}
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={linea.monto_recibido}
                                onChange={(evento) =>
                                  actualizarLinea(
                                    linea.id,
                                    'monto_recibido',
                                    evento.target.value,
                                  )
                                }
                                disabled={guardando}
                              />
                            </label>
                            <small>Vuelto: {moneda(vuelto)}</small>
                          </>
                        )}
                        {esTarjeta(medio) && (
                          <label>
                            Últimos 4 dígitos
                            <input
                              aria-label={`Últimos 4 dígitos ${indice + 1}`}
                              inputMode="numeric"
                              maxLength={4}
                              value={linea.referencia}
                              onChange={(evento) =>
                                actualizarLinea(
                                  linea.id,
                                  'referencia',
                                  evento.target.value.replace(/\D/g, '').slice(-4),
                                )
                              }
                              disabled={guardando}
                            />
                          </label>
                        )}
                        {esTransferencia(medio) && (
                          <label>
                            Referencia
                            <input
                              aria-label={`Referencia ${indice + 1}`}
                              maxLength={100}
                              value={linea.referencia}
                              onChange={(evento) =>
                                actualizarLinea(
                                  linea.id,
                                  'referencia',
                                  evento.target.value,
                                )
                              }
                              disabled={guardando}
                            />
                          </label>
                        )}
                        {!esEfectivo(medio) &&
                          !esTarjeta(medio) &&
                          !esTransferencia(medio) &&
                          medio && <span>No requiere datos adicionales</span>}
                        {erroresLineas[indice] && (
                          <small role="alert">{erroresLineas[indice]}</small>
                        )}
                      </td>
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => quitarLinea(linea.id)}
                          disabled={guardando || lineas.length === 1}
                          aria-label={`Quitar medio ${indice + 1}`}
                        >
                          Quitar
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={agregarLinea}
            disabled={guardando || cargandoMedios}
          >
            Agregar medio de pago
          </Button>

          <dl>
            <div>
              <dt>Total aplicado</dt>
              <dd>{moneda(resumen.aplicadoCentavos)}</dd>
            </div>
            <div>
              <dt>{resumen.diferenciaCentavos >= 0 ? 'Restante' : 'Excedente'}</dt>
              <dd>{moneda(Math.abs(resumen.diferenciaCentavos))}</dd>
            </div>
            <div>
              <dt>Vuelto total</dt>
              <dd>{moneda(resumen.vueltoCentavos)}</dd>
            </div>
          </dl>

          <div className="modal-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancelar}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={guardando}
              loadingLabel="Registrando…"
              disabled={!formularioValido || cargandoMedios}
            >
              Confirmar cobro
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
