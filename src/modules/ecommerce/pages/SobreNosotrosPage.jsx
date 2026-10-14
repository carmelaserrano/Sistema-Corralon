import { Clock, Mail, MapPin, Phone, Truck } from 'lucide-react'
import { DATOS_COMERCIALES } from '../datosComerciales'

const DIRECCION_MAPA = 'Caseros 850, Salta Capital, Salta, Argentina'
const MAPA_EMBED_URL = `https://maps.google.com/maps?q=${encodeURIComponent(DIRECCION_MAPA)}&output=embed`
const MAPA_DIRECCIONES_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(DIRECCION_MAPA)}`

export default function SobreNosotrosPage() {
  return (
    <section className="tienda-sobre-nosotros" aria-labelledby="titulo-sobre-nosotros">
      <header className="tienda-sobre-nosotros-header">
        <span className="tienda-sobre-nosotros-kicker">Corralón Norte · Salta, Argentina</span>
        <h1 id="titulo-sobre-nosotros">Sobre nosotros</h1>
        <p>
          Acompañamos tus proyectos con materiales para la construcción, atención
          para obras particulares y profesionales, y opciones de entrega o retiro.
        </p>
      </header>

      <div className="tienda-sobre-nosotros-grid">
        <div className="tienda-sobre-nosotros-info">
          <article className="tienda-sobre-nosotros-card">
            <Truck size={22} aria-hidden="true" />
            <div>
              <h2>Materiales y logística para tu obra</h2>
              <p>
                Encontrá materiales de construcción gruesa y fina, consultá
                disponibilidad y elegí envío a obra o retiro en sucursal.
              </p>
            </div>
          </article>

          <article className="tienda-sobre-nosotros-card">
            <MapPin size={22} aria-hidden="true" />
            <div>
              <h2>Sucursal Centro</h2>
              <p>{DATOS_COMERCIALES.domicilio}</p>
              <a href={MAPA_DIRECCIONES_URL} target="_blank" rel="noreferrer">
                Cómo llegar
              </a>
            </div>
          </article>

          <article className="tienda-sobre-nosotros-card">
            <Clock size={22} aria-hidden="true" />
            <div>
              <h2>Horarios de atención</h2>
              <p>Lunes a viernes de 8:00 a 18:00 · Sábados de 8:00 a 13:00.</p>
            </div>
          </article>

          <article className="tienda-sobre-nosotros-card">
            <Phone size={22} aria-hidden="true" />
            <div>
              <h2>Contacto</h2>
              <p>
                <a href={`tel:${DATOS_COMERCIALES.telefono.replace(/[^\d+]/g, '')}`}>
                  {DATOS_COMERCIALES.telefono}
                </a>
              </p>
              <p>
                <a href={`mailto:${DATOS_COMERCIALES.email}`}>
                  <Mail size={14} aria-hidden="true" />
                  {DATOS_COMERCIALES.email}
                </a>
              </p>
            </div>
          </article>
        </div>

        <div className="tienda-sobre-nosotros-mapa">
          <iframe
            title="Mapa de Corralón Norte en Salta"
            src={MAPA_EMBED_URL}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  )
}
