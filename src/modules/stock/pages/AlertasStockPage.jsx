import { useEffect, useState } from 'react'
import { atenderAlertaStock, getAlertasStock } from '../api/alertasStockApi'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { useToast } from '../../../components/ui/ToastContext'
import Papa from 'papaparse'
import { AlertTriangle, ShieldAlert, Warehouse, CheckCircle2, Download, RefreshCw } from 'lucide-react'

export default function AlertasStockPage() {
  const { showToast } = useToast()
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
      showToast({ message: 'Alerta de stock atendida exitosamente', tone: 'success' })
      await cargarAlertas()
    } catch (err) {
      setError(err.message || 'No se pudo atender la alerta')
      showToast({ message: err.message || 'Error al atender la alerta', tone: 'danger' })
    } finally {
      setAtendiendoId(null)
    }
  }

  function exportarCsv() {
    if (alertas.length === 0) {
      showToast({ message: 'No hay alertas para exportar', tone: 'warning' })
      return
    }
    const datosCsv = alertas.map((a) => ({
      'Código / SKU': a.producto?.sku || '',
      Artículo: a.producto?.nombre || '',
      Depósito: a.deposito?.nombre || '',
      'Stock disponible': a.stock_disponible,
      'Stock mínimo': a.stock_minimo,
      Generada: a.generada_en ? new Date(a.generada_en).toLocaleString('es-AR') : '',
      Estado: a.estado || '',
    }))
    const csv = Papa.unparse(datosCsv)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.setAttribute('download', `alertas_stock_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    URL.revokeObjectURL(url)
    showToast({ message: 'Alertas de stock exportadas en CSV', tone: 'success' })
  }

  const criticosSinStock = alertas.filter((a) => Number(a.stock_disponible) <= 0).length
  const depositosAfectados = new Set(alertas.map((a) => a.deposito?.nombre).filter(Boolean)).size

  return (
    <main>
      <PageHeader
        title="Alertas de stock mínimo"
        kicker="Módulo Stock"
        description="Supervisión en tiempo real de artículos con inventario igual o inferior al umbral mínimo definido."
        actions={[
          {
            label: 'Actualizar',
            icon: RefreshCw,
            onClick: () => {
              cargarAlertas()
              showToast({ message: 'Alertas actualizadas', tone: 'info' })
            },
            variant: 'ghost',
          },
          {
            label: 'Exportar CSV',
            icon: Download,
            onClick: exportarCsv,
            variant: 'secondary',
            disabled: alertas.length === 0,
          },
        ]}
      />

      <div className="kpi-grid">
        <KpiCard
          label="Alertas activas"
          value={alertas.length}
          icon={AlertTriangle}
          tone={alertas.length > 0 ? 'warning' : 'success'}
          helperText="Requieren intervención"
        />
        <KpiCard
          label="Agotados (Stock 0)"
          value={criticosSinStock}
          icon={ShieldAlert}
          tone={criticosSinStock > 0 ? 'danger' : 'neutral'}
          helperText="Quiebre inmediato"
        />
        <KpiCard
          label="Depósitos afectados"
          value={depositosAfectados}
          icon={Warehouse}
          tone="info"
          helperText="Puntos de almacenamiento"
        />
        <KpiCard
          label="Estado general"
          value={alertas.length === 0 ? 'Óptimo' : 'Atención'}
          icon={CheckCircle2}
          tone={alertas.length === 0 ? 'success' : 'warning'}
          helperText="Salud de existencias"
        />
      </div>

      {error && <p role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      {loading && <p>Cargando alertas...</p>}

      {!loading && alertas.length === 0 && (
        <p>No hay alertas de stock mínimo activas.</p>
      )}

      {!loading && alertas.length > 0 && (
        <div className="data-table-card">
          <div className="data-table-scroll-container">
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
          </div>
        </div>
      )}
    </main>
  )
}
