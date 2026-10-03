import { useEffect, useRef, useState } from 'react'

import {
  createRecepcion,
  getRecepciones,
  getOrdenesRecepcion,
  getDetalleOrdenRecepcion,
  puedeRegistrarRecepciones,
  errorCantidadRecepcion,
} from '../api/recepcionesApi'

import { getDepositos } from '../api/depositosApi'

import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import EmptyState from '../../../components/ui/EmptyState'
import RecepcionDetalle from './RecepcionDetalle'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import { useToast } from '../../../components/ui/ToastContext'
import Papa from 'papaparse'
import { PackageCheck, Clock, FileCheck, Warehouse, Download, RefreshCw } from 'lucide-react'

const inicial = {
  orden_compra_id: '',
  deposito_destino_id: '',
  observaciones: '',
  items: [],
}

const moneda = (valor) =>
  Number(valor).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
  })

export default function RecepcionesPage() {
  const { showToast } = useToast()
  const [form, setForm] = useState(inicial)
  const [ordenes, setOrdenes] = useState([])
  const [depositos, setDepositos] = useState([])
  const [listado, setListado] = useState({
    recepciones: [],
    totalPaginas: 1,
    page: 1,
  })
  const [permiso, setPermiso] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [detalleId, setDetalleId] = useState(null)

  const solicitud = useRef(0)
  const guardando = useRef(false)

  const erroresCantidad = form.items.map(errorCantidadRecepcion)
  const cantidadesValidas = erroresCantidad.every((mensaje) => !mensaje)

  const hayCantidadRecibida = form.items.some(
    (item) => Number(item.cantidad) > 0
  )

  const entregaParcial =
    cantidadesValidas &&
    hayCantidadRecibida &&
    form.items.some(
      (item) => Number(item.cantidad) < Number(item.pendiente)
    )

  async function cargarDatos(page = 1) {
    setLoading(true)
    setError('')

    try {
      const [ocs, deps, recepciones, autorizado] = await Promise.all([
        getOrdenesRecepcion(),
        getDepositos(),
        getRecepciones({
          estado: 'confirmada',
          page,
        }),
        puedeRegistrarRecepciones(),
      ])

      setOrdenes(ocs)
      setDepositos(deps)
      setListado(recepciones)
      setPermiso(autorizado)
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar las recepciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  async function seleccionarOrden(id) {
    const version = ++solicitud.current

    const oc = ordenes.find((orden) => orden.id === id)

    setForm({
      ...inicial,
      orden_compra_id: id,
      deposito_destino_id: oc?.deposito_destino_id || '',
    })

    setError('')
    setAviso('')
    setCargandoDetalle(Boolean(id))

    if (!id) {
      setCargandoDetalle(false)
      return
    }

    try {
      const detalle = await getDetalleOrdenRecepcion(id)

      if (version !== solicitud.current) return

      setForm((actual) => ({
        ...actual,
        items: detalle.map((item) => ({
          orden_compra_detalle_id: item.id,
          nombre: item.producto?.nombre || item.producto_id,
          sku: item.producto?.sku,
          pendiente: item.pendiente,
          cantidad: item.pendiente,
          pedido: item.cantidad,
          recibido: item.cantidad_recibida,
          costo: item.precio_unitario,
        })),
      }))
    } catch (err) {
      if (version === solicitud.current) {
        setError(err?.message || 'No se pudo cargar la orden')
      }
    } finally {
      if (version === solicitud.current) {
        setCargandoDetalle(false)
      }
    }
  }

  async function confirmar(event) {
    event.preventDefault()

    if (guardando.current) return

    if (!form.items.length) {
      setError('Seleccioná una orden de compra.')
      return
    }

    if (!cantidadesValidas) {
      setError(erroresCantidad.find(Boolean))
      return
    }

    if (!hayCantidadRecibida) {
      setError('Debe recibir al menos un producto para confirmar.')
      return
    }

    if (!form.deposito_destino_id) {
      setError('Seleccioná un depósito de destino.')
      return
    }

    guardando.current = true
    setEnviando(true)
    setError('')
    setAviso('')

    try {
      const recepcion = await createRecepcion(form)

      setAviso(
        `Recepción N.º ${recepcion.numero} confirmada. Se actualizaron el stock y la orden de compra.`
      )
      showToast({
        message: `Recepción N.º ${recepcion.numero} confirmada`,
        tone: 'success',
      })

      setForm(inicial)

      await cargarDatos()
    } catch (err) {
      const msg = err?.status === 423
        ? 'Hay otra operación en proceso. Esperá unos segundos y volvé a intentar.'
        : err?.message || 'No se pudo confirmar la recepción.'
      setError(msg)
      showToast({ message: msg, tone: 'danger' })
    } finally {
      guardando.current = false
      setEnviando(false)
    }
  }

  function exportarCsv() {
    if (!listado.recepciones.length) {
      showToast({ message: 'No hay recepciones para exportar', tone: 'warning' })
      return
    }
    const datosCsv = listado.recepciones.map((r) => ({
      Número: r.numero,
      'Fecha y hora': new Date(r.confirmado_at || r.created_at).toLocaleString('es-AR'),
      Usuario: r.confirmado_by || r.created_by || '-',
      'Orden de compra': r.orden?.numero || '-',
      Depósito: r.destino?.nombre || '-',
      Estado: r.estado || '-',
      'Estado OC': r.orden?.estado || '-',
    }))
    const csv = Papa.unparse(datosCsv)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.setAttribute('download', `recepciones_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    URL.revokeObjectURL(url)
    showToast({ message: 'Recepciones exportadas en CSV', tone: 'success' })
  }

  if (detalleId) {
    return (
      <RecepcionDetalle
        id={detalleId}
        onVolver={() => setDetalleId(null)}
      />
    )
  }

  const recepcionesCompletas = listado.recepciones.filter((r) => r.orden?.estado === 'recibida').length

  const accionesHeader = [
    {
      label: 'Actualizar',
      icon: RefreshCw,
      onClick: () => {
        cargarDatos(listado.page)
        showToast({ message: 'Listado actualizado', tone: 'info' })
      },
      variant: 'ghost',
      disabled: enviando,
    },
    {
      label: 'Exportar CSV',
      icon: Download,
      onClick: exportarCsv,
      variant: 'secondary',
      disabled: !listado.recepciones.length,
    },
  ]

  return (
    <main className="recepciones-page">
      <PageHeader
        title="Recepción de mercadería"
        kicker="Módulo Stock"
        description="Ingreso físico de productos remitidos por proveedores contra órdenes de compra emitidas."
        actions={accionesHeader}
      />

      <div className="kpi-grid">
        <KpiCard
          label="Recepciones confirmadas"
          value={listado.recepciones.length}
          icon={PackageCheck}
          tone="brand"
          helperText="Registradas en el sistema"
        />
        <KpiCard
          label="OC pendientes"
          value={ordenes.length}
          icon={Clock}
          tone={ordenes.length > 0 ? 'warning' : 'neutral'}
          helperText="A la espera de ingreso"
        />
        <KpiCard
          label="Recepciones completas"
          value={recepcionesCompletas}
          icon={FileCheck}
          tone="success"
          helperText="Sin saldo remanente"
        />
        <KpiCard
          label="Depósitos destino"
          value={depositos.length}
          icon={Warehouse}
          tone="neutral"
          helperText="Ubicaciones de guarda"
        />
      </div>

      {error && <Feedback tone="error">{error}</Feedback>}

      {aviso && <Feedback tone="success">{aviso}</Feedback>}

      {loading ? (
        <Feedback>Cargando recepciones...</Feedback>
      ) : (
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => cargarDatos(listado.page)}
            disabled={enviando}
            style={{ display: 'none' }}
          >
            Actualizar
          </Button>

          {permiso ? (
            <section>
              <h2>Nueva recepción</h2>

              {!ordenes.length ? (
                <EmptyState
                  title="No hay órdenes pendientes de recibir"
                  description="Generá una orden de compra para registrar una recepción."
                />
              ) : (
                <form onSubmit={confirmar} noValidate>
                  <fieldset disabled={enviando}>
                    <label htmlFor="orden_compra_id">
                      Orden de compra
                    </label>

                    <select
                      id="orden_compra_id"
                      value={form.orden_compra_id}
                      onChange={(e) => seleccionarOrden(e.target.value)}
                    >
                      <option value="">Seleccionar orden...</option>

                      {ordenes.map((oc) => (
                        <option key={oc.id} value={oc.id}>
                          OC {oc.numero} — {oc.proveedor?.razon_social} —{' '}
                          {oc.estado === 'pendiente'
                            ? 'Pendiente'
                            : 'Parcial'}
                        </option>
                      ))}
                    </select>

                    <label htmlFor="deposito_destino_id">
                      Depósito de destino
                    </label>

                    <select
                      id="deposito_destino_id"
                      value={form.deposito_destino_id}
                      onChange={(e) =>
                        setForm((actual) => ({
                          ...actual,
                          deposito_destino_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">Seleccionar depósito...</option>

                      {depositos.map((dep) => (
                        <option key={dep.id} value={dep.id}>
                          {dep.nombre}
                        </option>
                      ))}
                    </select>

                    <label htmlFor="observaciones">Observaciones</label>

                    <textarea
                      id="observaciones"
                      value={form.observaciones}
                      onChange={(e) =>
                        setForm((actual) => ({
                          ...actual,
                          observaciones: e.target.value,
                        }))
                      }
                    />

                    {cargandoDetalle ? (
                      <Feedback>
                        Cargando productos de la orden...
                      </Feedback>
                    ) : form.items.length > 0 ? (
                      <table>
                        <thead>
                          <tr>
                            <th>Artículo</th>
                            <th>Pedido en la OC</th>
                            <th>Recibido anteriormente</th>
                            <th>Cantidad esperada</th>
                            <th>Costo unitario</th>
                            <th>Cantidad recibida</th>
                          </tr>
                        </thead>

                        <tbody>
                          {form.items.map((item, indice) => (
                            <tr key={item.orden_compra_detalle_id}>
                              <td>
                                {item.sku} — {item.nombre}
                              </td>

                              <td>{item.pedido}</td>
                              <td>{item.recibido}</td>
                              <td>{item.pendiente}</td>
                              <td>{moneda(item.costo)}</td>

                              <td>
                                <input
                                  aria-label={`Cantidad recibida de ${item.nombre}`}
                                  type="number"
                                  min="0"
                                  max={item.pendiente}
                                  step="1"
                                  aria-invalid={Boolean(
                                    erroresCantidad[indice]
                                  )}
                                  aria-describedby={
                                    erroresCantidad[indice]
                                      ? `error-cantidad-${indice}`
                                      : undefined
                                  }
                                  disabled={item.pendiente === 0}
                                  value={item.cantidad}
                                  onChange={(e) => {
                                    setError('')

                                    setForm((actual) => ({
                                      ...actual,
                                      items: actual.items.map(
                                        (fila, i) =>
                                          i === indice
                                            ? {
                                                ...fila,
                                                cantidad: e.target.value,
                                              }
                                            : fila
                                      ),
                                    }))
                                  }}
                                />

                                {erroresCantidad[indice] && (
                                  <p
                                    id={`error-cantidad-${indice}`}
                                    role="alert"
                                    className="recepcion-cantidad-error"
                                  >
                                    {erroresCantidad[indice]}
                                  </p>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : form.orden_compra_id ? (
                      <Feedback>
                        No se cargaron productos. Volvé a seleccionar la
                        orden para reintentar.
                      </Feedback>
                    ) : null}

                    {!cargandoDetalle &&
                      form.items.length > 0 &&
                      !hayCantidadRecibida && (
                        <Feedback tone="warning">
                          Debe recibir al menos un producto para confirmar.
                        </Feedback>
                      )}

                    {!cargandoDetalle &&
                      entregaParcial && (
                        <Feedback tone="warning">
                          Los productos recibidos son menos que los
                          esperados. Podés confirmar la recepción; la OC
                          quedará Parcial, con cantidades pendientes.
                        </Feedback>
                      )}

                    <p>
                      La fecha, la hora y el número se asignan
                      automáticamente. Al confirmar se actualiza el stock;
                      la recepción no podrá editarse ni eliminarse.
                    </p>

                    <Button
                      type="submit"
                      loading={enviando}
                      loadingLabel="Confirmando..."
                      disabled={
                        cargandoDetalle ||
                        !cantidadesValidas ||
                        !hayCantidadRecibida ||
                        !form.deposito_destino_id
                      }
                    >
                      Confirmar recepción
                    </Button>
                  </fieldset>
                </form>
              )}
            </section>
          ) : (
            <Feedback>
              No tenés permiso para registrar recepciones.
            </Feedback>
          )}

          <section>
            <h2>Recepciones confirmadas</h2>

            <p>
              Verde: OC completa. Amarillo: OC con cantidades pendientes. El
              color se actualiza cuando se completa la orden.
            </p>

            {!listado.recepciones.length ? (
              <EmptyState
                title="No hay recepciones confirmadas"
                description="Las recepciones aparecerán aquí después de confirmarlas."
              />
            ) : (
              <div className="data-table-card">
                <div className="data-table-scroll-container">
                  <table>
                    <thead>
                  <tr>
                    <th>Número</th>
                    <th>Fecha y hora</th>
                    <th>Usuario</th>
                    <th>OC</th>
                    <th>Depósito</th>
                    <th>Productos</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {listado.recepciones.map((rec) => (
                    <tr
                      key={rec.id}
                      className={
                        rec.orden?.estado === 'recibida'
                          ? 'recepcion-fila-completa'
                          : ['pendiente', 'parcialmente_recibida'].includes(
                              rec.orden?.estado
                            )
                          ? 'recepcion-fila-parcial'
                          : undefined
                      }
                    >
                      <td>{rec.numero}</td>

                      <td>
                        {new Date(
                          rec.confirmado_at || rec.created_at
                        ).toLocaleString('es-AR')}
                      </td>

                      <td>{rec.confirmado_by || rec.created_by}</td>
                      <td>{rec.orden?.numero}</td>
                      <td>{rec.destino?.nombre}</td>

                      <td>
                        {(rec.detalle ?? [])
                          .map(
                            (item) =>
                              `${item.producto?.nombre}: ${item.cantidad}`
                          )
                          .join(', ')}
                      </td>

                      <td>
                        Confirmada

                        {rec.orden?.estado === 'recibida' && (
                          <div>
                            <span className="recepcion-etiqueta">
                              OC completa
                            </span>
                          </div>
                        )}

                        {['pendiente', 'parcialmente_recibida'].includes(
                          rec.orden?.estado
                        ) && (
                          <div>
                            <span className="recepcion-etiqueta">
                              OC con pendientes
                            </span>
                          </div>
                        )}
                      </td>

                      <td>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setDetalleId(rec.id)}
                          disabled={enviando}
                        >
                          Ver detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

            {listado.totalPaginas > 1 && (
              <div>
                <Button
                  variant="secondary"
                  disabled={listado.page === 1 || enviando}
                  onClick={() => cargarDatos(listado.page - 1)}
                >
                  Anterior
                </Button>

                <span>
                  {' '}
                  Página {listado.page} de {listado.totalPaginas}{' '}
                </span>

                <Button
                  variant="secondary"
                  disabled={
                    listado.page === listado.totalPaginas || enviando
                  }
                  onClick={() => cargarDatos(listado.page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
