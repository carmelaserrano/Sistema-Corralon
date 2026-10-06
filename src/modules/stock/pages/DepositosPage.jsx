import { useEffect, useState } from 'react'
import {
  createDeposito,
  deleteDeposito,
  getDepositos,
  getTiposDeposito,
  updateDeposito,
} from '../api/depositosApi'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { useToast } from '../../../components/ui/ToastContext'
import Papa from 'papaparse'
import { Warehouse, Layers, Boxes, MapPin, Download, RefreshCw } from 'lucide-react'

const depositoInicial = {
  nombre: '',
  direccion: '',
  localidad: '',
  tipo_deposito_id: '',
  capacidad_maxima: '',
}

function DepositosPage() {
  const { showToast } = useToast()
  const [depositos, setDepositos] = useState([])
  const [tipos, setTipos] = useState([])
  const [form, setForm] = useState(depositoInicial)
  const [editandoId, setEditandoId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function cargarDatos() {
    try {
      setLoading(true)
      setError('')

      const [depositosData, tiposData] = await Promise.all([
        getDepositos(),
        getTiposDeposito(),
      ])

      setDepositos(depositosData)
      setTipos(tiposData)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los depósitos')
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

  function limpiarFormulario() {
    setForm(depositoInicial)
    setEditandoId(null)
    setError('')
  }

  function comenzarEdicion(deposito) {
    setForm({
      nombre: deposito.nombre,
      direccion: deposito.direccion,
      localidad: deposito.localidad,
      tipo_deposito_id: deposito.tipo_deposito_id,
      capacidad_maxima: deposito.capacidad_maxima,
    })

    setEditandoId(deposito.id)
    setError('')
  }

  async function guardarDeposito(event) {
    event.preventDefault()

    try {
      setError('')

      if (editandoId) {
        await updateDeposito(editandoId, form)
      } else {
        await createDeposito(form)
      }

      limpiarFormulario()
      await cargarDatos()
      showToast({
        message: editandoId ? 'Depósito actualizado exitosamente' : 'Depósito creado exitosamente',
        tone: 'success',
      })
    } catch (err) {
      setError(err.message || 'No se pudo guardar el depósito')
      showToast({ message: err.message || 'Error al guardar depósito', tone: 'danger' })
    }
  }

  async function eliminarDeposito(deposito) {
    const confirmado = window.confirm(
      `¿Seguro que querés eliminar "${deposito.nombre}"?`,
    )

    if (!confirmado) return

    try {
      setError('')
      await deleteDeposito(deposito.id)
      await cargarDatos()
      showToast({ message: `Depósito "${deposito.nombre}" eliminado`, tone: 'info' })
    } catch (err) {
      const mensaje = err.message || 'No se pudo eliminar el depósito'

      setError(mensaje)
      showToast({ message: mensaje, tone: 'danger' })
      window.alert(mensaje)
    }

  }

  function exportarCsv() {
    if (depositos.length === 0) {
      showToast({ message: 'No hay depósitos para exportar', tone: 'warning' })
      return
    }
    const datosCsv = depositos.map((d) => ({
      Nombre: d.nombre || '',
      Dirección: d.direccion || '',
      Localidad: d.localidad || '',
      Tipo: d.tipo?.nombre || '-',
      'Capacidad máxima': d.capacidad_maxima ?? '',
    }))
    const csv = Papa.unparse(datosCsv)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.setAttribute('download', `depositos_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    URL.revokeObjectURL(url)
    showToast({ message: 'Depósitos exportados en CSV', tone: 'success' })
  }

  if (loading) {
    return <p>Cargando depósitos...</p>
  }

  const capacidadTotal = depositos.reduce((acc, d) => acc + (Number(d.capacidad_maxima) || 0), 0)
  const localidadesCubiertas = new Set(depositos.map((d) => d.localidad).filter(Boolean)).size

  return (
    <main>
      <PageHeader
        title="Gestión de depósitos"
        kicker="Módulo Stock"
        description="Administración de depósitos físicos, capacidades máximas de almacenamiento y sucursales."
        actions={[
          {
            label: 'Actualizar',
            icon: RefreshCw,
            onClick: () => {
              cargarDatos()
              showToast({ message: 'Depósitos actualizados', tone: 'info' })
            },
            variant: 'ghost',
          },
          {
            label: 'Exportar CSV',
            icon: Download,
            onClick: exportarCsv,
            variant: 'secondary',
            disabled: depositos.length === 0,
          },
        ]}
      />

      <div className="kpi-grid">
        <KpiCard
          label="Depósitos activos"
          value={depositos.length}
          icon={Warehouse}
          tone="brand"
          helperText="Almacenes registrados"
        />
        <KpiCard
          label="Capacidad total"
          value={capacidadTotal.toLocaleString('es-AR')}
          icon={Layers}
          tone="info"
          helperText="Unidades de acopio"
        />
        <KpiCard
          label="Tipos definidos"
          value={tipos.length}
          icon={Boxes}
          tone="neutral"
          helperText="Clasificación logística"
        />
        <KpiCard
          label="Localidades"
          value={localidadesCubiertas}
          icon={MapPin}
          tone="success"
          helperText="Cobertura geográfica"
        />
      </div>

      {error && <p role="alert">{error}</p>}

      <section>
        <h2>{editandoId ? 'Editar depósito' : 'Nuevo depósito'}</h2>

        <form onSubmit={guardarDeposito}>
          <div>
            <label htmlFor="nombre">Nombre</label>
            <input
              id="nombre"
              name="nombre"
              value={form.nombre}
              onChange={manejarCambio}
              required
            />
          </div>

          <div>
            <label htmlFor="direccion">Dirección</label>
            <input
              id="direccion"
              name="direccion"
              value={form.direccion}
              onChange={manejarCambio}
              required
            />
          </div>

          <div>
            <label htmlFor="localidad">Localidad</label>
            <input
              id="localidad"
              name="localidad"
              value={form.localidad}
              onChange={manejarCambio}
              required
            />
          </div>

          <div>
            <label htmlFor="tipo_deposito_id">Tipo</label>
            <select
              id="tipo_deposito_id"
              name="tipo_deposito_id"
              value={form.tipo_deposito_id}
              onChange={manejarCambio}
              required
            >
              <option value="">Seleccionar...</option>

              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="capacidad_maxima">Capacidad máxima</label>
            <input
              id="capacidad_maxima"
              name="capacidad_maxima"
              type="number"
              min="1"
              value={form.capacidad_maxima}
              onChange={manejarCambio}
              required
            />
          </div>

          <button type="submit">
            {editandoId ? 'Guardar cambios' : 'Crear depósito'}
          </button>

          {editandoId && (
            <button type="button" onClick={limpiarFormulario}>
              Cancelar
            </button>
          )}
        </form>
      </section>

      <section>
        <h2>Depósitos registrados</h2>

        {depositos.length === 0 ? (
          <p>No hay depósitos registrados.</p>
        ) : (
          <div className="data-table-card">
            <div className="data-table-scroll-container">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Dirección</th>
                    <th>Localidad</th>
                    <th>Tipo</th>
                    <th>Capacidad máxima</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {depositos.map((deposito) => (
                    <tr key={deposito.id}>
                      <td>{deposito.nombre}</td>
                      <td>{deposito.direccion}</td>
                      <td>{deposito.localidad}</td>
                      <td>{deposito.tipo?.nombre || '-'}</td>
                      <td>{deposito.capacidad_maxima}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => comenzarEdicion(deposito)}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => eliminarDeposito(deposito)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default DepositosPage