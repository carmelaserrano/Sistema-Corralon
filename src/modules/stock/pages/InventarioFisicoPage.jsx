import { useEffect, useState } from 'react'
import { getDepositos } from '../api/depositosApi'
import {
  aprobarInventarioFisico,
  cargarConteosInventario,
  enviarInventarioAprobacion,
  getInventarioAbiertoPorDeposito,
  iniciarInventarioFisico,
  aplicarAjustesInventarioFisico,
  puedeAjustarInventario,
} from '../api/inventarioFisicoApi'

function descripcionDiferencia(diferencia) {
  if (diferencia === null || diferencia === undefined) {
    return 'Pendiente de conteo'
  }

  const valor = Number(diferencia)

  if (valor < 0) {
    return `Faltante de ${Math.abs(valor)}`
  }

  if (valor > 0) {
    return `Sobrante de ${valor}`
  }

  return 'Sin diferencia'
}

function nombreEstado(estado) {
  if (estado === 'en_carga') return 'En carga'
  if (estado === 'pendiente_aprobacion') return 'Pendiente de aprobación'
  if (estado === 'aprobado') return 'Aprobado'

  return estado
}

function InventarioFisicoPage() {
  const [depositos, setDepositos] = useState([])
  const [depositoId, setDepositoId] = useState('')

  const [inventario, setInventario] = useState(null)
  const [conteos, setConteos] = useState({})

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(false)
  const [puedeAjustar, setPuedeAjustar] = useState(false)
  const [categoriaAjuste, setCategoriaAjuste] = useState('conteo_fisico')
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [aplicandoAjuste, setAplicandoAjuste] = useState(false)

  useEffect(() => {
    getDepositos()
      .then(setDepositos)
      .catch((err) =>
        setError(err.message || 'No se pudieron cargar los depósitos'),
      )
  }, [])

  useEffect(() => {
    puedeAjustarInventario()
      .then(setPuedeAjustar)
      .catch((err) => {
        setPuedeAjustar(false)
        setError(err.message || 'No se pudo verificar el permiso de ajuste')
      })
  }, [])

  function cargarConteosEnFormulario(detalle) {
    const nuevosConteos = {}

    for (const item of detalle ?? []) {
      nuevosConteos[item.producto_id] =
        item.cantidad_contada === null ||
        item.cantidad_contada === undefined
          ? ''
          : item.cantidad_contada
    }

    setConteos(nuevosConteos)
  }

  async function iniciarToma(event) {
    event.preventDefault()

    try {
      setLoading(true)
      setError('')
      setAviso('')

      const existente = await getInventarioAbiertoPorDeposito(depositoId)

      if (existente) {
        setInventario(existente)
        cargarConteosEnFormulario(existente.detalle)

        setAviso(
          'Ya existía una toma abierta para este depósito. Se recuperó para continuarla.',
        )

        return
      }

      const data = await iniciarInventarioFisico(depositoId)

      setInventario(data)
      cargarConteosEnFormulario(data.detalle)

      setAviso(
        'Toma de inventario iniciada. El stock teórico quedó congelado.',
      )
    } catch (err) {
      setError(err.message || 'No se pudo iniciar la toma de inventario')
    } finally {
      setLoading(false)
    }
  }

  function cambiarConteo(productoId, valor) {
    setConteos((actual) => ({
      ...actual,
      [productoId]: valor,
    }))
  }

  async function guardarConteo(event) {
    event.preventDefault()

    if (!inventario) return

    try {
      setLoading(true)
      setError('')
      setAviso('')

      const detalle = inventario.detalle ?? []

      const conteosAEnviar = detalle.map((item) => ({
        producto_id: item.producto_id,
        cantidad_contada: conteos[item.producto_id],
      }))

      const data = await cargarConteosInventario(
        inventario.id,
        conteosAEnviar,
      )

      setInventario(data)
      cargarConteosEnFormulario(data.detalle)

      setAviso(
        'Conteo registrado. Revisá las diferencias antes de enviarlo a aprobación.',
      )
    } catch (err) {
      setError(err.message || 'No se pudo registrar el conteo físico')
    } finally {
      setLoading(false)
    }
  }

  async function enviarAprobacion() {
    if (!inventario) return

    try {
      setLoading(true)
      setError('')
      setAviso('')

      const cabecera = await enviarInventarioAprobacion(inventario.id)

      setInventario((actual) => ({
        ...actual,
        ...cabecera,
      }))

      setAviso(
        'La toma fue enviada a aprobación. Los conteos ya no pueden modificarse.',
      )
    } catch (err) {
      setError(err.message || 'No se pudo enviar la toma a aprobación')
    } finally {
      setLoading(false)
    }
  }

  async function aprobarToma() {
    if (!inventario) return

    try {
      setLoading(true)
      setError('')
      setAviso('')

      const cabecera = await aprobarInventarioFisico(inventario.id)

      setInventario((actual) => ({
        ...actual,
        ...cabecera,
      }))

      setAviso(
        'Inventario aprobado. El stock todavía no fue modificado; el ajuste corresponde a US-STK-12.',
      )
    } catch (err) {
      setError(err.message || 'No se pudo aprobar la toma de inventario')
    } finally {
      setLoading(false)
    }

  }

  async function aplicarAjustes() {
    if (!inventario || !motivoAjuste.trim()) {
      setError('El motivo del ajuste es obligatorio')
      return
    }

    try {
      setAplicandoAjuste(true)
      setError('')
      setAviso('')

      const total = await aplicarAjustesInventarioFisico(inventario.id, {
        categoria: categoriaAjuste,
        motivo: motivoAjuste,
      })

      setInventario((actual) => ({
        ...actual,
        ajustes_aplicados_at: new Date().toISOString(),
      }))
      setAviso(
        `${total} ajuste${total === 1 ? '' : 's'} aplicado${total === 1 ? '' : 's'} al stock. Quedaron registrados con usuario y fecha.`,
      )
    } catch (err) {
      setError(err.message || 'No se pudieron aplicar los ajustes')
    } finally {
      setAplicandoAjuste(false)
    }
  }

  function nuevaToma() {
    setInventario(null)
    setConteos({})
    setDepositoId('')
    setError('')
    setAviso('')
  }

  const conteoCompleto =
    inventario?.detalle?.length > 0 &&
    inventario.detalle.every((item) => {
      const valor = conteos[item.producto_id]

      return valor !== '' && valor !== null && valor !== undefined
    })

  return (
    <main>
      <h1>Inventario físico y conciliación</h1>

      <p>
        La diferencia se calcula como: cantidad contada - stock teórico.
        Un resultado negativo representa un faltante y uno positivo un
        sobrante.
      </p>

      {error && <p role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      {!inventario && (
        <section>
          <h2>Iniciar toma de inventario</h2>

          <form onSubmit={iniciarToma}>
            <label htmlFor="deposito_inventario">
              Depósito
            </label>

            <select
              id="deposito_inventario"
              value={depositoId}
              onChange={(event) => setDepositoId(event.target.value)}
              required
            >
              <option value="">Seleccionar depósito...</option>

              {depositos.map((deposito) => (
                <option key={deposito.id} value={deposito.id}>
                  {deposito.nombre}
                </option>
              ))}
            </select>

            <button type="submit" disabled={loading}>
              {loading ? 'Iniciando...' : 'Iniciar toma'}
            </button>
          </form>
        </section>
      )}

      {inventario && (
        <>
          <section>
            <h2>Datos de la toma</h2>

            <p>
              <strong>Depósito:</strong>{' '}
              {inventario.deposito?.nombre || '-'}
            </p>

            <p>
              <strong>Estado:</strong>{' '}
              {nombreEstado(inventario.estado)}
            </p>

            <p>
              <strong>Fecha de inicio:</strong>{' '}
              {inventario.created_at
                ? new Date(inventario.created_at).toLocaleString()
                : '-'}
            </p>
          </section>

          <section>
            <h2>Conteo físico</h2>

            <form onSubmit={guardarConteo}>
              <table>
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Stock teórico</th>
                    <th>Cantidad contada</th>
                    <th>Diferencia</th>
                    <th>Resultado</th>
                  </tr>
                </thead>

                <tbody>
                  {(inventario.detalle ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.producto?.sku
                          ? `${item.producto.sku} - ${item.producto.nombre}`
                          : item.producto?.nombre || '-'}
                      </td>

                      <td>{item.stock_teorico}</td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={conteos[item.producto_id] ?? ''}
                          onChange={(event) =>
                            cambiarConteo(
                              item.producto_id,
                              event.target.value,
                            )
                          }
                          disabled={inventario.estado !== 'en_carga'}
                          required
                        />
                      </td>

                      <td>
                        {item.diferencia === null ||
                        item.diferencia === undefined
                          ? '-'
                          : Number(item.diferencia) > 0
                            ? `+${item.diferencia}`
                            : item.diferencia}
                      </td>

                      <td>
                        {descripcionDiferencia(item.diferencia)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {inventario.estado === 'en_carga' && (
                <button type="submit" disabled={loading || !conteoCompleto}>
                  Registrar conteo completo
                </button>
              )}
            </form>
          </section>

          <section>
            <h2>Acciones</h2>

            {inventario.estado === 'en_carga' && (
              <button
                type="button"
                onClick={enviarAprobacion}
                disabled={
                  loading ||
                  (inventario.detalle ?? []).some(
                    (item) =>
                      item.cantidad_contada === null ||
                      item.cantidad_contada === undefined,
                  )
                }
              >
                Enviar a aprobación
              </button>
            )}

            {inventario.estado === 'pendiente_aprobacion' && (
              <button
                type="button"
                onClick={aprobarToma}
                disabled={loading}
              >
                Aprobar inventario
              </button>
            )}

            {inventario.estado === 'aprobado' && (
              <>
                <p>
                  Toma aprobada. Las diferencias se aplican como ajustes
                  trazables al stock.
                </p>

                {inventario.ajustes_aplicados_at ? (
                  <p role="status">Los ajustes de esta toma ya fueron aplicados.</p>
                ) : puedeAjustar ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      aplicarAjustes()
                    }}
                  >
                    <label htmlFor="categoria_ajuste_inventario">
                      Categoría del ajuste
                    </label>
                    <select
                      id="categoria_ajuste_inventario"
                      value={categoriaAjuste}
                      onChange={(event) => setCategoriaAjuste(event.target.value)}
                      required
                    >
                      <option value="conteo_fisico">Conteo físico</option>
                      <option value="rotura">Rotura</option>
                      <option value="vencimiento">Vencimiento</option>
                      <option value="robo">Robo</option>
                      <option value="otro">Otro</option>
                    </select>
                    <label htmlFor="motivo_ajuste_inventario">Motivo</label>
                    <textarea
                      id="motivo_ajuste_inventario"
                      value={motivoAjuste}
                      onChange={(event) => setMotivoAjuste(event.target.value)}
                      required
                    />
                    <button type="submit" disabled={aplicandoAjuste}>
                      {aplicandoAjuste ? 'Aplicando...' : 'Aplicar ajustes de las diferencias'}
                    </button>
                  </form>
                ) : (
                  <p>No tenés permiso para realizar ajustes de inventario.</p>
                )}

                <button type="button" onClick={nuevaToma}>
                  Nueva toma
                </button>
              </>
            )}
          </section>
        </>
      )}
    </main>
  )
}

export default InventarioFisicoPage