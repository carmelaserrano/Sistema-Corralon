import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageUp } from 'lucide-react'
import {
  listarPublicacion,
  publicarProducto,
  puedePublicar,
  subirImagen,
  validarImagen,
  POR_PAGINA,
  TIPOS_IMAGEN,
} from '../api/catalogoApi'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'
import { ImagenProducto } from './CatalogoPage'

const ESPERA_BUSQUEDA_MS = 350

function motivoNoVisible(producto) {
  if (!producto.publicado_web) return 'No publicado'
  if (producto.estado_producto !== 'activo') return 'Publicado, pero el artículo está inactivo'
  return 'Publicado, pero no tiene precio en la lista General'
}

function FilaProducto({ producto, onCambio, onAviso }) {
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const entrada = useRef(null)

  async function alternarPublicacion(event) {
    const publicado = event.target.checked
    setGuardando(true)
    onAviso(null)
    try {
      const guardado = await publicarProducto(producto.id, publicado)
      onCambio()
      onAviso({ tone: 'success', texto: `${producto.nombre} ${guardado.publicado_web ? 'quedó publicado' : 'se quitó de la tienda'}.` })
    } catch (err) {
      onAviso({ tone: 'error', texto: err.message })
    } finally {
      setGuardando(false)
    }
  }

  async function elegirImagen(event) {
    const archivo = event.target.files?.[0]
    event.target.value = ''
    if (!archivo) return
    onAviso(null)
    try {
      validarImagen(archivo)
    } catch (err) {
      onAviso({ tone: 'error', texto: `${producto.nombre}: ${err.message}` })
      return
    }
    setSubiendo(true)
    try {
      await subirImagen(producto.id, archivo)
      onCambio()
      onAviso({ tone: 'success', texto: `Actualizamos la imagen de ${producto.nombre}.` })
    } catch (err) {
      onAviso({ tone: 'error', texto: err.message })
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <tr>
      <td style={{ width: 72 }}><ImagenProducto url={producto.imagen_url} nombre={producto.nombre} alto={56} /></td>
      <td>
        <strong>{producto.nombre}</strong>
        <small style={{ display: 'block' }}>{[producto.sku, producto.marca?.nombre, producto.categoria?.nombre].filter(Boolean).join(' · ')}</small>
      </td>
      <td>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" role="switch" checked={producto.publicado_web} disabled={guardando}
            aria-label={`Publicar ${producto.nombre} en la tienda`} onChange={alternarPublicacion} />
          {producto.publicado_web ? 'Publicado' : 'No publicado'}
        </label>
      </td>
      <td>
        {producto.visibleEnTienda
          ? <span style={{ color: 'var(--color-success)' }}>Visible en la tienda</span>
          : <span style={{ color: 'var(--text-muted)' }}>{motivoNoVisible(producto)}</span>}
      </td>
      <td>
        <input ref={entrada} type="file" accept={TIPOS_IMAGEN.join(',')} hidden onChange={elegirImagen}
          aria-label={`Imagen de ${producto.nombre}`} />
        <Button type="button" variant="ghost" icon={ImageUp} loading={subiendo} loadingLabel="Subiendo…"
          onClick={() => entrada.current?.click()}>
          {producto.imagen_url ? 'Cambiar imagen' : 'Subir imagen'}
        </Button>
      </td>
    </tr>
  )
}

export default function PublicacionWebPage() {
  const [tienePermiso, setTienePermiso] = useState(null)
  const [errorPermiso, setErrorPermiso] = useState('')
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState({ items: [], total: 0 })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState(null)
  const [version, setVersion] = useState(0)
  const ultimaConsulta = useRef(0)

  useEffect(() => {
    puedePublicar()
      .then(setTienePermiso)
      .catch((err) => {
        setErrorPermiso(err.message)
        setTienePermiso(false)
      })
  }, [])

  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(texto.trim())
      setPagina(1)
    }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [texto])

  useEffect(() => {
    if (!tienePermiso) return
    const consulta = ++ultimaConsulta.current
    setCargando(true)
    setError('')
    listarPublicacion({ busqueda, pagina })
      .then((datos) => { if (consulta === ultimaConsulta.current) setResultado(datos) })
      .catch((err) => { if (consulta === ultimaConsulta.current) setError(err.message) })
      .finally(() => { if (consulta === ultimaConsulta.current) setCargando(false) })
  }, [tienePermiso, busqueda, pagina, version])

  if (tienePermiso === null) {
    return (
      <main>
        <h1>Publicación web</h1>
        <p className="loading-state" role="status">Verificando permisos…</p>
      </main>
    )
  }

  if (!tienePermiso) {
    return (
      <main>
        <h1>Publicación web</h1>
        <EmptyState
          title="Sin permiso"
          description={
            errorPermiso
              ? `No se pudo verificar tu permiso (${errorPermiso}).`
              : 'Para publicar productos en la tienda necesitás el permiso «ecommerce.publicar».'
          }
        />
      </main>
    )
  }

  const totalPaginas = Math.max(1, Math.ceil(resultado.total / POR_PAGINA))
  const recargar = () => setVersion((n) => n + 1)

  return (
    <main aria-busy={cargando}>
      <h1>Publicación web</h1>
      <p>
        Elegí qué artículos se ven en la tienda online y cargá su imagen (JPG, PNG o WebP, hasta 2 MB).
        Un artículo aparece en la tienda si está publicado, activo y tiene precio en la lista General.
      </p>

      <label style={{ display: 'grid', gap: 4, maxWidth: 420 }}>
        Buscar por nombre o SKU
        <input type="search" value={texto} onChange={(event) => setTexto(event.target.value)} />
      </label>

      {aviso && <Feedback tone={aviso.tone}>{aviso.texto}</Feedback>}
      {error && <Feedback tone="error">{error} <button type="button" onClick={recargar}>Reintentar</button></Feedback>}
      {cargando && <p className="loading-state" role="status">Cargando artículos…</p>}

      {!cargando && !error && resultado.items.length === 0 && (
        <EmptyState title="No hay artículos" description="Probá con otra búsqueda." />
      )}

      {resultado.items.length > 0 && (
        <>
          <table>
            <caption style={{ textAlign: 'left' }}>{resultado.total} artículos</caption>
            <thead>
              <tr>
                <th scope="col">Imagen</th>
                <th scope="col">Artículo</th>
                <th scope="col">Publicación</th>
                <th scope="col">Tienda</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {resultado.items.map((producto) => (
                <FilaProducto key={producto.id} producto={producto} onCambio={recargar} onAviso={setAviso} />
              ))}
            </tbody>
          </table>
          <nav aria-label="Paginación" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
    </main>
  )
}
