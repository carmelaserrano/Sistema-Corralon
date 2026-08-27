import { useEffect, useState } from 'react'
import {
  getDepositos,
  getStockDisponibles,
  subscribeToStockChanges,
} from '../api/stockApi'

export default function StockPage() {
  const [depositos, setDepositos] = useState([])
  const [depositoId, setDepositoId] = useState('')
  const [search, setSearch] = useState('')
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDepositos()
      .then((data) => {
        setDepositos(data)
        if (data.length > 0 && !depositoId) setDepositoId(data[0].id)
      })
      .catch((err) => setError(err.message || 'No se pudieron cargar los depósitos'))
  }, [depositoId])

  useEffect(() => {
    if (!depositoId) return

    async function cargarStock() {
      setLoading(true)
      setError(null)

      try {
        const respuesta = await getStockDisponibles({
          deposito_id: depositoId,
          search,
          page: 1,
          pageSize: 50,
        })
        setStock(respuesta.items)
      } catch (err) {
        setError(err.message || 'No se pudo consultar el stock')
      } finally {
        setLoading(false)
      }
    }

    cargarStock()

    const canal = subscribeToStockChanges({
      deposito_id: depositoId,
      onChange: () => {
        cargarStock()
      },
    })

    return () => {
      canal?.unsubscribe?.()
    }
  }, [depositoId, search])

  return (
    <div>
      <h1>Stock por depósito</h1>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <label>
          Depósito:{' '}
          <select
            value={depositoId}
            onChange={(e) => setDepositoId(e.target.value)}
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU o nombre"
          />
        </label>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading && <p>Cargando...</p>}

      {!loading && (
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
      )}
    </div>
  )
}
