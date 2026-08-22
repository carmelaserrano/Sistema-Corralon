export default function Beneficios({ cantidadSucursales }) {
  const items = [
    { icono: '🚚', texto: 'Envíos propios' },
    { icono: '✓', texto: 'Mejores precios' },
    { icono: '📍', texto: `${cantidadSucursales} Sucursales` },
    { icono: '🛡', texto: 'Pagos seguros' },
  ]

  return (
    <section className="inicio-beneficios">
      {items.map((item) => (
        <div key={item.texto} className="inicio-beneficios__item">
          <span aria-hidden="true">{item.icono}</span>
          <span>{item.texto}</span>
        </div>
      ))}
    </section>
  )
}
