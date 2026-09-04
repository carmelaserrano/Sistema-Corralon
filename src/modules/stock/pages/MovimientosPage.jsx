import { useEffect, useState } from 'react'
import {
  TIPOS,
  cancelarMovimiento,
  confirmarMovimiento,
  createMovimiento,
  getMovimientos,
  puedeAjustarInventario,
} from '../api/movimientosApi'
import { getDepositos } from '../api/depositosApi'
import { getArticulos } from '../api/articulosApi'

const movimientoInicial = {
  tipo: '',
  articulo_id: '',
  cantidad: '',
  deposito_origen_id: '',
  deposito_destino_id: '',
  comprobante: '',
  observaciones: '',
  deposito_id: '',
  categoria_ajuste: 'otro',
  motivo_ajuste: '',
}

const categoriasAjuste = [
  ['rotura', 'Rotura'],
  ['vencimiento', 'Vencimiento'],
  ['robo', 'Robo'],
  ['conteo_fisico', 'Conteo físico'],
  ['otro', 'Otro'],
]

const etiquetaTipo = {
  [TIPOS.INGRESO]: 'Ingreso',
  [TIPOS.EGRESO]: 'Egreso',
  [TIPOS.TRANSFERENCIA]: 'Transferencia',
  [TIPOS.AJUSTE]: 'Ajuste',
}

// El 423 es el único error accionable por el usuario: reintentar. El resto ya
// vienen con un mensaje específico en castellano desde la validación o la base.
function mensajeDeError(err, mensajePorDefecto) {
  if (err?.status === 423) {
    return 'Hay otro movimiento en proceso sobre el mismo artículo o depósito. Esperá unos segundos y volvé a intentar.'
  }

  return err?.message || mensajePorDefecto
}

