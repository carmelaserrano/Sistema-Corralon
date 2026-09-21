import { useEffect, useState } from 'react'
import {
  createNota,
  eliminarNota,
  ESTADOS,
  ETIQUETAS_ESTADO,
  ETIQUETAS_TIPO,
  getNotaById,
  getNotas,
  LETRAS,
  puedeRegistrarNotas,
  TIPOS,
} from '../api/notasProveedorApi'
import {
  getFacturasConSaldoDelProveedor,
  normalizarNumero,
  normalizarSucursal,
} from '../../tesoreria/api/facturasProveedorApi'
import {
  calcularMaximoImputable,
  desvincularNota,
  getImputacionesDeNota,
  vincularNotaFactura,
} from '../../tesoreria/api/imputacionesApi'
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

function formatearFechaHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR')
}

function comprobanteFactura(factura) {
  if (!factura) return '—'
  return `${factura.letra} ${factura.sucursal}-${factura.numero}`
}

function EstadoBadge({ estado }) {
  const mapClasses = {
    disponible: 'estado-badge-activo',
    parcialmente_aplicada: 'estado-badge-advertencia',
    aplicada: 'estado-badge-inactivo',
    anulada: 'estado-badge-inactivo',
  }
  const cls = mapClasses[estado] || 'estado-badge-inactivo'
  return <span className={`estado-badge ${cls}`}>{ETIQUETAS_ESTADO[estado] || estado}</span>
}

const cabeceraInicial = {
  tipo: '',
  proveedor_id: '',
  letra: '',
  sucursal: '',
  numero: '',
  fecha: new Date().toISOString().split('T')[0],
  importe: '',
  factura_id: '',
}

const filtrosIniciales = {
  proveedorId: '',
  tipo: '',
  estado: '',
  fechaDesde: '',
  fechaHasta: '',
}

const vinculoInicial = { factura_id: '', importe: '' }

