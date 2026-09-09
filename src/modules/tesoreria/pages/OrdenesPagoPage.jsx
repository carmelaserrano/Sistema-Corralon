import { useEffect, useState } from 'react'
import {
  calcularTotales,
  crearOrdenPago,
  getMediosPago,
  getOrdenPagoById,
  getOrdenesPago,
  puedeRegistrarOrdenesPago,
} from '../api/ordenesPagoApi'
import { getFacturasConSaldoDelProveedor } from '../api/facturasProveedorApi'
import { calcularMaximoImputable } from '../api/imputacionesApi'
import {
  getNotasDisponiblesDelProveedor,
  ETIQUETAS_TIPO as ETIQUETAS_TIPO_NOTA,
} from '../../compras/api/notasProveedorApi'
import { getProveedores } from '../../proveedores/api/proveedoresApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

function formatearFechaCorta(isoDateString) {
  if (!isoDateString) return '—'
  const [yyyy, mm, dd] = isoDateString.split('-')
  return `${dd}/${mm}/${yyyy}`
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(valor || 0)
}

function comprobante(doc) {
  if (!doc) return '—'
  return `${doc.letra} ${doc.sucursal}-${doc.numero}`
}

const cabeceraInicial = {
  proveedor_id: '',
  medio_pago_id: '',
  fecha: new Date().toISOString().split('T')[0],
  importe_total: '',
  referencia: '',
  observaciones: '',
}

const filtrosIniciales = {
  proveedorId: '',
  fechaDesde: '',
  fechaHasta: '',
}

