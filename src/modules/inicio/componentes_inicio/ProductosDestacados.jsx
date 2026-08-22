export default function ProductosDestacados({ sucursalNombre, productos, loading, error }) {
  return (
    <section id="destacados" className="inicio-seccion">
      <h2>
        Destacados en <span className="inicio-destaque">{sucursalNombre ?? '...'}</span>
      </h2>

      {error && <p className="inicio-error">{error}</p>}
      {loading && <p>Cargando productos...</p>}

      {!loading && !error && productos.length === 0 && (
        <p className="inicio-vacio">Esta sucursal todavía no tiene stock cargado.</p>
      )}

      {!loading && productos.length > 0 && (
        <div className="inicio-productos">
          {productos.map((item) => (
            <div key={item.id} className="inicio-producto">
              <div className="inicio-producto__imagen" aria-hidden="true" />
              <div className="inicio-producto__cuerpo">
                <span className="inicio-producto__categoria">{item.producto?.categoria?.nombre}</span>
                <h3>{item.producto?.nombre}</h3>
                <span className="inicio-producto__precio">Consultar precio</span>
                <span className="inicio-producto__stock">
                  {item.cantidad} {item.producto?.unidad_medida?.abreviatura} disponibles
                </span>
                <button type="button" className="boton boton--primario">
                  Agregar al carrito
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
