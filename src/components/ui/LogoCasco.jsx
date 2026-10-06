import { useId } from 'react'

/**
 * Casco del logo de Corralón Norte, en SVG para usarlo chico o sobre fondos
 * oscuros (menú lateral, encabezado de la tienda). Las ranuras son
 * transparentes, así que se ven sobre cualquier fondo. El logo completo con
 * el nombre está en src/assets/logo-corralon-norte.png.
 */
export default function LogoCasco({ size = 32, title, className, color = 'var(--color-brand)' }) {
  // Un id por instancia: con varios cascos en pantalla, un id repetido hace
  // que el navegador use la máscara de otro (y falle si ese está oculto).
  const id = `logo-casco-${useId().replace(/:/g, '')}`
  return (
    <svg
      className={className}
      width={size}
      height={Math.round(size * 0.75)}
      viewBox="0 0 64 48"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <mask id={id}>
          <rect width="64" height="48" fill="#fff" />
          <path
            d="M21 13 L24.5 27 M43 13 L39.5 27"
            stroke="#000"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M13 37.5 h8 M43 37.5 h8"
            stroke="#000"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </mask>
      </defs>
      <g fill={color} mask={`url(#${id})`}>
        <path d="M11 35 C11 19 20 8.5 32 8.5 C44 8.5 53 19 53 35 Z" />
        <rect x="27" y="4" width="10" height="25" rx="3" />
        <path d="M4.5 33.5 h55 a3 3 0 0 1 1.6 5.4 C54 42.6 44 45 32 45 C20 45 10 42.6 2.9 38.9 a3 3 0 0 1 1.6 -5.4 Z" />
      </g>
    </svg>
  )
}
