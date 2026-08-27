import { useEffect, useRef, useState } from 'react'
import {
  getDepositos,
  getStockDisponibles,
  subscribeToStockChanges,
} from '../api/stockApi'

const STOCK_POR_PAGINA = 50

export default function StockPage() {
  const [depositos, setDepositos] = useState([])
  const [depositoId, setDepositoId] = useState('')
  const [search, setSearch] = useState('')
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [versionStock, setVersionStock] = useState(0)
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const ultimaSolicitudRef = useRef(0)

  useEffect(() => {
    getDepositos()
      .then((data) => {
        setDepositos(data)
        if (data.length > 0) setDepositoId(data[0].id)
      })
      .catch((err) => setError(err.message || 'No se pudieron cargar los depósitos'))
  }, [])

  useEffect(() => {
    if (!depositoId) return

    const numeroSolicitud = ++ultimaSolicitudRef.current

    async function cargarStock() {
      setLoading(true)
      setError(null)

      try {
        const respuesta = await getStockDisponibles({
          deposito_id: depositoId,
          search,
          page: pagina,
          pageSize: STOCK_POR_PAGINA,
        })

        if (numeroSolicitud !== ultimaSolicitudRef.current) return

        setStock(respuesta.items)
        setTotal(respuesta.total)

        const ultimaPagina = Math.max(
          1,
          Math.ceil(respuesta.total / STOCK_POR_PAGINA),
        )
        if (pagina > ultimaPagina) setPagina(ultimaPagina)
      } catch (err) {
        if (numeroSolicitud !== ultimaSolicitudRef.current) return
        setError(err.message || 'No se pudo consultar el stock')
      } finally {
        if (numeroSolicitud === ultimaSolicitudRef.current) setLoading(false)
      }
    }

    cargarStock()

    return () => {
      if (numeroSolicitud === ultimaSolicitudRef.current) {
        ultimaSolicitudRef.current += 1
      }
    }
  }, [depositoId, pagina, search, versionStock])

  useEffect(() => {
    if (!depositoId) return

    const canal = subscribeToStockChanges({
      deposito_id: depositoId,
      onChange: () => {
        setVersionStock((version) => version + 1)
      },
    })

    return () => {
      canal?.unsubscribe?.()
    }
  }, [depositoId])

  const totalPaginas = Math.max(1, Math.ceil(total / STOCK_POR_PAGINA))

  return (
    <div>
      <h1>Stock por depósito</h1>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <label>
          Depósito:{' '}
          <select
            value={depositoId}
            onChange={(e) => {
              setDepositoId(e.target.value)
              setPagina(1)
            }}
          >
            {depositos.map((deposito) => (
              <option key={deposito.id} value={deposito.id}>
                {deposito.nombre}
              </option>
            ))}
          </select>
        </label>

        <label>
          Buscar producto:{' '}
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPagina(1)
            }}
            placeholder="SKU o nombre"
          />
        </label>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading && <p>Cargando...</p>}

      {!loading && (
        <>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Marca</th>
                <th>Físico</th>
                <th>Comprometido</th>
                <th>Disponible</th>
                <th>Unidad</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => (
                <tr key={row.articulo_id ?? row.producto?.id ?? row.id}>
                  <td>{row.articulo_sku ?? row.producto?.sku}</td>
                  <td>{row.articulo_nombre ?? row.producto?.nombre}</td>
                  <td>{row.producto?.categoria?.nombre}</td>
                  <td>{row.producto?.marca?.nombre}</td>
                  <td>{row.fisico}</td>
                  <td>{row.comprometido}</td>
                  <td>{row.disponible}</td>
                  <td>{row.producto?.unidad_medida?.abreviatura}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <nav aria-label="Paginación de stock">
            <button
              type="button"
              disabled={pagina === 1}
              onClick={() => setPagina((actual) => Math.max(1, actual - 1))}
            >
              Anterior
            </button>{' '}
            <span>
              Página {pagina} de {totalPaginas} ({total} productos)
            </span>{' '}
            <button
              type="button"
              disabled={pagina >= totalPaginas}
              onClick={() =>
                setPagina((actual) => Math.min(totalPaginas, actual + 1))
              }
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </div>
  )
}
