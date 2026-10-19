import { diasDelRango, etiquetaRango } from '../informeIngresos'
import { rangoDePeriodo } from '../selectorPeriodo'

export default function SelectorPeriodo({ titulo, periodo, onCambio, meses }) {
  const rango = rangoDePeriodo(periodo)
  return (
    <fieldset className="informe-periodo">
      <legend>{titulo}</legend>
      <div className="informe-periodo-tipo" role="group" aria-label={`Cómo elegir el ${titulo.toLowerCase()}`}>
        {[['mes', 'Un mes'], ['semana', 'Una semana'], ['fechas', 'Entre fechas']].map(([tipo, label]) => (
          <button
            key={tipo}
            type="button"
            aria-pressed={periodo.tipo === tipo}
            className={periodo.tipo === tipo ? 'is-active' : undefined}
            onClick={() => onCambio({ ...periodo, tipo })}
          >
            {label}
          </button>
        ))}
      </div>
      {periodo.tipo === 'mes' && (
        <label>
          Mes
          <select value={periodo.mes} onChange={(e) => onCambio({ ...periodo, mes: e.target.value })}>
            {meses.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
          </select>
        </label>
      )}
      {periodo.tipo === 'semana' && (
        <label>
          Cualquier día de la semana
          <input type="date" value={periodo.fecha} onChange={(e) => e.target.value && onCambio({ ...periodo, fecha: e.target.value })} />
        </label>
      )}
      {periodo.tipo === 'fechas' && (
        <div className="informe-fechas">
          <label>
            Desde
            <input type="date" value={periodo.desde} max={periodo.hasta} onChange={(e) => e.target.value && onCambio({ ...periodo, desde: e.target.value })} />
          </label>
          <label>
            Hasta
            <input type="date" value={periodo.hasta} min={periodo.desde} onChange={(e) => e.target.value && onCambio({ ...periodo, hasta: e.target.value })} />
          </label>
        </div>
      )}
      <p className="informe-periodo-rango">{etiquetaRango(rango.desde, rango.hasta)} · {diasDelRango(rango.desde, rango.hasta)} días</p>
    </fieldset>
  )
}
