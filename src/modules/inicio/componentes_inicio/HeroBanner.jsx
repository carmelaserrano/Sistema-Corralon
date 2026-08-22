import { useState } from 'react'

const SLIDES = [
  {
    badge: 'Ofertas del mes',
    titulo: 'Hasta 15% off en cemento',
    texto: 'Válido para compras mayoristas retiradas en la sucursal',
    cta: 'Ver productos',
  },
  {
    badge: 'Envío gratis',
    titulo: 'Envío sin cargo en compras +$100.000',
    texto: 'Aplica a pedidos dentro del radio de reparto de cada sucursal',
    cta: 'Ver productos',
  },
  {
    badge: 'Nuevo',
    titulo: 'Sumamos hierros y mallas soldadas',
    texto: 'Disponible ya en Sucursal Centro',
    cta: 'Ver productos',
  },
]

export default function HeroBanner() {
  const [indice, setIndice] = useState(0)
  const slide = SLIDES[indice]

  const anterior = () => setIndice((i) => (i === 0 ? SLIDES.length - 1 : i - 1))
  const siguiente = () => setIndice((i) => (i === SLIDES.length - 1 ? 0 : i + 1))

  return (
    <section id="ofertas" className="inicio-hero">
      <button type="button" className="inicio-hero__flecha" onClick={anterior} aria-label="Anterior">
        ‹
      </button>

      <div className="inicio-hero__contenido">
        <span className="inicio-hero__badge">{slide.badge}</span>
        <h1>{slide.titulo}</h1>
        <p>{slide.texto}</p>
        <button type="button" className="boton boton--primario">
          {slide.cta}
        </button>
      </div>

      <button type="button" className="inicio-hero__flecha" onClick={siguiente} aria-label="Siguiente">
        ›
      </button>

      <div className="inicio-hero__puntos">
        {SLIDES.map((s, i) => (
          <button
            key={s.titulo}
            type="button"
            className={`inicio-hero__punto ${i === indice ? 'inicio-hero__punto--activo' : ''}`}
            onClick={() => setIndice(i)}
            aria-label={`Ir al slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  )
}