export default function OrdenesPagoPage() {
  const [vista, setVista] = useState('listado') // 'listado', 'nueva', 'detalle'

  // Listado
  const [ordenes, setOrdenes] = useState([])
  const [loadingListado, setLoadingListado] = useState(true)
  const [filtros, setFiltros] = useState(filtrosIniciales)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [puedeRegistrar, setPuedeRegistrar] = useState(false)

  // Datos maestros
  const [proveedores, setProveedores] = useState([])
  const [mediosPago, setMediosPago] = useState([])

  // Nueva orden
  const [form, setForm] = useState(cabeceraInicial)
  const [facturas, setFacturas] = useState([])
  const [notasDisponibles, setNotasDisponibles] = useState([])
  const [seleccionFacturas, setSeleccionFacturas] = useState({}) // id -> importe
  const [seleccionNotas, setSeleccionNotas] = useState({}) // id -> { importe, factura_id }
  const [cargandoProveedor, setCargandoProveedor] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Detalle
  const [ordenActiva, setOrdenActiva] = useState(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  useEffect(() => {
    cargarPermisos()
    cargarMaestros()
  }, [])

  useEffect(() => {
    if (vista === 'listado') cargarDatosListado()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, filtros])

  useEffect(() => {
    if (!form.proveedor_id) {
      setFacturas([])
      setNotasDisponibles([])
      setSeleccionFacturas({})
      setSeleccionNotas({})
      return
    }
    cargarComprobantesDelProveedor(form.proveedor_id)
  }, [form.proveedor_id])

  async function cargarPermisos() {
    try {
      setPuedeRegistrar(await puedeRegistrarOrdenesPago())
    } catch {
      // Ignorar, asume falso por seguridad
    }
  }

  async function cargarMaestros() {
    try {
      const [provs, medios] = await Promise.all([
        getProveedores({ estado: 'activo', soloActivos: true }),
        getMediosPago(),
      ])
      setProveedores(provs)
      setMediosPago(medios)
    } catch (err) {
      console.error('Error cargando maestros', err)
    }
  }

  async function cargarComprobantesDelProveedor(proveedorId) {
    try {
      setCargandoProveedor(true)
      setSeleccionFacturas({})
      setSeleccionNotas({})
      const [facts, notas] = await Promise.all([
        getFacturasConSaldoDelProveedor(proveedorId),
        getNotasDisponiblesDelProveedor(proveedorId),
      ])
      setFacturas(facts)
      setNotasDisponibles(notas)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los comprobantes del proveedor')
    } finally {
      setCargandoProveedor(false)
    }
  }

  async function cargarDatosListado() {
    try {
      setLoadingListado(true)
      const resp = await getOrdenesPago(filtros)
      setOrdenes(resp.ordenes)
    } catch (err) {
      setError(err.message || 'Error al cargar las órdenes de pago')
    } finally {
      setLoadingListado(false)
    }
  }

  function cambiarFiltro(e) {
    const { name, value } = e.target
    setFiltros((f) => ({ ...f, [name]: value }))
  }

  async function verDetalle(id) {
    try {
      setVista('detalle')
      setLoadingDetalle(true)
      setError('')
      setAviso('')
      setOrdenActiva(await getOrdenPagoById(id))
    } catch (err) {
      setError(err.message || 'No se pudo cargar el detalle de la orden')
      setVista('listado')
    } finally {
      setLoadingDetalle(false)
    }
  }

  // ---- ARMADO DE LA ORDEN ----
  function cambiarCampo(e) {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  function alternarFactura(factura) {
    setSeleccionFacturas((actual) => {
      const siguiente = { ...actual }
      if (siguiente[factura.id] !== undefined) {
        delete siguiente[factura.id]
        // Las notas imputadas a esa factura dejan de tener destino válido.
        setSeleccionNotas((notas) =>
          Object.fromEntries(
            Object.entries(notas).filter(([, n]) => n.factura_id !== factura.id),
          ),
        )
      } else {
        siguiente[factura.id] = String(factura.saldo_pendiente)
      }
      return siguiente
    })
  }

  function cambiarImporteFactura(facturaId, valor) {
    setSeleccionFacturas((actual) => ({ ...actual, [facturaId]: valor }))
  }

  function alternarNota(nota) {
    setSeleccionNotas((actual) => {
      const siguiente = { ...actual }
      if (siguiente[nota.id]) {
        delete siguiente[nota.id]
        return siguiente
      }

      // Se precarga la primera factura de la orden, que es el caso más común.
      const primeraFacturaId = Object.keys(seleccionFacturas)[0] ?? ''
      const factura = facturas.find((f) => f.id === primeraFacturaId)
      siguiente[nota.id] = {
        factura_id: primeraFacturaId,
        importe: factura ? String(calcularMaximoImputable(nota, factura)) : '',
      }
      return siguiente
    })
  }

  function cambiarNota(notaId, campo, valor) {
    setSeleccionNotas((actual) => ({
      ...actual,
      [notaId]: { ...actual[notaId], [campo]: valor },
    }))
  }

  const facturasElegidas = Object.entries(seleccionFacturas).map(([facturaId, importe]) => ({
    factura_id: facturaId,
    importe,
  }))

  const notasElegidas = Object.entries(seleccionNotas).map(([notaId, datos]) => ({
    nota_id: notaId,
    factura_id: datos.factura_id,
    importe: datos.importe,
    tipo: notasDisponibles.find((n) => n.id === notaId)?.tipo,
  }))

  const totales = calcularTotales(facturasElegidas, notasElegidas)
  const importeOrden = Number(form.importe_total) || 0
  const diferencia = Math.round((importeOrden - totales.subtotal) * 100) / 100

  async function confirmarOrden(e) {
    e.preventDefault()
    try {
      setGuardando(true)
      setError('')
      const creada = await crearOrdenPago({
        ...form,
        facturas: facturasElegidas,
        notas: notasElegidas,
      })
      setAviso(`Orden de pago #${creada.numero} confirmada correctamente.`)
      setForm(cabeceraInicial)
      setSeleccionFacturas({})
      setSeleccionNotas({})
      setVista('listado')
      setFiltros(filtrosIniciales)
    } catch (err) {
      setError(err.message || 'No se pudo confirmar la orden de pago')
    } finally {
      setGuardando(false)
    }
  }

  function volverListado() {
    setVista('listado')
    setOrdenActiva(null)
    setError('')
    setAviso('')
  }

  function irANueva() {
    setForm(cabeceraInicial)
    setSeleccionFacturas({})
    setSeleccionNotas({})
    setError('')
    setAviso('')
    setVista('nueva')
  }

  // --- RENDER: NUEVA ORDEN ---
  if (vista === 'nueva') {
    // CA 1: hasta que no haya proveedor, el resto del formulario no se toca.
    const sinProveedor = !form.proveedor_id

    return (
      <main>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>Nueva Orden de Pago</h1>
          <Button type="button" variant="ghost" onClick={volverListado}>Volver</Button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}

        <form className="stacked-form" onSubmit={confirmarOrden}>
          <section>
            <h2>Proveedor</h2>
            <div style={{ maxWidth: '480px' }}>
              <label htmlFor="proveedor_id">Proveedor *</label>
              <select id="proveedor_id" name="proveedor_id" value={form.proveedor_id} onChange={cambiarCampo} required>
                <option value="">Seleccione un proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.razon_social} (CUIT {p.cuit})</option>
                ))}
              </select>
            </div>
          </section>

          <fieldset disabled={sinProveedor}>
            <section style={{ marginTop: '2rem' }}>
              <h2>Facturas a pagar</h2>

              {cargandoProveedor && <p role="status">Cargando comprobantes...</p>}

              {!cargandoProveedor && !sinProveedor && facturas.length === 0 && (
                <EmptyState
                  title="Sin facturas impagas"
                  description="Este proveedor no tiene facturas con saldo pendiente."
                />
              )}

              {!cargandoProveedor && facturas.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Factura</th>
                      <th>Emisión</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'right' }}>Saldo pendiente</th>
                      <th style={{ textAlign: 'right' }}>A imputar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturas.map((factura) => (
                      <tr key={factura.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Incluir factura ${comprobante(factura)}`}
                            checked={seleccionFacturas[factura.id] !== undefined}
                            onChange={() => alternarFactura(factura)}
                          />
                        </td>
                        <td>
                          <strong>{comprobante(factura)}</strong>
                          {/* CA 3: las notas ya imputadas explican el saldo que se muestra. */}
                          {factura.notas?.length > 0 && (
                            <div>
                              {factura.notas.map((imp) => (
                                <small key={imp.id} style={{ display: 'block' }}>
                                  {ETIQUETAS_TIPO_NOTA[imp.nota.tipo]} {comprobante(imp.nota)} ·{' '}
                                  {formatearMoneda(imp.importe_imputado)} ya aplicado
                                </small>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>{formatearFechaCorta(factura.fecha_emision)}</td>
                        <td style={{ textAlign: 'right' }}>{formatearMoneda(factura.importe_total)}</td>
                        <td style={{ textAlign: 'right' }}>{formatearMoneda(factura.saldo_pendiente)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={factura.saldo_pendiente}
                            aria-label={`Importe a imputar a ${comprobante(factura)}`}
                            value={seleccionFacturas[factura.id] ?? ''}
                            onChange={(e) => cambiarImporteFactura(factura.id, e.target.value)}
                            disabled={seleccionFacturas[factura.id] === undefined}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section style={{ marginTop: '2rem' }}>
              <h2>Notas disponibles</h2>

              {/* CA 7: sin notas, la sección se ve vacía y no bloquea nada. */}
              {!cargandoProveedor && notasDisponibles.length === 0 ? (
                <EmptyState
                  title="Sin notas disponibles"
                  description="Este proveedor no tiene notas de crédito o débito con saldo para aplicar."
                />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Tipo</th>
                      <th>Nota</th>
                      <th style={{ textAlign: 'right' }}>Saldo disponible</th>
                      <th>Se imputa a</th>
                      <th style={{ textAlign: 'right' }}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notasDisponibles.map((nota) => {
                      const elegida = seleccionNotas[nota.id]
                      const facturaDestino = facturas.find((f) => f.id === elegida?.factura_id)
                      return (
                        <tr key={nota.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Aplicar nota ${comprobante(nota)}`}
                              checked={Boolean(elegida)}
                              onChange={() => alternarNota(nota)}
                              disabled={facturasElegidas.length === 0}
                            />
                          </td>
                          <td>{ETIQUETAS_TIPO_NOTA[nota.tipo]}</td>
                          <td><strong>{comprobante(nota)}</strong></td>
                          <td style={{ textAlign: 'right' }}>{formatearMoneda(nota.saldo_pendiente)}</td>
                          <td>
                            <select
                              aria-label={`Factura a la que se imputa ${comprobante(nota)}`}
                              value={elegida?.factura_id ?? ''}
                              onChange={(e) => cambiarNota(nota.id, 'factura_id', e.target.value)}
                              disabled={!elegida}
                            >
                              <option value="">Seleccione</option>
                              {facturasElegidas.map(({ factura_id: facturaId }) => {
                                const factura = facturas.find((f) => f.id === facturaId)
                                return (
                                  <option key={facturaId} value={facturaId}>
                                    {comprobante(factura)}
                                  </option>
                                )
                              })}
                            </select>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              max={facturaDestino ? calcularMaximoImputable(nota, facturaDestino) : undefined}
                              aria-label={`Importe a imputar de ${comprobante(nota)}`}
                              value={elegida?.importe ?? ''}
                              onChange={(e) => cambiarNota(nota.id, 'importe', e.target.value)}
                              disabled={!elegida}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              {facturasElegidas.length === 0 && notasDisponibles.length > 0 && (
                <p>Elegí al menos una factura para poder aplicarle notas.</p>
              )}
            </section>

            <section style={{ marginTop: '2rem' }}>
              <h2>Datos de la orden</h2>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label htmlFor="fecha">Fecha *</label>
                  <input id="fecha" name="fecha" type="date" value={form.fecha} onChange={cambiarCampo} required />
                </div>

                <div>
                  <label htmlFor="medio_pago_id">Medio de pago *</label>
                  <select id="medio_pago_id" name="medio_pago_id" value={form.medio_pago_id} onChange={cambiarCampo} required>
                    <option value="">Seleccione</option>
                    {mediosPago.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="referencia">Referencia</label>
                  <input id="referencia" name="referencia" value={form.referencia} onChange={cambiarCampo} />
                </div>

                <div>
                  <label htmlFor="importe_total">Importe de la orden *</label>
                  <input
                    id="importe_total"
                    name="importe_total"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.importe_total}
                    onChange={cambiarCampo}
                    required
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="observaciones">Observaciones</label>
                  <textarea id="observaciones" name="observaciones" value={form.observaciones} onChange={cambiarCampo} />
                </div>
              </div>
            </section>

            <section style={{ marginTop: '2rem' }}>
              <h2>Totales</h2>
              <table>
                <tbody>
                  <tr>
                    <th>Subtotal facturas</th>
                    <td style={{ textAlign: 'right' }}>{formatearMoneda(totales.subtotal)}</td>
                  </tr>
                  <tr>
                    <th>Notas de crédito (restan)</th>
                    <td style={{ textAlign: 'right' }}>− {formatearMoneda(totales.creditos)}</td>
                  </tr>
                  <tr>
                    <th>Notas de débito (suman)</th>
                    <td style={{ textAlign: 'right' }}>+ {formatearMoneda(totales.debitos)}</td>
                  </tr>
                  <tr>
                    <th>Total a pagar</th>
                    <td style={{ textAlign: 'right' }}><strong>{formatearMoneda(totales.total)}</strong></td>
                  </tr>
                </tbody>
              </table>

              {/* CA 10: el importe de la orden tiene que igualar lo imputado a facturas. */}
              {form.importe_total !== '' && diferencia !== 0 && (
                <Feedback tone="error">
                  El importe de la orden ({formatearMoneda(importeOrden)}) no coincide con el total
                  imputado a facturas ({formatearMoneda(totales.subtotal)}). Diferencia:{' '}
                  {formatearMoneda(diferencia)}.
                </Feedback>
              )}
            </section>

            <div style={{ marginTop: '2rem' }}>
              <Button
                type="submit"
                loading={guardando}
                disabled={facturasElegidas.length === 0 || diferencia !== 0}
              >
                Confirmar Orden de Pago
              </Button>
            </div>
          </fieldset>
        </form>
      </main>
    )
  }

  // --- RENDER: DETALLE (CA 13) ---
  if (vista === 'detalle') {
    if (loadingDetalle) return <main><p role="status">Cargando detalle...</p></main>
    if (!ordenActiva) return <main><p>Orden no encontrada</p><Button onClick={volverListado}>Volver</Button></main>

    return (
      <main>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>Orden de Pago #{ordenActiva.numero}</h1>
          <Button type="button" onClick={volverListado}>Volver</Button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}

        <section>
          <h2>Datos Generales</h2>
          <table>
            <tbody>
              <tr><th>Proveedor</th><td>{ordenActiva.proveedor?.razon_social}</td></tr>
              <tr><th>Fecha</th><td>{formatearFechaCorta(ordenActiva.fecha)}</td></tr>
              <tr><th>Importe</th><td>{formatearMoneda(ordenActiva.importe_total)}</td></tr>
              <tr><th>Medio de pago</th><td>{ordenActiva.medio_pago?.nombre}</td></tr>
              <tr><th>Referencia</th><td>{ordenActiva.referencia || '—'}</td></tr>
              <tr><th>Observaciones</th><td>{ordenActiva.observaciones || '—'}</td></tr>
              <tr><th>Estado</th><td><span className="estado-badge estado-badge-activo">Confirmada</span></td></tr>
            </tbody>
          </table>
        </section>

        <section style={{ marginTop: '2rem' }}>
          <h2>Facturas imputadas</h2>
          <table>
            <thead>
              <tr>
                <th>Factura</th>
                <th style={{ textAlign: 'right' }}>Importe imputado</th>
                <th style={{ textAlign: 'right' }}>Saldo actual</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ordenActiva.facturas.map((imp) => (
                <tr key={imp.id}>
                  <td><strong>{comprobante(imp.factura)}</strong></td>
                  <td style={{ textAlign: 'right' }}>{formatearMoneda(imp.importe_imputado)}</td>
                  <td style={{ textAlign: 'right' }}>{formatearMoneda(imp.factura?.saldo_pendiente)}</td>
                  <td>{imp.factura?.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ marginTop: '2rem' }}>
          <h2>Notas imputadas</h2>
          {ordenActiva.notas.length === 0 ? (
            <EmptyState
              title="Sin notas"
              description="Esta orden de pago no aplicó notas de crédito ni de débito."
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Nota</th>
                  <th>Aplicada a</th>
                  <th style={{ textAlign: 'right' }}>Importe imputado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {ordenActiva.notas.map((imp) => (
                  <tr key={imp.id}>
                    <td>{ETIQUETAS_TIPO_NOTA[imp.nota?.tipo]}</td>
                    <td><strong>{comprobante(imp.nota)}</strong></td>
                    <td>{comprobante(imp.factura)}</td>
                    <td style={{ textAlign: 'right' }}>{formatearMoneda(imp.importe_imputado)}</td>
                    <td>{imp.nota?.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    )
  }

  // --- RENDER: LISTADO (CA 13) ---
  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Órdenes de Pago</h1>
        {puedeRegistrar && (
          <Button type="button" onClick={irANueva}>Nueva Orden de Pago</Button>
        )}
      </header>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}

      <section style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="proveedorId">Proveedor</label>
          <select id="proveedorId" name="proveedorId" value={filtros.proveedorId} onChange={cambiarFiltro}>
            <option value="">Todos</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fechaDesde">Desde</label>
          <input id="fechaDesde" name="fechaDesde" type="date" value={filtros.fechaDesde} onChange={cambiarFiltro} />
        </div>
        <div>
          <label htmlFor="fechaHasta">Hasta</label>
          <input id="fechaHasta" name="fechaHasta" type="date" value={filtros.fechaHasta} onChange={cambiarFiltro} min={filtros.fechaDesde} />
        </div>
      </section>

      <section>
        {loadingListado && <p role="status">Cargando órdenes de pago...</p>}

        {!loadingListado && ordenes.length === 0 && (
          <EmptyState
            title="No hay órdenes de pago"
            description="Todavía no se registró ninguna orden de pago con estos filtros."
          />
        )}

        {!loadingListado && ordenes.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th>Medio de pago</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((orden) => (
                <tr key={orden.id}>
                  <td><strong>#{orden.numero}</strong></td>
                  <td>{formatearFechaCorta(orden.fecha)}</td>
                  <td>{orden.proveedor?.razon_social}</td>
                  <td style={{ textAlign: 'right' }}>{formatearMoneda(orden.importe_total)}</td>
                  <td>{orden.medio_pago?.nombre}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Button type="button" variant="ghost" onClick={() => verDetalle(orden.id)}>
                      Ver detalle
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
