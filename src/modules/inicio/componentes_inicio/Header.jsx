import logoCompleto from '../../../assets/logo-completo.png'

const SECCIONES_NAV = [
  { label: 'Productos', href: '#destacados' },
  { label: 'Categorias', href: '#categorias' },
  { label: 'Ofertas', href: '#ofertas' },
  { label: 'Sucursales', href: '#sucursales' },
  { label: 'Contacto', href: '#contacto' },
]

export default function Header({
  session,
  sucursales,
  sucursalActualId,
  onCambiarSucursal,
  onIrALogin,
  onCerrarSesion,
}) {
  return (
    <header className="inicio-header">
      <div className="inicio-header__top">
        <div className="inicio-logo">
          <img src={logoCompleto} alt="" aria-hidden="true" className="inicio-logo__imagen" />
          <div className="inicio-logo__texto">
            <strong>Corralón</strong>
            <span>Norte S.A</span>
          </div>
        </div>

        <nav className="inicio-nav">
          {SECCIONES_NAV.map((seccion) => (
            <a key={seccion.href} href={seccion.href}>
              {seccion.label}
            </a>
          ))}
        </nav>

        {session ? (
          <div className="inicio-cuenta">
            <span className="inicio-cuenta__email">{session.user.email}</span>
            <button type="button" className="boton boton--cuenta" onClick={onCerrarSesion}>
              Salir
            </button>
          </div>
        ) : (
          <button type="button" className="boton boton--cuenta" onClick={onIrALogin}>
            Mi cuenta
          </button>
        )}
      </div>

      {sucursales.length > 0 && (
        <div className="inicio-header__sucursal">
          <span>Comprando en:</span>
          <select
            value={sucursalActualId ?? ''}
            onChange={(e) => onCambiarSucursal(e.target.value)}
            aria-label="Elegir sucursal"
          >
            {sucursales.map((sucursal) => (
              <option key={sucursal.id} value={sucursal.id}>
                {sucursal.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
    </header>
  )
}
