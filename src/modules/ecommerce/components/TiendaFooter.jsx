import { Building2, Clock, Mail, MapPin, Phone, ShieldCheck, Truck } from 'lucide-react'

export default function TiendaFooter({ onNavigate }) {
  return (
    <footer className="tienda-footer">
      <div className="tienda-footer-features">
        <div className="tienda-feature-card">
          <Truck size={24} className="tienda-feature-icon" />
          <div>
            <strong>Envíos directos a obra</strong>
            <p>Camiones propios y logística de descarga para materiales pesados.</p>
          </div>
        </div>
        <div className="tienda-feature-card">
          <ShieldCheck size={24} className="tienda-feature-icon" />
          <div>
            <strong>Stock en tiempo real</strong>
            <p>Reserva garantizada sobre nuestro depósito central de e-commerce.</p>
          </div>
        </div>
        <div className="tienda-feature-card">
          <Clock size={24} className="tienda-feature-icon" />
          <div>
            <strong>Retiro inmediato</strong>
            <p>Comprá online y retirá sin demoras por nuestro sector de carga.</p>
          </div>
        </div>
      </div>

      <div className="tienda-footer-main">
        <div className="tienda-footer-col">
          <div className="tienda-brand" style={{ marginBottom: 12 }}>
            <Building2 size={22} />
            <strong style={{ fontSize: 18 }}>Corralón del Sur</strong>
          </div>
          <p className="tienda-footer-desc">
            Venta mayorista y minorista de materiales para la construcción gruesa y fina.
            Asesoramos obras particulares, empresas constructoras y profesionales de la construcción.
          </p>
        </div>

        <div className="tienda-footer-col">
          <h4>Navegación</h4>
          <ul>
            <li><button type="button" onClick={() => onNavigate('catalogo')}>Catálogo de Materiales</button></li>
            <li><button type="button" onClick={() => onNavigate('carrito')}>Mi Carrito</button></li>
            <li><button type="button" onClick={() => onNavigate('mis-pedidos')}>Seguimiento de Pedidos</button></li>
            <li><button type="button" onClick={() => onNavigate('ingresar')}>Acceso Clientes</button></li>
          </ul>
        </div>

        <div className="tienda-footer-col">
          <h4>Casa Central & Salón</h4>
          <ul className="tienda-footer-contact">
            <li><MapPin size={16} /> Av. San Martín 1420, Salta Capital</li>
            <li><Phone size={16} /> (387) 456-7890 / WhatsApp: +54 9 387 512-3456</li>
            <li><Mail size={16} /> ventas@corralondelsur.com.ar</li>
            <li><Clock size={16} /> Lun a Vie: 08:00 - 18:00 · Sáb: 08:00 - 13:00</li>
          </ul>
        </div>

        <div className="tienda-footer-col">
          <h4>Medios de Pago & Seguridad</h4>
          <p className="tienda-footer-pago-desc">
            Operamos con <strong>Mercado Pago</strong> (tarjetas de crédito, débito y dinero en cuenta), transferencias bancarias y pago seguro en sucursal.
          </p>
          <div className="tienda-footer-badges">
            <span className="tienda-badge-pill">Mercado Pago</span>
            <span className="tienda-badge-pill">Transferencia</span>
            <span className="tienda-badge-pill">Tarjetas Débito/Crédito</span>
          </div>
        </div>
      </div>

      <div className="tienda-footer-bottom">
        <p>© {new Date().getFullYear()} Corralón del Norte. Todos los derechos reservados.</p>
        <p>Sistema de Gestión Comercial y E-commerce Integrado.</p>
      </div>
    </footer>
  )
}
