export default function SelectorMultiple({ titulo, opciones, seleccion, onCambio, textoTodos }) {
  const alternar = (valor) => onCambio(seleccion.includes(valor) ? seleccion.filter((v) => v !== valor) : [...seleccion, valor])
  return (
    <fieldset className="informe-chips">
      <legend>{titulo}</legend>
      <button type="button" aria-pressed={seleccion.length === 0} className={seleccion.length === 0 ? 'is-active' : undefined} onClick={() => onCambio([])}>
        {textoTodos}
      </button>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={seleccion.includes(o.valor)}
          className={seleccion.includes(o.valor) ? 'is-active' : undefined}
          onClick={() => alternar(o.valor)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  )
}
