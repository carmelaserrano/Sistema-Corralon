import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  FileDown,
  FileSpreadsheet,
  Info,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import KpiCard from '../../../components/ui/KpiCard'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import GraficoBarras from '../components/GraficoBarras'
import GraficoTorta from '../components/GraficoTorta'
import SelectorMultiple from '../components/SelectorMultiple'
import SelectorPeriodo from '../components/SelectorPeriodo'
import { opcionesDeMes, rangoDePeriodo } from '../selectorPeriodo'
import {
  ATAJOS_RANGO,
  COLORES_SERIE,
  diasDelRango,
  etiquetaPeriodo,
  etiquetaRango,
  rangoDeAtajo,
  totalesDe,
} from '../informeIngresos'
import {
  combinarPorPeriodo,
  combinarPorSucursal,
  filasComparacionBalance,
  indicadoresBalance,
} from '../balanceIngresosEgresos'
import { listarSucursalesInforme, obtenerEgresos, obtenerIngresos } from '../api/informesApi'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const formatoMoneda = (n) => moneda.format(n)
const formatoVariacion = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('es-AR')} %`)
const COLOR_INGRESO = 'var(--color-success)'
const COLOR_EGRESO = 'var(--color-danger)'

export default function InformeBalancePage() {
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
  const [periodoA, setPeriodoA] = useState({ tipo: 'mes', mes: meses[2].valor, fecha: inicial.hasta, desde: inicial.desde, hasta: inicial.hasta })
  const [periodoB, setPeriodoB] = useState({ tipo: 'mes', mes: meses[0].valor, fecha: inicial.hasta, desde: inicial.desde, hasta: inicial.hasta })

  const [opcionesSucursal, setOpcionesSucursal] = useState([])
  const [ingresos, setIngresos] = useState([])
  const [egresos, setEgresos] = useState([])
  const [comparacion, setComparacion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listarSucursalesInforme().then((s) => setOpcionesSucursal(s.map((x) => ({ valor: x.id, label: x.nombre })))).catch(() => {})
  }, [])

  const rangoA = rangoDePeriodo(periodoA)
  const rangoB = rangoDePeriodo(periodoB)
  const claveA = `${rangoA.desde}|${rangoA.hasta}`
  const claveB = `${rangoB.desde}|${rangoB.hasta}`

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setError('')
    const filtros = { sucursales }
    const consulta = modo === 'evolucion'
      ? Promise.all([
        obtenerIngresos({ desde, hasta, agrupacion, ...filtros }),
        obtenerEgresos({ desde, hasta, agrupacion, ...filtros }),
      ]).then(([filasIngresos, filasEgresos]) => {
        if (!vigente) return
        setIngresos(filasIngresos)
        setEgresos(filasEgresos)
      })
      : Promise.all([
        obtenerIngresos({ ...rangoA, agrupacion: 'total', ...filtros }),
        obtenerEgresos({ ...rangoA, agrupacion: 'total', ...filtros }),
        obtenerIngresos({ ...rangoB, agrupacion: 'total', ...filtros }),
        obtenerEgresos({ ...rangoB, agrupacion: 'total', ...filtros }),
      ]).then(([filasIngA, filasEgA, filasIngB, filasEgB]) => {
        if (vigente) {
          setComparacion({
            totIngA: totalesDe(filasIngA),
            totEgA: totalesDe(filasEgA),
            totIngB: totalesDe(filasIngB),
            totEgB: totalesDe(filasEgB),
          })
        }
      })
    consulta
      .catch((err) => vigente && setError(err.message || 'No pudimos calcular el balance'))
      .finally(() => vigente && setCargando(false))
    return () => { vigente = false }
    // rangoA/rangoB se derivan de claveA/claveB.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, desde, hasta, agrupacion, sucursales, claveA, claveB])

  function elegirAtajo(id) {
    const rango = rangoDeAtajo(id, hoy)
    setAtajo(id)
    setDesde(rango.desde)
    setHasta(rango.hasta)
    setAgrupacion(rango.agrupacion)
  }

  // ---- Modo evolución -------------------------------------------------------
  const periodos = useMemo(() => combinarPorPeriodo(ingresos, egresos, agrupacion), [ingresos, egresos, agrupacion])
  const porSucursal = useMemo(() => combinarPorSucursal(ingresos, egresos, agrupacion), [ingresos, egresos, agrupacion])
  const kpis = indicadoresBalance(periodos)
  const redondear = (n) => Math.round(n * 100) / 100
  const totalSucursalResultado = (sucursal) =>
    redondear(porSucursal.periodos.reduce((suma, p) => suma + (p.porSucursal[sucursal]?.resultado ?? 0), 0))
  const categorias = (compararSucursales ? porSucursal.periodos : periodos).map((p) => ({
    id: p.inicio, label: etiquetaPeriodo(p.inicio, p.fin, agrupacion),
  }))
  const seriesFlujo = [
    { id: 'ingreso', label: 'Ingresos', color: COLOR_INGRESO },
    { id: 'egreso', label: 'Egresos', color: COLOR_EGRESO },
  ]
  const seriesSucursal = porSucursal.sucursales.map((s, i) => ({ id: s.id, label: s.nombre, color: COLORES_SERIE[i % COLORES_SERIE.length] }))
  const valorFlujo = (periodo, serie) => periodos.find((p) => p.inicio === periodo)?.[serie] ?? 0
  const valorSucursal = (periodo, sucursal) => porSucursal.periodos.find((p) => p.inicio === periodo)?.porSucursal[sucursal]?.resultado ?? 0
  const donutDatos = [
    { id: 'ingreso', label: 'Ingresos', valor: kpis.totalIngreso, color: COLOR_INGRESO },
    { id: 'egreso', label: 'Egresos', valor: kpis.totalEgreso, color: COLOR_EGRESO },
  ]

  // ---- Modo comparar --------------------------------------------------------
  const diasA = diasDelRango(rangoA.desde, rangoA.hasta)
  const diasB = diasDelRango(rangoB.desde, rangoB.hasta)
  const filasComparar = comparacion ? filasComparacionBalance(comparacion, diasA, diasB) : []
  const filaResultado = filasComparar.find((f) => f.concepto === 'Resultado neto')
  const etiquetaA = `A · ${etiquetaRango(rangoA.desde, rangoA.hasta)}`
  const etiquetaB = `B · ${etiquetaRango(rangoB.desde, rangoB.hasta)}`
  const valorCompararChart = (categoria, serie) => {
    const totIng = serie === 'a' ? comparacion?.totIngA.total ?? 0 : comparacion?.totIngB.total ?? 0
    const totEg = serie === 'a' ? comparacion?.totEgA.total ?? 0 : comparacion?.totEgB.total ?? 0
    if (categoria === 'ingreso') return totIng
    if (categoria === 'egreso') return totEg
    return totIng - totEg
  }

  // ---- Exportar -------------------------------------------------------------
  const nombreSucursales = sucursales.length
    ? opcionesSucursal.filter((o) => sucursales.includes(o.valor)).map((o) => o.label).join(', ')
    : 'todas las sucursales'
  const subtitulo = modo === 'evolucion'
    ? `${etiquetaRango(desde, hasta)} · por ${agrupacion} · ${nombreSucursales}`
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
    const balance = {
      titulo: 'Balance por período',
      hoja: 'Balance',
      columnas: [columna('Período', 'texto'), columna('Ingresos'), columna('Egresos'), columna('Resultado')],
      filas: periodos.map((p) => [etiquetaPeriodo(p.inicio, p.fin, agrupacion), p.ingreso, p.egreso, p.resultado]),
    }
    return [balance]
      .filter((t) => t.filas.length > 0)
      .map((t) => ({ ...t, total: filaTotal(t.columnas, t.filas) }))
  }

  const nombreArchivo = (extension) => `informe-balance-${modo}-${new Date().toISOString().slice(0, 10)}.${extension}`

  async function exportarExcel() {
    const { armarInformeExcel } = await import('../excel/informeExcel')
    const blob = await armarInformeExcel({ titulo: 'Balance de ingresos y egresos', subtitulo, tablas: tablasParaExportar() })
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
    armarInformePdf({ titulo: 'Balance de ingresos y egresos', subtitulo, tablas }).save(nombreArchivo('pdf'))
  }

  const sinDatos = !cargando && !error && (modo === 'evolucion'
    ? periodos.length === 0
    : !comparacion || (comparacion.totIngA.total === 0 && comparacion.totEgA.total === 0
      && comparacion.totIngB.total === 0 && comparacion.totEgB.total === 0))

  return (
    <div className="informe-page">
      <PageHeader
        kicker="Informes"
        title="Balance: ingresos vs egresos"
        description="Lo que entró y lo que salió en el mismo rango, el resultado neto y su evolución, por fuente y por sucursal."
        actions={
          <div className="informe-exportar">
            <Button type="button" variant="ghost" icon={FileSpreadsheet} onClick={exportarExcel} disabled={cargando || sinDatos}>Excel</Button>
            <Button type="button" variant="ghost" icon={FileDown} onClick={exportarPdf} disabled={cargando || sinDatos}>PDF</Button>
          </div>
        }
      />

      <details className="informe-callout">
        <summary>
          <Info size={16} aria-hidden="true" /> ¿Qué incluye este panel?
        </summary>
        <ul>
          <li>Cruza los informes de Ingresos y Egresos: hereda sus mismas fuentes y limitaciones.</li>
          <li>
            Una orden de pago a un proveedor pagada en efectivo ya se cuenta sola: si además se registra como egreso de
            caja, se cuenta dos veces.
          </li>
          <li>
            Los traslados de dinero (por ejemplo, depositar efectivo en el banco o pasar plata entre cajas) se registran
            hoy como egresos de caja y están incluidos.
          </li>
          <li>Los pagos a proveedores no tienen sucursal: al filtrar por sucursal, solo se ven los egresos de caja.</li>
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
      </section>

      {sucursales.length > 0 && (
        <Feedback>Los pagos a proveedores no tienen sucursal: al filtrar por sucursal solo se ven los egresos de caja.</Feedback>
      )}
      {error && <Feedback tone="error">{error}</Feedback>}
      {cargando && <p className="loading-state" role="status">Calculando el balance…</p>}
      {sinDatos && <Feedback>No hay ingresos ni egresos registrados con estos filtros.</Feedback>}

      {!cargando && !error && !sinDatos && modo === 'evolucion' && (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total ingresos" value={formatoMoneda(kpis.totalIngreso)} icon={TrendingUp} tone="success" helperText={etiquetaRango(desde, hasta)} />
            <KpiCard label="Total egresos" value={formatoMoneda(kpis.totalEgreso)} icon={TrendingDown} tone="danger" helperText={etiquetaRango(desde, hasta)} />
            <KpiCard
              label="Resultado neto"
              value={formatoMoneda(kpis.resultado)}
              icon={kpis.resultado >= 0 ? ArrowUpRight : ArrowDownRight}
              tone={kpis.resultado >= 0 ? 'success' : 'danger'}
              helperText={kpis.resultado >= 0 ? 'Superávit del período' : 'Déficit del período'}
            />
          </div>

          <div className="informe-grid-2">
            <section className="informe-bloque">
              <h2>{compararSucursales ? 'Resultado neto por sucursal' : 'Ingresos y egresos por período'}</h2>
              <GraficoBarras
                categorias={categorias}
                series={compararSucursales ? seriesSucursal : seriesFlujo}
                valor={compararSucursales ? valorSucursal : valorFlujo}
                modo="agrupado"
                formato={formatoMoneda}
                titulo={compararSucursales ? 'Resultado neto por sucursal y período' : 'Ingresos y egresos por período'}
              />
            </section>

            <section className="informe-bloque">
              <h2>Composición del rango</h2>
              <GraficoTorta
                datos={donutDatos}
                formato={formatoMoneda}
                titulo="Ingresos y egresos del rango seleccionado"
                centro={{ valor: kpis.resultado, etiqueta: 'Resultado neto' }}
              />
            </section>
          </div>

          <section className="informe-bloque">
            <h2>Detalle por {agrupacion}</h2>
            {compararSucursales ? (
              <table>
                <thead>
                  <tr><th>Período</th>{porSucursal.sucursales.map((s) => <th key={s.id} className="informe-num">{s.nombre}</th>)}<th className="informe-num">Total</th></tr>
                </thead>
                <tbody>
                  {porSucursal.periodos.map((p) => {
                    const totalPeriodo = redondear(Object.values(p.porSucursal).reduce((suma, v) => suma + v.resultado, 0))
                    return (
                      <tr key={p.inicio}>
                        <td>{etiquetaPeriodo(p.inicio, p.fin, agrupacion)}</td>
                        {porSucursal.sucursales.map((s) => (
                          <td key={s.id} className={`informe-num${p.porSucursal[s.id].resultado < 0 ? ' informe-negativo' : ''}`}>
                            {formatoMoneda(p.porSucursal[s.id].resultado)}
                          </td>
                        ))}
                        <td className={`informe-num${totalPeriodo < 0 ? ' informe-negativo' : ''}`}><strong>{formatoMoneda(totalPeriodo)}</strong></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {porSucursal.sucursales.map((s) => <td key={s.id} className="informe-num">{formatoMoneda(totalSucursalResultado(s.id))}</td>)}
                    <td className="informe-num">{formatoMoneda(kpis.resultado)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table>
                <thead>
                  <tr><th>Período</th><th className="informe-num">Ingresos</th><th className="informe-num">Egresos</th><th className="informe-num">Resultado</th></tr>
                </thead>
                <tbody>
                  {periodos.map((p) => (
                    <tr key={p.inicio}>
                      <td>{etiquetaPeriodo(p.inicio, p.fin, agrupacion)}</td>
                      <td className="informe-num">{formatoMoneda(p.ingreso)}</td>
                      <td className="informe-num">{formatoMoneda(p.egreso)}</td>
                      <td className={`informe-num${p.resultado < 0 ? ' informe-negativo' : ' informe-positivo'}`}><strong>{formatoMoneda(p.resultado)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="informe-num">{formatoMoneda(kpis.totalIngreso)}</td>
                    <td className="informe-num">{formatoMoneda(kpis.totalEgreso)}</td>
                    <td className="informe-num">{formatoMoneda(kpis.resultado)}</td>
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
            <KpiCard
              label="Resultado período A"
              value={formatoMoneda(comparacion.totIngA.total - comparacion.totEgA.total)}
              icon={CalendarRange}
              tone="info"
              helperText={etiquetaRango(rangoA.desde, rangoA.hasta)}
            />
            <KpiCard
              label="Resultado período B"
              value={formatoMoneda(comparacion.totIngB.total - comparacion.totEgB.total)}
              icon={CalendarRange}
              tone="brand"
              helperText={etiquetaRango(rangoB.desde, rangoB.hasta)}
            />
            <KpiCard
              label="Variación de B contra A"
              value={formatoVariacion(filaResultado?.variacion ?? null)}
              icon={(filaResultado?.diferencia ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight}
              tone={(filaResultado?.diferencia ?? 0) >= 0 ? 'success' : 'danger'}
              helperText={`${(filaResultado?.diferencia ?? 0) >= 0 ? '+' : ''}${formatoMoneda(filaResultado?.diferencia ?? 0)}`}
            />
          </div>
          {diasA !== diasB && (
            <Feedback>
              Los períodos tienen distinta cantidad de días ({diasA} y {diasB}): para compararlos de forma justa, mirá también el promedio por día.
            </Feedback>
          )}

          <section className="informe-bloque">
            <h2>Ingresos, egresos y resultado</h2>
            <GraficoBarras
              categorias={[{ id: 'ingreso', label: 'Ingresos' }, { id: 'egreso', label: 'Egresos' }, { id: 'resultado', label: 'Resultado neto' }]}
              series={[{ id: 'a', label: etiquetaA, color: COLORES_SERIE[0] }, { id: 'b', label: etiquetaB, color: COLORES_SERIE[1] }]}
              valor={valorCompararChart}
              modo="agrupado"
              formato={formatoMoneda}
              titulo="Ingresos, egresos y resultado, período A contra período B"
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
                  // Más egresos es desfavorable: esas filas usan los colores al revés que el resto.
                  const esEgreso = f.grupo === 'Egresos por fuente' || f.concepto === 'Total egresos'
                  const favorable = esEgreso ? f.diferencia < 0 : f.diferencia > 0
                  const desfavorable = esEgreso ? f.diferencia > 0 : f.diferencia < 0
                  return [
                    nuevoGrupo && (
                      <tr key={`g-${f.grupo}`} className="informe-grupo"><th colSpan={5} scope="colgroup">{f.grupo}</th></tr>
                    ),
                    <tr key={`${f.grupo}-${f.concepto}`} className={f.grupo === 'total' ? 'informe-fila-total' : undefined}>
                      <td>{f.concepto}</td>
                      <td className="informe-num">{formatoMoneda(f.a)}</td>
                      <td className="informe-num">{formatoMoneda(f.b)}</td>
                      <td className={`informe-num${desfavorable ? ' informe-negativo' : favorable ? ' informe-positivo' : ''}`}>
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
