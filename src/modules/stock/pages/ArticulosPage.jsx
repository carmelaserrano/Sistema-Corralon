import { useEffect, useState } from 'react'
import {
  createArticulo,
  getArticulos,
  setEstadoArticulo,
  updateArticulo,
} from '../api/articulosApi'
import { getCategorias } from '../api/categoriasApi'
import { getMarcas } from '../api/marcasApi'
import { getUnidadesMedida } from '../api/unidadesMedidaApi'

const TAMANIO_PAGINA = 10

const articuloInicial = {
  nombre: '',
  descripcion: '',
  categoria_id: '',
  marca_id: '',
  unidad_medida_id: '',
  codigo_barras: '',
}

const filtrosIniciales = {
  search: '',
  categoria_id: '',
  marca_id: '',
  estado: '',
}

// La base guarda 'activo' / 'inactivo'; la historia los muestra con
// mayúscula inicial.
function mostrarEstado(estadoProducto) {
  return estadoProducto === 'activo' ? 'Activo' : 'Inactivo'
}

// Sólo se ofrecen catálogos activos (CA-03). La excepción es el valor que
// el artículo ya tiene: si quedó apuntando a algo que después se desactivó,
// se muestra igual para que el campo no aparezca vacío.
function opcionesPara(lista, idSeleccionado) {
  return lista.filter((item) => item.activo || item.id === idSeleccionado)
}

