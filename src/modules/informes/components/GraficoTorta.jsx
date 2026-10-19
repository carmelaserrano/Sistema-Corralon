import { useState } from 'react'

// Donut SVG simple (sin librerías), hermano de GraficoBarras: mismo patrón
// de leyenda y tooltip al pasar el mouse. Pensado para pocas porciones
// (2 a 4): la composición de un total, no series en el tiempo.
const ANCHO = 220
const ALTO = 220
const CENTRO = ANCHO / 2
const RADIO = 78
const GROSOR = 34
const CIRCUNFERENCIA = 2 * Math.PI * RADIO

export default function GraficoTorta({ datos, formato, titulo }) {
  const [foco, setFoco] = useState(null)
  const total = datos.reduce((suma, d) => suma + (d.valor || 0), 0)

  let acumulado = 0
  const porciones = datos
    .filter((d) => d.valor > 0)
    .map((d) => {
      const fraccion = total ? d.valor / total : 0
      const largo = fraccion * CIRCUNFERENCIA
      const dashoffset = CIRCUNFERENCIA * (1 - acumulado)
      acumulado += fraccion
      return { ...d, fraccion, largo, dashoffset }
    })

  return (
    <div className="grafico-torta">
      <ul className="grafico-leyenda" aria-label="Referencias">
        {datos.map((d) => (
          <li key={d.id}>
            <span className="grafico-leyenda-color" style={{ background: d.color }} aria-hidden="true" />
            {d.label} · {formato(d.valor)}
          </li>
        ))}
      </ul>

      <div className="grafico-torta-lienzo">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width={ANCHO} height={ALTO} role="img" aria-label={titulo}>
          <g transform={`rotate(-90 ${CENTRO} ${CENTRO})`}>
            <circle
              cx={CENTRO}
              cy={CENTRO}
              r={RADIO}
              fill="none"
              className="grafico-torta-fondo"
              strokeWidth={GROSOR}
            />
            {porciones.map((p) => (
              <circle
                key={p.id}
                cx={CENTRO}
                cy={CENTRO}
                r={RADIO}
                fill="none"
                stroke={p.color}
                strokeWidth={GROSOR}
                strokeDasharray={`${p.largo} ${CIRCUNFERENCIA - p.largo}`}
                strokeDashoffset={p.dashoffset}
                className={foco && foco !== p.id ? 'grafico-atenuado' : undefined}
                onMouseEnter={() => setFoco(p.id)}
                onMouseLeave={() => setFoco(null)}
              />
            ))}
          </g>
          <text x={CENTRO} y={CENTRO - 6} textAnchor="middle" className="grafico-torta-total">
            {formato(total)}
          </text>
          <text x={CENTRO} y={CENTRO + 14} textAnchor="middle" className="grafico-torta-total-label">
            Total
          </text>
        </svg>

      </div>

      <p className="grafico-torta-detalle" role="status">
        {(() => {
          const p = porciones.find((x) => x.id === foco)
          return p ? `${p.label}: ${formato(p.valor)} (${Math.round(p.fraccion * 100)} %)` : ' '
        })()}
      </p>
    </div>
  )
}
