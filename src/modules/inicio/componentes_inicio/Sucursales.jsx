export default function Sucursales({ sucursales, sucursalActualId, onElegir }) {
  return (
    <section id="sucursales" className="inicio-seccion">
      <h2>Nuestras sucursales</h2>

      {sucursales.length === 0 && <p className="inicio-vacio">Todavía no hay sucursales cargadas.</p>}

      {sucursales.length > 0 && (
        <div className="inicio-sucursales">
          {sucursales.map((sucursal) => {
            const esActual = sucursal.id === sucursalActualId
            return (
              <div key={sucursal.id} className="inicio-sucursal">
                <h3>{sucursal.nombre}</h3>
                {sucursal.direccion && <p>{sucursal.direccion}</p>}
                {esActual ? (
                  <span className="inicio-sucursal__actual">Sucursal actual</span>
                ) : (
                  <button type="button" className="boton boton--secundario" onClick={() => onElegir(sucursal.id)}>
                    Elegir esta sucursal
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
