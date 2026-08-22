function inicialDe(nombre) {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((palabra) => palabra[0])
    .join('')
    .toUpperCase()
}

export default function CategoryGrid({ categorias, loading, error }) {
  return (
    <section id="categorias" className="inicio-seccion">
      <h2>Comprá por categoría</h2>

      {error && <p className="inicio-error">{error}</p>}
      {loading && <p>Cargando categorías...</p>}

      {!loading && !error && categorias.length === 0 && (
        <p className="inicio-vacio">Todavía no hay categorías cargadas.</p>
      )}

      {!loading && categorias.length > 0 && (
        <div className="inicio-categorias">
          {categorias.map((categoria, i) => (
            <div key={categoria.id} className="inicio-categoria">
              <span
                className={`inicio-categoria__icono ${i % 2 === 0 ? 'inicio-categoria__icono--navy' : 'inicio-categoria__icono--naranja'}`}
              >
                {inicialDe(categoria.nombre)}
              </span>
              <span>{categoria.nombre}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
