import logoCompleto from '../../../assets/logo-completo.png'

export default function Footer() {
  return (
    <footer id="contacto" className="inicio-footer">
      <div className="inicio-footer__marca">
        <div className="inicio-logo inicio-logo--footer">
          <span className="inicio-logo__placa">
            <img src={logoCompleto} alt="" aria-hidden="true" className="inicio-logo__imagen" />
          </span>
          <div className="inicio-logo__texto">
            <strong>Corralón Norte</strong>
          </div>
        </div>
        <p>Todo para construir mejor, con stock y precios propios de cada sucursal.</p>
      </div>

      <div className="inicio-footer__columna">
        <h4>Comprar</h4>
        <a href="#destacados">Productos</a>
        <a href="#categorias">Categorías</a>
        <a href="#ofertas">Ofertas</a>
      </div>

      <div className="inicio-footer__columna">
        <h4>Ayuda</h4>
        <a href="#contacto">Contacto</a>
        <a href="#sucursales">Sucursales</a>
        <a href="#ofertas">Envíos</a>
      </div>

      <div className="inicio-footer__columna">
        <h4>Medios de pago</h4>
        <div className="inicio-footer__pagos">
          <span>VISA</span>
          <span>MASTER</span>
          <span>MP</span>
        </div>
      </div>
    </footer>
  )
}
