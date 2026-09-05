import { useEffect, useState } from 'react'
import {
  getHistorialMovimientos,
  getTiposMovimiento,
} from '../api/movimientosApi'
import { getDepositos } from '../api/depositosApi'
import { getArticulos } from '../api/articulosApi'

const filtrosIniciales = {
  articuloId: '',
  tipoId: '',
  fechaDesde: '',
  fechaHasta: '',
  depositoOrigenId: '',
  depositoDestinoId: '',
}

function HistorialMovimientosPage({ onVolver }) {
  const [movimientos, setMovimientos] = useState([])
  const [depositos, setDepositos] = useState([])
  const [articulos, setArticulos] = useState([])
  const [tipos, setTipos] = useState([])
  const [filtros, setFiltros] = useState(filtrosIniciales)
  const [filtrosAplicados, setFiltrosAplicados] =
    useState(filtrosIniciales)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function cargarHistorial(filtrosConsulta, pagina) {
    try {
      setLoading(true)
      setError('')

      const resultado = await getHistorialMovimientos({
        ...filtrosConsulta,
        page: pagina,
        pageSize: 10,
      })

      setMovimientos(resultado.movimientos)
      setTotal(resultado.total)
      setTotalPaginas(resultado.totalPaginas)
    } catch (err) {
      setError(
        err.message ||
          'No se pudo cargar el historial de movimientos',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function iniciar() {
      try {
        setLoading(true)
        setError('')

        const [depositosData, articulosData, tiposData] =
          await Promise.all([
            getDepositos(),
            getArticulos({
              estado: 'activo',
              pageSize: 200,
            }),
            getTiposMovimiento(),
          ])

        setDepositos(depositosData)
        setArticulos(articulosData.articulos)
        setTipos(tiposData)

        const resultado = await getHistorialMovimientos({
          page: 1,
          pageSize: 10,
        })

        setMovimientos(resultado.movimientos)
        setTotal(resultado.total)
        setTotalPaginas(resultado.totalPaginas)
      } catch (err) {
        setError(
          err.message ||
            'No se pudo cargar el historial de movimientos',
        )
      } finally {
        setLoading(false)
      }
    }

    iniciar()
  }, [])

  function manejarCambio(event) {
    const { name, value } = event.target

    setFiltros((actual) => ({
      ...actual,
      [name]: value,
    }))
  }

  async function aplicarFiltros(event) {
    event.preventDefault()

    setFiltrosAplicados(filtros)
    setPage(1)

    await cargarHistorial(filtros, 1)
  }

  async function limpiarFiltros() {
    setFiltros(filtrosIniciales)
    setFiltrosAplicados(filtrosIniciales)
    setPage(1)

    await cargarHistorial(filtrosIniciales, 1)
  }

  async function cambiarPagina(nuevaPagina) {
    if (
      nuevaPagina < 1 ||
      nuevaPagina > totalPaginas
    ) {
      return
    }

    setPage(nuevaPagina)

    await cargarHistorial(
      filtrosAplicados,
      nuevaPagina,
    )
  }

  return (
    <main>
      <button
        type="button"
        onClick={onVolver}
      >
        Volver a movimientos
      </button>

      <h1>Historial de movimientos de stock</h1>

      <p>
        Consulta histórica de solo lectura. Los
        movimientos registrados no pueden modificarse
        ni eliminarse desde esta pantalla.
      </p>

      {error && <p role="alert">{error}</p>}

      <section>
        <h2>Filtros</h2>

        <form onSubmit={aplicarFiltros}>
          <div>
            <label htmlFor="articuloId">
              Artículo
            </label>

            <select
              id="articuloId"
              name="articuloId"
              value={filtros.articuloId}
              onChange={manejarCambio}
            >
              <option value="">Todos</option>

              {articulos.map((articulo) => (
                <option
                  key={articulo.id}
                  value={articulo.id}
                >
                  {articulo.sku} — {articulo.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tipoId">
              Tipo de movimiento
            </label>

            <select
              id="tipoId"
              name="tipoId"
              value={filtros.tipoId}
              onChange={manejarCambio}
            >
              <option value="">Todos</option>

              {tipos.map((tipo) => (
                <option
                  key={tipo.id}
                  value={tipo.id}
                >
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fechaDesde">
              Desde
            </label>

            <input
              id="fechaDesde"
              name="fechaDesde"
              type="date"
              value={filtros.fechaDesde}
              onChange={manejarCambio}
            />
          </div>

          <div>
            <label htmlFor="fechaHasta">
              Hasta
            </label>

            <input
              id="fechaHasta"
              name="fechaHasta"
              type="date"
              value={filtros.fechaHasta}
              onChange={manejarCambio}
            />
          </div>

          <div>
            <label htmlFor="depositoOrigenId">
              Depósito origen
            </label>

            <select
              id="depositoOrigenId"
              name="depositoOrigenId"
              value={filtros.depositoOrigenId}
              onChange={manejarCambio}
            >
              <option value="">Todos</option>

              {depositos.map((deposito) => (
                <option
                  key={deposito.id}
                  value={deposito.id}
                >
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="depositoDestinoId">
              Depósito destino
            </label>

            <select
              id="depositoDestinoId"
              name="depositoDestinoId"
              value={filtros.depositoDestinoId}
              onChange={manejarCambio}
            >
              <option value="">Todos</option>

              {depositos.map((deposito) => (
                <option
                  key={deposito.id}
                  value={deposito.id}
                >
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </div>

          <button type="submit">
            Aplicar filtros
          </button>

          <button
            type="button"
            onClick={limpiarFiltros}
          >
            Limpiar filtros
          </button>
        </form>
      </section>

      <section>
        <h2>Resultados</h2>

        <p>
          Total de movimientos encontrados: {total}
        </p>

        {loading ? (
          <p>Cargando historial...</p>
        ) : movimientos.length === 0 ? (
          <p>
            No se encontraron movimientos para los
            filtros seleccionados.
          </p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Tipo</th>
                  <th>Artículo</th>
                  <th>Cantidad</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Usuario</th>
                  <th>Comprobante</th>
                  <th>Observaciones</th>
                  <th>Categoría de ajuste</th>
                  <th>Motivo del ajuste</th>
                  <th>Origen del ajuste</th>
                  <th>Estado</th>
                </tr>
              </thead>

              <tbody>
                {movimientos.map((movimiento) => {
                  const renglones = movimiento.detalle ?? []

                  return (
                    <tr key={movimiento.id}>
                      <td>
                        {new Date(
                          movimiento.fecha,
                        ).toLocaleString('es-AR')}
                      </td>

                      <td>
                        {movimiento.tipo?.nombre ||
                          '-'}
                      </td>

                      <td>
                        {renglones.length > 0 ? (
                          <ul>{renglones.map((renglon) => (
                            <li key={renglon.id}>
                              {renglon.producto?.sku} — {renglon.producto?.nombre}
                            </li>
                          ))}</ul>
                        ) : '-'}
                      </td>

                      <td>
                        {renglones.length > 0 ? (
                          <ul>{renglones.map((renglon) => (
                            <li key={renglon.id}>{renglon.cantidad}</li>
                          ))}</ul>
                        ) : '-'}
                      </td>

                      <td>
                        {movimiento.origen?.nombre ||
                          '-'}
                      </td>

                      <td>
                        {movimiento.destino?.nombre ||
                          '-'}
                      </td>

                      <td>
                        {movimiento.created_by || '-'}
                      </td>

                      <td>
                        {movimiento.comprobante || '-'}
                      </td>

                      <td>
                        {movimiento.observaciones ||
                          '-'}
                      </td>

                      <td>
                        {movimiento.categoria_ajuste ||
                          '-'}
                      </td>

                      <td>
                        {movimiento.motivo_ajuste || '-'}
                      </td>

                      <td>
                        {movimiento.origen_ajuste === 'inventario_fisico'
                          ? 'Inventario físico'
                          : movimiento.origen_ajuste === 'manual'
                            ? 'Manual'
                            : '-'}
                      </td>

                      <td>
                        {movimiento.estado_movimiento ||
                          '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div>
              <button
                type="button"
                onClick={() =>
                  cambiarPagina(page - 1)
                }
                disabled={page <= 1 || loading}
              >
                Anterior
              </button>

              <span>
                {' '}
                Página {page} de {totalPaginas}{' '}
              </span>

              <button
                type="button"
                onClick={() =>
                  cambiarPagina(page + 1)
                }
                disabled={
                  page >= totalPaginas || loading
                }
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default HistorialMovimientosPage
