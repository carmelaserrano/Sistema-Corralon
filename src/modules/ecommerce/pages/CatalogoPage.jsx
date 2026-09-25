import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, Search, Store } from 'lucide-react'
import { listarCatalogo, listarFiltrosCatalogo, POR_PAGINA } from '../api/catalogoApi'
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
    <span style={{ fontWeight: 600, color: disponible ? 'var(--color-success)' : 'var(--color-danger)' }}>
      {disponible ? 'Disponible' : 'Sin stock'}
    </span>
  )
}

export default function CatalogoPage({ onVerProducto }) {
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

  const totalPaginas = Math.max(1, Math.ceil(resultado.total / POR_PAGINA))
  const hayFiltros = Boolean(busqueda || categoriaId || marcaId)

  return (
    <section className="tienda-catalogo" aria-labelledby="titulo-catalogo" aria-busy={cargando} style={{ maxWidth: 1200, margin: '24px auto', padding: '0 16px' }}>
      <h1 id="titulo-catalogo"><Store size={26} aria-hidden="true" /> Catálogo</h1>
      <p>Buscá, filtrá y elegí los productos que necesitás.</p>

      <div className="tienda-busqueda" role="search" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', margin: '16px 0' }}>
        <label style={{ display: 'grid', gap: 4, flex: '2 1 240px' }}>
          Buscar
          <span style={{ position: 'relative' }}>
            <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input type="search" value={texto} placeholder="Nombre del producto" style={{ width: '100%', paddingLeft: 32 }}
              onChange={(event) => setTexto(event.target.value)} />
          </span>
        </label>
        <label style={{ display: 'grid', gap: 4, flex: '1 1 160px' }}>
          Categoría
          <select value={categoriaId} onChange={cambiarFiltro(setCategoriaId)}>
            <option value="">Todas</option>
            {filtros.categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, flex: '1 1 160px' }}>
          Marca
          <select value={marcaId} onChange={cambiarFiltro(setMarcaId)}>
            <option value="">Todas</option>
            {filtros.marcas.map((marca) => <option key={marca.id} value={marca.id}>{marca.nombre}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, flex: '1 1 160px' }}>
          Ordenar por
          <select value={orden} onChange={cambiarFiltro(setOrden)}>
            {OPCIONES_ORDEN.map((opcion) => <option key={opcion.value} value={opcion.value}>{opcion.label}</option>)}
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
          <p aria-live="polite">{resultado.total} {resultado.total === 1 ? 'producto' : 'productos'}</p>
          <ul className="tienda-productos" style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', opacity: cargando ? 0.6 : 1 }}>
            {resultado.items.map((producto) => (
              <li key={producto.id}>
                <article className="tienda-producto" style={{ display: 'grid', gap: 8, height: '100%', padding: 12, background: 'var(--surface-panel)', border: '1px solid var(--border-default)', borderRadius: 12 }}>
                  <ImagenProducto url={producto.imagen_url} nombre={producto.nombre} />
                  <h2 style={{ fontSize: 16, margin: 0 }}>{producto.nombre}</h2>
                  {producto.marca_nombre && <small>{producto.marca_nombre}</small>}
                  <strong style={{ fontSize: 20 }}>{moneda.format(producto.precio)}</strong>
                  <EtiquetaDisponibilidad disponible={producto.disponible} />
                  <Button type="button" variant="ghost" aria-label={`Ver ${producto.nombre}`} onClick={() => onVerProducto?.(producto.id)}>
                    Ver producto
                  </Button>
                </article>
              </li>
            ))}
          </ul>
          <nav aria-label="Paginación" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
            <Button type="button" variant="ghost" icon={ChevronLeft} disabled={cargando || pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <span>Página {pagina} de {totalPaginas}</span>
            <Button type="button" variant="ghost" icon={ChevronRight} disabled={cargando || pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </Button>
          </nav>
        </>
      )}
    </section>
  )
}
