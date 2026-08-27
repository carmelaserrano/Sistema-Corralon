import { useEffect, useState } from 'react'
import {
  confirmarRecepcion,
  createRecepcion,
  getRecepciones,
} from '../api/recepcionesApi'
import { getDepositos } from '../api/depositosApi'
import { getArticulos } from '../api/articulosApi'

const itemVacio = { articulo_id: '', cantidad: '', costo_unitario: '' }

const recepcionInicial = {
  deposito_destino_id: '',
  orden_compra_id: '',
  observaciones: '',
  items: [{ ...itemVacio }],
}

// El 423 es el único error accionable por el usuario: reintentar. El resto ya
// vienen con un mensaje específico en castellano desde la validación o la base.
function mensajeDeError(err, mensajePorDefecto) {
  if (err?.status === 423) {
    return 'Hay otra operación en proceso sobre el mismo artículo o depósito. Esperá unos segundos y volvé a intentar.'
  }

  return err?.message || mensajePorDefecto
}

function RecepcionesPage() {
  const [depositos, setDepositos] = useState([])
  const [articulos, setArticulos] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [form, setForm] = useState(recepcionInicial)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [procesandoId, setProcesandoId] = useState(null)

  async function cargarDatos() {
    try {
      setLoading(true)
      setError('')

      const [depositosData, articulosData, pendientesData] = await Promise.all([
        getDepositos(),
        getArticulos({ estado: 'activo', pageSize: 200 }),
        getRecepciones({ estado: 'pendiente', pageSize: 50 }),
      ])

      setDepositos(depositosData)
      setArticulos(articulosData.articulos)
      setPendientes(pendientesData.recepciones)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las recepciones')
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

  function manejarCambioItem(indice, event) {
    const { name, value } = event.target

    setForm((actual) => ({
      ...actual,
      items: actual.items.map((item, i) =>
        i === indice ? { ...item, [name]: value } : item,
      ),
    }))
  }

  function agregarItem() {
    setForm((actual) => ({
      ...actual,
      items: [...actual.items, { ...itemVacio }],
    }))
  }

  function quitarItem(indice) {
    setForm((actual) => ({
      ...actual,
      items: actual.items.filter((_, i) => i !== indice),
    }))
  }

  async function registrarRecepcion(event) {
    event.preventDefault()

    try {
      setError('')
      setEnviando(true)

      await createRecepcion(form)

      setForm(recepcionInicial)
      await cargarDatos()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar la recepción'))
    } finally {
      setEnviando(false)
    }
  }

  async function confirmar(recepcion) {
    const confirmado = window.confirm(
      '¿Confirmar esta recepción? Se va a aplicar el impacto en el stock y no se puede deshacer.',
    )

    if (!confirmado) return

    try {
      setError('')
      setProcesandoId(recepcion.id)

      await confirmarRecepcion(recepcion.id)
      await cargarDatos()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo confirmar la recepción'))
    } finally {
      setProcesandoId(null)
    }
  }

  if (loading) {
    return <p>Cargando recepciones...</p>
  }

  return (
    <main>
      <h1>Recepción de mercadería</h1>

      {error && <p role="alert">{error}</p>}

      <section>
        <h2>Nueva recepción</h2>

        <form onSubmit={registrarRecepcion}>
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

              {depositos.map((deposito) => (
                <option key={deposito.id} value={deposito.id}>
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="orden_compra_id">Orden de compra</label>
            <input
              id="orden_compra_id"
              name="orden_compra_id"
              value={form.orden_compra_id}
              onChange={manejarCambio}
            />
          </div>

          <div>
            <label htmlFor="observaciones">Observaciones</label>
            <textarea
              id="observaciones"
              name="observaciones"
              value={form.observaciones}
              onChange={manejarCambio}
            />
          </div>

          <table>
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Cantidad</th>
                <th>Costo unitario</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {form.items.map((item, indice) => (
                <tr key={indice}>
                  <td>
                    <select
                      name="articulo_id"
                      value={item.articulo_id}
                      onChange={(event) => manejarCambioItem(indice, event)}
                      required
                    >
                      <option value="">Seleccionar...</option>

                      {articulos.map((articulo) => (
                        <option key={articulo.id} value={articulo.id}>
                          {articulo.sku} — {articulo.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      name="cantidad"
                      type="number"
                      min="0"
                      step="any"
                      value={item.cantidad}
                      onChange={(event) => manejarCambioItem(indice, event)}
                      required
                    />
                  </td>
                  <td>
                    <input
                      name="costo_unitario"
                      type="number"
                      min="0"
                      step="any"
                      value={item.costo_unitario}
                      onChange={(event) => manejarCambioItem(indice, event)}
                      required
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => quitarItem(indice)}
                      disabled={form.items.length === 1}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button type="button" onClick={agregarItem}>
            Agregar ítem
          </button>

          <div>
            <button type="submit" disabled={enviando}>
              {enviando ? 'Registrando...' : 'Registrar recepción'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2>Recepciones pendientes</h2>

        {pendientes.length === 0 ? (
          <p>No hay recepciones pendientes.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Destino</th>
                <th>Orden de compra</th>
                <th>Ítems</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {pendientes.map((recepcion) => {
                const procesando = procesandoId === recepcion.id

                return (
                  <tr key={recepcion.id}>
                    <td>
                      {new Date(recepcion.created_at).toLocaleString('es-AR')}
                    </td>
                    <td>{recepcion.destino?.nombre || '-'}</td>
                    <td>{recepcion.orden_compra_id || '-'}</td>
                    <td>
                      {(recepcion.detalle ?? [])
                        .map(
                          (renglon) =>
                            `${renglon.producto?.sku} x${renglon.cantidad}`,
                        )
                        .join(', ') || '-'}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => confirmar(recepcion)}
                        disabled={procesando}
                      >
                        {procesando ? 'Procesando...' : 'Confirmar'}
                      </button>
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

export default RecepcionesPage
