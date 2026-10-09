import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, CircleDollarSign, LockKeyhole, Plus, Wallet, X } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import PageHeader from '../../../components/ui/PageHeader'
import { listarMediosPago } from '../../ventas/api/cobrosApi'
import {
  abrirCaja,
  cerrarCaja,
  guardarCaja,
  listarCajas,
  listarCajeros,
  listarMovimientosCaja,
  listarPuntosVenta,
  listarSesionesCaja,
  obtenerUsuarioCaja,
  puedeGestionarCajas,
  PERMISOS_CAJAS,
  registrarMovimientoCaja,
} from '../api/cajasApi'

const FORM_CAJA_VACIO = {
  id: '',
  nombre: '',
  punto_venta_id: '',
  usuario_asignado_id: '',
  activa: true,
}

const FORM_MOVIMIENTO_VACIO = {
  tipo: 'ingreso',
  medio_pago_id: '',
  monto: '',
  motivo: '',
  comprobante: '',
}

function moneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(Number(valor) || 0)
}

function diferenciaArqueo(valor) {
  if (valor === null || valor === undefined) return '—'
  const diferencia = Number(valor)
  if (diferencia === 0) return 'Sin diferencia'
  return `${moneda(Math.abs(diferencia))} ${diferencia > 0 ? 'sobrante' : 'faltante'}`
}

function claseDiferenciaArqueo(valor) {
  if (valor === null || valor === undefined) return ''
  const diferencia = Number(valor)
  if (diferencia > 0) return 'caja-diferencia-sobrante'
  if (diferencia < 0) return 'caja-diferencia-faltante'
  return 'caja-diferencia-sin-diferencia'
}

function fechaHora(valor) {
  return valor ? new Date(valor).toLocaleString('es-AR') : '—'
}

function puntoVentaLabel(punto) {
  return punto ? `${punto.numero} · ${punto.nombre}` : '—'
}

