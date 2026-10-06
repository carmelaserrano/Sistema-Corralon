import { useEffect, useRef, useState } from 'react'
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { listarCatalogo, listarFiltrosCatalogo, POR_PAGINA } from '../api/catalogoApi'
import { useCarrito } from '../context/CarritoContext'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'
import TiendaHero from '../components/TiendaHero'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const ESPERA_BUSQUEDA_MS = 300

const OPCIONES_ORDEN = [
  { value: 'precio-asc', label: 'Menor precio' },
  { value: 'precio-desc', label: 'Mayor precio' },
  { value: 'nombre-asc', label: 'Nombre (A-Z)' },
  { value: 'nombre-desc', label: 'Nombre (Z-A)' },
]

/** Imagen del producto con una genérica si falta o no carga (CA-07). */
export function ImagenProducto({ url, nombre, alto = 180 }) {
  const [fallo, setFallo] = useState(false)
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    setFallo(false)
    setCargado(false)
  }, [url])

  const marco = {
    width: '100%',
    height: alto,
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--surface-subtle)',
  }

  return url && !fallo ? (
    <div style={marco}>
      <img
        src={url}
        alt={nombre}
        loading="lazy"
        onLoad={() => setCargado(true)}
        onError={() => setFallo(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: cargado ? 1 : 0,
          transition: 'opacity 250ms ease, transform 300ms ease',
        }}
      />
      {!cargado && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-muted)',
            background: 'var(--surface-subtle)',
          }}
        >
          <Building2 size={32} style={{ opacity: 0.3 }} />
        </span>
      )}
    </div>
  ) : (
    <span
      role="img"
      aria-label={`${nombre}: materiales de corralón`}
      style={{
        ...marco,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        color: 'var(--text-muted)',
        background: 'linear-gradient(135deg, rgba(230, 167, 0, 0.08) 0%, rgba(0, 0, 0, 0.04) 100%)',
        border: '1px solid var(--border-default)',
        textAlign: 'center',
      }}
    >
      <Building2 size={36} style={{ color: 'var(--color-brand)', opacity: 0.85 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', maxWidth: '90%' }}>
        {nombre}
      </span>
    </span>
  )
}

export function EtiquetaDisponibilidad({ disponible }) {
  return (
    <span className={`tienda-badge-stock ${disponible ? 'is-available' : 'is-empty'}`}>
      <span className="tienda-badge-dot" />
      {disponible ? 'En stock' : 'Sin stock'}
    </span>
  )
}

export default function CatalogoPage({ onVerProducto, onNotificar }) {
  const { agregar } = useCarrito()

  // Inicializar desde URL params si existen
  const paramsInit = new URLSearchParams(window.location.search)
  const [texto, setTexto] = useState(paramsInit.get('busqueda') || '')
  const [busqueda, setBusqueda] = useState(paramsInit.get('busqueda') || '')
  const [categoriaId, setCategoriaId] = useState(paramsInit.get('categoria') || '')
  const [marcaId, setMarcaId] = useState(paramsInit.get('marca') || '')
  const [orden, setOrden] = useState(paramsInit.get('orden') || 'precio-asc')
  const [soloDisponibles, setSoloDisponibles] = useState(paramsInit.get('stock') === 'true')
  const [precioMinInput, setPrecioMinInput] = useState(paramsInit.get('pmin') || '')
  const [precioMaxInput, setPrecioMaxInput] = useState(paramsInit.get('pmax') || '')
  const [precioMin, setPrecioMin] = useState(paramsInit.get('pmin') || '')
  const [precioMax, setPrecioMax] = useState(paramsInit.get('pmax') || '')

  const [pagina, setPagina] = useState(1)
  const [filtros, setFiltros] = useState({ categorias: [], marcas: [] })
  const [resultado, setResultado] = useState({ items: [], total: 0 })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [reintento, setReintento] = useState(0)
  const [mostrarFiltrosMobile, setMostrarFiltrosMobile] = useState(false)
  const [agregandoId, setAgregandoId] = useState(null)
  const [agregadoExitoId, setAgregadoExitoId] = useState(null)
  const ultimaConsulta = useRef(0)

  // Cargar lista de categorías y marcas para filtros
  useEffect(() => {
    listarFiltrosCatalogo()
      .then(setFiltros)
      .catch(() => { /* Sin filtros el catálogo sigue siendo navegable. */ })
  }, [])

  // Debounce para búsqueda por texto
  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(texto.trim())
      setPagina(1)
    }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [texto])

  // Sincronizar filtros activos con la URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (busqueda) params.set('busqueda', busqueda)
    if (categoriaId) params.set('categoria', categoriaId)
    if (marcaId) params.set('marca', marcaId)
    if (orden && orden !== 'precio-asc') params.set('orden', orden)
    if (soloDisponibles) params.set('stock', 'true')
    if (precioMin) params.set('pmin', precioMin)
    if (precioMax) params.set('pmax', precioMax)

    const query = params.toString()
    const nuevaUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname
    window.history.replaceState({}, '', nuevaUrl)
  }, [busqueda, categoriaId, marcaId, orden, soloDisponibles, precioMin, precioMax])

  // Consulta de catálogo en Supabase
  useEffect(() => {
    const consulta = ++ultimaConsulta.current
    const [campo, direccion] = orden.split('-')
    setCargando(true)
    setError('')
    listarCatalogo({
      busqueda,
      categoriaId,
      marcaId,
      orden: campo,
      direccion,
      pagina,
      soloDisponibles,
      precioMin: precioMin ? Number(precioMin) : undefined,
      precioMax: precioMax ? Number(precioMax) : undefined,
    })
      .then((datos) => {
        if (consulta === ultimaConsulta.current) setResultado(datos)
      })
      .catch((err) => {
        if (consulta === ultimaConsulta.current) setError(err.message || 'No pudimos cargar el catálogo')
      })
      .finally(() => {
        if (consulta === ultimaConsulta.current) setCargando(false)
      })
  }, [busqueda, categoriaId, marcaId, orden, pagina, soloDisponibles, precioMin, precioMax, reintento])

  function limpiarTodosFiltros() {
    setTexto('')
    setBusqueda('')
    setCategoriaId('')
    setMarcaId('')
    setSoloDisponibles(false)
    setPrecioMinInput('')
    setPrecioMaxInput('')
    setPrecioMin('')
    setPrecioMax('')
    setPagina(1)
  }

  function aplicarRangoPrecio(e) {
    e.preventDefault()
    setPrecioMin(precioMinInput)
    setPrecioMax(precioMaxInput)
    setPagina(1)
  }

  async function agregarRapido(e, producto) {
    e.stopPropagation()
    if (!producto.disponible || agregandoId) return
    setAgregandoId(producto.id)
    try {
      await agregar(producto.id, 1)
      setAgregadoExitoId(producto.id)
      onNotificar?.({
        mensaje: 'Producto agregado al carrito',
        productoNombre: producto.nombre,
      })
      setTimeout(() => {
        setAgregadoExitoId(null)
      }, 1800)
    } catch (err) {
      console.error('Error al agregar al carrito:', err)
    } finally {
      setAgregandoId(null)
    }
  }

  const categoriaActual = filtros.categorias.find((c) => c.id === categoriaId)
  const marcaActual = filtros.marcas.find((m) => m.id === marcaId)
  const totalPaginas = Math.max(1, Math.ceil(resultado.total / POR_PAGINA))

  // Conteo de filtros activos para badge mobile
  const filtrosActivosCount = [
    Boolean(busqueda),
    Boolean(categoriaId),
    Boolean(marcaId),
    Boolean(soloDisponibles),
    Boolean(precioMin || precioMax),
  ].filter(Boolean).length

  return (
    <div className="tienda-catalogo-wrap">
      {/* 1. HERO BANNER COMERCIAL */}
      <TiendaHero
        categorias={filtros.categorias}
        categoriaSeleccionada={categoriaId}
        onSeleccionarCategoria={(catId) => {
          setCategoriaId(catId)
          setPagina(1)
        }}
      />

      {/* 2. CONTENEDOR PRINCIPAL CON SIDEBAR + GRILLA */}
      <section className="tienda-catalogo" aria-labelledby="titulo-catalogo" aria-busy={cargando}>
        <div className="tienda-catalogo-layout">
          {/* SIDEBAR DE FILTROS (Desktop & Mobile Drawer) */}
          <aside className={`tienda-sidebar-filtros ${mostrarFiltrosMobile ? 'is-open' : ''}`}>
            <div className="tienda-sidebar-header">
              <div className="tienda-sidebar-title">
                <SlidersHorizontal size={18} />
                <h3>Filtros</h3>
              </div>
              {filtrosActivosCount > 0 && (
                <button type="button" className="tienda-btn-limpiar-filtros" onClick={limpiarTodosFiltros}>
                  <RotateCcw size={13} />
                  Limpiar
                </button>
              )}
              <button
                type="button"
                className="tienda-sidebar-close-mobile"
                onClick={() => setMostrarFiltrosMobile(false)}
                aria-label="Cerrar filtros"
              >
                <X size={20} />
              </button>
            </div>

            {/* Filtro: Disponibilidad */}
            <div className="tienda-filtro-seccion">
              <h4>Disponibilidad</h4>
              <label className="tienda-checkbox-label">
                <input
                  type="checkbox"
                  checked={soloDisponibles}
                  onChange={(e) => {
                    setSoloDisponibles(e.target.checked)
                    setPagina(1)
                  }}
                />
                <span>Solo con stock disponible</span>
              </label>
            </div>

            {/* Filtro: Categorías */}
            <div className="tienda-filtro-seccion">
              <h4>Categorías</h4>
              <div className="tienda-filtro-lista">
                <button
                  type="button"
                  className={`tienda-filtro-item ${!categoriaId ? 'is-active' : ''}`}
                  onClick={() => {
                    setCategoriaId('')
                    setPagina(1)
                  }}
                >
                  Todas las categorías
                </button>
                {filtros.categorias.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`tienda-filtro-item ${categoriaId === cat.id ? 'is-active' : ''}`}
                    onClick={() => {
                      setCategoriaId(cat.id)
                      setPagina(1)
                    }}
                  >
                    <span>{cat.nombre}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro: Marcas */}
            {filtros.marcas.length > 0 && (
              <div className="tienda-filtro-seccion">
                <h4>Marcas</h4>
                <div className="tienda-filtro-lista">
                  <button
                    type="button"
                    className={`tienda-filtro-item ${!marcaId ? 'is-active' : ''}`}
                    onClick={() => {
                      setMarcaId('')
                      setPagina(1)
                    }}
                  >
                    Todas las marcas
                  </button>
                  {filtros.marcas.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`tienda-filtro-item ${marcaId === m.id ? 'is-active' : ''}`}
                      onClick={() => {
                        setMarcaId(m.id)
                        setPagina(1)
                      }}
                    >
                      <span>{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filtro: Rango de Precios */}
            <div className="tienda-filtro-seccion">
              <h4>Rango de Precio</h4>
              <form onSubmit={aplicarRangoPrecio} className="tienda-precio-form">
                <div className="tienda-precio-inputs">
                  <input
                    type="number"
                    min="0"
                    placeholder="Mín ($)"
                    value={precioMinInput}
                    onChange={(e) => setPrecioMinInput(e.target.value)}
                  />
                  <span>—</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Máx ($)"
                    value={precioMaxInput}
                    onChange={(e) => setPrecioMaxInput(e.target.value)}
                  />
                </div>
                <button type="submit" className="tienda-btn-aplicar-precio">
                  Aplicar precio
                </button>
              </form>
            </div>
          </aside>

          {/* BACKDROP PARA MOBILE DRAWER */}
          {mostrarFiltrosMobile && (
            <div
              className="tienda-drawer-backdrop"
              onClick={() => setMostrarFiltrosMobile(false)}
              aria-hidden="true"
            />
          )}

          {/* COLUMNA DERECHA: TOOLBAR, CHIPS & PRODUCTOS */}
          <main className="tienda-catalogo-principal">
            {/* Toolbar Superior */}
            <div className="tienda-toolbar">
              <div className="tienda-toolbar-search">
                <Search size={18} className="tienda-search-icon" aria-hidden="true" />
                <input
                  type="search"
                  value={texto}
                  placeholder="Buscar por nombre de material, cemento, hierro..."
                  onChange={(e) => setTexto(e.target.value)}
                  aria-label="Buscar productos en el catálogo"
                />
                {texto && (
                  <button
                    type="button"
                    className="tienda-search-clear"
                    onClick={() => {
                      setTexto('')
                      setBusqueda('')
                    }}
                    aria-label="Borrar búsqueda"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="tienda-toolbar-controls">
                <button
                  type="button"
                  className="tienda-btn-mobile-filtros"
                  onClick={() => setMostrarFiltrosMobile(true)}
                >
                  <Filter size={16} />
                  <span>Filtros</span>
                  {filtrosActivosCount > 0 && (
                    <span className="tienda-filtros-badge">{filtrosActivosCount}</span>
                  )}
                </button>

                <div className="tienda-orden-wrap">
                  <label htmlFor="select-orden">Ordenar:</label>
                  <select
                    id="select-orden"
                    value={orden}
                    onChange={(e) => {
                      setOrden(e.target.value)
                      setPagina(1)
                    }}
                  >
                    {OPCIONES_ORDEN.map((opcion) => (
                      <option key={opcion.value} value={opcion.value}>
                        {opcion.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* CHIPS DE FILTROS ACTIVOS */}
            {filtrosActivosCount > 0 && (
              <div className="tienda-filtros-activos">
                <span className="tienda-filtros-activos-label">Filtros aplicados:</span>
                {busqueda && (
                  <span className="tienda-filtro-pill">
                    Búsqueda: <strong>{busqueda}</strong>
                    <button type="button" onClick={() => { setTexto(''); setBusqueda(''); }} aria-label="Quitar búsqueda">
                      <X size={13} />
                    </button>
                  </span>
                )}
                {categoriaActual && (
                  <span className="tienda-filtro-pill">
                    Categoría: <strong>{categoriaActual.nombre}</strong>
                    <button type="button" onClick={() => setCategoriaId('')} aria-label="Quitar categoría">
                      <X size={13} />
                    </button>
                  </span>
                )}
                {marcaActual && (
                  <span className="tienda-filtro-pill">
                    Marca: <strong>{marcaActual.nombre}</strong>
                    <button type="button" onClick={() => setMarcaId('')} aria-label="Quitar marca">
                      <X size={13} />
                    </button>
                  </span>
                )}
                {soloDisponibles && (
                  <span className="tienda-filtro-pill">
                    <strong>En stock</strong>
                    <button type="button" onClick={() => setSoloDisponibles(false)} aria-label="Quitar filtro de stock">
                      <X size={13} />
                    </button>
                  </span>
                )}
                {(precioMin || precioMax) && (
                  <span className="tienda-filtro-pill">
                    Precio: <strong>{precioMin ? `$${precioMin}` : '$0'} - {precioMax ? `$${precioMax}` : 'max'}</strong>
                    <button type="button" onClick={() => { setPrecioMin(''); setPrecioMax(''); setPrecioMinInput(''); setPrecioMaxInput(''); }} aria-label="Quitar rango de precios">
                      <X size={13} />
                    </button>
                  </span>
                )}
                <button type="button" className="tienda-btn-borrar-filtros" onClick={limpiarTodosFiltros}>
                  Borrar todos
                </button>
              </div>
            )}

            {/* Feedback y Estados */}
            {error && (
              <Feedback tone="error">
                {error} <button type="button" onClick={() => setReintento((n) => n + 1)}>Reintentar</button>
              </Feedback>
            )}
            {cargando && <Feedback>Cargando materiales…</Feedback>}

            {!cargando && !error && resultado.items.length === 0 && (
              <EmptyState
                title="No encontramos productos con los filtros seleccionados"
                description={filtrosActivosCount > 0 ? 'Probá quitando algunos filtros o ampliando el rango de búsqueda.' : 'Todavía no hay productos publicados en la tienda.'}
              >
                {filtrosActivosCount > 0 && (
                  <Button type="button" variant="ghost" onClick={limpiarTodosFiltros}>
                    Limpiar todos los filtros
                  </Button>
                )}
              </EmptyState>
            )}

            {/* GRILLA DE PRODUCTOS */}
            {resultado.items.length > 0 && (
              <>
                <div className="tienda-meta-info">
                  <p aria-live="polite">
                    Mostrando <strong>{resultado.items.length}</strong> de <strong>{resultado.total}</strong> materiales
                  </p>
                </div>

                <ul className="tienda-productos" style={{ opacity: cargando ? 0.6 : 1 }}>
                  {resultado.items.map((producto) => {
                    const estaAgregando = agregandoId === producto.id
                    const exito = agregadoExitoId === producto.id

                    return (
                      <li key={producto.id}>
                        <article className="tienda-producto">
                          <div
                            className="tienda-producto-img-wrap"
                            role="button"
                            tabIndex={0}
                            onClick={() => onVerProducto?.(producto.id)}
                            onKeyDown={(e) => e.key === 'Enter' && onVerProducto?.(producto.id)}
                          >
                            <ImagenProducto url={producto.imagen_url} nombre={producto.nombre} alto={190} />
                            <div className="tienda-producto-badge-pos">
                              <EtiquetaDisponibilidad disponible={producto.disponible} />
                            </div>
                          </div>

                          <div className="tienda-producto-body">
                            <div className="tienda-producto-chips">
                              {producto.categoria_nombre && (
                                <span className="tienda-chip">{producto.categoria_nombre}</span>
                              )}
                              {producto.marca_nombre && (
                                <span className="tienda-chip tienda-chip-marca">{producto.marca_nombre}</span>
                              )}
                            </div>

                            <h2
                              className="tienda-producto-titulo"
                              role="button"
                              tabIndex={0}
                              onClick={() => onVerProducto?.(producto.id)}
                              onKeyDown={(e) => e.key === 'Enter' && onVerProducto?.(producto.id)}
                              title={producto.nombre}
                            >
                              {producto.nombre}
                            </h2>

                            {producto.sku && (
                              <span className="tienda-producto-sku">SKU: {producto.sku}</span>
                            )}

                            <div className="tienda-producto-precio-box">
                              <strong className="tienda-producto-precio">
                                {moneda.format(producto.precio)}
                              </strong>
                              {producto.unidad_medida && (
                                <span className="tienda-producto-unidad">
                                  / {producto.unidad_medida.toLowerCase()}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="tienda-producto-footer">
                            <Button
                              type="button"
                              className="tienda-btn-card-agregar"
                              disabled={!producto.disponible || estaAgregando}
                              loading={estaAgregando}
                              loadingLabel="Agregando…"
                              icon={exito ? Check : ShoppingCart}
                              onClick={(e) => agregarRapido(e, producto)}
                            >
                              {exito ? '¡Agregado!' : producto.disponible ? 'Agregar' : 'Sin stock'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="tienda-btn-card-ver"
                              icon={Eye}
                              aria-label={`Ver detalles de ${producto.nombre}`}
                              onClick={() => onVerProducto?.(producto.id)}
                            >
                              Detalle
                            </Button>
                          </div>
                        </article>
                      </li>
                    )
                  })}
                </ul>

                {/* PAGINACIÓN */}
                <nav aria-label="Paginación" className="tienda-paginacion">
                  <Button
                    type="button"
                    variant="ghost"
                    icon={ChevronLeft}
                    disabled={cargando || pagina <= 1}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="tienda-paginacion-info">
                    Página {pagina} de {totalPaginas}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    icon={ChevronRight}
                    disabled={cargando || pagina >= totalPaginas}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </nav>
              </>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}
