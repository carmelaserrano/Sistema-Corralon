import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, BarChart3, CalendarRange, FileDown, FileSpreadsheet, Flame, Info, TrendingDown, TrendingUp } from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import GraficoBarras from '../components/GraficoBarras'
import SelectorMultiple from '../components/SelectorMultiple'
import SelectorPeriodo from '../components/SelectorPeriodo'
import { opcionesDeMes, rangoDePeriodo } from '../selectorPeriodo'
import {
  ATAJOS_RANGO,
  COLORES_SERIE,
  ETIQUETA_FUENTE_EGRESO,
  FUENTES_EGRESO,
  agruparPorPeriodo,
  agruparPorSucursal,
  diasDelRango,
  etiquetaPeriodo,
  etiquetaRango,
  filasComparacion,
  indicadores,
  rangoDeAtajo,
  totalesDe,
} from '../informeIngresos'
import {
  listarMediosEgresos,
  listarSucursalesInforme,
  obtenerEgresos,
} from '../api/informesApi'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const formatoMoneda = (n) => moneda.format(n)
const formatoVariacion = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('es-AR')} %`)

export default function InformeEgresosPage() {
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
  const [egresos, setEgresos] = useState([])
  const [comparacion, setComparacion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listarSucursalesInforme().then((s) => setOpcionesSucursal(s.map((x) => ({ valor: x.id, label: x.nombre })))).catch(() => {})
    listarMediosEgresos().then((m) => setOpcionesMedio(m.map((x) => ({ valor: x, label: x })))).catch(() => {})
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
      ? obtenerEgresos({ desde, hasta, agrupacion, ...filtros }).then((filas) => {
        if (vigente) setEgresos(filas)
      })
      : Promise.all([
        obtenerEgresos({ ...rangoA, agrupacion: 'total', ...filtros }),
        obtenerEgresos({ ...rangoB, agrupacion: 'total', ...filtros }),
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
  const periodos = useMemo(() => agruparPorPeriodo(egresos), [egresos])
  const porSucursal = useMemo(() => agruparPorSucursal(egresos), [egresos])
  const kpis = indicadores(periodos)
  const redondear = (n) => Math.round(n * 100) / 100
  const totalFuente = (fuente) => redondear(periodos.reduce((suma, p) => suma + (p.porFuente[fuente] ?? 0), 0))
  const totalSucursal = (sucursal) => redondear(porSucursal.periodos.reduce((suma, p) => suma + (p.porSucursal[sucursal] ?? 0), 0))
  const fuentesConDatos = FUENTES_EGRESO.filter((f) => periodos.some((p) => p.porFuente[f.id]))
  const categorias = (compararSucursales ? porSucursal.periodos : periodos).map((p) => ({
    id: p.inicio, label: etiquetaPeriodo(p.inicio, p.fin, agrupacion),
  }))
  const seriesFuente = FUENTES_EGRESO.map((f, i) => ({ id: f.id, label: f.label, color: COLORES_SERIE[i] }))
  const seriesSucursal = porSucursal.sucursales.map((s, i) => ({ id: s.id, label: s.nombre, color: COLORES_SERIE[i % COLORES_SERIE.length] }))
  const valorFuente = (periodo, fuente) => periodos.find((p) => p.inicio === periodo)?.porFuente[fuente] ?? 0
  const valorSucursal = (periodo, sucursal) => porSucursal.periodos.find((p) => p.inicio === periodo)?.porSucursal[sucursal] ?? 0

  // ---- Modo comparar --------------------------------------------------------
  const diasA = diasDelRango(rangoA.desde, rangoA.hasta)
  const diasB = diasDelRango(rangoB.desde, rangoB.hasta)
  const filasComparar = comparacion
    ? filasComparacion(comparacion.a, comparacion.b, diasA, diasB, { fuentes: FUENTES_EGRESO, etiquetaTotal: 'Total pagado' })
    : []
  const etiquetaA = `A · ${etiquetaRango(rangoA.desde, rangoA.hasta)}`
  const etiquetaB = `B · ${etiquetaRango(rangoB.desde, rangoB.hasta)}`

  // ---- Exportar -------------------------------------------------------------
  const nombreSucursales = sucursales.length
    ? opcionesSucursal.filter((o) => sucursales.includes(o.valor)).map((o) => o.label).join(', ')
    : 'todas las sucursales'
  const subtitulo = modo === 'evolucion'
    ? `${etiquetaRango(desde, hasta)} · por ${agrupacion} · ${nombreSucursales}${medios.length ? ` · ${medios.join(', ')}` : ''}`
    : `${etiquetaA} contra ${etiquetaB} · ${nombreSucursales}`

  // Tablas para exportar con los valores crudos: el Excel guarda los montos
  // como números y el PDF los muestra formateados.
  const columna = (titulo, tipo = 'moneda') => ({ titulo, tipo })
  const sumar = (filas, i) => filas.reduce((s, f) => s + (Number(f[i]) || 0), 0)
  const filaTotal = (columnas, filas) => columnas.map((c, i) => (i === 0 ? 'Total' : sumar(filas, i)))

  function tablasParaExportar() {
    if (modo === 'comparar') {
      const filas = []
      let grupoActual = 'total'
      for (const f of filasComparar) {
        if (f.grupo !== grupoActual) {
          grupoActual = f.grupo
          if (f.grupo !== 'total') filas.push({ grupo: f.grupo })
        }
        filas.push([f.concepto, f.a, f.b, f.diferencia, f.variacion])
      }
      return [{
        titulo: 'Comparación de períodos',
        hoja: 'Comparación',
        columnas: [columna('Concepto', 'texto'), columna(etiquetaA), columna(etiquetaB), columna('Diferencia'), columna('Variación', 'porcentaje')],
        filas,
      }]
    }
    const pagado = {
      titulo: 'Pagado por período',
      hoja: 'Pagado',
      columnas: [columna('Período', 'texto'), ...FUENTES_EGRESO.map((f) => columna(f.label)), columna('Total')],
      filas: periodos.map((p) => [
        etiquetaPeriodo(p.inicio, p.fin, agrupacion),
        ...FUENTES_EGRESO.map((f) => p.porFuente[f.id] ?? 0),
        p.total,
      ]),
    }
    return [pagado]
      .filter((t) => t.filas.length > 0)
      .map((t) => ({ ...t, total: filaTotal(t.columnas, t.filas) }))
  }

  const nombreArchivo = (extension) => `informe-egresos-${modo}-${new Date().toISOString().slice(0, 10)}.${extension}`

  async function exportarExcel() {
    const { armarInformeExcel } = await import('../excel/informeExcel')
    const blob = await armarInformeExcel({ titulo: 'Informe de egresos', subtitulo, tablas: tablasParaExportar() })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombreArchivo('xlsx')
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    URL.revokeObjectURL(url)
  }

  async function exportarPdf() {
    const { armarInformePdf } = await import('../pdf/informePdf')
    const formatear = (v, tipo) => {
      if (tipo === 'texto') return v
      if (tipo === 'porcentaje') return formatoVariacion(v)
      return v === null || v === undefined ? '—' : formatoMoneda(v)
    }
    const tablas = tablasParaExportar().map((t) => ({
      titulo: t.titulo,
      columnas: t.columnas.map((c) => c.titulo),
      filas: [...t.filas, ...(t.total ? [t.total] : [])].map((f) =>
        Array.isArray(f) ? f.map((v, i) => formatear(v, t.columnas[i].tipo)) : [f.grupo, ...t.columnas.slice(1).map(() => '')],
      ),
    }))
    armarInformePdf({ titulo: 'Informe de egresos', subtitulo, tablas }).save(nombreArchivo('pdf'))
  }

  const sinDatos = !cargando && !error && (modo === 'evolucion' ? periodos.length === 0 : !comparacion || (comparacion.a.total === 0 && comparacion.b.total === 0))
  const variacionTotal = filasComparar[0]
  // En egresos, que crezcan es lo desfavorable.
  const subio = (variacionTotal?.diferencia ?? 0) > 0

  return (
    <div className="informe-page">
      <PageHeader
        kicker="Informes"
        title="Informe de egresos"
        description="Lo pagado: la plata que efectivamente salió, por pagos a proveedores y egresos de caja."
        actions={
          <div className="informe-exportar">
            <Button type="button" variant="ghost" icon={FileSpreadsheet} onClick={exportarExcel} disabled={cargando || sinDatos}>Excel</Button>
            <Button type="button" variant="ghost" icon={FileDown} onClick={exportarPdf} disabled={cargando || sinDatos}>PDF</Button>
          </div>
        }
      />

      <details className="informe-callout">
        <summary>
          <Info size={16} aria-hidden="true" /> ¿Qué incluye este informe?
        </summary>
        <ul>
          <li>
            Las órdenes de pago a proveedores ya se cuentan solas: si una se pagó en efectivo desde la caja, no la registres
            además como egreso de caja porque se contaría dos veces.
          </li>
          <li>
            Los traslados de dinero (por ejemplo, depositar efectivo en el banco o pasar plata entre cajas) se registran hoy
            como egresos de caja y están incluidos.
          </li>
          <li>Las devoluciones de dinero a clientes figuran como egresos de caja.</li>
        </ul>
      </details>

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

      {sucursales.length > 0 && (
        <Feedback>Los pagos a proveedores no tienen sucursal: al filtrar por sucursal solo se ven los egresos de caja.</Feedback>
      )}
      {error && <Feedback tone="error">{error}</Feedback>}
      {cargando && <p className="loading-state" role="status">Calculando el informe…</p>}
      {sinDatos && <Feedback>No hay egresos registrados con estos filtros.</Feedback>}

      {!cargando && !error && !sinDatos && modo === 'evolucion' && (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total pagado" value={formatoMoneda(kpis.total)} icon={TrendingDown} tone="brand" helperText={etiquetaRango(desde, hasta)} />
            <KpiCard label={`Promedio por ${agrupacion}`} value={formatoMoneda(kpis.promedio)} icon={CalendarRange} tone="info" helperText={`${periodos.length} ${agrupacion === 'mes' ? 'meses' : 'semanas'} con egresos`} />
            <KpiCard
              label={`${agrupacion === 'mes' ? 'Mes' : 'Semana'} con más egresos`}
              value={kpis.mejor ? formatoMoneda(kpis.mejor.total) : '—'}
              icon={Flame}
              tone="danger"
              helperText={kpis.mejor ? etiquetaPeriodo(kpis.mejor.inicio, kpis.mejor.fin, agrupacion) : ''}
            />
          </div>

          <section className="informe-bloque">
            <h2>{compararSucursales ? 'Pagado por sucursal' : 'Pagado por fuente'}</h2>
            <GraficoBarras
              categorias={categorias}
              series={compararSucursales ? seriesSucursal : seriesFuente.filter((s) => fuentesConDatos.some((f) => f.id === s.id))}
              valor={compararSucursales ? valorSucursal : valorFuente}
              modo={compararSucursales ? 'agrupado' : 'apilado'}
              formato={formatoMoneda}
              titulo={compararSucursales ? 'Egresos por sucursal y período' : 'Egresos por fuente y período'}
            />
          </section>

          <section className="informe-bloque">
            <h2>Detalle por {agrupacion}</h2>
            {compararSucursales ? (
              <table>
                <thead>
                  <tr><th>Período</th>{porSucursal.sucursales.map((s) => <th key={s.id} className="informe-num">{s.nombre}</th>)}<th className="informe-num">Total</th></tr>
                </thead>
                <tbody>
                  {porSucursal.periodos.map((p) => (
                    <tr key={p.inicio}>
                      <td>{etiquetaPeriodo(p.inicio, p.fin, agrupacion)}</td>
                      {porSucursal.sucursales.map((s) => <td key={s.id} className="informe-num">{formatoMoneda(p.porSucursal[s.id] ?? 0)}</td>)}
                      <td className="informe-num"><strong>{formatoMoneda(Object.values(p.porSucursal).reduce((a, b) => a + b, 0))}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {porSucursal.sucursales.map((s) => <td key={s.id} className="informe-num">{formatoMoneda(totalSucursal(s.id))}</td>)}
                    <td className="informe-num">{formatoMoneda(kpis.total)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table>
                <thead>
                  <tr><th>Período</th>{FUENTES_EGRESO.map((f) => <th key={f.id} className="informe-num">{f.label}</th>)}<th className="informe-num">Total</th></tr>
                </thead>
                <tbody>
                  {periodos.map((p) => (
                    <tr key={p.inicio}>
                      <td>{etiquetaPeriodo(p.inicio, p.fin, agrupacion)}</td>
                      {FUENTES_EGRESO.map((f) => <td key={f.id} className="informe-num">{formatoMoneda(p.porFuente[f.id] ?? 0)}</td>)}
                      <td className="informe-num"><strong>{formatoMoneda(p.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {FUENTES_EGRESO.map((f) => <td key={f.id} className="informe-num">{formatoMoneda(totalFuente(f.id))}</td>)}
                    <td className="informe-num">{formatoMoneda(kpis.total)}</td>
                  </tr>
                </tfoot>
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
              value={formatoVariacion(variacionTotal?.variacion ?? null)}
              icon={subio ? TrendingUp : TrendingDown}
              tone={subio ? 'danger' : 'success'}
              helperText={`${subio ? '+' : ''}${formatoMoneda(variacionTotal?.diferencia ?? 0)}`}
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
              categorias={FUENTES_EGRESO.map((f) => ({ id: f.id, label: f.label }))}
              series={[{ id: 'a', label: etiquetaA, color: COLORES_SERIE[0] }, { id: 'b', label: etiquetaB, color: COLORES_SERIE[1] }]}
              valor={(fuente, serie) => comparacion[serie].porFuente[fuente] ?? 0}
              modo="agrupado"
              formato={formatoMoneda}
              titulo="Egresos por fuente, período A contra período B"
            />
          </section>

          <section className="informe-bloque">
            <h2>Comparación</h2>
            <table>
              <thead>
                <tr><th>Concepto</th><th className="informe-num">{etiquetaA}</th><th className="informe-num">{etiquetaB}</th><th className="informe-num">Diferencia</th><th className="informe-num">Variación</th></tr>
              </thead>
              <tbody>
                {filasComparar.map((f, i) => {
                  const nuevoGrupo = f.grupo !== 'total' && f.grupo !== filasComparar[i - 1]?.grupo
                  return [
                    nuevoGrupo && (
                      <tr key={`g-${f.grupo}`} className="informe-grupo"><th colSpan={5} scope="colgroup">{f.grupo}</th></tr>
                    ),
                    <tr key={`${f.grupo}-${f.concepto}`} className={f.grupo === 'total' ? 'informe-fila-total' : undefined}>
                      <td>{ETIQUETA_FUENTE_EGRESO[f.concepto] ?? f.concepto}</td>
                      <td className="informe-num">{formatoMoneda(f.a)}</td>
                      <td className="informe-num">{formatoMoneda(f.b)}</td>
                      {/* Más egresos es lo desfavorable: los colores van al revés que en ingresos. */}
                      <td className={`informe-num${f.diferencia > 0 ? ' informe-negativo' : f.diferencia < 0 ? ' informe-positivo' : ''}`}>
                        {f.diferencia > 0 ? '+' : ''}{formatoMoneda(f.diferencia)}
                      </td>
                      <td className="informe-num">{formatoVariacion(f.variacion)}</td>
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
