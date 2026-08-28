import { useEffect, useState } from 'react'
import { atenderAlertaStock, getAlertasStock } from '../api/alertasStockApi'

export default function AlertasStockPage() {
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [atendiendoId, setAtendiendoId] = useState(null)

  function cargarAlertas() {
    setLoading(true)
    setError('')

    return getAlertasStock({ estado: 'activa' })
      .then(setAlertas)
      .catch((err) =>
        setError(err.message || 'No se pudieron cargar las alertas de stock'),
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    cargarAlertas()
  }, [])

  async function atender(id) {
    try {
      setAtendiendoId(id)
      setError('')
      setAviso('')

      await atenderAlertaStock(id)

      setAviso('Alerta atendida')
      await cargarAlertas()
    } catch (err) {
      setError(err.message || 'No se pudo atender la alerta')
    } finally {
      setAtendiendoId(null)
    }
  }

  return (
    <main>
      <h1>Alertas de stock mínimo</h1>

      {error && <p role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      {loading && <p>Cargando alertas...</p>}

      {!loading && alertas.length === 0 && (
        <p>No hay alertas de stock mínimo activas.</p>
      )}

      {!loading && alertas.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Depósito</th>
              <th>Stock disponible</th>
              <th>Stock mínimo</th>
              <th>Generada</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {alertas.map((alerta) => (
              <tr className="alert-row" key={alerta.id}>
                <td>
                  {alerta.producto?.sku
                    ? `${alerta.producto.sku} - ${alerta.producto.nombre}`
                    : alerta.producto?.nombre || '-'}
                </td>

                <td>{alerta.deposito?.nombre || '-'}</td>
                <td>{alerta.stock_disponible}</td>
                <td>{alerta.stock_minimo}</td>
                <td>{new Date(alerta.generada_en).toLocaleString()}</td>
                <td>{alerta.estado}</td>

                <td>
                  <button
                    type="button"
                    disabled={atendiendoId === alerta.id}
                    onClick={() => atender(alerta.id)}
                  >
                    {atendiendoId === alerta.id ? 'Atendiendo...' : 'Atender'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
