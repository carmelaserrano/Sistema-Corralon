import { useState, useEffect, useRef } from 'react'
import {
  Building2,
  CheckCircle2,
  PlusCircle,
  Search,
  ShoppingCart,
  User,
} from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import LineasVenta from '../components/LineasVenta'
import {
  listarDepositos,
  buscarClientes,
  registrarVenta,
  calcularTotalesVenta,
} from '../api/ventasApi'

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(valor || 0)
}

function nombreCompletoCliente(c) {
  if (!c) return ''
  if (c.tipo_persona === 'fisica') {
    return `${c.apellido || ''}, ${c.nombre || ''}`.trim()
  }
  return c.razon_social || `${c.nombre || ''} ${c.apellido || ''}`.trim()
}

/**
 * Pantalla principal del Punto de Venta (POS) para registro de venta en mostrador (S3-09 #104).
 *
 * Flujo de carga secuencial (CA-01):
 * 1. Depósito
 * 2. Cliente
 * 3. Artículos (grilla tipo carrito con LineasVenta)
 * 4. Observaciones
 * 5. Confirmar venta (transaccional)
 */
export default function NuevaVentaPage() {
  // 1. Estado de Depósito
  const [depositos, setDepositos] = useState([])
  const [depositoId, setDepositoId] = useState('')
  const [cargandoDepositos, setCargandoDepositos] = useState(true)

  // 2. Estado de Cliente
  const [cliente, setCliente] = useState(null)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clientesResultados, setClientesResultados] = useState([])
  const [buscandoClientes, setBuscandoClientes] = useState(false)
  const [dropdownClienteAbierto, setDropdownClienteAbierto] = useState(false)

  // 3. Estado de Artículos (Líneas)
  const [lineas, setLineas] = useState([])

  // 4. Observaciones
  const [observaciones, setObservaciones] = useState('')

  // 5. Estado general de envío y feedback
  const [guardando, setGuardando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')
  const [ventaConfirmada, setVentaConfirmada] = useState(null)
  const [lineasStockError, setLineasStockError] = useState([])

  const dropdownClienteRef = useRef(null)

  // Cargar depósitos al montar
  useEffect(() => {
    async function cargar() {
      try {
        setCargandoDepositos(true)
        const data = await listarDepositos()
        setDepositos(data)
        if (data.length === 1) {
          setDepositoId(data[0].id)
        }
      } catch (err) {
        setErrorEnvio(err.message || 'Error al cargar depósitos')
      } finally {
        setCargandoDepositos(false)
      }
    }
    cargar()
  }, [])

  // Cerrar dropdown de clientes al hacer click afuera
  useEffect(() => {
    function manejarClickAfuera(e) {
      if (
        dropdownClienteRef.current &&
        !dropdownClienteRef.current.contains(e.target)
      ) {
        setDropdownClienteAbierto(false)
      }
    }
    document.addEventListener('mousedown', manejarClickAfuera)
    return () => document.removeEventListener('mousedown', manejarClickAfuera)
  }, [])

  // Buscar clientes con debounce (CA-02: solo clientes habilitados)
  useEffect(() => {
    if (!busquedaCliente.trim()) {
      setClientesResultados([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        setBuscandoClientes(true)
        const data = await buscarClientes(busquedaCliente)
        setClientesResultados(data)
      } catch {
        setClientesResultados([])
      } finally {
        setBuscandoClientes(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [busquedaCliente])

  // Cambiar depósito: si ya hay líneas, advertir o resetear
  function handleCambiarDeposito(nuevoDepositoId) {
    if (lineas.length > 0) {
      const confirmar = window.confirm(
        'Cambiar el depósito vaciará los artículos seleccionados, ya que el stock depende del depósito. ¿Deseás continuar?',
      )
      if (!confirmar) return
    }
    setDepositoId(nuevoDepositoId)
    setLineas([])
  }

  // Seleccionar cliente
  function handleSeleccionarCliente(c) {
    setCliente(c)
    setBusquedaCliente('')
    setDropdownClienteAbierto(false)
  }

  function handleQuitarCliente() {
    setCliente(null)
    setBusquedaCliente('')
  }

  // Reiniciar formulario para una nueva venta
function handleNuevaVenta() {
  setVentaConfirmada(null)
  setLineas([])
  setObservaciones('')
  setErrorEnvio('')
  setLineasStockError([])
  setCliente(null)
  setBusquedaCliente('')
}

  // Estado de recálculo asíncrono de precios
  const [recalculandoPrecios, setRecalculandoPrecios] = useState(false)

  // Calcular totales de la venta (CA-04)
  const { total: totalVenta, totalArticulos } = calcularTotalesVenta(lineas)

  const lineasConStockInsuficiente = lineas.filter(
    (l) => l.cantidad > l.stock_disponible,
  )
  const lineasSuperanStock = lineasConStockInsuficiente.some((l) => !l.backorder)
  const lineasSinPrecio = lineas.some(
    (l) =>
      l.precio_unitario === null ||
      l.precio_unitario === undefined ||
      Number(l.precio_unitario) <= 0,
  )
  const puedeConfirmar =
    depositoId &&
    cliente &&
    lineas.length > 0 &&
    !lineasSuperanStock &&
    !lineasSinPrecio &&
    !recalculandoPrecios &&
    !guardando

  // Confirmar venta transaccional (CA-06)
  async function handleConfirmarVenta(e) {
    e.preventDefault()
    if (!puedeConfirmar) return

    try {
      setGuardando(true)
      setErrorEnvio('')

      const cabecera = {
        deposito_id: depositoId,
        cliente_id: cliente.id,
        observaciones: observaciones.trim() || null,
      }

      const items = lineas.map((l) => ({
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        descuento_pct: l.descuento_pct || 0,
        autorizacion_descuento_id: l.autorizacion_descuento_id || null,
        backorder: Boolean(l.backorder),
      }))

      const ventaCreada = await registrarVenta(cabecera, items)
      setLineasStockError([])
      setVentaConfirmada(ventaCreada)
    } catch (err) {
      if (err.code === 'STOCK_INSUFICIENTE') {
        setLineasStockError(err.details || [])
      }
      setErrorEnvio(err.message || 'Ocurrió un error al registrar la venta')
    } finally {
      setGuardando(false)
    }
  }

  // Si la venta se confirmó exitosamente, mostrar resumen de éxito (CA-06)
  if (ventaConfirmada) {
    return (
      <div className="page-canvas nueva-venta-page">
        <section
          style={{
            maxWidth: '640px',
            margin: '40px auto',
            textAlign: 'center',
            padding: '32px 24px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              padding: '16px',
              borderRadius: '50%',
              background: '#e7f2ea',
              color: '#306b49',
              marginBottom: '16px',
            }}
          >
            <CheckCircle2 size={48} />
          </div>

          <h2 style={{ marginBottom: '8px' }}>¡Venta registrada con éxito!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            La venta se registró correctamente en estado{' '}
            <strong>Pendiente</strong> y con reserva de stock comprometido.
          </p>

          <div
            style={{
              background: 'var(--surface-subtle)',
              padding: '20px',
              borderRadius: 'var(--radius-lg)',
              textAlign: 'left',
              display: 'grid',
              gap: '12px',
              marginBottom: '28px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Número de venta:</span>
              <strong>#{ventaConfirmada.numero}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Estado:</span>
              <span className="estado-badge estado-badge-principal">
                {ventaConfirmada.estado}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Cliente:</span>
              <span>{nombreCompletoCliente(cliente)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Artículos:</span>
              <span>{totalArticulos} unidades</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '12px',
                fontSize: '18px',
              }}
            >
              <span>Total:</span>
              <strong style={{ color: 'var(--color-brand)' }}>
                {formatearMoneda(ventaConfirmada.total)}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <Button
              type="button"
              variant="primary"
              icon={PlusCircle}
              onClick={handleNuevaVenta}
            >
              Iniciar nueva venta
            </Button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page-canvas nueva-venta-page">
      <header className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1>Nueva venta (POS)</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Registro de venta en mostrador: selección de depósito, cliente y artículos con control de stock.
          </p>
        </div>
      </header>

      {errorEnvio && (
        <div style={{ marginBottom: '16px' }}>
          <Feedback tone="error">{errorEnvio}</Feedback>
        </div>
      )}
      {lineasStockError.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <Feedback tone="error">
            Stock insuficiente al confirmar:
            <ul style={{ margin: '6px 0 0 18px' }}>
              {lineasStockError.map((item) => (
                <li key={item.producto_id}>
                  {lineas.find((linea) => linea.producto_id === item.producto_id)?.nombre || item.producto_id}:{' '}
                  disponible {item.disponible}, solicitado {item.solicitado}
                </li>
              ))}
            </ul>
          </Feedback>
        </div>
      )}

      <form onSubmit={handleConfirmarVenta} className="stacked-form">
        {/* PASO 1: SELECCIÓN DE DEPÓSITO (CA-01) */}
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <Building2 size={20} color="var(--color-brand)" />
            1. Depósito de origen
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 16px' }}>
            El stock y los artículos disponibles se filtran según el depósito seleccionado.
          </p>

          <div style={{ maxWidth: '400px' }}>
            <label htmlFor="select-deposito">
              Depósito
              <select
                id="select-deposito"
                value={depositoId}
                onChange={(e) => handleCambiarDeposito(e.target.value)}
                disabled={cargandoDepositos || guardando}
                required
              >
                <option value="">-- Seleccioná un depósito --</option>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre} {d.localidad ? `(${d.localidad})` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* PASO 2: SELECCIÓN DE CLIENTE (CA-01, CA-02) */}
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <User size={20} color="var(--color-brand)" />
            2. Cliente
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 16px' }}>
            Buscá por nombre, apellido, razón social, DNI o CUIT (solo clientes habilitados).
          </p>

          {!cliente ? (
            <div
              className="buscador-cliente-wrapper"
              ref={dropdownClienteRef}
              style={{ position: 'relative', maxWidth: '500px' }}
            >
              <label htmlFor="input-buscar-cliente">
                Buscar cliente
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="input-buscar-cliente"
                    type="text"
                    value={busquedaCliente}
                    onChange={(e) => {
                      setBusquedaCliente(e.target.value)
                      setDropdownClienteAbierto(true)
                    }}
                    onFocus={() => setDropdownClienteAbierto(true)}
                    placeholder="Escribí nombre, DNI o CUIT…"
                    disabled={guardando}
                    style={{ paddingLeft: '36px' }}
                  />
                  <Search
                    size={18}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      color: 'var(--text-muted)',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </label>

              {dropdownClienteAbierto && busquedaCliente.trim() && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: 'var(--surface-panel)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-2)',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    marginTop: '4px',
                  }}
                >
                  {buscandoClientes && (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Buscando clientes habilitados…
                    </div>
                  )}

                  {!buscandoClientes && clientesResultados.length === 0 && (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No se encontraron clientes habilitados con ese término
                    </div>
                  )}

                  {!buscandoClientes &&
                    clientesResultados.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSeleccionarCliente(c)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderBottom: '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = 'var(--surface-subtle)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = 'transparent')
                        }
                      >
                        <div>
                          <strong>{nombreCompletoCliente(c)}</strong>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {c.tipo_documento}: {c.numero_documento}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '12px' }}>
                          <span className="estado-badge estado-badge-activo">
                            {c.estado}
                          </span>
                          <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                            {c.tipo_cliente?.nombre || 'General'}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                background: 'var(--surface-subtle)',
                borderRadius: 'var(--radius-md)',
                maxWidth: '600px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: '15px' }}>
                    {nombreCompletoCliente(cliente)}
                  </strong>
                  <span className="estado-badge estado-badge-activo" style={{ fontSize: '10px' }}>
                    {cliente.estado}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <span>
                    {cliente.tipo_documento}: {cliente.numero_documento}
                  </span>{' '}
                  |{' '}
                  <span>
                    Tipo: <strong>{cliente.tipo_cliente?.nombre || 'Consumidor Final'}</strong>
                  </span>{' '}
                  |{' '}
                  <span>
                    IVA: {cliente.condicion_iva?.nombre || 'Consumidor Final'}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={handleQuitarCliente}
                disabled={guardando}
                style={{ fontSize: '12px', color: 'var(--color-danger, #b42318)' }}
              >
                Cambiar cliente
              </Button>
            </div>
          )}
        </section>

        {/* PASO 3: ARTÍCULOS / CARRITO (CA-01, CA-03, CA-04, CA-05, CA-07) */}
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <ShoppingCart size={20} color="var(--color-brand)" />
            3. Artículos
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 16px' }}>
            Agregá productos al carrito. Podés modificar cantidades, descuentos manuales o quitar artículos.
          </p>

          {!depositoId ? (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                background: 'var(--surface-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)',
              }}
            >
              Seleccioná primero un depósito arriba para ver el catálogo y stock disponible.
            </div>
          ) : !cliente ? (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                background: 'var(--surface-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)',
              }}
            >
              Seleccioná un cliente para consultar los precios correspondientes a su lista.
            </div>
          ) : (
            <LineasVenta
              depositoId={depositoId}
              clienteId={cliente.id}
              lineas={lineas}
              onLineasChange={setLineas}
              onRecalculandoChange={setRecalculandoPrecios}
              deshabilitado={guardando}
            />
          )}
        </section>

        {/* PASO 4: OBSERVACIONES (CA-01) */}
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '8px' }}>
            4. Observaciones
          </h2>
          <label htmlFor="input-observaciones">
            Observaciones adicionales (opcional)
            <textarea
              id="input-observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Detalles de entrega, instrucciones o notas para el mostrador…"
              disabled={guardando}
              rows={2}
            />
          </label>
        </section>

        {/* PASO 5: RESUMEN Y CONFIRMAR (CA-01, CA-06) */}
        <section
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            background: 'var(--surface-subtle)',
            padding: '20px 24px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Total de artículos: <strong>{totalArticulos}</strong> {totalArticulos === 1 ? 'unidad' : 'unidades'} ({lineas.length} {lineas.length === 1 ? 'ítem' : 'ítems'})
            </div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-brand)', marginTop: '4px' }}>
              Total: {formatearMoneda(totalVenta)}
            </div>
            {lineasSuperanStock && (
              <div style={{ color: 'var(--color-danger, #b42318)', fontSize: '12px', marginTop: '4px' }}>
                Atención: hay artículos que superan el stock disponible en el depósito.
              </div>
            )}
            {lineasConStockInsuficiente.some((l) => l.backorder) && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
                Las líneas marcadas como backorder comprometerán solo lo disponible.
              </div>
            )}
            {lineasSinPrecio && (
              <div style={{ color: 'var(--color-danger, #b42318)', fontSize: '12px', marginTop: '4px' }}>
                Atención: hay artículos sin precio asignado en la lista del cliente.
              </div>
            )}
            {recalculandoPrecios && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
                Recalculando precios en tiempo real…
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              type="button"
              variant="ghost"
              onClick={handleNuevaVenta}
              disabled={guardando || (!depositoId && !cliente && lineas.length === 0)}
            >
              Limpiar
            </Button>

            <Button
              type="submit"
              variant="primary"
              loading={guardando}
              loadingLabel="Confirmando venta…"
              disabled={!puedeConfirmar}
            >
              {recalculandoPrecios ? 'Recalculando precios…' : 'Confirmar venta'}
            </Button>
          </div>
        </section>
      </form>
    </div>
  )
}
