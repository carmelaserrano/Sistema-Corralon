import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import {
  esCuentaCorriente,
  esEfectivo,
  esTarjeta,
  esTransferencia,
  listarMediosPago,
  obtenerResumenCtaCte,
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

/**
 * Crédito disponible del cliente en centavos, o null si no tiene límite
 * (limite_credito = 0 significa "sin límite", igual que registrar_cobro).
 */
function disponibleCtaCte(resumenCtaCte) {
  const limite = Number(resumenCtaCte?.limite_credito) || 0
  if (limite <= 0) return null
  const saldo = Number(resumenCtaCte?.saldo_deudor) || 0
  return Math.max(0, aCentavos(limite) - aCentavos(saldo))
}

function validarLinea(linea, medio, clienteHabilitado, resumenCtaCte) {
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

  if (esCuentaCorriente(medio)) {
    if (!clienteHabilitado) {
      return 'El cliente no está habilitado para cuenta corriente'
    }
    // La base vuelve a validar el límite (CV007); esto solo avisa antes.
    const disponible = disponibleCtaCte(resumenCtaCte)
    if (disponible !== null && aCentavos(linea.monto) > disponible) {
      return `Supera el límite de crédito disponible (${moneda(disponible)})`
    }
  }

  return ''
}

/** Explicación corta de qué cargar según el medio elegido. */
function ayudaMedio(medio) {
  if (esEfectivo(medio)) {
    return 'Ingresá el importe que se cobra en efectivo y cuánto dinero entregó el cliente. Si entregó de más, el sistema calcula el vuelto.'
  }
  if (esTarjeta(medio)) {
    return 'Ingresá el importe cobrado con tarjeta y los últimos 4 dígitos de la tarjeta, tal como figuran en el ticket del posnet.'
  }
  if (esTransferencia(medio)) {
    return 'Ingresá el importe transferido y el número de operación o comprobante que figura en la transferencia.'
  }
  if (esCuentaCorriente(medio)) {
    return 'El importe queda como deuda en la cuenta corriente del cliente. No hace falta cargar otros datos.'
  }
  return 'Ingresá el importe. Este medio no requiere datos adicionales.'
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
  const [resumenCtaCte, setResumenCtaCte] = useState(null)
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

    // Saldo y límite de cuenta corriente para avisar antes de confirmar. Si la
    // consulta falla no se bloquea: registrar_cobro valida el límite igual.
    setResumenCtaCte(null)
    const clienteId = venta?.cliente?.id ?? venta?.cliente_id
    if (clienteId && clienteHabilitado) {
      obtenerResumenCtaCte(clienteId)
        .then((resultado) => {
          if (vigente) setResumenCtaCte(resultado)
        })
        .catch(() => {})
    }

    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, venta?.id, clienteHabilitado])

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
      resumenCtaCte,
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

  // Completa el importe de una línea con lo que todavía falta asignar.
  function completarRestante(linea) {
    const restante = resumen.diferenciaCentavos + Math.max(0, aCentavos(linea.monto))
    if (restante <= 0) return
    actualizarLinea(linea.id, 'monto', (restante / 100).toFixed(2))
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
        className="modal-panel page-canvas cobro-panel"
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

        <form className="cobro-form" onSubmit={confirmarCobro}>
          <ol className="cobro-pasos">
            <li>Elegí el medio de pago.</li>
            <li>Ingresá el importe que se cobra con ese medio.</li>
            <li>Completá los datos que pide cada medio.</li>
          </ol>
          <p className="cobro-nota">
            Si el cliente paga con más de un medio, usá «Agregar medio de pago». La suma
            de los importes tiene que ser igual al total de la venta.
          </p>

          <div className="cobro-lineas">
            {lineas.map((linea, indice) => {
              const medio = medios.find(
                (item) => item.id === linea.medio_pago_id,
              )
              const vuelto = Math.max(
                0,
                aCentavos(linea.monto_recibido) - aCentavos(linea.monto),
              )
              // El error se muestra recién cuando la línea empezó a cargarse.
              const mostrarError =
                Boolean(linea.medio_pago_id || linea.monto) && erroresLineas[indice]
              const restanteLinea =
                resumen.diferenciaCentavos + Math.max(0, aCentavos(linea.monto))

              return (
                <div
                  key={linea.id}
                  className={`cobro-linea${mostrarError ? ' cobro-linea--error' : ''}`}
                >
                  <div className="cobro-linea-header">
                    <strong>
                      Pago {indice + 1}
                      {medio ? ` · ${medio.nombre}` : ''}
                    </strong>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => quitarLinea(linea.id)}
                      disabled={guardando || lineas.length === 1}
                      aria-label={`Quitar medio ${indice + 1}`}
                    >
                      Quitar
                    </Button>
                  </div>

                  <div className="cobro-campos">
                    <label>
                      Medio de pago
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
                            disabled={esCuentaCorriente(item) && !clienteHabilitado}
                          >
                            {item.nombre}
                            {esCuentaCorriente(item) && !clienteHabilitado
                              ? ' (no habilitado)'
                              : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="cobro-campo">
                      <label>
                        Importe a cobrar con este medio
                        <input
                          aria-label={`Importe ${indice + 1}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="0,00"
                          value={linea.monto}
                          onChange={(evento) =>
                            actualizarLinea(linea.id, 'monto', evento.target.value)
                          }
                          disabled={guardando}
                        />
                      </label>
                      {restanteLinea > 0 && aCentavos(linea.monto) !== restanteLinea && (
                        <button
                          type="button"
                          className="cobro-link"
                          onClick={() => completarRestante(linea)}
                          disabled={guardando}
                        >
                          Usar lo que falta ({moneda(restanteLinea)})
                        </button>
                      )}
                    </div>

                    {esEfectivo(medio) && (
                      <div className="cobro-campo">
                        <label>
                          Dinero entregado por el cliente
                          <input
                            aria-label={`Monto recibido ${indice + 1}`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="Ej.: 10000"
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
                        <small className="cobro-vuelto">Vuelto: {moneda(vuelto)}</small>
                      </div>
                    )}
                    {esTarjeta(medio) && (
                      <label>
                        Últimos 4 dígitos de la tarjeta
                        <input
                          aria-label={`Últimos 4 dígitos ${indice + 1}`}
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="1234"
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
                        N.º de operación o comprobante
                        <input
                          aria-label={`Referencia ${indice + 1}`}
                          maxLength={100}
                          placeholder="Ej.: 000123456789"
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
                  </div>

                  <p className="cobro-ayuda">
                    {medio
                      ? ayudaMedio(medio)
                      : 'Empezá eligiendo cómo paga el cliente esta parte.'}
                  </p>
                  {esCuentaCorriente(medio) && clienteHabilitado && resumenCtaCte && (
                    <p className="cobro-ayuda">
                      <strong>
                        {disponibleCtaCte(resumenCtaCte) === null
                          ? `Sin límite de crédito · Saldo deudor actual: ${moneda(aCentavos(resumenCtaCte.saldo_deudor))}`
                          : `Límite: ${moneda(aCentavos(resumenCtaCte.limite_credito))} · Saldo deudor: ${moneda(aCentavos(resumenCtaCte.saldo_deudor))} · Disponible: ${moneda(disponibleCtaCte(resumenCtaCte))}`}
                      </strong>
                    </p>
                  )}
                  {mostrarError && (
                    <p className="cobro-error" role="alert">
                      {erroresLineas[indice]}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={agregarLinea}
            disabled={guardando || cargandoMedios}
          >
            Agregar medio de pago
          </Button>

          <div className="cobro-resumen">
            <dl>
              <div>
                <dt>Total de la venta</dt>
                <dd>{moneda(resumen.totalCentavos)}</dd>
              </div>
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
            <p
              className={`cobro-estado cobro-estado--${
                formularioValido
                  ? 'ok'
                  : resumen.diferenciaCentavos < 0
                    ? 'error'
                    : 'pendiente'
              }`}
              aria-live="polite"
            >
              {resumen.diferenciaCentavos > 0 &&
                `Falta asignar ${moneda(resumen.diferenciaCentavos)} para cubrir el total.`}
              {resumen.diferenciaCentavos < 0 &&
                `Los importes superan el total por ${moneda(-resumen.diferenciaCentavos)}. Si el cliente entregó de más en efectivo, cargalo en «Dinero entregado por el cliente».`}
              {resumen.diferenciaCentavos === 0 &&
                (formularioValido
                  ? 'El total está cubierto. Ya podés confirmar el cobro.'
                  : 'El total está cubierto. Revisá los datos marcados en cada pago.')}
            </p>
          </div>

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
