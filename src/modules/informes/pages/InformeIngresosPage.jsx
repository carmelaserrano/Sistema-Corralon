import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, BarChart3, CalendarRange, Download, FileDown, TrendingUp, Trophy } from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import GraficoBarras from '../components/GraficoBarras'
import {
  ATAJOS_RANGO,
  COLORES_SERIE,
  ETIQUETA_FUENTE,
  FUENTES,
  MESES_LARGOS,
  agruparPorPeriodo,
  agruparPorSucursal,
  diasDelRango,
  etiquetaPeriodo,
  etiquetaRango,
  filasComparacion,
  indicadores,
  rangoDeAtajo,
  rangoDeMes,
  rangoDeSemana,
  resumenFacturado,
  totalesDe,
  deISO,
} from '../informeIngresos'
import {
  listarMediosInforme,
  listarSucursalesInforme,
  obtenerFacturado,
  obtenerIngresos,
} from '../api/informesApi'
import { descargarCsv } from '../../stock/api/reportesApi'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const formatoMoneda = (n) => moneda.format(n)
const formatoVariacion = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('es-AR')} %`)

/** Opciones de mes para el modo Comparar: los últimos 18 meses. */
function opcionesDeMes(hoy = new Date()) {
  return Array.from({ length: 18 }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    return { valor: `${fecha.getFullYear()}-${fecha.getMonth()}`, label: `${MESES_LARGOS[fecha.getMonth()]} ${fecha.getFullYear()}` }
  })
}

/** Rango de un período del modo Comparar según cómo se eligió. */
function rangoDePeriodo(periodo) {
  if (periodo.tipo === 'mes') {
    const [anio, mes] = periodo.mes.split('-').map(Number)
    return rangoDeMes(anio, mes)
  }
  if (periodo.tipo === 'semana') return rangoDeSemana(deISO(periodo.fecha))
  return { desde: periodo.desde, hasta: periodo.hasta }
}

function SelectorPeriodo({ titulo, periodo, onCambio, meses }) {
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

function SelectorMultiple({ titulo, opciones, seleccion, onCambio, textoTodos }) {
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

export default function InformeIngresosPage() {
  const hoy = useMemo(() => new Date(), [])
  const meses = useMemo(() => opcionesDeMes(hoy), [hoy])
  const inicial = useMemo(() => rangoDeAtajo('ultimos-3-meses', hoy), [hoy])

  const [modo, setModo] = useState('evolucion')
  const [atajo, setAtajo] = useState('ultimos-3-meses')
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [agrupacion, setAgrupacion] = useState(inicial.agrupacion)
  const [compararSucursales, setCompararSucursales] = useState(false)
  const [sucursales, setSucursales] = useState([])
  const [medios, setMedios] = useState([])
  const [periodoA, setPeriodoA] = useState({ tipo: 'mes', mes: meses[2].valor, fecha: inicial.hasta, desde: inicial.desde, hasta: inicial.hasta })
  const [periodoB, setPeriodoB] = useState({ tipo: 'mes', mes: meses[0].valor, fecha: inicial.hasta, desde: inicial.desde, hasta: inicial.hasta })

  const [opcionesSucursal, setOpcionesSucursal] = useState([])
  const [opcionesMedio, setOpcionesMedio] = useState([])
  const [ingresos, setIngresos] = useState([])
  const [facturado, setFacturado] = useState([])
  const [comparacion, setComparacion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listarSucursalesInforme().then((s) => setOpcionesSucursal(s.map((x) => ({ valor: x.id, label: x.nombre })))).catch(() => {})
    listarMediosInforme().then((m) => setOpcionesMedio(m.map((x) => ({ valor: x, label: x })))).catch(() => {})
  }, [])

  const rangoA = rangoDePeriodo(periodoA)
  const rangoB = rangoDePeriodo(periodoB)
  const claveA = `${rangoA.desde}|${rangoA.hasta}`
  const claveB = `${rangoB.desde}|${rangoB.hasta}`

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setError('')
    const filtros = { sucursales, medios }
    const consulta = modo === 'evolucion'
      ? Promise.all([
        obtenerIngresos({ desde, hasta, agrupacion, ...filtros }),
        obtenerFacturado({ desde, hasta, agrupacion, sucursales }),
      ]).then(([filasIngresos, filasFacturado]) => {
        if (!vigente) return
        setIngresos(filasIngresos)
        setFacturado(filasFacturado)
      })
      : Promise.all([
        obtenerIngresos({ ...rangoA, agrupacion: 'total', ...filtros }),
        obtenerIngresos({ ...rangoB, agrupacion: 'total', ...filtros }),
      ]).then(([filasA, filasB]) => {
        if (vigente) setComparacion({ a: totalesDe(filasA), b: totalesDe(filasB) })
      })
    consulta
      .catch((err) => vigente && setError(err.message || 'No pudimos calcular el informe'))
      .finally(() => vigente && setCargando(false))
    return () => { vigente = false }
    // rangoA/rangoB se derivan de claveA/claveB.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, desde, hasta, agrupacion, sucursales, medios, claveA, claveB])

  function elegirAtajo(id) {
    const rango = rangoDeAtajo(id, hoy)
    setAtajo(id)
    setDesde(rango.desde)
    setHasta(rango.hasta)
    setAgrupacion(rango.agrupacion)
  }

  // ---- Modo evolución -------------------------------------------------------
  const periodos = useMemo(() => agruparPorPeriodo(ingresos), [ingresos])
  const porSucursal = useMemo(() => agruparPorSucursal(ingresos), [ingresos])
  const kpis = indicadores(periodos)
  const facturadoPorPeriodo = useMemo(() => resumenFacturado(facturado), [facturado])
  const fuentesConDatos = FUENTES.filter((f) => periodos.some((p) => p.porFuente[f.id]))
  const categorias = (compararSucursales ? porSucursal.periodos : periodos).map((p) => ({
    id: p.inicio, label: etiquetaPeriodo(p.inicio, p.fin, agrupacion),
  }))
  const seriesFuente = FUENTES.map((f, i) => ({ id: f.id, label: f.label, color: COLORES_SERIE[i] }))
  const seriesSucursal = porSucursal.sucursales.map((s, i) => ({ id: s.id, label: s.nombre, color: COLORES_SERIE[i % COLORES_SERIE.length] }))
  const valorFuente = (periodo, fuente) => periodos.find((p) => p.inicio === periodo)?.porFuente[fuente] ?? 0
  const valorSucursal = (periodo, sucursal) => porSucursal.periodos.find((p) => p.inicio === periodo)?.porSucursal[sucursal] ?? 0

  // ---- Modo comparar --------------------------------------------------------
  const diasA = diasDelRango(rangoA.desde, rangoA.hasta)
  const diasB = diasDelRango(rangoB.desde, rangoB.hasta)
  const filasComparar = comparacion ? filasComparacion(comparacion.a, comparacion.b, diasA, diasB) : []
  const etiquetaA = `A · ${etiquetaRango(rangoA.desde, rangoA.hasta)}`
  const etiquetaB = `B · ${etiquetaRango(rangoB.desde, rangoB.hasta)}`

  // ---- Exportar -------------------------------------------------------------
  const nombreSucursales = sucursales.length
    ? opcionesSucursal.filter((o) => sucursales.includes(o.valor)).map((o) => o.label).join(', ')
    : 'todas las sucursales'
  const subtitulo = modo === 'evolucion'
    ? `${etiquetaRango(desde, hasta)} · por ${agrupacion} · ${nombreSucursales}${medios.length ? ` · ${medios.join(', ')}` : ''}`
    : `${etiquetaA} contra ${etiquetaB} · ${nombreSucursales}`

  function tablasParaExportar() {
    if (modo === 'comparar') {
      return [{
        titulo: 'Comparación de períodos',
        columnas: ['Concepto', etiquetaA, etiquetaB, 'Diferencia', 'Variación'],
        filas: filasComparar.map((f) => [f.concepto, formatoMoneda(f.a), formatoMoneda(f.b), formatoMoneda(f.diferencia), formatoVariacion(f.variacion)]),
      }]
    }
    return [
      {
        titulo: 'Cobrado por período',
        columnas: ['Período', ...FUENTES.map((f) => f.label), 'Total'],
        filas: periodos.map((p) => [
          etiquetaPeriodo(p.inicio, p.fin, agrupacion),
          ...FUENTES.map((f) => formatoMoneda(p.porFuente[f.id] ?? 0)),
          formatoMoneda(p.total),
        ]),
      },
      {
        titulo: 'Facturado por período',
        columnas: ['Período', 'Facturas', 'Notas de crédito', 'Notas de débito', 'Neto'],
        filas: facturadoPorPeriodo.map((p) => [
          etiquetaPeriodo(p.inicio, p.fin, agrupacion),
          formatoMoneda(p.factura), formatoMoneda(p.nota_credito), formatoMoneda(p.nota_debito), formatoMoneda(p.neto),
        ]),
      },
    ]
  }

  function exportarCsv() {
    const [tabla] = tablasParaExportar()
    const columnas = tabla.columnas.map((titulo, i) => ({ titulo, valor: (fila) => fila[i] }))
    descargarCsv(`informe-ingresos-${modo}-${new Date().toISOString().slice(0, 10)}.csv`, columnas, tabla.filas)
  }

  async function exportarPdf() {
    const { armarInformePdf } = await import('../pdf/informePdf')
    armarInformePdf({ titulo: 'Informe de ingresos', subtitulo, tablas: tablasParaExportar() })
      .save(`informe-ingresos-${modo}-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const sinDatos = !cargando && !error && (modo === 'evolucion' ? periodos.length === 0 : !comparacion || (comparacion.a.total === 0 && comparacion.b.total === 0))

  return (
    <div className="informe-page">
      <PageHeader
        kicker="Informes"
        title="Informe de ingresos"
        description="Lo cobrado: la plata que efectivamente entró, por mostrador, cobranzas de cuenta corriente, tienda online e ingresos de caja."
        actions={
          <div className="informe-exportar">
            <Button type="button" variant="ghost" icon={Download} onClick={exportarCsv} disabled={cargando || sinDatos}>CSV</Button>
            <Button type="button" variant="ghost" icon={FileDown} onClick={exportarPdf} disabled={cargando || sinDatos}>PDF</Button>
          </div>
        }
      />

      <div className="tabs" role="tablist" aria-label="Modo del informe">
        <button type="button" role="tab" aria-selected={modo === 'evolucion'} onClick={() => setModo('evolucion')}>
          <BarChart3 size={16} aria-hidden="true" /> Evolución
        </button>
        <button type="button" role="tab" aria-selected={modo === 'comparar'} onClick={() => setModo('comparar')}>
          <ArrowLeftRight size={16} aria-hidden="true" /> Comparar períodos
        </button>
      </div>

      <section className="informe-filtros" aria-label="Filtros">
        {modo === 'evolucion' ? (
          <>
            <fieldset className="informe-chips">
              <legend>Rango</legend>
              {ATAJOS_RANGO.map((a) => (
                <button key={a.id} type="button" aria-pressed={atajo === a.id} className={atajo === a.id ? 'is-active' : undefined} onClick={() => elegirAtajo(a.id)}>
                  {a.label}
                </button>
              ))}
            </fieldset>
            <div className="informe-fechas">
              <label>
                Desde
                <input type="date" value={desde} max={hasta} onChange={(e) => { if (e.target.value) { setDesde(e.target.value); setAtajo(null) } }} />
              </label>
              <label>
                Hasta
                <input type="date" value={hasta} min={desde} onChange={(e) => { if (e.target.value) { setHasta(e.target.value); setAtajo(null) } }} />
              </label>
              <label>
                Agrupar por
                <select value={agrupacion} onChange={(e) => setAgrupacion(e.target.value)}>
                  <option value="semana">Semana (lunes a domingo)</option>
                  <option value="mes">Mes</option>
                </select>
              </label>
              <label className="informe-check">
                <input type="checkbox" checked={compararSucursales} onChange={(e) => setCompararSucursales(e.target.checked)} />
                Comparar sucursales
              </label>
            </div>
          </>
        ) : (
          <div className="informe-periodos">
            <SelectorPeriodo titulo="Período A" periodo={periodoA} onCambio={setPeriodoA} meses={meses} />
            <SelectorPeriodo titulo="Período B" periodo={periodoB} onCambio={setPeriodoB} meses={meses} />
          </div>
        )}
        <SelectorMultiple titulo="Sucursales" opciones={opcionesSucursal} seleccion={sucursales} onCambio={setSucursales} textoTodos="Todas" />
        <SelectorMultiple titulo="Medios de pago" opciones={opcionesMedio} seleccion={medios} onCambio={setMedios} textoTodos="Todos" />
      </section>

      {error && <Feedback tone="error">{error}</Feedback>}
      {cargando && <p className="loading-state" role="status">Calculando el informe…</p>}
      {sinDatos && <Feedback>No hay ingresos registrados con estos filtros.</Feedback>}

      {!cargando && !error && !sinDatos && modo === 'evolucion' && (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total cobrado" value={formatoMoneda(kpis.total)} icon={TrendingUp} tone="brand" helperText={etiquetaRango(desde, hasta)} />
            <KpiCard label={`Promedio por ${agrupacion}`} value={formatoMoneda(kpis.promedio)} icon={CalendarRange} tone="info" helperText={`${periodos.length} ${agrupacion === 'mes' ? 'meses' : 'semanas'} con ingresos`} />
            <KpiCard
              label={`Mejor ${agrupacion}`}
              value={kpis.mejor ? formatoMoneda(kpis.mejor.total) : '—'}
              icon={Trophy}
              tone="success"
              helperText={kpis.mejor ? etiquetaPeriodo(kpis.mejor.inicio, kpis.mejor.fin, agrupacion) : ''}
            />
          </div>

          <section className="informe-bloque">
            <h2>{compararSucursales ? 'Cobrado por sucursal' : 'Cobrado por fuente'}</h2>
            <GraficoBarras
              categorias={categorias}
              series={compararSucursales ? seriesSucursal : seriesFuente.filter((s) => fuentesConDatos.some((f) => f.id === s.id))}
              valor={compararSucursales ? valorSucursal : valorFuente}
              modo={compararSucursales ? 'agrupado' : 'apilado'}
              formato={formatoMoneda}
              titulo={compararSucursales ? 'Ingresos por sucursal y período' : 'Ingresos por fuente y período'}
            />
          </section>

          <section className="informe-bloque">
            <h2>Detalle por {agrupacion}</h2>
            {compararSucursales ? (
              <table>
                <thead>
                  <tr><th>Período</th>{porSucursal.sucursales.map((s) => <th key={s.id}>{s.nombre}</th>)}<th>Total</th></tr>
                </thead>
                <tbody>
                  {porSucursal.periodos.map((p) => (
                    <tr key={p.inicio}>
                      <td>{etiquetaPeriodo(p.inicio, p.fin, agrupacion)}</td>
                      {porSucursal.sucursales.map((s) => <td key={s.id}>{formatoMoneda(p.porSucursal[s.id] ?? 0)}</td>)}
                      <td><strong>{formatoMoneda(Object.values(p.porSucursal).reduce((a, b) => a + b, 0))}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr><th>Período</th>{FUENTES.map((f) => <th key={f.id}>{f.label}</th>)}<th>Total</th></tr>
                </thead>
                <tbody>
                  {periodos.map((p) => (
                    <tr key={p.inicio}>
                      <td>{etiquetaPeriodo(p.inicio, p.fin, agrupacion)}</td>
                      {FUENTES.map((f) => <td key={f.id}>{formatoMoneda(p.porFuente[f.id] ?? 0)}</td>)}
                      <td><strong>{formatoMoneda(p.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="informe-bloque">
            <h2>Facturado</h2>
            <p className="informe-nota">
              Comprobantes emitidos en el período, por la sucursal de cada factura. Puede diferir de lo cobrado: las ventas en
              cuenta corriente se facturan antes de cobrarse.
            </p>
            {facturadoPorPeriodo.length === 0 ? (
              <p className="informe-nota">No hay comprobantes emitidos en el rango.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Período</th><th>Facturas</th><th>Notas de crédito</th><th>Notas de débito</th><th>Neto facturado</th></tr>
                </thead>
                <tbody>
                  {facturadoPorPeriodo.map((p) => (
                    <tr key={p.inicio}>
                      <td>{etiquetaPeriodo(p.inicio, p.fin, agrupacion)}</td>
                      <td>{formatoMoneda(p.factura)}</td>
                      <td>{formatoMoneda(p.nota_credito)}</td>
                      <td>{formatoMoneda(p.nota_debito)}</td>
                      <td><strong>{formatoMoneda(p.neto)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {!cargando && !error && !sinDatos && modo === 'comparar' && comparacion && (
        <>
          <div className="kpi-grid">
            <KpiCard label="Período A" value={formatoMoneda(comparacion.a.total)} icon={CalendarRange} tone="info" helperText={etiquetaRango(rangoA.desde, rangoA.hasta)} />
            <KpiCard label="Período B" value={formatoMoneda(comparacion.b.total)} icon={CalendarRange} tone="brand" helperText={etiquetaRango(rangoB.desde, rangoB.hasta)} />
            <KpiCard
              label="Variación de B contra A"
              value={formatoVariacion(filasComparar[0]?.variacion ?? null)}
              icon={TrendingUp}
              tone={(filasComparar[0]?.diferencia ?? 0) >= 0 ? 'success' : 'danger'}
              helperText={`${(filasComparar[0]?.diferencia ?? 0) >= 0 ? '+' : ''}${formatoMoneda(filasComparar[0]?.diferencia ?? 0)}`}
            />
          </div>
          {diasA !== diasB && (
            <Feedback>
              Los períodos tienen distinta cantidad de días ({diasA} y {diasB}): para compararlos de forma justa, mirá también el promedio por día.
            </Feedback>
          )}

          <section className="informe-bloque">
            <h2>Por fuente</h2>
            <GraficoBarras
              categorias={FUENTES.map((f) => ({ id: f.id, label: f.label }))}
              series={[{ id: 'a', label: etiquetaA, color: COLORES_SERIE[0] }, { id: 'b', label: etiquetaB, color: COLORES_SERIE[1] }]}
              valor={(fuente, serie) => comparacion[serie].porFuente[fuente] ?? 0}
              modo="agrupado"
              formato={formatoMoneda}
              titulo="Ingresos por fuente, período A contra período B"
            />
          </section>

          <section className="informe-bloque">
            <h2>Comparación</h2>
            <table>
              <thead>
                <tr><th>Concepto</th><th>{etiquetaA}</th><th>{etiquetaB}</th><th>Diferencia</th><th>Variación</th></tr>
              </thead>
              <tbody>
                {filasComparar.map((f, i) => {
                  const nuevoGrupo = f.grupo !== 'total' && f.grupo !== filasComparar[i - 1]?.grupo
                  return [
                    nuevoGrupo && (
                      <tr key={`g-${f.grupo}`} className="informe-grupo"><th colSpan={5} scope="colgroup">{f.grupo}</th></tr>
                    ),
                    <tr key={`${f.grupo}-${f.concepto}`} className={f.grupo === 'total' ? 'informe-fila-total' : undefined}>
                      <td>{ETIQUETA_FUENTE[f.concepto] ?? f.concepto}</td>
                      <td>{formatoMoneda(f.a)}</td>
                      <td>{formatoMoneda(f.b)}</td>
                      <td className={f.diferencia < 0 ? 'informe-negativo' : f.diferencia > 0 ? 'informe-positivo' : undefined}>
                        {f.diferencia > 0 ? '+' : ''}{formatoMoneda(f.diferencia)}
                      </td>
                      <td>{formatoVariacion(f.variacion)}</td>
                    </tr>,
                  ]
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