function MovimientosPage({ onVerHistorial }) {
  const [depositos, setDepositos] = useState([])
  const [articulos, setArticulos] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [form, setForm] = useState(movimientoInicial)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [procesandoId, setProcesandoId] = useState(null)
  const [puedeAjustar, setPuedeAjustar] = useState(false)

  async function cargarDatos() {
    try {
      setLoading(true)
      setError('')

      const [depositosData, articulosData, pendientesData] = await Promise.all([
        getDepositos(),
        getArticulos({ estado: 'activo', pageSize: 200 }),
        getMovimientos({ estado: 'pendiente', pageSize: 50 }),
      ])

      setDepositos(depositosData)
      setArticulos(articulosData.articulos)
      setPendientes(pendientesData.movimientos)

      try {
        setPuedeAjustar(await puedeAjustarInventario())
      } catch {
        setPuedeAjustar(false)
      }
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los movimientos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  function manejarCambio(event) {
    const { name, value } = event.target

    setForm((actual) => ({
      ...actual,
      [name]: value,
    }))
  }

  // Al cambiar el tipo se preserva el depósito ya seleccionado reasignándolo
  // al campo correcto para el nuevo tipo, y se limpia el resto de depósitos.
  function manejarCambioTipo(event) {
    const tipo = event.target.value

    setForm((actual) => {
      // El depósito "principal" es el primer campo que el usuario completó.
      const depositoPrimario =
        actual.tipo === TIPOS.INGRESO
          ? actual.deposito_destino_id
          : actual.tipo === TIPOS.AJUSTE
            ? actual.deposito_id
            : actual.deposito_origen_id // cubre tipo vacío, EGRESO y TRANSFERENCIA

      const nuevo = {
        ...actual,
        tipo,
        deposito_origen_id: '',
        deposito_destino_id: '',
        deposito_id: '',
      }

      if (tipo === TIPOS.INGRESO) {
        nuevo.deposito_destino_id = depositoPrimario
      } else if (tipo === TIPOS.AJUSTE) {
        nuevo.deposito_id = depositoPrimario
      } else {
        // EGRESO, TRANSFERENCIA o vacío
        nuevo.deposito_origen_id = depositoPrimario
      }

      return nuevo
    })
  }

  async function registrarMovimiento(event) {
    event.preventDefault()

    try {
      setError('')
      setEnviando(true)

      await createMovimiento(form)

      setForm(movimientoInicial)
      await cargarDatos()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar el movimiento'))
    } finally {
      setEnviando(false)
    }
  }

  async function confirmar(movimiento) {
    const confirmado = window.confirm(
      `¿Confirmar el movimiento ${movimiento.comprobante || ''}? Se va a aplicar el impacto en el stock.`,
    )

    if (!confirmado) return

    try {
      setError('')
      setProcesandoId(movimiento.id)

      await confirmarMovimiento(movimiento.id)
      await cargarDatos()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo confirmar el movimiento'))
    } finally {
      setProcesandoId(null)
    }
  }

  async function cancelar(movimiento) {
    const confirmado = window.confirm(
      `¿Cancelar el movimiento ${movimiento.comprobante || ''}? No se va a aplicar en el stock.`,
    )

    if (!confirmado) return

    try {
      setError('')
      setProcesandoId(movimiento.id)

      await cancelarMovimiento(movimiento.id)
      await cargarDatos()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cancelar el movimiento'))
    } finally {
      setProcesandoId(null)
    }
  }

  if (loading) {
    return <p>Cargando movimientos...</p>
  }

  const esAjuste = form.tipo === TIPOS.AJUSTE
  const esIngreso = form.tipo === TIPOS.INGRESO
  const esTransferencia = form.tipo === TIPOS.TRANSFERENCIA

  // depositoPrincipal: valor del primer campo de depósito que ve el usuario.
  // Para tipo vacío o EGRESO/TRANSFERENCIA usa deposito_origen_id.
  const depositoPrincipal = esAjuste
    ? form.deposito_id
    : esIngreso
      ? form.deposito_destino_id
      : form.deposito_origen_id

  // Pasos de habilitación progresiva según los criterios de aceptación.
  const pasoDeposito = depositoPrincipal !== ''
  const pasoTipo = pasoDeposito && form.tipo !== ''
  // Para Ajuste, categoría_ajuste cumple el rol de Comprobante.
  // Arranca con valor 'otro' (válido), por lo que pasoComprobante se cumple
  // en cuanto se selecciona el tipo.
  const pasoComprobante =
    pasoTipo &&
    (esAjuste
      ? form.categoria_ajuste !== ''
      : form.comprobante.trim() !== '')
  const pasoArticulo = pasoComprobante

  return (
    <main>
      <h1>Movimientos de stock</h1>
      <button type="button" onClick={onVerHistorial}>
        Ver historial
      </button>

      {error && <p role="alert">{error}</p>}

      <section>
        <h2>Nuevo movimiento</h2>

        <form onSubmit={registrarMovimiento}>
          {/* PASO 1: Depósito — siempre habilitado.
              El campo y la etiqueta cambian según el tipo ya seleccionado para
              que el id del select y el htmlFor del label siempre coincidan. */}
          {esAjuste ? (
            <div>
              <label htmlFor="deposito_id">Depósito</label>
              <select
                id="deposito_id"
                name="deposito_id"
                value={form.deposito_id}
                onChange={manejarCambio}
                required
              >
                <option value="">Seleccionar...</option>
                {depositos.map((deposito) => (
                  <option key={deposito.id} value={deposito.id}>
                    {deposito.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : esIngreso ? (
            <div>
              <label htmlFor="deposito_destino_id">Depósito</label>
              <select
                id="deposito_destino_id"
                name="deposito_destino_id"
                value={form.deposito_destino_id}
                onChange={manejarCambio}
                required
              >
                <option value="">Seleccionar...</option>
                {depositos.map((deposito) => (
                  <option key={deposito.id} value={deposito.id}>
                    {deposito.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="deposito_origen_id">
                {esTransferencia ? 'Depósito origen' : 'Depósito'}
              </label>
              <select
                id="deposito_origen_id"
                name="deposito_origen_id"
                value={form.deposito_origen_id}
                onChange={manejarCambio}
                required
              >
                <option value="">Seleccionar...</option>
                {depositos.map((deposito) => (
                  <option key={deposito.id} value={deposito.id}>
                    {deposito.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* PASO 2: Tipo de movimiento — se habilita al seleccionar depósito */}
          <div>
            <label htmlFor="tipo">Tipo</label>
            <select
              id="tipo"
              name="tipo"
              value={form.tipo}
              onChange={manejarCambioTipo}
              disabled={!pasoDeposito}
              required
            >
              <option value="">Seleccionar...</option>
              <option value={TIPOS.INGRESO}>Ingreso</option>
              <option value={TIPOS.EGRESO}>Egreso</option>
              <option value={TIPOS.TRANSFERENCIA}>Transferencia</option>
              {puedeAjustar && (
                <option value={TIPOS.AJUSTE}>Ajuste de inventario</option>
              )}
            </select>
          </div>

          {/* PASO 3a: Depósito destino — solo Transferencia, se habilita al elegir tipo */}
          {esTransferencia && (
            <div>
              <label htmlFor="deposito_destino_id">Depósito destino</label>
              <select
                id="deposito_destino_id"
                name="deposito_destino_id"
                value={form.deposito_destino_id}
                onChange={manejarCambio}
                disabled={!pasoTipo}
                required
              >
                <option value="">Seleccionar...</option>
                {depositos
                  .filter((deposito) => deposito.id !== form.deposito_origen_id)
                  .map((deposito) => (
                    <option key={deposito.id} value={deposito.id}>
                      {deposito.nombre}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* PASO 3b: Comprobante — no Ajuste, se habilita al elegir tipo */}
          {!esAjuste && (
            <div>
              <label htmlFor="comprobante">Comprobante</label>
              <input
                id="comprobante"
                name="comprobante"
                value={form.comprobante}
                onChange={manejarCambio}
                disabled={!pasoTipo}
                required
              />
            </div>
          )}

          {/* PASO 3b (Ajuste): Categoría — cumple el rol de Comprobante como gate
              para habilitar la grilla; arranca con 'otro' preseleccionado. */}
          {esAjuste && (
            <div>
              <label htmlFor="categoria_ajuste">Categoría del ajuste</label>
              <select
                id="categoria_ajuste"
                name="categoria_ajuste"
                value={form.categoria_ajuste}
                onChange={manejarCambio}
                disabled={!pasoTipo}
                required
              >
                {categoriasAjuste.map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* PASO 4: Observaciones — no Ajuste, opcional, se habilita al cargar comprobante */}
          {!esAjuste && (
            <div>
              <label htmlFor="observaciones">Observaciones</label>
              <textarea
                id="observaciones"
                name="observaciones"
                value={form.observaciones}
                onChange={manejarCambio}
                disabled={!pasoComprobante}
              />
            </div>
          )}

          {/* PASO 4 (Ajuste): Motivo — obligatorio en submit, cumple el rol de Observaciones */}
          {esAjuste && (
            <div>
              <label htmlFor="motivo_ajuste">Motivo</label>
              <textarea
                id="motivo_ajuste"
                name="motivo_ajuste"
                value={form.motivo_ajuste}
                onChange={manejarCambio}
                disabled={!pasoTipo}
                required
              />
            </div>
          )}

          {/* PASO 5: Artículo — se habilita únicamente al completar los pasos previos */}
          <div>
            <label htmlFor="articulo_id">Artículo</label>
            <select
              id="articulo_id"
              name="articulo_id"
              value={form.articulo_id}
              onChange={manejarCambio}
              disabled={!pasoArticulo}
              required
            >
              <option value="">Seleccionar...</option>
              {articulos.map((articulo) => (
                <option key={articulo.id} value={articulo.id}>
                  {articulo.sku} — {articulo.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* PASO 5: Cantidad — junto al artículo */}
          <div>
            <label htmlFor="cantidad">
              {esAjuste
                ? 'Cantidad (positiva suma, negativa resta)'
                : 'Cantidad'}
            </label>
            <input
              id="cantidad"
              name="cantidad"
              type="number"
              min={esAjuste ? undefined : '0'}
              step="any"
              value={form.cantidad}
              onChange={manejarCambio}
              disabled={!pasoArticulo}
              required
            />
          </div>

          <button type="submit" disabled={enviando}>
            {enviando ? 'Registrando...' : 'Registrar movimiento'}
          </button>
        </form>
      </section>

      <section>
        <h2>Movimientos pendientes</h2>

        {pendientes.length === 0 ? (
          <p>No hay movimientos pendientes.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Artículo</th>
                <th>Cantidad</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Comprobante</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {pendientes.map((movimiento) => {
                // detalle es una relación uno a muchos: llega como array
                // aunque en esta historia siempre tenga un solo renglón.
                const renglon = movimiento.detalle?.[0]
                const procesando = procesandoId === movimiento.id
                const esAjustePendiente =
                  movimiento.tipo?.codigo === TIPOS.AJUSTE
                const puedeProcesar = !esAjustePendiente || puedeAjustar

                return (
                  <tr key={movimiento.id}>
                    <td>
                      {new Date(movimiento.fecha).toLocaleString('es-AR')}
                    </td>
                    <td>
                      {etiquetaTipo[movimiento.tipo?.codigo] ||
                        movimiento.tipo?.nombre ||
                        '-'}
                    </td>
                    <td>
                      {renglon
                        ? `${renglon.producto?.sku} — ${renglon.producto?.nombre}`
                        : '-'}
                    </td>
                    <td>{renglon?.cantidad ?? '-'}</td>
                    <td>{movimiento.origen?.nombre || '-'}</td>
                    <td>{movimiento.destino?.nombre || '-'}</td>
                    <td>{movimiento.comprobante || '-'}</td>
                    <td>
                      {puedeProcesar ? (
                        <>
                          <button
                            type="button"
                            onClick={() => confirmar(movimiento)}
                            disabled={procesando}
                          >
                            {procesando ? 'Procesando...' : 'Confirmar'}
                          </button>

                          <button
                            type="button"
                            onClick={() => cancelar(movimiento)}
                            disabled={procesando}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <span>Sin permiso para procesar el ajuste</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

export default MovimientosPage
