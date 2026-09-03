import { useEffect, useState } from 'react'
import {
  TIPOS,
  createMovimiento,
  puedeAjustarInventario,
} from '../api/movimientosApi'
import { getDepositos } from '../api/depositosApi'
import { getArticulos } from '../api/articulosApi'

const movimientoInicial = {
  tipo: TIPOS.TRANSFERENCIA,
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
  const [form, setForm] = useState(movimientoInicial)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [puedeAjustar, setPuedeAjustar] = useState(false)

  async function cargarDatos() {
    try {
      setLoading(true)
      setError('')

      const [depositosData, articulosData] = await Promise.all([
        getDepositos(),
        getArticulos({ estado: 'activo', pageSize: 200 }),
      ])

      setDepositos(depositosData)
      setArticulos(articulosData.articulos)

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

  // Al cambiar el tipo hay que limpiar el depósito que se oculta: si queda un
  // valor colgado en el state, el trigger de la base rechaza el movimiento.
  function manejarCambioTipo(event) {
    const tipo = event.target.value

    setForm((actual) => ({
      ...actual,
      tipo,
      deposito_origen_id:
        tipo === TIPOS.INGRESO ? '' : actual.deposito_origen_id,
      deposito_destino_id:
        tipo === TIPOS.EGRESO ? '' : actual.deposito_destino_id,
    }))
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

  if (loading) {
    return <p>Cargando movimientos...</p>
  }

  const muestraOrigen = form.tipo !== TIPOS.INGRESO
  const muestraDestino = form.tipo !== TIPOS.EGRESO
  const esAjuste = form.tipo === TIPOS.AJUSTE

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
          <div>
            <label htmlFor="tipo">Tipo</label>
            <select
              id="tipo"
              name="tipo"
              value={form.tipo}
              onChange={manejarCambioTipo}
              required
            >
              <option value={TIPOS.INGRESO}>Ingreso</option>
              <option value={TIPOS.EGRESO}>Egreso</option>
              <option value={TIPOS.TRANSFERENCIA}>Transferencia</option>
              {puedeAjustar && <option value={TIPOS.AJUSTE}>Ajuste de inventario</option>}
            </select>
          </div>

          <div>
            <label htmlFor="articulo_id">Artículo</label>
            <select
              id="articulo_id"
              name="articulo_id"
              value={form.articulo_id}
              onChange={manejarCambio}
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

          {!esAjuste && <div>
            <label htmlFor="cantidad">Cantidad</label>
            <input
              id="cantidad"
              name="cantidad"
              type="number"
              min="0"
              step="any"
              value={form.cantidad}
              onChange={manejarCambio}
              required
            />
          </div>}

          {esAjuste && (
            <>
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
              <div>
                <label htmlFor="cantidad">Cantidad (positiva suma, negativa resta)</label>
                <input
                  id="cantidad"
                  name="cantidad"
                  type="number"
                  step="any"
                  value={form.cantidad}
                  onChange={manejarCambio}
                  required
                />
              </div>
              <div>
                <label htmlFor="categoria_ajuste">Categoría del ajuste</label>
                <select
                  id="categoria_ajuste"
                  name="categoria_ajuste"
                  value={form.categoria_ajuste}
                  onChange={manejarCambio}
                  required
                >
                  {categoriasAjuste.map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>{etiqueta}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="motivo_ajuste">Motivo</label>
                <textarea
                  id="motivo_ajuste"
                  name="motivo_ajuste"
                  value={form.motivo_ajuste}
                  onChange={manejarCambio}
                  required
                />
              </div>
            </>
          )}

          {!esAjuste && muestraOrigen && (
            <div>
              <label htmlFor="deposito_origen_id">Depósito origen</label>
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

          {!esAjuste && muestraDestino && (
            <div>
              <label htmlFor="deposito_destino_id">Depósito destino</label>
              <select
                id="deposito_destino_id"
                name="deposito_destino_id"
                value={form.deposito_destino_id}
                onChange={manejarCambio}
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

          {!esAjuste && <div>
            <label htmlFor="comprobante">Comprobante</label>
            <input
              id="comprobante"
              name="comprobante"
              value={form.comprobante}
              onChange={manejarCambio}
              required
            />
          </div>}

          {!esAjuste && <div>
            <label htmlFor="observaciones">Observaciones</label>
            <textarea
              id="observaciones"
              name="observaciones"
              value={form.observaciones}
              onChange={manejarCambio}
            />
          </div>}

          <button type="submit" disabled={enviando}>
            {enviando ? 'Registrando...' : 'Registrar movimiento'}
          </button>
        </form>
      </section>

    </main>
  )
}

export default MovimientosPage