export default function CajasPage() {
  const cerrarMovimientosRef = useRef(null)
  const cerrarFormularioCajaRef = useRef(null)
  const [permisos, setPermisos] = useState({})
  const [usuarioId, setUsuarioId] = useState(null)
  const [cajas, setCajas] = useState([])
  const [sesiones, setSesiones] = useState([])
  const [cajeros, setCajeros] = useState([])
  const [puntosVenta, setPuntosVenta] = useState([])
  const [mediosPago, setMediosPago] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [sesionHistorialId, setSesionHistorialId] = useState('')
  const [movimientosHistorial, setMovimientosHistorial] = useState([])
  const [cargandoMovimientosHistorial, setCargandoMovimientosHistorial] = useState(false)
  const [sesionActiva, setSesionActiva] = useState(null)
  const [cajaForm, setCajaForm] = useState(FORM_CAJA_VACIO)
  const [mostrarFormularioCaja, setMostrarFormularioCaja] = useState(false)
  const [movimientoForm, setMovimientoForm] = useState(FORM_MOVIMIENTO_VACIO)
  const [saldoInicial, setSaldoInicial] = useState('')
  const [montoDeclarado, setMontoDeclarado] = useState('')
  const [cajaAperturaId, setCajaAperturaId] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const puedeOperar = permisos[PERMISOS_CAJAS.operar]
  const puedeAdministrar = permisos[PERMISOS_CAJAS.administrar]
  const puedeAbrir = permisos[PERMISOS_CAJAS.abrir]
  const puedeCerrar = permisos[PERMISOS_CAJAS.cerrar]
  const puntosVentaDisponibles = puntosVenta.filter(
    (punto) => punto.deposito_id || punto.id === cajaForm.punto_venta_id,
  )

  const cerrarFormularioCaja = useCallback(() => {
    if (guardando) return
    setMostrarFormularioCaja(false)
    setCajaForm(FORM_CAJA_VACIO)
  }, [guardando])

  async function cargarDatos() {
    setLoading(true)
    setError('')
    try {
      const nombres = Object.values(PERMISOS_CAJAS)
      const [valoresPermiso, idUsuario] = await Promise.all([
        Promise.all(nombres.map((permiso) => puedeGestionarCajas(permiso))),
        obtenerUsuarioCaja(),
      ])
      const permisosActuales = Object.fromEntries(
        nombres.map((permiso, index) => [permiso, valoresPermiso[index]]),
      )
      setPermisos(permisosActuales)
      setUsuarioId(idUsuario)

      const [cajasActuales, sesionesActuales, cajerosActuales, puntosActuales, mediosActuales] =
        await Promise.all([
          (permisosActuales[PERMISOS_CAJAS.administrar] ||
            permisosActuales[PERMISOS_CAJAS.abrir] ||
            permisosActuales[PERMISOS_CAJAS.operar]) ? listarCajas() : [],
          (permisosActuales[PERMISOS_CAJAS.administrar] ||
            permisosActuales[PERMISOS_CAJAS.abrir] ||
            permisosActuales[PERMISOS_CAJAS.cerrar] ||
            permisosActuales[PERMISOS_CAJAS.operar]) ? listarSesionesCaja() : [],
          permisosActuales[PERMISOS_CAJAS.administrar] ? listarCajeros() : [],
          permisosActuales[PERMISOS_CAJAS.administrar] ? listarPuntosVenta() : [],
          permisosActuales[PERMISOS_CAJAS.operar] ? listarMediosPago() : [],
        ])

      setCajas(cajasActuales)
      setSesiones(sesionesActuales)
      setCajeros(cajerosActuales)
      setPuntosVenta(puntosActuales)
      setMediosPago(mediosActuales)
      const sesion = sesionesActuales.find(
        (item) => item.estado === 'abierta' && item.usuario_id === idUsuario,
      ) ?? null
      setSesionActiva(sesion)
      setMovimientos(sesion && permisosActuales[PERMISOS_CAJAS.operar]
        ? await listarMovimientosCaja(sesion.id)
        : [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos de cajas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  useEffect(() => {
    if (!sesionHistorialId) return undefined

    cerrarMovimientosRef.current?.focus()

    function cerrarConEscape(event) {
      if (event.key === 'Escape') {
        setSesionHistorialId('')
        setMovimientosHistorial([])
        setCargandoMovimientosHistorial(false)
      }
    }

    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [sesionHistorialId])

  useEffect(() => {
    if (!mostrarFormularioCaja) return undefined

    cerrarFormularioCajaRef.current?.focus()

    function cerrarConEscape(event) {
      if (event.key === 'Escape') cerrarFormularioCaja()
    }

    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [mostrarFormularioCaja, cerrarFormularioCaja])

  const resumenMedios = useMemo(() => {
    const resumen = new Map()
    for (const movimiento of movimientos) {
      const nombre = movimiento.medio_pago?.nombre || 'Otro medio'
      const importe = (resumen.get(nombre) || 0) +
        (movimiento.tipo === 'ingreso' ? 1 : -1) * Number(movimiento.monto)
      resumen.set(nombre, importe)
    }
    return [...resumen.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
  }, [movimientos])

  async function ejecutar(operacion, mensaje) {
    try {
      setGuardando(true)
      setError('')
      setAviso('')
      await operacion()
      setAviso(mensaje)
      await cargarDatos()
      return true
    } catch (err) {
      setError(err.message || 'No se pudo completar la operación de caja')
      return false
    } finally {
      setGuardando(false)
    }
  }

  function abrirFormularioNuevaCaja() {
    setCajaForm(FORM_CAJA_VACIO)
    setError('')
    setAviso('')
    setMostrarFormularioCaja(true)
  }

  function editarCaja(caja) {
    setCajaForm({
      id: caja.id,
      nombre: caja.nombre,
      punto_venta_id: caja.punto_venta_id,
      usuario_asignado_id: caja.usuario_asignado_id || '',
      activa: caja.activa,
    })
    setError('')
    setAviso('')
    setMostrarFormularioCaja(true)
  }

  async function guardarCajaForm(event) {
    event.preventDefault()
    const guardado = await ejecutar(async () => {
      await guardarCaja(cajaForm)
    }, cajaForm.id ? 'La caja se actualizó.' : 'La caja se creó.')
    if (guardado) {
      setCajaForm(FORM_CAJA_VACIO)
      setMostrarFormularioCaja(false)
    }
  }

  async function abrirCajaForm(event, caja) {
    event.preventDefault()
    await ejecutar(async () => {
      await abrirCaja(caja.id, saldoInicial)
      setCajaAperturaId('')
      setSaldoInicial('')
    }, `Caja «${caja.nombre}» abierta correctamente.`)
  }

  async function guardarMovimiento(event) {
    event.preventDefault()
    await ejecutar(async () => {
      await registrarMovimientoCaja(movimientoForm)
      setMovimientoForm(FORM_MOVIMIENTO_VACIO)
    }, 'El movimiento se registró correctamente.')
  }

  async function cerrarSesion(event) {
    event.preventDefault()
    await ejecutar(async () => {
      await cerrarCaja(sesionActiva.id, montoDeclarado)
      setMontoDeclarado('')
    }, 'La sesión se cerró. El arqueo quedó guardado de forma inmutable.')
  }

  async function alternarDetalleSesion(sesionId) {
    if (sesionHistorialId === sesionId) {
      setSesionHistorialId('')
      setMovimientosHistorial([])
      return
    }
    setSesionHistorialId(sesionId)
    setMovimientosHistorial([])
    setCargandoMovimientosHistorial(true)
    setError('')
    try {
      setMovimientosHistorial(await listarMovimientosCaja(sesionId))
    } catch (err) {
      setSesionHistorialId('')
      setError(err.message || 'No se pudieron cargar los movimientos de la sesión')
    } finally {
      setCargandoMovimientosHistorial(false)
    }
  }

  function cerrarDetalleSesion() {
    setSesionHistorialId('')
    setMovimientosHistorial([])
    setCargandoMovimientosHistorial(false)
  }

  if (loading) {
    return <main className="page-canvas"><p className="loading-state" role="status">Cargando cajas…</p></main>
  }

  return (
    <main className="page-canvas">
      <PageHeader
        kicker="Tesorería"
        title="Gestión de cajas"
        description="Apertura, movimientos, arqueo y seguimiento de las sesiones de cajeros."
        actions={puedeAdministrar ? [
          {
            label: 'Nueva caja',
            icon: Plus,
            onClick: abrirFormularioNuevaCaja,
          },
        ] : undefined}
      />

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}
      {!puedeAdministrar && !puedeAbrir && !puedeOperar && !puedeCerrar && (
        <Feedback tone="info">Tu usuario no tiene permisos para operar o consultar cajas.</Feedback>
      )}

      {(puedeAdministrar || puedeAbrir) && (
        <section className="cajas-section">
          <h2>Cajas físicas</h2>
          {cajas.length === 0 ? (
            <p className="empty-state">No hay cajas configuradas o asignadas a tu usuario.</p>
          ) : (
            <div className="cajas-grid">
              {cajas.map((caja) => {
                const cajero = cajeros.find((item) => item.usuario_id === caja.usuario_asignado_id)
                const puedeAbrirEsta = caja.activa && caja.usuario_asignado_id === usuarioId &&
                  puedeAbrir && !sesionActiva
                return (
                  <article className="cajas-panel caja-card" key={caja.id}>
                    <div className="caja-card-heading">
                      <div>
                        <h3>{caja.nombre}</h3>
                        <p>{puntoVentaLabel(caja.punto_venta)}</p>
                      </div>
                      <span className={`estado-badge ${caja.activa ? 'estado-badge-activo' : 'estado-badge-inactivo'}`}>
                        {caja.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    <p className="caja-asignado">
                      Cajero: {cajero?.nombre || (caja.usuario_asignado_id ? 'Asignado' : 'Sin asignar')}
                    </p>
                    {puedeAdministrar && (
                      <Button type="button" variant="ghost" onClick={() => editarCaja(caja)}>
                        Administrar
                      </Button>
                    )}
                    {puedeAbrirEsta && (
                      cajaAperturaId === caja.id ? (
                        <form className="caja-inline-form" onSubmit={(event) => abrirCajaForm(event, caja)}>
                          <label>
                            Fondo inicial en efectivo
                            <input
                              autoFocus
                              min="0"
                              required
                              step="0.01"
                              type="number"
                              value={saldoInicial}
                              onChange={(event) => setSaldoInicial(event.target.value)}
                            />
                          </label>
                          <Button type="submit" loading={guardando} icon={Wallet}>Confirmar apertura</Button>
                        </form>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => setCajaAperturaId(caja.id)}
                          disabled={guardando}
                          icon={Wallet}
                        >
                          Abrir caja
                        </Button>
                      )
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {sesionActiva && (
        <section className="cajas-section">
          <div className="cajas-section-heading">
            <div>
              <h2>Sesión abierta: {sesionActiva.caja?.nombre || 'Caja'}</h2>
              <p>Abierta el {fechaHora(sesionActiva.abierta_at)} · Fondo inicial {moneda(sesionActiva.saldo_inicial)}</p>
            </div>
            <span className="estado-badge estado-badge-activo">Abierta</span>
          </div>

          {puedeOperar && (
            <div className="cajas-panel">
              <h3><CircleDollarSign size={18} aria-hidden="true" /> Registrar ingreso o egreso</h3>
              <form className="stacked-form cajas-form" onSubmit={guardarMovimiento}>
                <label>
                  Tipo
                  <select
                    value={movimientoForm.tipo}
                    onChange={(event) => setMovimientoForm((form) => ({ ...form, tipo: event.target.value }))}
                  >
                    <option value="ingreso">Ingreso</option>
                    <option value="egreso">Egreso</option>
                  </select>
                </label>
                <label>
                  Medio de pago
                  <select
                    required
                    value={movimientoForm.medio_pago_id}
                    onChange={(event) => setMovimientoForm((form) => ({ ...form, medio_pago_id: event.target.value }))}
                  >
                    <option value="">Seleccionar</option>
                    {mediosPago.map((medio) => <option key={medio.id} value={medio.id}>{medio.nombre}</option>)}
                  </select>
                </label>
                <label>
                  Importe
                  <input
                    min="0.01"
                    required
                    step="0.01"
                    type="number"
                    value={movimientoForm.monto}
                    onChange={(event) => setMovimientoForm((form) => ({ ...form, monto: event.target.value }))}
                  />
                </label>
                <label>
                  Motivo
                  <input
                    maxLength={300}
                    required
                    value={movimientoForm.motivo}
                    onChange={(event) => setMovimientoForm((form) => ({ ...form, motivo: event.target.value }))}
                  />
                </label>
                <label>
                  Comprobante / referencia
                  <input
                    maxLength={200}
                    required
                    value={movimientoForm.comprobante}
                    onChange={(event) => setMovimientoForm((form) => ({ ...form, comprobante: event.target.value }))}
                  />
                </label>
                <div className="cajas-actions">
                  <Button type="submit" loading={guardando} disabled={!mediosPago.length}>Registrar movimiento</Button>
                </div>
              </form>
            </div>
          )}

          {puedeCerrar && (
            <div className="cajas-panel">
              <h3><LockKeyhole size={18} aria-hidden="true" /> Cerrar y realizar arqueo</h3>
              <form className="caja-inline-form" onSubmit={cerrarSesion}>
                <label>
                  Efectivo contado al cierre
                  <input
                    min="0"
                    required
                    step="0.01"
                    type="number"
                    value={montoDeclarado}
                    onChange={(event) => setMontoDeclarado(event.target.value)}
                  />
                </label>
                <Button type="submit" loading={guardando}>Cerrar caja</Button>
              </form>
            </div>
          )}

          {resumenMedios.length > 0 && (
            <div className="cajas-panel">
              <h3>Saldo neto por medio de pago</h3>
              <dl className="cajas-saldos">
                {resumenMedios.map(([medio, total]) => (
                  <div key={medio}><dt>{medio}</dt><dd>{moneda(total)}</dd></div>
                ))}
              </dl>
            </div>
          )}

          <div className="cajas-panel">
            <h3>Movimientos de la sesión</h3>
            {movimientos.length === 0 ? (
              <p className="empty-state">Todavía no hay movimientos registrados.</p>
            ) : (
              <div className="data-table-scroll-container">
                <table>
                  <thead>
                    <tr><th>Fecha</th><th>Tipo</th><th>Medio</th><th>Motivo</th><th>Comprobante</th><th>Importe</th></tr>
                  </thead>
                  <tbody>
                    {movimientos.map((movimiento) => (
                      <tr key={movimiento.id}>
                        <td>{fechaHora(movimiento.created_at)}</td>
                        <td>{movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</td>
                        <td>{movimiento.medio_pago?.nombre || '—'}</td>
                        <td>{movimiento.motivo}</td>
                        <td>{movimiento.comprobante || '—'}</td>
                        <td>{moneda(movimiento.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="cajas-section">
        <h2>Historial de sesiones</h2>
        {sesiones.length === 0 ? (
          <p className="empty-state">No hay sesiones registradas.</p>
        ) : (
          <div className="data-table-card">
            <div className="data-table-scroll-container">
              <table>
                <thead>
                  <tr>
                    <th>Caja</th><th>Punto de venta</th><th>Cajero</th><th>Apertura</th><th>Cierre</th>
                    <th>Saldo inicial</th><th>Efectivo declarado</th><th>Saldo teórico</th><th>Diferencia</th><th>Estado</th><th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {sesiones.map((sesion) => (
                    <tr key={sesion.id}>
                      <td>{sesion.caja?.nombre || '—'}</td>
                      <td>{puntoVentaLabel(sesion.caja?.punto_venta)}</td>
                      <td>{sesion.usuario_id === usuarioId ? 'Mi sesión' : (
                        cajeros.find((cajero) => cajero.usuario_id === sesion.usuario_id)?.nombre || '—'
                      )}</td>
                      <td>{fechaHora(sesion.abierta_at)}</td>
                      <td>{fechaHora(sesion.cerrada_at)}</td>
                      <td>{moneda(sesion.saldo_inicial)}</td>
                      <td>{sesion.monto_declarado === null ? '—' : moneda(sesion.monto_declarado)}</td>
                      <td>{sesion.saldo_teorico === null ? '—' : moneda(sesion.saldo_teorico)}</td>
                      <td>
                        <span className={`caja-diferencia ${claseDiferenciaArqueo(sesion.diferencia)}`}>
                          {diferenciaArqueo(sesion.diferencia)}
                        </span>
                      </td>
                      <td>{sesion.estado === 'abierta' ? 'Abierta' : 'Cerrada'}</td>
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => alternarDetalleSesion(sesion.id)}
                        >
                          Movimientos
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {sesionHistorialId && (
        <div className="modal-backdrop" onMouseDown={cerrarDetalleSesion}>
          <section
            aria-labelledby="movimientos-sesion-title"
            aria-modal="true"
            className="modal-panel"
            aria-busy={cargandoMovimientosHistorial}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">Historial de sesiones</p>
                <h2 id="movimientos-sesion-title">
                  Movimientos de {sesiones.find((sesion) => sesion.id === sesionHistorialId)?.caja?.nombre || 'la sesión'}
                </h2>
              </div>
              <button
                aria-label="Cerrar movimientos"
                className="icon-button"
                onClick={cerrarDetalleSesion}
                ref={cerrarMovimientosRef}
                title="Cerrar movimientos"
                type="button"
                style={{ padding: 0 }}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            {cargandoMovimientosHistorial ? (
              <p className="loading-state" role="status">Cargando movimientos…</p>
            ) : movimientosHistorial.length === 0 ? (
              <p className="empty-state">No hay movimientos registrados en esta sesión.</p>
            ) : (
              <div className="data-table-scroll-container">
                <table>
                  <thead>
                    <tr><th>Fecha</th><th>Tipo</th><th>Medio</th><th>Motivo</th><th>Comprobante</th><th>Importe</th></tr>
                  </thead>
                  <tbody>
                    {movimientosHistorial.map((movimiento) => (
                      <tr key={movimiento.id}>
                        <td>{fechaHora(movimiento.created_at)}</td>
                        <td>{movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</td>
                        <td>{movimiento.medio_pago?.nombre || '—'}</td>
                        <td>{movimiento.motivo}</td>
                        <td>{movimiento.comprobante || '—'}</td>
                        <td>{moneda(movimiento.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {mostrarFormularioCaja && (
        <div className="modal-backdrop" onMouseDown={cerrarFormularioCaja}>
          <section
            aria-labelledby="formulario-caja-title"
            aria-modal="true"
            aria-busy={guardando}
            className="modal-panel"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">Gestión de cajas</p>
                <h2 id="formulario-caja-title">{cajaForm.id ? 'Editar caja' : 'Crear caja'}</h2>
              </div>
              <button
                aria-label="Cerrar formulario"
                className="icon-button"
                disabled={guardando}
                onClick={cerrarFormularioCaja}
                ref={cerrarFormularioCajaRef}
                title="Cerrar formulario"
                type="button"
                style={{ padding: 0 }}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            {error && <Feedback tone="error">{error}</Feedback>}
            <form className="stacked-form cajas-form" onSubmit={guardarCajaForm}>
              <label>
                Nombre de caja
                <input
                  maxLength={100}
                  required
                  value={cajaForm.nombre}
                  onChange={(event) => setCajaForm((form) => ({ ...form, nombre: event.target.value }))}
                />
              </label>
              <label>
                Punto de venta / sucursal
                <select
                  required
                  value={cajaForm.punto_venta_id}
                  onChange={(event) =>
                    setCajaForm((form) => ({ ...form, punto_venta_id: event.target.value }))
                  }
                >
                  <option value="">Seleccionar punto de venta</option>
                  {puntosVentaDisponibles.map((punto) => (
                    <option key={punto.id} value={punto.id}>{puntoVentaLabel(punto)}</option>
                  ))}
                </select>
              </label>
              <label>
                Cajero asignado
                <select
                  required
                  value={cajaForm.usuario_asignado_id}
                  onChange={(event) =>
                    setCajaForm((form) => ({ ...form, usuario_asignado_id: event.target.value }))
                  }
                >
                  <option value="">Seleccionar cajero</option>
                  {cajeros.map((cajero) => (
                    <option key={cajero.usuario_id} value={cajero.usuario_id}>{cajero.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="cajas-checkbox">
                <input
                  type="checkbox"
                  checked={cajaForm.activa}
                  onChange={(event) =>
                    setCajaForm((form) => ({ ...form, activa: event.target.checked }))
                  }
                />
                Caja activa
              </label>
              <div className="cajas-actions">
                <Button type="submit" loading={guardando} icon={Check}>
                  {cajaForm.id ? 'Guardar cambios' : 'Crear caja'}
                </Button>
                <Button type="button" variant="ghost" disabled={guardando} onClick={cerrarFormularioCaja}>
                  Cancelar
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
