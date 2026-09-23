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
 * @param {boolean} [props.deshabilitado=false] Si la carga está bloqueada.
 */
export default function LineasVenta({
  depositoId,
  clienteId,
  lineas,
  onLineasChange,
  deshabilitado = false,
}) {
  const [busqueda, setBusqueda] = useState('')
  const [articulosResultados, setArticulosResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [dropdownAbierto, setDropdownAbierto] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState('')
  const [modalAut, setModalAut] = useState({
    abierto: false,
    index: null,
    porcentaje: 0,
    descuentoAnterior: 0,
  })

  const dropdownRef = useRef(null)

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
      const lineasActualizadas = await Promise.all(
        lineas.map(async (linea) => {
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
    }

    actualizarPreciosPorCliente()

    return () => {
      activo = false
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

  // Modificar cantidad en tiempo real (CA-04)
  async function handleCambiarCantidad(index, valor) {
    const cantidadNum = Math.max(1, Number(valor) || 1)
    const lineaActual = lineas[index]

    let nuevoPrecio = lineaActual.precio_unitario
    try {
      const precioCalculado = await calcularPrecioVenta(
        lineaActual.producto_id,
        clienteId,
        cantidadNum,
      )
      if (precioCalculado !== null) nuevoPrecio = precioCalculado
    } catch {
      // Mantiene precio actual
    }

    const subtotal = redondear(
      cantidadNum * nuevoPrecio * (1 - (lineaActual.descuento_pct || 0) / 100),
    )

    const nuevasLineas = [...lineas]
    nuevasLineas[index] = {
      ...lineaActual,
      cantidad: cantidadNum,
      precio_unitario: nuevoPrecio,
      subtotal,
    }
    onLineasChange(nuevasLineas)
  }

  // Modificar descuento manual (CA-05)
  async function handleCambiarDescuento(index, valor) {
    const desc = Math.min(100, Math.max(0, Number(valor) || 0))
    const lineaActual = lineas[index]

    if (desc === 0) {
      const subtotal = redondear(lineaActual.cantidad * lineaActual.precio_unitario)
      const nuevasLineas = [...lineas]
      nuevasLineas[index] = {
        ...lineaActual,
        descuento_pct: 0,
        autorizacion_descuento_id: null,
        subtotal,
      }
      onLineasChange(nuevasLineas)
      return
    }

    try {
      const validacion = await validarDescuentoManual(desc)
      if (validacion?.requiere_autorizacion) {
        // Abrir modal de autorización
        setModalAut({
          abierto: true,
          index,
          porcentaje: desc,
          descuentoAnterior: lineaActual.descuento_pct || 0,
        })
      } else {
        // Aplica directamente sin autorización
        const subtotal = redondear(
          lineaActual.cantidad * lineaActual.precio_unitario * (1 - desc / 100),
        )
        const nuevasLineas = [...lineas]
        nuevasLineas[index] = {
          ...lineaActual,
          descuento_pct: desc,
          autorizacion_descuento_id: null,
          subtotal,
        }
        onLineasChange(nuevasLineas)
      }
    } catch (err) {
      setErrorBusqueda(err.message || 'Error al validar descuento')
    }
  }

  // Confirmar autorización de descuento (CA-05)
  function handleDescuentoAutorizado(autorizacionId) {
    const { index, porcentaje } = modalAut
    if (index === null || index === undefined) return

    const lineaActual = lineas[index]
    const subtotal = redondear(
      lineaActual.cantidad * lineaActual.precio_unitario * (1 - porcentaje / 100),
    )

    const nuevasLineas = [...lineas]
    nuevasLineas[index] = {
      ...lineaActual,
      descuento_pct: porcentaje,
      autorizacion_descuento_id: autorizacionId,
      subtotal,
    }
    onLineasChange(nuevasLineas)

    setModalAut({ abierto: false, index: null, porcentaje: 0, descuentoAnterior: 0 })
  }

  function handleCancelarAutorizacion() {
    setModalAut({ abierto: false, index: null, porcentaje: 0, descuentoAnterior: 0 })
  }

  // Quitar línea del carrito (CA-06)
  function handleQuitarLinea(index) {
    const nuevasLineas = lineas.filter((_, i) => i !== index)
    onLineasChange(nuevasLineas)
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
              <col style={{ width: '32%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '5%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Artículo</th>
                <th style={{ textAlign: 'center' }}>Stock disp.</th>
                <th style={{ textAlign: 'center' }}>Cantidad</th>
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
                        onChange={(e) => handleCambiarCantidad(index, e.target.value)}
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
                          onChange={(e) => handleCambiarDescuento(index, e.target.value)}
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
                        onClick={() => handleQuitarLinea(index)}
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

        /* Estilo visual opaco para el modal de autorización de descuento */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(18, 18, 16, 0.6);
          backdrop-filter: blur(2px);
        }
        .modal-backdrop .modal {
          width: min(480px, calc(100vw - 32px));
          background: #ffffff;
          border: 1px solid var(--border-default, #e5e7eb);
          border-radius: var(--radius-lg, 12px);
          padding: 24px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .modal-backdrop .modal h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary, #111827);
        }
        .modal-backdrop .modal p {
          margin: 0;
          font-size: 14px;
          color: var(--text-secondary, #4b5563);
          line-height: 1.5;
        }
        .modal-backdrop .modal .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 12px;
        }
      `}</style>
    </div>
  )
}
