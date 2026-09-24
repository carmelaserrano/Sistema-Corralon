import { useEffect, useMemo, useState } from 'react'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'
import {
  asignarListaATipo,
  crearListaPrecio,
  desactivarListaPrecio,
  editarListaPrecio,
  guardarPrecio,
  listarListasPrecio,
  listarProductosConPrecio,
  listarTiposCliente,
  puedeGestionarPrecios,
} from '../api/preciosApi'

const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const formatoPrecio = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
})

function fechaLegible(valor) {
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '—' : formatoFecha.format(fecha)
}

function ListasPrecioPage() {
  const [listas, setListas] = useState([])
  const [tiposCliente, setTiposCliente] = useState([])
  const [listaSeleccionadaId, setListaSeleccionadaId] = useState('')
  const [productos, setProductos] = useState([])
  const [preciosEditados, setPreciosEditados] = useState({})
  const [asignaciones, setAsignaciones] = useState({})

  const [nombre, setNombre] = useState('')
  const [editandoId, setEditandoId] = useState('')

  const [puedeGestionar, setPuedeGestionar] = useState(null)
  const [avisoPermiso, setAvisoPermiso] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingProductos, setLoadingProductos] = useState(false)
  const [guardandoLista, setGuardandoLista] = useState(false)
  const [guardandoPrecioId, setGuardandoPrecioId] = useState('')
  const [guardandoTipoId, setGuardandoTipoId] = useState('')

  const listaSeleccionada = useMemo(
    () => listas.find((lista) => lista.id === listaSeleccionadaId) ?? null,
    [listaSeleccionadaId, listas],
  )
  const listasActivas = useMemo(
    () => listas.filter((lista) => lista.activo),
    [listas],
  )

  async function cargarDatos() {
    try {
      setLoading(true)
      setError('')
      const [nuevasListas, nuevosTipos] = await Promise.all([
        listarListasPrecio(),
        listarTiposCliente(),
      ])

      setListas(nuevasListas)
      setTiposCliente(nuevosTipos)
      setAsignaciones(
        Object.fromEntries(
          nuevosTipos.map((tipo) => [tipo.id, tipo.lista_precio_id ?? '']),
        ),
      )
      setListaSeleccionadaId((actual) =>
        nuevasListas.some((lista) => lista.id === actual)
          ? actual
          : (nuevasListas[0]?.id ?? ''),
      )
    } catch (err) {
      setListas([])
      setTiposCliente([])
      setError(err.message || 'No se pudieron cargar las listas de precios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
    puedeGestionarPrecios()
      .then((habilitado) => {
        setPuedeGestionar(habilitado)
        setAvisoPermiso(
          habilitado
            ? ''
            : 'Modo solo lectura: necesitás el permiso «precios.gestionar» para realizar cambios.',
        )
      })
      .catch((err) => {
        setPuedeGestionar(false)
        setAvisoPermiso(
          `Modo solo lectura: no se pudo verificar el permiso «precios.gestionar» (${err.message || 'error desconocido'}).`,
        )
      })
  }, [])

  useEffect(() => {
    if (!listaSeleccionadaId) {
      setProductos([])
      setPreciosEditados({})
      return undefined
    }

    let vigente = true
    setLoadingProductos(true)
    setError('')

    listarProductosConPrecio(listaSeleccionadaId)
      .then((filas) => {
        if (!vigente) return
        setProductos(filas)
        setPreciosEditados(
          Object.fromEntries(
            filas.map((producto) => [
              producto.id,
              producto.precio == null ? '' : String(producto.precio),
            ]),
          ),
        )
      })
      .catch((err) => {
        if (!vigente) return
        setProductos([])
        setPreciosEditados({})
        setError(err.message || 'No se pudieron cargar los precios')
      })
      .finally(() => {
        if (vigente) setLoadingProductos(false)
      })

    return () => {
      vigente = false
    }
  }, [listaSeleccionadaId])

  function limpiarFormulario() {
    setNombre('')
    setEditandoId('')
  }

  function comenzarEdicion(lista) {
    setNombre(lista.nombre)
    setEditandoId(lista.id)
    setError('')
    setAviso('')
  }

  async function guardarLista(event) {
    event.preventDefault()

    try {
      setGuardandoLista(true)
      setError('')
      setAviso('')

      if (editandoId) {
        const actualizada = await editarListaPrecio(editandoId, { nombre })
        setAviso(`Lista “${actualizada.nombre}” actualizada`)
      } else {
        const creada = await crearListaPrecio(nombre)
        setListaSeleccionadaId(creada.id)
        setAviso(`Lista “${creada.nombre}” creada`)
      }

      limpiarFormulario()
      await cargarDatos()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la lista')
    } finally {
      setGuardandoLista(false)
    }
  }

  async function desactivar(lista) {
    const confirmado = window.confirm(
      `¿Seguro que querés desactivar la lista “${lista.nombre}”? No se borrará su historial.`,
    )
    if (!confirmado) return

    try {
      setError('')
      setAviso('')
      await desactivarListaPrecio(lista.id)
      setAviso(`Lista “${lista.nombre}” desactivada`)
      if (editandoId === lista.id) limpiarFormulario()
      await cargarDatos()
    } catch (err) {
      setError(err.message || 'No se pudo desactivar la lista')
    }
  }

  async function guardarPrecioProducto(producto) {
    try {
      setGuardandoPrecioId(producto.id)
      setError('')
      setAviso('')
      const guardado = await guardarPrecio(
        listaSeleccionadaId,
        producto.id,
        preciosEditados[producto.id],
      )
      setProductos((actuales) =>
        actuales.map((fila) =>
          fila.id === producto.id
            ? { ...fila, precio_id: guardado.id, precio: guardado.precio }
            : fila,
        ),
      )
      setPreciosEditados((actuales) => ({
        ...actuales,
        [producto.id]: String(guardado.precio),
      }))
      setAviso(`Precio de “${producto.nombre}” guardado`)
    } catch (err) {
      setError(err.message || 'No se pudo guardar el precio')
    } finally {
      setGuardandoPrecioId('')
    }
  }

  async function guardarAsignacion(tipo) {
    try {
      setGuardandoTipoId(tipo.id)
      setError('')
      setAviso('')
      const actualizado = await asignarListaATipo(
        tipo.id,
        asignaciones[tipo.id],
      )
      setTiposCliente((actuales) =>
        actuales.map((fila) => (fila.id === tipo.id ? actualizado : fila)),
      )
      setAviso(`Lista asignada a “${tipo.nombre}”`)
    } catch (err) {
      setError(err.message || 'No se pudo guardar la asignación')
    } finally {
      setGuardandoTipoId('')
    }
  }

  return (
    <main>
      <h1>Listas de precios</h1>

      {error && <Feedback tone="error">{error}</Feedback>}
      {aviso && <Feedback tone="success">{aviso}</Feedback>}
      {avisoPermiso && <Feedback tone="info">{avisoPermiso}</Feedback>}

      {puedeGestionar && (
        <section>
          <h2>{editandoId ? 'Editar lista' : 'Nueva lista'}</h2>
          <form onSubmit={guardarLista}>
            <label htmlFor="nombre-lista">
              Nombre
              <input
                id="nombre-lista"
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                placeholder="Profesionales"
                autoComplete="off"
              />
            </label>
            <div>
              <Button type="submit" loading={guardandoLista}>
                {editandoId ? 'Guardar cambios' : 'Crear lista'}
              </Button>
              {editandoId && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={limpiarFormulario}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </section>
      )}

      <section>
        <h2>Listas registradas</h2>
        {loading && (
          <p className="loading-state" role="status">
            Cargando listas…
          </p>
        )}
        {!loading && !error && listas.length === 0 && (
          <EmptyState
            title="Todavía no hay listas de precios"
            description={
              puedeGestionar
                ? 'Creá la primera lista para comenzar a cargar precios.'
                : 'No hay listas disponibles para consultar.'
            }
          />
        )}
        {!loading && listas.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Vigencia</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listas.map((lista) => (
                <tr key={lista.id}>
                  <td>{lista.nombre}</td>
                  <td>Vigente desde {fechaLegible(lista.created_at)}</td>
                  <td>{lista.activo ? 'Activa' : 'Inactiva'}</td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-pressed={lista.id === listaSeleccionadaId}
                      onClick={() => setListaSeleccionadaId(lista.id)}
                    >
                      Ver precios
                    </Button>
                    {puedeGestionar && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => comenzarEdicion(lista)}
                      >
                        Editar
                      </Button>
                    )}
                    {puedeGestionar && lista.activo && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => desactivar(lista)}
                      >
                        Desactivar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {listaSeleccionada && (
        <section>
          <h2>Precios de {listaSeleccionada.nombre}</h2>
          {!listaSeleccionada.activo && (
            <Feedback tone="info">
              Esta lista está inactiva. Sus precios se conservan sólo para
              consulta.
            </Feedback>
          )}
          {loadingProductos && (
            <p className="loading-state" role="status">
              Cargando productos…
            </p>
          )}
          {!loadingProductos && productos.length === 0 && (
            <EmptyState
              title="No hay productos activos"
              description="Cuando haya productos activos aparecerán en esta lista."
            />
          )}
          {!loadingProductos && productos.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Precio actual</th>
                  {puedeGestionar && listaSeleccionada.activo && (
                    <th>Nuevo precio</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {productos.map((producto) => (
                  <tr key={producto.id}>
                    <td>{producto.sku}</td>
                    <td>{producto.nombre}</td>
                    <td>
                      {producto.precio == null
                        ? 'Sin precio'
                        : formatoPrecio.format(Number(producto.precio))}
                    </td>
                    {puedeGestionar && listaSeleccionada.activo && (
                      <td>
                        <label htmlFor={`precio-${producto.id}`}>
                          <span className="sr-only">
                            Precio de {producto.nombre}
                          </span>
                          <input
                            id={`precio-${producto.id}`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={preciosEditados[producto.id] ?? ''}
                            onChange={(event) =>
                              setPreciosEditados((actuales) => ({
                                ...actuales,
                                [producto.id]: event.target.value,
                              }))
                            }
                            placeholder="Sin precio"
                          />
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          loading={guardandoPrecioId === producto.id}
                          onClick={() => guardarPrecioProducto(producto)}
                        >
                          Guardar precio
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section>
        <h2>Listas por tipo de cliente</h2>
        {!loading && tiposCliente.length === 0 && (
          <EmptyState
            title="No hay tipos de cliente activos"
            description="No hay asignaciones para mostrar."
          />
        )}
        {!loading && tiposCliente.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Tipo de cliente</th>
                <th>Lista asignada</th>
                {puedeGestionar && <th>Nueva asignación</th>}
              </tr>
            </thead>
            <tbody>
              {tiposCliente.map((tipo) => {
                const listaActual = listas.find(
                  (lista) => lista.id === tipo.lista_precio_id,
                )
                return (
                  <tr key={tipo.id}>
                    <td>{tipo.nombre}</td>
                    <td>
                      {listaActual
                        ? `${listaActual.nombre}${listaActual.activo ? '' : ' (inactiva)'}`
                        : 'Sin lista asignada'}
                    </td>
                    {puedeGestionar && (
                      <td>
                        <label htmlFor={`lista-tipo-${tipo.id}`}>
                          <span className="sr-only">
                            Lista para {tipo.nombre}
                          </span>
                          <select
                            id={`lista-tipo-${tipo.id}`}
                            value={asignaciones[tipo.id] ?? ''}
                            onChange={(event) =>
                              setAsignaciones((actuales) => ({
                                ...actuales,
                                [tipo.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Seleccioná una lista activa</option>
                            {listasActivas.map((lista) => (
                              <option key={lista.id} value={lista.id}>
                                {lista.nombre}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          loading={guardandoTipoId === tipo.id}
                          disabled={!asignaciones[tipo.id]}
                          onClick={() => guardarAsignacion(tipo)}
                        >
                          Guardar asignación
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

export default ListasPrecioPage
