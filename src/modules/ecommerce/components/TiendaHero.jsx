import {
  Boxes,
  Building2,
  CheckCircle2,
  CreditCard,
  Hammer,
  Layers,
  Paintbrush,
  ShieldCheck,
  Truck,
} from 'lucide-react'

const CATEGORIAS_ICONOS = [
  { nombre: 'Cementos', icon: Building2 },
  { nombre: 'Cales', icon: Layers },
  { nombre: 'Áridos', icon: Boxes },
  { nombre: 'Hierros', icon: Hammer },
  { nombre: 'Pinturas', icon: Paintbrush },
]

export function TiendaHero({ categorias = [], categoriaSeleccionada, onSeleccionarCategoria }) {
  return (
    <section className="tienda-hero" aria-label="Bienvenida y promociones">
      <div className="tienda-hero-content">
        <div className="tienda-hero-badge">
          <Building2 size={15} />
          <span>Venta mayorista y minorista de materiales</span>
        </div>

        <h1 className="tienda-hero-title">
          Construí tu proyecto con la mejor calidad y entrega en obra
        </h1>

        <p className="tienda-hero-desc">
          Cementos, áridos, hierros, ladrillos, membranas y pinturas con stock en tiempo real y precios directos de depósito.
        </p>

        <div className="tienda-hero-pills">
          <div className="tienda-hero-pill-item">
            <Truck size={16} />
            <span>Envíos a obra con logística pesada</span>
          </div>
          <div className="tienda-hero-pill-item">
            <ShieldCheck size={16} />
            <span>Reserva de stock garantizada</span>
          </div>
          <div className="tienda-hero-pill-item">
            <CreditCard size={16} />
            <span>Mercado Pago & transferencias</span>
          </div>
        </div>

        {categorias.length > 0 && (
          <div className="tienda-hero-categorias">
            <span className="tienda-hero-cat-label">Rubros destacados:</span>
            <div className="tienda-hero-cat-list">
              <button
                type="button"
                className={`tienda-cat-bubble ${!categoriaSeleccionada ? 'is-active' : ''}`}
                onClick={() => onSeleccionarCategoria('')}
              >
                <span>Todos</span>
              </button>
              {categorias.map((cat) => {
                const iconoObj = CATEGORIAS_ICONOS.find((item) =>
                  cat.nombre.toLowerCase().includes(item.nombre.toLowerCase()),
                )
                const Icono = iconoObj ? iconoObj.icon : CheckCircle2

                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`tienda-cat-bubble ${categoriaSeleccionada === cat.id ? 'is-active' : ''}`}
                    onClick={() => onSeleccionarCategoria(cat.id)}
                  >
                    <Icono size={14} />
                    <span>{cat.nombre}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default TiendaHero
