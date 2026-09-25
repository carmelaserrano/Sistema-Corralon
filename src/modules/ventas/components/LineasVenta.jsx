import { useState, useEffect, useRef } from 'react'
import { Search, Trash2 } from 'lucide-react'
import Button from '../../../components/ui/Button'
import ModalAutorizacionDescuento from './ModalAutorizacionDescuento'
import {
  buscarArticulos,
  calcularPrecioVenta,
  validarDescuentoManual,
  agregarArticuloALineas,
} from '../api/ventasApi'

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(valor || 0)
}

function redondear(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100
}

/**
 * Grilla interactiva de artículos tipo carrito para la pantalla de venta POS.
 *
 * @param {Object} props
 * @param {string} props.depositoId UUID del depósito seleccionado.
 * @param {string} props.clienteId UUID del cliente seleccionado.
 * @param {Array<Object>} props.lineas Lista de artículos agregados a la venta.
 * @param {(lineas: Array<Object>) => void} props.onLineasChange Callback al actualizar líneas.
 * @param {(recalculando: boolean) => void} [props.onRecalculandoChange] Callback de estado de recálculo.
 * @param {boolean} [props.deshabilitado=false] Si la carga está bloqueada.
 */
export default function LineasVenta({
  depositoId,
  clienteId,
  lineas,
  onLineasChange,
  onRecalculandoChange,
  deshabilitado = false,
}) {
  const [busqueda, setBusqueda] = useState('')
  const [articulosResultados, setArticulosResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [dropdownAbierto, setDropdownAbierto] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState('')
  const [modalAut, setModalAut] = useState({
    abierto: false,
    productoId: null,
    porcentaje: 0,
    descuentoAnterior: 0,
  })

  const dropdownRef = useRef(null)

  // Referencias para evitar race conditions y desfasajes por cierres (closures)
  const lineasRef = useRef(lineas)
  lineasRef.current = lineas
  const clienteIdRef = useRef(clienteId)
  clienteIdRef.current = clienteId
  const depositoIdRef = useRef(depositoId)
  depositoIdRef.current = depositoId

  const solicitudesCantidadRef = useRef({}) // producto_id -> último requestId
  const recalculosPendientesRef = useRef(new Set())

  function notificarRecalculo(productoId, enProgreso) {
    if (enProgreso) {
      recalculosPendientesRef.current.add(productoId)
    } else {
      recalculosPendientesRef.current.delete(productoId)
    }
    onRecalculandoChange?.(recalculosPendientesRef.current.size > 0)
  }

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    function manejarClickAfuera(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownAbierto(false)
      }
    }
    document.addEventListener('mousedown', manejarClickAfuera)
    return () => document.removeEventListener('mousedown', manejarClickAfuera)
  }, [])

  // Buscar artículos con debounce al escribir (CA-03)
  useEffect(() => {
    if (!depositoId) {
      setArticulosResultados([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        setBuscando(true)
        setErrorBusqueda('')
        const data = await buscarArticulos(depositoId, busqueda, clienteId)
        setArticulosResultados(data)
      } catch (err) {
        setErrorBusqueda(err.message || 'Error al buscar artículos')
        setArticulosResultados([])
      } finally {
        setBuscando(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [depositoId, busqueda, clienteId])

  // Recalcular precios de las líneas si cambia el cliente (CA-04)
  useEffect(() => {
    if (!lineas.length) return

    let activo = true
    async function actualizarPreciosPorCliente() {
      try {
        onRecalculandoChange?.(true)
        const lineasActualizadas = await Promise.all(
          lineasRef.current.map(async (linea) => {
            const precio = await calcularPrecioVenta(
              linea.producto_id,
              clienteId,
              linea.cantidad,
            )
            const precioFinal = precio !== null ? precio : linea.precio_unitario
            const subtotal = redondear(
              linea.cantidad * precioFinal * (1 - (linea.descuento_pct || 0) / 100),
            )
            return {
              ...linea,
              precio_unitario: precioFinal,
              subtotal,
            }
          }),
        )
        if (activo) {
          onLineasChange(lineasActualizadas)
        }
      } finally {
        if (activo) {
          onRecalculandoChange?.(false)
        }
      }
    }

    actualizarPreciosPorCliente()

    return () => {
      activo = false
      onRecalculandoChange?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  // Agregar artículo al carrito (CA-07: suma cantidad si ya existe)
  async function agregarArticulo(articulo) {
    setErrorBusqueda('')
    const productoId = articulo.producto_id || articulo.id
    let precio = articulo.precio_unitario

    try {
      const p = await calcularPrecioVenta(productoId, clienteId, 1)
      if (p !== null) precio = p
    } catch {
      // Mantiene precio existente
    }

    const nuevasLineas = agregarArticuloALineas(lineas, articulo, 1, precio)
    onLineasChange(nuevasLineas)

    setBusqueda('')
    setDropdownAbierto(false)
  }

  // Modificar cantidad en tiempo real (CA-04) con protección contra race conditions
  async function handleCambiarCantidad(productoId, valor) {
    const cantidadNum = Math.max(1, Number(valor) || 1)
    const lineaActual = lineasRef.current.find((l) => l.producto_id === productoId)
    if (!lineaActual) return

    // 1. Actualización síncrona inmediata en UI
    const subtotalInmediato = redondear(
      cantidadNum * lineaActual.precio_unitario * (1 - (lineaActual.descuento_pct || 0) / 100),
    )
    const lineasInmediatas = lineasRef.current.map((l) =>
      l.producto_id === productoId
        ? { ...l, cantidad: cantidadNum, subtotal: subtotalInmediato }
        : l,
    )
    onLineasChange(lineasInmediatas)

    // 2. Consulta asíncrona de precio con número de secuencia por producto
    const reqId = (solicitudesCantidadRef.current[productoId] || 0) + 1
    solicitudesCantidadRef.current[productoId] = reqId
    notificarRecalculo(productoId, true)

    const targetClienteId = clienteIdRef.current
    const targetDepositoId = depositoIdRef.current

    try {
      const precioCalculado = await calcularPrecioVenta(
        productoId,
        targetClienteId,
        cantidadNum,
      )

      // Si llegó una respuesta posterior para este producto, descartar esta
      if (solicitudesCantidadRef.current[productoId] !== reqId) return

      // Si el cliente o depósito cambiaron, descartar
      if (
        clienteIdRef.current !== targetClienteId ||
        depositoIdRef.current !== targetDepositoId
      ) {
        return
      }

      // Si el producto fue quitado del carrito mientras la petición estaba en vuelo, descartar
      const lineaVigente = lineasRef.current.find((l) => l.producto_id === productoId)
      if (!lineaVigente) return

      const nuevoPrecio = precioCalculado !== null ? precioCalculado : lineaVigente.precio_unitario
      const subtotalFinal = redondear(
        lineaVigente.cantidad * nuevoPrecio * (1 - (lineaVigente.descuento_pct || 0) / 100),
      )

      const lineasFinales = lineasRef.current.map((l) =>
        l.producto_id === productoId
          ? { ...l, precio_unitario: nuevoPrecio, subtotal: subtotalFinal }
          : l,
      )
      onLineasChange(lineasFinales)
    } catch {
      // Mantiene precio actual si falla la consulta
    } finally {
      if (solicitudesCantidadRef.current[productoId] === reqId) {
        notificarRecalculo(productoId, false)
      }
    }
  }

  // Modificar descuento manual (CA-05)
  async function handleCambiarDescuento(productoId, valor) {
    const desc = Math.min(100, Math.max(0, Number(valor) || 0))
    const lineaActual = lineasRef.current.find((l) => l.producto_id === productoId)
    if (!lineaActual) return

    if (desc === 0) {
      const subtotal = redondear(lineaActual.cantidad * lineaActual.precio_unitario)
      const nuevasLineas = lineasRef.current.map((l) =>
        l.producto_id === productoId
          ? { ...l, descuento_pct: 0, autorizacion_descuento_id: null, subtotal }
          : l,
      )
      onLineasChange(nuevasLineas)
      return
    }

    try {
      const validacion = await validarDescuentoManual(desc)
      if (validacion?.requiere_autorizacion) {
        // Abrir modal de autorización
        setModalAut({
          abierto: true,
          productoId,
          porcentaje: desc,
          descuentoAnterior: lineaActual.descuento_pct || 0,
        })
      } else {
        // Aplica directamente sin autorización
        const subtotal = redondear(
          lineaActual.cantidad * lineaActual.precio_unitario * (1 - desc / 100),
        )
        const nuevasLineas = lineasRef.current.map((l) =>
          l.producto_id === productoId
            ? { ...l, descuento_pct: desc, autorizacion_descuento_id: null, subtotal }
            : l,
        )
        onLineasChange(nuevasLineas)
      }
    } catch (err) {
      setErrorBusqueda(err.message || 'Error al validar descuento')
    }
  }

  // Confirmar autorización de descuento (CA-05)
  function handleDescuentoAutorizado(autorizacionId) {
    const { productoId, porcentaje } = modalAut
    if (!productoId) return

    const lineaActual = lineasRef.current.find((l) => l.producto_id === productoId)
    if (!lineaActual) return

    const subtotal = redondear(
      lineaActual.cantidad * lineaActual.precio_unitario * (1 - porcentaje / 100),
    )

    const nuevasLineas = lineasRef.current.map((l) =>
      l.producto_id === productoId
        ? {
            ...l,
            descuento_pct: porcentaje,
            autorizacion_descuento_id: autorizacionId,
            subtotal,
          }
        : l,
    )
    onLineasChange(nuevasLineas)

    setModalAut({ abierto: false, productoId: null, porcentaje: 0, descuentoAnterior: 0 })
  }

  function handleCancelarAutorizacion() {
    setModalAut({ abierto: false, productoId: null, porcentaje: 0, descuentoAnterior: 0 })
  }

  // Quitar línea del carrito (CA-06)
  function handleQuitarLinea(productoId) {
    // Si había una petición en curso para este producto, invalidarla
    solicitudesCantidadRef.current[productoId] =
      (solicitudesCantidadRef.current[productoId] || 0) + 1
    notificarRecalculo(productoId, false)

    const nuevasLineas = lineasRef.current.filter((l) => l.producto_id !== productoId)
    onLineasChange(nuevasLineas)
  }

  function handleCambiarBackorder(productoId, activo) {
    onLineasChange(
      lineasRef.current.map((linea) =>
        linea.producto_id === productoId
          ? { ...linea, backorder: activo }
          : linea,
      ),
    )
  }

  return (
    <div className="lineas-venta-contenedor">
      {/* Buscador de artículos con autocompletado */}
      <div className="buscador-articulos-wrapper" ref={dropdownRef} style={{ position: 'relative' }}>
        <label htmlFor="input-buscar-articulo">
          Agregar artículo
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              id="input-buscar-articulo"
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setDropdownAbierto(true)
              }}
              onFocus={() => setDropdownAbierto(true)}
              placeholder="Buscar artículo por nombre, SKU o código de barras…"
              disabled={deshabilitado || !depositoId}
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

        {errorBusqueda && <p className="feedback feedback-error">{errorBusqueda}</p>}

        {dropdownAbierto && depositoId && (
          <div
            className="articulos-dropdown"
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
            {buscando && (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Buscando en catálogo…
              </div>
            )}

            {!buscando && articulosResultados.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                {busqueda ? 'No se encontraron artículos con stock en este depósito' : 'No hay artículos con stock disponible'}
              </div>
            )}

            {!buscando &&
              articulosResultados.map((art) => (
                <div
                  key={art.id}
                  onClick={() => agregarArticulo(art)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div>
                    <strong>{art.nombre}</strong>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      SKU: {art.sku} | Unidad: {art.unidad_medida}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '600', color: 'var(--color-brand)' }}>
                      {art.precio_unitario !== null ? formatearMoneda(art.precio_unitario) : 'Sin precio'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Disponible: <strong>{art.disponible}</strong> {art.unidad_medida}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Grilla de líneas cargadas */}
      {lineas.length === 0 ? (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            background: 'var(--surface-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-muted)',
            marginTop: '12px',
          }}
        >
          No hay artículos agregados a la venta. Buscá y seleccioná un producto arriba.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: '16px' }}>
          <table className="tabla-lineas-venta">
            <colgroup>
              <col style={{ width: '24%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Artículo</th>
                <th style={{ textAlign: 'center' }}>Stock disp.</th>
                <th style={{ textAlign: 'center' }}>Cantidad</th>
                <th style={{ textAlign: 'center' }}>Backorder</th>
                <th style={{ textAlign: 'right' }}>Precio unit.</th>
                <th style={{ textAlign: 'center' }}>Desc. %</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((linea, index) => {
                const superaStock = linea.cantidad > linea.stock_disponible
                return (
                  <tr key={`${linea.producto_id}-${index}`}>
                    <td style={{ textAlign: 'left' }}>
                      <strong>{linea.nombre}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        SKU: {linea.sku}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          fontWeight: '600',
                          color: superaStock ? 'var(--color-danger, #b42318)' : 'inherit',
                        }}
                      >
                        {linea.stock_disponible} {linea.unidad_medida}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={linea.cantidad}
                        onChange={(e) => handleCambiarCantidad(linea.producto_id, e.target.value)}
                        disabled={deshabilitado}
                        style={{
                          textAlign: 'center',
                          maxWidth: '85px',
                          margin: '0 auto',
                          borderColor: superaStock ? 'var(--color-danger, #b42318)' : undefined,
                        }}
                        aria-label={`Cantidad de ${linea.nombre}`}
                      />
                      {superaStock && (
                        <div style={{ fontSize: '10px', color: 'var(--color-danger, #b42318)', marginTop: '2px' }}>
                          Supera disponible
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {superaStock ? (
                        <label style={{ fontSize: '11px', display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(linea.backorder)}
                            onChange={(e) => handleCambiarBackorder(linea.producto_id, e.target.checked)}
                            disabled={deshabilitado}
                            aria-label={`Aceptar backorder de ${linea.nombre}`}
                          />
                          Aceptar espera
                        </label>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '500' }}>
                      {formatearMoneda(linea.precio_unitario)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={linea.descuento_pct}
                          onChange={(e) => handleCambiarDescuento(linea.producto_id, e.target.value)}
                          disabled={deshabilitado}
                          style={{ textAlign: 'center', maxWidth: '65px' }}
                          aria-label={`Descuento de ${linea.nombre}`}
                        />
                        {linea.autorizacion_descuento_id && (
                          <span
                            title="Descuento autorizado por supervisor"
                            style={{
                              fontSize: '10px',
                              background: '#e7f2ea',
                              color: '#306b49',
                              padding: '2px 4px',
                              borderRadius: '4px',
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '700' }}>
                      {formatearMoneda(linea.subtotal)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleQuitarLinea(linea.producto_id)}
                        disabled={deshabilitado}
                        title="Quitar artículo"
                        style={{ padding: '6px' }}
                      >
                        <Trash2 size={16} color="var(--color-danger, #b42318)" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de autorización de descuento manual (CA-05) */}
      <ModalAutorizacionDescuento
        abierto={modalAut.abierto}
        porcentaje={modalAut.porcentaje}
        onAutorizado={handleDescuentoAutorizado}
        onCancelar={handleCancelarAutorizacion}
      />

      <style>{`
        /* Alineación y layout estricto de la tabla de líneas de venta */
        .lineas-venta-contenedor table.tabla-lineas-venta {
          display: table !important;
          width: 100% !important;
          table-layout: fixed !important;
          border-collapse: separate;
          border-spacing: 0;
        }
        .lineas-venta-contenedor table.tabla-lineas-venta thead {
          display: table-header-group !important;
          width: auto !important;
          table-layout: auto !important;
        }
        .lineas-venta-contenedor table.tabla-lineas-venta tbody {
          display: table-row-group !important;
          width: auto !important;
          table-layout: auto !important;
        }
        .lineas-venta-contenedor table.tabla-lineas-venta tr {
          display: table-row !important;
        }
        .lineas-venta-contenedor table.tabla-lineas-venta th,
        .lineas-venta-contenedor table.tabla-lineas-venta td {
          padding: 10px 12px;
          vertical-align: middle;
        }
      `}</style>
    </div>
  )
}
