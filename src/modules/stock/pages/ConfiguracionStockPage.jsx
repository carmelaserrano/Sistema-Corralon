import { useEffect, useState } from 'react'
import {
  createConfiguracionStock,
  getConfiguracionesStock,
  updateConfiguracionStock,
} from '../api/configuracionStockApi'
import { getArticulos } from '../api/articulosApi'
import { getDepositos } from '../api/depositosApi'

const configuracionInicial = {
  articulo_id: '',
  deposito_id: '',
  stock_minimo: '',
  stock_maximo: '',
}

function ConfiguracionStockPage() {
  const [configuraciones, setConfiguraciones] = useState([])
  const [articulos, setArticulos] = useState([])
  const [depositos, setDepositos] = useState([])

  const [form, setForm] = useState(configuracionInicial)
  const [editandoId, setEditandoId] = useState(null)

  const [filtroDeposito, setFiltroDeposito] = useState('')
  const [filtroArticulo, setFiltroArticulo] = useState('')

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)

  async function cargarCatalogos() {
    const [resultadoArticulos, depositosData] = await Promise.all([
      getArticulos({
        estado: 'activo',
        page: 1,
        pageSize: 1000,
      }),
      getDepositos(),
    ])

    setArticulos(resultadoArticulos.articulos)
    setDepositos(depositosData)
  }

  async function cargarConfiguraciones({
    deposito_id = filtroDeposito,
    articulo_id = filtroArticulo,
  } = {}) {
    try {
      setLoading(true)
      setError('')

      const data = await getConfiguracionesStock({
        deposito_id,
        articulo_id,
      })

      setConfiguraciones(data)
    } catch (err) {
      setError(
        err.message || 'No se pudieron cargar las configuraciones de stock',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarCatalogos().catch((err) =>
      setError(err.message || 'No se pudieron cargar artículos y depósitos'),
    )

    cargarConfiguraciones({
      deposito_id: '',
      articulo_id: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function manejarCambio(event) {
    const { name, value } = event.target

    setForm((actual) => ({
      ...actual,
      [name]: value,
    }))
  }

  function limpiarFormulario() {
    setForm(configuracionInicial)
    setEditandoId(null)
    setError('')
  }

  function comenzarEdicion(configuracion) {
    setForm({
      articulo_id: configuracion.producto_id,
      deposito_id: configuracion.deposito_id,
      stock_minimo: configuracion.min_stock,
      stock_maximo: configuracion.max_stock,
    })

    setEditandoId(configuracion.id)
    setError('')
    setAviso('')
  }

  async function guardarConfiguracion(event) {
    event.preventDefault()

    try {
      setError('')
      setAviso('')

      if (editandoId) {
        await updateConfiguracionStock(editandoId, form)
        setAviso('Configuración de stock actualizada')
      } else {
        await createConfiguracionStock(form)
        setAviso('Configuración de stock creada')
      }

      limpiarFormulario()
      await cargarConfiguraciones()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la configuración de stock')
    }
  }

  function aplicarFiltros(event) {
    event.preventDefault()

    cargarConfiguraciones({
      deposito_id: filtroDeposito,
      articulo_id: filtroArticulo,
    })
  }

  function limpiarFiltros() {
    setFiltroDeposito('')
    setFiltroArticulo('')

    cargarConfiguraciones({
      deposito_id: '',
      articulo_id: '',
    })
  }

  return (
    <main>
      <h1>Configuración de stock por depósito</h1>

      {error && <p role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      <section>
        <h2>
          {editandoId
            ? 'Editar configuración de stock'
            : 'Nueva configuración de stock'}
        </h2>

        <form onSubmit={guardarConfiguracion}>
          <div>
            <label htmlFor="articulo_id">Artículo</label>

            <select
              id="articulo_id"
              name="articulo_id"
              value={form.articulo_id}
              onChange={manejarCambio}
              disabled={Boolean(editandoId)}
              required
            >
              <option value="">Seleccionar artículo...</option>

              {articulos.map((articulo) => (
                <option key={articulo.id} value={articulo.id}>
                  {articulo.sku} - {articulo.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="deposito_id">Depósito</label>

            <select
              id="deposito_id"
              name="deposito_id"
              value={form.deposito_id}
              onChange={manejarCambio}
              disabled={Boolean(editandoId)}
              required
            >
              <option value="">Seleccionar depósito...</option>

              {depositos.map((deposito) => (
                <option key={deposito.id} value={deposito.id}>
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="stock_minimo">Stock mínimo</label>

            <input
              id="stock_minimo"
              name="stock_minimo"
              type="number"
              min="0"
              value={form.stock_minimo}
              onChange={manejarCambio}
              required
            />
          </div>

          <div>
            <label htmlFor="stock_maximo">Stock máximo</label>

            <input
              id="stock_maximo"
              name="stock_maximo"
              type="number"
              min="0"
              value={form.stock_maximo}
              onChange={manejarCambio}
              required
            />
          </div>

          <button type="submit">
            {editandoId ? 'Guardar cambios' : 'Crear configuración'}
          </button>

          {editandoId && (
            <button type="button" onClick={limpiarFormulario}>
              Cancelar
            </button>
          )}
        </form>
      </section>

      <section>
        <h2>Buscar y filtrar</h2>

        <form onSubmit={aplicarFiltros}>
          <label>
            Depósito
            <select
              value={filtroDeposito}
              onChange={(event) => setFiltroDeposito(event.target.value)}
            >
              <option value="">Todos</option>

              {depositos.map((deposito) => (
                <option key={deposito.id} value={deposito.id}>
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </label>

          <label>
            Artículo
            <select
              value={filtroArticulo}
              onChange={(event) => setFiltroArticulo(event.target.value)}
            >
              <option value="">Todos</option>

              {articulos.map((articulo) => (
                <option key={articulo.id} value={articulo.id}>
                  {articulo.sku} - {articulo.nombre}
                </option>
              ))}
            </select>
          </label>

          <button type="submit">Filtrar</button>

          <button type="button" onClick={limpiarFiltros}>
            Limpiar
          </button>
        </form>
      </section>

      <section>
        <h2>Configuraciones registradas</h2>

        {loading && <p>Cargando configuraciones...</p>}

        {!loading && configuraciones.length === 0 && (
          <p>No hay configuraciones registradas.</p>
        )}

        {!loading && configuraciones.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Depósito</th>
                <th>Stock actual</th>
                <th>Stock mínimo</th>
                <th>Stock máximo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {configuraciones.map((configuracion) => (
                <tr key={configuracion.id}>
                  <td>
                    {configuracion.producto?.sku
                      ? `${configuracion.producto.sku} - ${configuracion.producto.nombre}`
                      : configuracion.producto?.nombre || '-'}
                  </td>

                  <td>{configuracion.deposito?.nombre || '-'}</td>

                  <td>
                    {configuracion.stock_actual === null
                      ? 'Sin stock registrado'
                      : configuracion.stock_actual}
                  </td>

                  <td>{configuracion.min_stock}</td>
                  <td>{configuracion.max_stock}</td>

                  <td>{configuracion.estado_stock}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => comenzarEdicion(configuracion)}
                    >
                      Editar
                    </button>
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

export default ConfiguracionStockPage