function ArticulosPage() {
  const [articulos, setArticulos] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)

  const [categorias, setCategorias] = useState([])
  const [marcas, setMarcas] = useState([])
  const [unidades, setUnidades] = useState([])

  const [form, setForm] = useState(articuloInicial)
  const [editandoId, setEditandoId] = useState(null)
  const [filtros, setFiltros] = useState(filtrosIniciales)

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)

  async function cargarCatalogos() {
    const [cats, mars, unis] = await Promise.all([
      getCategorias(),
      getMarcas(),
      getUnidadesMedida(),
    ])

    setCategorias(cats)
    setMarcas(mars)
    setUnidades(unis)
  }

  async function cargarArticulos(page = pagina, filtrosActuales = filtros) {
    try {
      setLoading(true)
      setError('')

      const resultado = await getArticulos({
        ...filtrosActuales,
        page,
        pageSize: TAMANIO_PAGINA,
      })

      setArticulos(resultado.articulos)
      setTotal(resultado.total)
      setTotalPaginas(resultado.totalPaginas)
      setPagina(resultado.page)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los artículos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarCatalogos().catch((err) =>
      setError(err.message || 'No se pudieron cargar los catálogos'),
    )
    cargarArticulos(1, filtrosIniciales)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function manejarCambio(event) {
    const { name, value } = event.target
    setForm((actual) => ({ ...actual, [name]: value }))
  }

  function manejarFiltro(event) {
    const { name, value } = event.target
    setFiltros((actual) => ({ ...actual, [name]: value }))
  }

  function limpiarFormulario() {
    setForm(articuloInicial)
    setEditandoId(null)
    setError('')
  }

  function comenzarEdicion(articulo) {
    setForm({
      nombre: articulo.nombre,
      descripcion: articulo.descripcion ?? '',
      categoria_id: articulo.categoria?.id ?? '',
      marca_id: articulo.marca?.id ?? '',
      unidad_medida_id: articulo.unidad_medida?.id ?? '',
      codigo_barras: articulo.codigo_barras ?? '',
    })
    setEditandoId(articulo.id)
    setError('')
    setAviso('')
  }

  async function guardarArticulo(event) {
    event.preventDefault()

    try {
      setError('')
      setAviso('')

      if (editandoId) {
        await updateArticulo(editandoId, form)
        setAviso('Artículo actualizado')
      } else {
        const creado = await createArticulo(form)
        setAviso(`Artículo "${creado.nombre}" creado con SKU ${creado.sku}`)
      }

      limpiarFormulario()
      await cargarArticulos()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el artículo')
    }
  }

  async function cambiarEstado(articulo) {
    const nuevoEstado =
      articulo.estado_producto === 'activo' ? 'inactivo' : 'activo'

    try {
      setError('')
      setAviso('')
      await setEstadoArticulo(articulo.id, nuevoEstado)
      setAviso(`Artículo "${articulo.nombre}" ahora está ${nuevoEstado}`)
      await cargarArticulos()
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado del artículo')
    }
  }

  function aplicarFiltros(event) {
    event.preventDefault()
    cargarArticulos(1)
  }

  function limpiarFiltros() {
    setFiltros(filtrosIniciales)
    cargarArticulos(1, filtrosIniciales)
  }

  return (
    <main>
      <h1>Catálogo de artículos</h1>

      {error && <p role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      <form onSubmit={guardarArticulo}>
        <h2>{editandoId ? 'Editar artículo' : 'Nuevo artículo'}</h2>

        <label>
          Nombre
          <input
            name="nombre"
            value={form.nombre}
            onChange={manejarCambio}
            placeholder="Cemento Portland x50kg"
          />
        </label>

        <label>
          Categoría
          <select
            name="categoria_id"
            value={form.categoria_id}
            onChange={manejarCambio}
          >
            <option value="">Seleccioná una categoría</option>
            {opcionesPara(categorias, form.categoria_id).map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
                {categoria.activo ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </label>

        <label>
          Marca
          <select name="marca_id" value={form.marca_id} onChange={manejarCambio}>
            <option value="">Seleccioná una marca</option>
            {opcionesPara(marcas, form.marca_id).map((marca) => (
              <option key={marca.id} value={marca.id}>
                {marca.nombre}
                {marca.activo ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </label>

        <label>
          Unidad de medida
          <select
            name="unidad_medida_id"
            value={form.unidad_medida_id}
            onChange={manejarCambio}
          >
            <option value="">Seleccioná una unidad</option>
            {opcionesPara(unidades, form.unidad_medida_id).map((unidad) => (
              <option key={unidad.id} value={unidad.id}>
                {unidad.nombre} ({unidad.abreviatura})
                {unidad.activo ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </label>

        <label>
          Código de barras
          <input
            name="codigo_barras"
            value={form.codigo_barras}
            onChange={manejarCambio}
            placeholder="7791234567890"
          />
        </label>

        <label>
          Descripción
          <input
            name="descripcion"
            value={form.descripcion}
            onChange={manejarCambio}
            placeholder="Opcional"
          />
        </label>

        <button type="submit">{editandoId ? 'Guardar' : 'Crear'}</button>

        {editandoId && (
          <button type="button" onClick={limpiarFormulario}>
            Cancelar
          </button>
        )}
      </form>

      <form onSubmit={aplicarFiltros}>
        <h2>Buscar y filtrar</h2>

        <label>
          Buscar
          <input
            name="search"
            value={filtros.search}
            onChange={manejarFiltro}
            placeholder="Nombre, SKU o código de barras"
          />
        </label>

        <label>
          Categoría
          <select
            name="categoria_id"
            value={filtros.categoria_id}
            onChange={manejarFiltro}
          >
            <option value="">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </label>

        <label>
          Marca
          <select
            name="marca_id"
            value={filtros.marca_id}
            onChange={manejarFiltro}
          >
            <option value="">Todas</option>
            {marcas.map((marca) => (
              <option key={marca.id} value={marca.id}>
                {marca.nombre}
              </option>
            ))}
          </select>
        </label>

        <label>
          Estado
          <select name="estado" value={filtros.estado} onChange={manejarFiltro}>
            <option value="">Todos</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </label>

        <button type="submit">Filtrar</button>
        <button type="button" onClick={limpiarFiltros}>
          Limpiar
        </button>
      </form>

      {loading && <p>Cargando artículos...</p>}

      {!loading && articulos.length === 0 && (
        <p>No hay artículos para mostrar.</p>
      )}

      {!loading && articulos.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Marca</th>
                <th>Unidad</th>
                <th>Código de barras</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {articulos.map((articulo) => (
                <tr key={articulo.id}>
                  <td>{articulo.sku}</td>
                  <td>{articulo.nombre}</td>
                  <td>{articulo.categoria?.nombre}</td>
                  <td>{articulo.marca?.nombre}</td>
                  <td>{articulo.unidad_medida?.abreviatura}</td>
                  <td>{articulo.codigo_barras ?? '—'}</td>
                  <td>{mostrarEstado(articulo.estado_producto)}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => comenzarEdicion(articulo)}
                    >
                      Editar
                    </button>
                    <button type="button" onClick={() => cambiarEstado(articulo)}>
                      {articulo.estado_producto === 'activo'
                        ? 'Desactivar'
                        : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p>
            {total} artículo(s) · página {pagina} de {totalPaginas}
          </p>

          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => cargarArticulos(pagina - 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => cargarArticulos(pagina + 1)}
          >
            Siguiente
          </button>
        </>
      )}
    </main>
  )
}

export default ArticulosPage
