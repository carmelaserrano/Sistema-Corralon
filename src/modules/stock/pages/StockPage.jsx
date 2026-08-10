import { useEffect, useState } from 'react'
import { getBranches, getStockByBranch } from '../api/stockApi'

export default function StockPage() {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getBranches()
      .then((data) => {
        setBranches(data)
        if (data.length > 0) setBranchId(data[0].id)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!branchId) return
    setLoading(true)
    setError(null)
    getStockByBranch(branchId)
      .then(setStock)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [branchId])

  return (
    <div>
      <h1>Stock por sucursal</h1>

      <label>
        Sucursal:{' '}
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
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
              <th>Cantidad</th>
              <th>Unidad</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((row) => (
              <tr key={row.id}>
                <td>{row.product?.sku}</td>
                <td>{row.product?.name}</td>
                <td>{row.product?.category}</td>
                <td>{row.quantity}</td>
                <td>{row.product?.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
