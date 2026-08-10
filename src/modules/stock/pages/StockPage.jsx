import { useEffect, useState } from 'react'
import { getDepositos, getStockByDeposito } from '../api/stockApi'

export default function StockPage() {
  const [depositos, setDepositos] = useState([])
  const [depositoId, setDepositoId] = useState('')
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDepositos()
      .then((data) => {
        setDepositos(data)
        if (data.length > 0) setDepositoId(data[0].id)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!depositoId) return
    setLoading(true)
    setError(null)
    getStockByDeposito(depositoId)
      .then(setStock)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [depositoId])

  return (
    <div>
      <h1>Stock por depósito</h1>

      <label>
        Depósito:{' '}
        <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
          {depositos.map((deposito) => (
            <option key={deposito.id} value={deposito.id}>
              {deposito.nombre}
            </option>
          ))}
        </select>
      </label>

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
              <th>Cantidad</th>
              <th>Unidad</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((row) => (
              <tr key={row.id}>
                <td>{row.producto?.sku}</td>
                <td>{row.producto?.nombre}</td>
                <td>{row.producto?.categoria?.nombre}</td>
                <td>{row.producto?.marca?.nombre}</td>
                <td>{row.cantidad}</td>
                <td>{row.producto?.unidad_medida?.abreviatura}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
