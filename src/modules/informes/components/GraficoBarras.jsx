import { useEffect, useRef, useState } from 'react'

// Ancho inicial; después se toma el ancho real del contenedor para que el
// texto del SVG no se agrande al estirarse (queda en 11px).
const ANCHO_INICIAL = 720
const ALTO = 280
const MARGEN = { arriba: 24, derecha: 12, abajo: 40, izquierda: 64 }
const ANCHO_BARRA_MAX = 24
const SEPARACION = 2

/** Tope "redondo" del eje: 1, 2, 2,5 o 5 × 10^n. */
function topeEje(maximo) {
  if (maximo <= 0) return 1
  const exponente = 10 ** Math.floor(Math.log10(maximo))
  const base = [1, 2, 2.5, 5, 10].find((b) => b * exponente >= maximo)
  return base * exponente
}

/** Montos cortos para el eje: $ 1,2 M · $ 350 k · $ 800. */
function montoCorto(valor) {
  const abs = Math.abs(valor)
  if (abs >= 1_000_000) return `$ ${(valor / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 2 })} M`
  if (abs >= 1_000) return `$ ${(valor / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} k`
  return `$ ${valor.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

/** Rectángulo con las esquinas de arriba redondeadas (punta de dato); base recta. */
function rutaBarra(x, y, ancho, alto, radio) {
  const r = Math.min(radio, ancho / 2, alto)
  if (alto <= 0) return ''
  return `M${x},${y + alto} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r} L${x + ancho},${y + alto} Z`
}

/**
 * Gráfico de columnas apiladas o agrupadas.
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string}>} props.categorias Eje X (períodos).
 * @param {Array<{id: string, label: string, color: string}>} props.series
 * @param {(categoriaId: string, serieId: string) => number} props.valor
 * @param {'apilado'|'agrupado'} [props.modo]
 * @param {(n: number) => string} props.formato Monto completo para el tooltip.
 * @param {string} props.titulo Descripción accesible del gráfico.
 */
export default function GraficoBarras({ categorias, series, valor, modo = 'apilado', formato, titulo }) {
  const [foco, setFoco] = useState(null)
  const [ANCHO, setAncho] = useState(ANCHO_INICIAL)
  const lienzoRef = useRef(null)

  useEffect(() => {
    const nodo = lienzoRef.current
    if (!nodo || typeof ResizeObserver === 'undefined') return undefined
    const observador = new ResizeObserver(([entrada]) => {
      const ancho = Math.round(entrada.contentRect.width)
      if (ancho > 0) setAncho(ancho)
    })
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  const anchoPlot = ANCHO - MARGEN.izquierda - MARGEN.derecha
  const altoPlot = ALTO - MARGEN.arriba - MARGEN.abajo
  const totalCategoria = (c) => series.reduce((s, serie) => s + (valor(c.id, serie.id) || 0), 0)
  const maximo = modo === 'apilado'
    ? Math.max(0, ...categorias.map(totalCategoria))
    : Math.max(0, ...categorias.flatMap((c) => series.map((s) => valor(c.id, s.id) || 0)))
  const tope = topeEje(maximo)
  const escalaY = (v) => (v / tope) * altoPlot
  const anchoBanda = anchoPlot / Math.max(categorias.length, 1)
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((p) => p * tope)
  // Si hay muchas categorías, el eje muestra una de cada N etiquetas.
  const pasoEtiqueta = Math.ceil(categorias.length / 12)

  return (
    <div className="grafico-barras">
      <ul className="grafico-leyenda" aria-label="Referencias">
        {series.map((s) => (
          <li key={s.id}>
            <span className="grafico-leyenda-color" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="grafico-lienzo" ref={lienzoRef}>
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width={ANCHO} height={ALTO} role="img" aria-label={titulo}>
          {/* Grilla y eje Y, en tono recesivo */}
          {marcas.map((m) => {
            const y = MARGEN.arriba + altoPlot - escalaY(m)
            return (
              <g key={m}>
                <line x1={MARGEN.izquierda} x2={ANCHO - MARGEN.derecha} y1={y} y2={y} className="grafico-grilla" />
                <text x={MARGEN.izquierda - 8} y={y} className="grafico-eje" textAnchor="end" dominantBaseline="middle">
                  {montoCorto(m)}
                </text>
              </g>
            )
          })}

          {categorias.map((c, i) => {
            const x0 = MARGEN.izquierda + i * anchoBanda
            const base = MARGEN.arriba + altoPlot
            const marcasCategoria = []

            if (modo === 'apilado') {
              const ancho = Math.min(ANCHO_BARRA_MAX, anchoBanda * 0.6)
              const x = x0 + (anchoBanda - ancho) / 2
              let acumulado = 0
              const tramos = series.map((s) => ({ s, v: valor(c.id, s.id) || 0 })).filter((t) => t.v > 0)
              tramos.forEach(({ s, v }, j) => {
                const alto = escalaY(v)
                const y = base - escalaY(acumulado) - alto
                acumulado += v
                // 2px de separación entre tramos; solo el de arriba lleva la punta redondeada.
                const altoVisible = Math.max(alto - (j > 0 ? SEPARACION : 0), 0)
                const esUltimo = j === tramos.length - 1
                marcasCategoria.push(
                  <path
                    key={s.id}
                    d={esUltimo ? rutaBarra(x, y, ancho, altoVisible, 4) : `M${x},${y} h${ancho} v${altoVisible} h${-ancho} Z`}
                    fill={s.color}
                    className={foco && (foco.categoria !== c.id || foco.serie !== s.id) ? 'grafico-atenuado' : undefined}
                    onMouseEnter={() => setFoco({ categoria: c.id, serie: s.id, x: x + ancho / 2, y, texto: `${c.label} · ${s.label}: ${formato(v)}` })}
                    onMouseLeave={() => setFoco(null)}
                  />,
                )
              })
              const total = totalCategoria(c)
              if (total > 0) {
                marcasCategoria.push(
                  <text key="total" x={x + ancho / 2} y={base - escalaY(total) - 6} className="grafico-total" textAnchor="middle">
                    {montoCorto(total)}
                  </text>,
                )
              }
            } else {
              const anchoGrupo = anchoBanda * 0.8
              const ancho = Math.min(ANCHO_BARRA_MAX, (anchoGrupo - SEPARACION * (series.length - 1)) / series.length)
              const anchoUsado = ancho * series.length + SEPARACION * (series.length - 1)
              const xGrupo = x0 + (anchoBanda - anchoUsado) / 2
              series.forEach((s, j) => {
                const v = valor(c.id, s.id) || 0
                const alto = escalaY(v)
                const x = xGrupo + j * (ancho + SEPARACION)
                marcasCategoria.push(
                  <path
                    key={s.id}
                    d={rutaBarra(x, base - alto, ancho, alto, 4)}
                    fill={s.color}
                    className={foco && (foco.categoria !== c.id || foco.serie !== s.id) ? 'grafico-atenuado' : undefined}
                    onMouseEnter={() => setFoco({ categoria: c.id, serie: s.id, x: x + ancho / 2, y: base - alto, texto: `${c.label} · ${s.label}: ${formato(v)}` })}
                    onMouseLeave={() => setFoco(null)}
                  />,
                )
              })
            }

            return (
              <g key={c.id}>
                {marcasCategoria}
                {i % pasoEtiqueta === 0 && (
                  <text x={x0 + anchoBanda / 2} y={ALTO - MARGEN.abajo + 18} className="grafico-eje" textAnchor="middle">
                    {c.label}
                  </text>
                )}
              </g>
            )
          })}

          <line x1={MARGEN.izquierda} x2={ANCHO - MARGEN.derecha} y1={MARGEN.arriba + altoPlot} y2={MARGEN.arriba + altoPlot} className="grafico-base" />
        </svg>

        {foco && (
          <div
            className="grafico-tooltip"
            role="status"
            style={{ left: `${(foco.x / ANCHO) * 100}%`, top: `${(foco.y / ALTO) * 100}%` }}
          >
            {foco.texto}
          </div>
        )}
      </div>
    </div>
  )
}