export default function NotasProveedorPage() {
  const [vista, setVista] = useState('listado') // 'listado', 'nueva', 'detalle'

  // Listado
  const [notas, setNotas] = useState([])
  const [loadingListado, setLoadingListado] = useState(true)
  const [filtros, setFiltros] = useState(filtrosIniciales)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [puedeRegistrar, setPuedeRegistrar] = useState(false)
  const [eliminandoId, setEliminandoId] = useState(null)

  // Datos maestros
  const [proveedores, setProveedores] = useState([])

  // Nueva nota
  const [form, setForm] = useState(cabeceraInicial)
  const [facturasProveedor, setFacturasProveedor] = useState([])
  const [guardando, setGuardando] = useState(false)

  // Detalle + vinculación manual (S2-17)
  const [notaActiva, setNotaActiva] = useState(null)
  const [imputaciones, setImputaciones] = useState([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [facturasVinculables, setFacturasVinculables] = useState([])
  const [vinculo, setVinculo] = useState(vinculoInicial)
  const [vinculando, setVinculando] = useState(false)
  const [desvinculandoId, setDesvinculandoId] = useState(null)

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
      setFacturasProveedor([])
      return
    }
    getFacturasConSaldoDelProveedor(form.proveedor_id)
      .then(setFacturasProveedor)
      .catch((err) => console.error('Error cargando facturas del proveedor', err))
  }, [form.proveedor_id])

  async function cargarPermisos() {
    try {
      setPuedeRegistrar(await puedeRegistrarNotas())
    } catch {
      // Ignorar, asume falso por seguridad
    }
  }

  async function cargarMaestros() {
    try {
      setProveedores(await getProveedores({ estado: 'activo', soloActivos: true }))
    } catch (err) {
      console.error('Error cargando proveedores', err)
    }
  }

  async function cargarDatosListado() {
    try {
      setLoadingListado(true)
      const resp = await getNotas({
        proveedorId: filtros.proveedorId,
        tipo: filtros.tipo,
        estado: filtros.estado,
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
      })
      setNotas(resp.notas)
    } catch (err) {
      setError(err.message || 'Error al cargar las notas de proveedor')
    } finally {
      setLoadingListado(false)
    }
  }

  function cambiarFiltro(e) {
    const { name, value } = e.target
    setFiltros((f) => ({ ...f, [name]: value }))
  }

  async function eliminar(nota) {
    if (!window.confirm(`¿Eliminar la nota ${nota.letra} ${nota.sucursal}-${nota.numero}?`)) return

    try {
      setEliminandoId(nota.id)
      setError('')
      await eliminarNota(nota.id)
      setAviso('Nota eliminada correctamente.')
      await cargarDatosListado()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la nota')
    } finally {
      setEliminandoId(null)
    }
  }

  // ---- DETALLE Y VINCULACIÓN MANUAL (S2-17) ----
  async function verDetalle(id) {
    try {
      setVista('detalle')
      setLoadingDetalle(true)
      setError('')
      setAviso('')
      setVinculo(vinculoInicial)
      await cargarDetalle(id)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el detalle de la nota')
      setVista('listado')
    } finally {
      setLoadingDetalle(false)
    }
  }

  async function cargarDetalle(id) {
    const [nota, imps] = await Promise.all([getNotaById(id), getImputacionesDeNota(id)])
    setNotaActiva(nota)
    setImputaciones(imps)
    setFacturasVinculables(await getFacturasConSaldoDelProveedor(nota.proveedor_id))
  }

  function cambiarVinculo(e) {
    const { name, value } = e.target

    if (name !== 'factura_id') {
      setVinculo((v) => ({ ...v, [name]: value }))
      return
    }

    // Al elegir la factura se precarga el máximo imputable, que es el caso
    // más común (imputar todo lo que se pueda) y deja claro el tope.
    const factura = facturasVinculables.find((f) => f.id === value)
    setVinculo({
      factura_id: value,
      importe: factura ? String(calcularMaximoImputable(notaActiva, factura)) : '',
    })
  }

  async function vincular(e) {
    e.preventDefault()
    try {
      setVinculando(true)
      setError('')
      await vincularNotaFactura({
        notaId: notaActiva.id,
        facturaId: vinculo.factura_id,
        importe: vinculo.importe,
      })
      setAviso('Nota vinculada correctamente.')
      setVinculo(vinculoInicial)
      await cargarDetalle(notaActiva.id)
    } catch (err) {
      setError(err.message || 'No se pudo vincular la nota')
    } finally {
      setVinculando(false)
    }
  }

  async function desvincular(imputacion) {
    if (!window.confirm(`¿Desvincular la nota de la factura ${comprobanteFactura(imputacion.factura)}?`)) {
      return
    }

    try {
      setDesvinculandoId(imputacion.id)
      setError('')
      await desvincularNota(imputacion.id)
      setAviso('Vinculación deshecha. Los saldos volvieron al estado anterior.')
      await cargarDetalle(notaActiva.id)
    } catch (err) {
      setError(err.message || 'No se pudo desvincular la nota')
    } finally {
      setDesvinculandoId(null)
    }
  }

  // ---- ALTA DE NOTA ----
  function cambiarCampo(e) {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  function normalizarAlPerderFoco(e) {
    const { name, value } = e.target
    if (!value) return
    const normalizado = name === 'sucursal' ? normalizarSucursal(value) : normalizarNumero(value)
    setForm((f) => ({ ...f, [name]: normalizado }))
  }

  async function guardarNota(e) {
    e.preventDefault()
    try {
      setGuardando(true)
      setError('')
      const creada = await createNota(form)
      setAviso(
        `${ETIQUETAS_TIPO[creada.tipo]} ${creada.letra} ${creada.sucursal}-${creada.numero} registrada correctamente.`,
      )
      setForm(cabeceraInicial)
      setVista('listado')
      setFiltros(filtrosIniciales)
    } catch (err) {
      setError(err.message || 'Error al guardar la nota')
    } finally {
      setGuardando(false)
    }
  }

  function volverListado() {
    setVista('listado')
    setNotaActiva(null)
    setImputaciones([])
    setError('')
    setAviso('')
  }

  function irANueva() {
    setForm(cabeceraInicial)
    setError('')
    setAviso('')
    setVista('nueva')
  }

  // --- RENDER: NUEVA NOTA ---
  if (vista === 'nueva') {
    return (
      <main>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>Nueva Nota de Crédito/Débito</h1>
          <Button type="button" variant="ghost" onClick={volverListado}>Volver</Button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}

        <form className="stacked-form" onSubmit={guardarNota}>
          <section>
            <h2>Comprobante</h2>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label htmlFor="tipo">Tipo *</label>
                <select id="tipo" name="tipo" value={form.tipo} onChange={cambiarCampo} required>
                  <option value="">Seleccione</option>
                  {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{ETIQUETAS_TIPO[tipo]}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="proveedor_id">Proveedor *</label>
                <select id="proveedor_id" name="proveedor_id" value={form.proveedor_id} onChange={cambiarCampo} required>
                  <option value="">Seleccione un proveedor</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.razon_social} (CUIT {p.cuit})</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="letra">Letra *</label>
                <select id="letra" name="letra" value={form.letra} onChange={cambiarCampo} required>
                  <option value="">Seleccione</option>
                  {LETRAS.map((letra) => <option key={letra} value={letra}>{letra}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="sucursal">Sucursal *</label>
                <input
                  id="sucursal"
                  name="sucursal"
                  value={form.sucursal}
                  onChange={cambiarCampo}
                  onBlur={normalizarAlPerderFoco}
                  maxLength={4}
                  placeholder="0001"
                  required
                />
              </div>

              <div>
                <label htmlFor="numero">Número *</label>
                <input
                  id="numero"
                  name="numero"
                  value={form.numero}
                  onChange={cambiarCampo}
                  onBlur={normalizarAlPerderFoco}
                  maxLength={8}
                  placeholder="00001234"
                  required
                />
              </div>

              <div>
                <label htmlFor="fecha">Fecha *</label>
                <input id="fecha" name="fecha" type="date" value={form.fecha} onChange={cambiarCampo} required />
              </div>

              <div>
                <label htmlFor="importe">Importe *</label>
                <input id="importe" name="importe" type="number" min="0" step="0.01" value={form.importe} onChange={cambiarCampo} required />
              </div>
            </div>
          </section>

          <section style={{ marginTop: '2rem' }}>
            <h2>Vínculo opcional a Factura</h2>
            <div>
              <label htmlFor="factura_id">Factura</label>
              <select
                id="factura_id"
                name="factura_id"
                value={form.factura_id}
                onChange={cambiarCampo}
                disabled={!form.proveedor_id}
              >
                <option value="">Sin vincular (queda Disponible)</option>
                {facturasProveedor.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.letra} {f.sucursal}-{f.numero} — saldo {formatearMoneda(f.saldo_pendiente)}
                  </option>
                ))}
              </select>
              {form.proveedor_id && facturasProveedor.length === 0 && (
                <p>Este proveedor no tiene facturas con saldo pendiente.</p>
              )}
            </div>
          </section>

          <div style={{ marginTop: '2rem' }}>
            <Button type="submit" loading={guardando}>Registrar Nota</Button>
          </div>
        </form>
      </main>
    )
  }

  // --- RENDER: DETALLE (S2-17, CA 1) ---
  if (vista === 'detalle') {
    if (loadingDetalle) return <main><p role="status">Cargando detalle...</p></main>
    if (!notaActiva) return <main><p>Nota no encontrada</p><Button onClick={volverListado}>Volver</Button></main>

    const facturaElegida = facturasVinculables.find((f) => f.id === vinculo.factura_id)
    const maximoImputable = calcularMaximoImputable(notaActiva, facturaElegida)
    const puedeVincular =
      puedeRegistrar && notaActiva.estado !== 'anulada' && Number(notaActiva.saldo_pendiente) > 0

    return (
      <main>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>
            {ETIQUETAS_TIPO[notaActiva.tipo]} {notaActiva.letra} {notaActiva.sucursal}-{notaActiva.numero}
          </h1>
          <Button type="button" onClick={volverListado}>Volver</Button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}
        {aviso && <Feedback tone="success">{aviso}</Feedback>}

        <section>
          <h2>Datos de la Nota</h2>
          <table>
            <tbody>
              <tr><th>Proveedor</th><td>{notaActiva.proveedor?.razon_social}</td></tr>
              <tr><th>Tipo</th><td>{ETIQUETAS_TIPO[notaActiva.tipo]}</td></tr>
              <tr><th>Fecha</th><td>{formatearFechaCorta(notaActiva.fecha)}</td></tr>
              <tr><th>Importe</th><td>{formatearMoneda(notaActiva.importe)}</td></tr>
              <tr><th>Saldo Disponible</th><td>{formatearMoneda(notaActiva.saldo_pendiente)}</td></tr>
              <tr><th>Estado</th><td><EstadoBadge estado={notaActiva.estado} /></td></tr>
            </tbody>
          </table>
        </section>

        <section style={{ marginTop: '2rem' }}>
          <h2>Facturas vinculadas</h2>

          {imputaciones.length === 0 ? (
            <EmptyState
              title="Sin vinculaciones"
              description="Esta nota todavía no está imputada a ninguna factura."
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Factura</th>
                  <th style={{ textAlign: 'right' }}>Importe imputado</th>
                  <th>Vinculada el</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {imputaciones.map((imp) => (
                  <tr key={imp.id}>
                    <td><strong>{comprobanteFactura(imp.factura)}</strong></td>
                    <td style={{ textAlign: 'right' }}>{formatearMoneda(imp.importe_imputado)}</td>
                    <td>{formatearFechaHora(imp.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {imp.factura?.estado === 'pagada' ? (
                        <span>Factura pagada: no se puede desvincular</span>
                      ) : (
                        puedeRegistrar && (
                          <Button
                            type="button"
                            variant="ghost"
                            loading={desvinculandoId === imp.id}
                            onClick={() => desvincular(imp)}
                          >
                            Desvincular
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {puedeVincular && (
          <section style={{ marginTop: '2rem' }}>
            <h2>Vincular a una factura</h2>
            <form onSubmit={vincular} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '260px' }}>
                <label htmlFor="factura_id">Factura con saldo pendiente</label>
                <select id="factura_id" name="factura_id" value={vinculo.factura_id} onChange={cambiarVinculo} required>
                  <option value="">Seleccione una factura</option>
                  {facturasVinculables.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.letra} {f.sucursal}-{f.numero} — saldo {formatearMoneda(f.saldo_pendiente)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="importe_imputado">Importe a imputar</label>
                <input
                  id="importe_imputado"
                  name="importe"
                  type="number"
                  min="0"
                  step="0.01"
                  max={maximoImputable || undefined}
                  value={vinculo.importe}
                  onChange={cambiarVinculo}
                  disabled={!vinculo.factura_id}
                  required
                />
              </div>

              <Button type="submit" loading={vinculando} disabled={!vinculo.factura_id}>
                Vincular
              </Button>
            </form>

            {facturaElegida && (
              <Feedback tone="info">
                Máximo imputable: {formatearMoneda(maximoImputable)}
                {notaActiva.tipo === 'CREDITO'
                  ? ' (el menor entre el saldo de la nota y el de la factura).'
                  : ' (el saldo disponible de la nota; al ser de débito, aumenta el saldo de la factura).'}
              </Feedback>
            )}

            {facturasVinculables.length === 0 && (
              <p>Este proveedor no tiene facturas con saldo pendiente para vincular.</p>
            )}
          </section>
        )}
      </main>
    )
  }

  // --- RENDER: LISTADO ---
  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Notas de Crédito/Débito</h1>
        {puedeRegistrar && (
          <Button type="button" onClick={irANueva}>Nueva Nota</Button>
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
          <label htmlFor="tipo">Tipo</label>
          <select id="tipo" name="tipo" value={filtros.tipo} onChange={cambiarFiltro}>
            <option value="">Todos</option>
            {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{ETIQUETAS_TIPO[tipo]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="estado">Estado</label>
          <select id="estado" name="estado" value={filtros.estado} onChange={cambiarFiltro}>
            <option value="">Todos</option>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>{ETIQUETAS_ESTADO[estado]}</option>
            ))}
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
        {loadingListado && <p role="status">Cargando notas...</p>}

        {!loadingListado && notas.length === 0 && (
          <EmptyState title="No hay notas registradas" description="Todavía no se registró ninguna nota de crédito o débito con estos filtros." />
        )}

        {!loadingListado && notas.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Comprobante</th>
                <th>Proveedor</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th>Factura vinculada</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {notas.map((nota) => (
                <tr key={nota.id}>
                  <td>{ETIQUETAS_TIPO[nota.tipo]}</td>
                  <td><strong>{nota.letra} {nota.sucursal}-{nota.numero}</strong></td>
                  <td>{nota.proveedor?.razon_social}</td>
                  <td>{formatearFechaCorta(nota.fecha)}</td>
                  <td style={{ textAlign: 'right' }}>{formatearMoneda(nota.importe)}</td>
                  <td>
                    {nota.imputaciones?.length
                      ? nota.imputaciones.map((imp) => comprobanteFactura(imp.factura)).join(', ')
                      : '—'}
                  </td>
                  <td><EstadoBadge estado={nota.estado} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <Button type="button" variant="ghost" onClick={() => verDetalle(nota.id)}>
                      Ver detalle
                    </Button>
                    {puedeRegistrar && nota.estado === 'disponible' && (
                      <Button
                        type="button"
                        variant="ghost"
                        loading={eliminandoId === nota.id}
                        onClick={() => eliminar(nota)}
                      >
                        Eliminar
                      </Button>
                    )}
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
