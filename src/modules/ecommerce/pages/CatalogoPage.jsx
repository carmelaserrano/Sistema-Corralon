import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  ImageOff,
  Search,
  ShoppingCart,
  Store,
} from 'lucide-react'
import { listarCatalogo, listarFiltrosCatalogo, POR_PAGINA } from '../api/catalogoApi'
import { useCarrito } from '../context/CarritoContext'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const ESPERA_BUSQUEDA_MS = 350

const OPCIONES_ORDEN = [
  { value: 'nombre-asc', label: 'Nombre (A-Z)' },
  { value: 'nombre-desc', label: 'Nombre (Z-A)' },
  { value: 'precio-asc', label: 'Menor precio' },
  { value: 'precio-desc', label: 'Mayor precio' },
]

/** Imagen del producto con una genérica si falta o no carga (CA-07). */
export function ImagenProducto({ url, nombre, alto = 180 }) {
  const [fallo, setFallo] = useState(false)
  useEffect(() => { setFallo(false) }, [url])
  const marco = { width: '100%', height: alto, borderRadius: 8, background: 'var(--surface-subtle)' }
  return url && !fallo
    ? <img src={url} alt={nombre} loading="lazy" style={{ ...marco, objectFit: 'contain' }} onError={() => setFallo(true)} />
    : (
      <span role="img" aria-label={`${nombre}: sin imagen`} style={{ ...marco, display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
        <ImageOff size={36} aria-hidden="true" />
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
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [orden, setOrden] = useState('nombre-asc')
  const [pagina, setPagina] = useState(1)
  const [filtros, setFiltros] = useState({ categorias: [], marcas: [] })
  const [resultado, setResultado] = useState({ items: [], total: 0 })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [reintento, setReintento] = useState(0)
  const [agregandoId, setAgregandoId] = useState(null)
  const [agregadoExitoId, setAgregadoExitoId] = useState(null)
  const ultimaConsulta = useRef(0)

  useEffect(() => {
    listarFiltrosCatalogo()
      .then(setFiltros)
      .catch(() => { /* Sin filtros el catálogo sigue siendo navegable. */ })
  }, [])

  // Debounce: consulta cuando el visitante deja de escribir.
  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(texto.trim())
      setPagina(1)
    }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [texto])

  useEffect(() => {
    const consulta = ++ultimaConsulta.current
    const [campo, direccion] = orden.split('-')
    setCargando(true)
    setError('')
    listarCatalogo({ busqueda, categoriaId, marcaId, orden: campo, direccion, pagina })
      .then((datos) => {
        // Una respuesta atrasada no pisa el resultado de filtros más nuevos.
        if (consulta === ultimaConsulta.current) setResultado(datos)
      })
      .catch((err) => {
        if (consulta === ultimaConsulta.current) setError(err.message || 'No pudimos cargar el catálogo')
      })
      .finally(() => {
        if (consulta === ultimaConsulta.current) setCargando(false)
      })
  }, [busqueda, categoriaId, marcaId, orden, pagina, reintento])

  function cambiarFiltro(setter) {
    return (event) => {
      setter(event.target.value)
      setPagina(1)
    }
  }

  function limpiarFiltros() {
    setTexto('')
    setBusqueda('')
    setCategoriaId('')
    setMarcaId('')
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

  const totalPaginas = Math.max(1, Math.ceil(resultado.total / POR_PAGINA))
  const hayFiltros = Boolean(busqueda || categoriaId || marcaId)

  return (
    <section className="tienda-catalogo" aria-labelledby="titulo-catalogo" aria-busy={cargando}>
      <header className="tienda-catalogo-header">
        <div>
          <h1 id="titulo-catalogo">
            <Store size={26} aria-hidden="true" /> Catálogo de Materiales
          </h1>
          <p className="tienda-catalogo-sub">
            Encontrá todo lo necesario para tu obra con stock garantizado en depósito central.
          </p>
        </div>
      </header>

      <div className="tienda-busqueda" role="search">
        <label className="tienda-filtro-campo tienda-filtro-buscar">
          <span>Buscar material</span>
          <span className="tienda-input-icon-wrap">
            <Search size={16} aria-hidden="true" className="tienda-input-icon" />
            <input
              type="search"
              value={texto}
              placeholder="Ej: cemento, arena, hierro..."
              onChange={(event) => setTexto(event.target.value)}
            />
          </span>
        </label>
        <label className="tienda-filtro-campo">
          <span>Categoría</span>
          <select value={categoriaId} onChange={cambiarFiltro(setCategoriaId)}>
            <option value="">Todas las categorías</option>
            {filtros.categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>
            ))}
          </select>
        </label>
        <label className="tienda-filtro-campo">
          <span>Marca</span>
          <select value={marcaId} onChange={cambiarFiltro(setMarcaId)}>
            <option value="">Todas las marcas</option>
            {filtros.marcas.map((marca) => (
              <option key={marca.id} value={marca.id}>{marca.nombre}</option>
            ))}
          </select>
        </label>
        <label className="tienda-filtro-campo">
          <span>Ordenar por</span>
          <select value={orden} onChange={cambiarFiltro(setOrden)}>
            {OPCIONES_ORDEN.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <Feedback tone="error">
          {error} <button type="button" onClick={() => setReintento((n) => n + 1)}>Reintentar</button>
        </Feedback>
      )}
      {cargando && <Feedback>Cargando productos…</Feedback>}

      {!cargando && !error && resultado.items.length === 0 && (
        <EmptyState
          title="No encontramos productos"
          description={hayFiltros ? 'Probá con otra búsqueda o quitá los filtros.' : 'Todavía no hay productos publicados en la tienda.'}
        >
          {hayFiltros && <Button type="button" variant="ghost" onClick={limpiarFiltros}>Limpiar filtros</Button>}
        </EmptyState>
      )}

      {resultado.items.length > 0 && (
        <>
          <div className="tienda-catalogo-meta">
            <p aria-live="polite" className="tienda-total-contador">
              Mostrando <strong>{resultado.items.length}</strong> de <strong>{resultado.total}</strong> materiales disponibles
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
    </section>
  )
}
