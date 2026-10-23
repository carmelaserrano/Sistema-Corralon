import { armarZip } from '../../../lib/zip'
import logoCorralon from '../../ecommerce/pdf/logo-corralon-norte.jpg?inline'
import { formatearFechaHora } from '../../../lib/fechas'

// Exporta un informe como .xlsx (Excel) con la estética del sistema: logo,
// encabezado naranja, montos como números con formato de moneda y una fila de
// total. Una hoja por tabla. Se arma a mano, como la plantilla de clientes,
// para no sumar una librería.

const TIPO_MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const XML_INICIO = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const NS_DIBUJO = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'

// Filas fijas de la hoja: 1-4 encabezado con logo, 6 títulos de columna.
const FILA_ENCABEZADO = 6

// Índices de cellXfs en STYLES.
const ESTILO = {
  normal: 0,
  marca: 1,
  titulo: 2,
  subtitulo: 3,
  encabezadoTexto: 4,
  encabezadoNumero: 5,
  texto: 6,
  moneda: 7,
  porcentaje: 8,
  totalTexto: 9,
  totalMoneda: 10,
  grupo: 11,
  vacio: 12,
}

/** Letra de columna de Excel: 0 → A, 25 → Z, 26 → AA. */
function letra(indice) {
  let n = indice + 1
  let texto = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    texto = String.fromCharCode(65 + resto) + texto
    n = Math.floor((n - 1) / 26)
  }
  return texto
}

function escapar(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function celdaTexto(col, fila, valor, estilo) {
  return `<c r="${letra(col)}${fila}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`
}

function celdaNumero(col, fila, valor, estilo) {
  return `<c r="${letra(col)}${fila}" s="${estilo}"><v>${valor}</v></c>`
}

function celdaVacia(col, fila, estilo) {
  return `<c r="${letra(col)}${fila}" s="${estilo}"/>`
}

/** Celda de dato según el tipo de la columna. */
function celdaDato(col, fila, valor, tipo, total) {
  if (tipo === 'texto') return celdaTexto(col, fila, valor ?? '', total ? ESTILO.totalTexto : ESTILO.texto)
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
    return celdaTexto(col, fila, '—', total ? ESTILO.totalTexto : ESTILO.vacio)
  }
  if (tipo === 'porcentaje') return celdaNumero(col, fila, Number(valor) / 100, ESTILO.porcentaje)
  return celdaNumero(col, fila, Number(valor), total ? ESTILO.totalMoneda : ESTILO.moneda)
}

function hoja(tabla, { titulo, subtitulo, generado }) {
  const { columnas, filas, total } = tabla
  const ultimaCol = letra(columnas.length - 1)
  const xmlFilas = []

  // Encabezado: el logo ocupa la columna A de las filas 1 a 4.
  xmlFilas.push(`<row r="1" ht="26" customHeight="1">${celdaTexto(1, 1, 'CORRALÓN NORTE', ESTILO.marca)}</row>`)
  xmlFilas.push(`<row r="2" ht="20" customHeight="1">${celdaTexto(1, 2, `${titulo} · ${tabla.titulo}`, ESTILO.titulo)}</row>`)
  xmlFilas.push(`<row r="3">${celdaTexto(1, 3, subtitulo, ESTILO.subtitulo)}</row>`)
  xmlFilas.push(`<row r="4">${celdaTexto(1, 4, `Generado el ${generado}`, ESTILO.subtitulo)}</row>`)

  xmlFilas.push(
    `<row r="${FILA_ENCABEZADO}" ht="22" customHeight="1">` +
      columnas.map((c, i) => celdaTexto(i, FILA_ENCABEZADO, c.titulo, c.tipo === 'texto' ? ESTILO.encabezadoTexto : ESTILO.encabezadoNumero)).join('') +
      '</row>',
  )

  let r = FILA_ENCABEZADO
  for (const fila of filas) {
    r += 1
    // Fila de grupo (p. ej. "Por fuente" en la comparación): banda de color.
    if (!Array.isArray(fila)) {
      xmlFilas.push(
        `<row r="${r}">${celdaTexto(0, r, fila.grupo, ESTILO.grupo)}` +
          columnas.slice(1).map((_, i) => celdaVacia(i + 1, r, ESTILO.grupo)).join('') +
          '</row>',
      )
      continue
    }
    xmlFilas.push(`<row r="${r}">${fila.map((v, i) => celdaDato(i, r, v, columnas[i].tipo, false)).join('')}</row>`)
  }

  if (total) {
    r += 1
    xmlFilas.push(`<row r="${r}" ht="20" customHeight="1">${total.map((v, i) => celdaDato(i, r, v, columnas[i].tipo, true)).join('')}</row>`)
  }

  const anchos = columnas
    .map((c, i) => {
      const largo = Math.max(c.titulo.length, ...filas.filter(Array.isArray).map((f) => String(f[i] ?? '').length))
      const ancho = i === 0 ? Math.max(28, largo + 4) : Math.max(18, largo + 6)
      return `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`
    })
    .join('')

  return (
    XML_INICIO +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<dimension ref="A1:${ultimaCol}${r}"/>` +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0">' +
    `<pane ySplit="${FILA_ENCABEZADO}" topLeftCell="A${FILA_ENCABEZADO + 1}" activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft" activeCell="A${FILA_ENCABEZADO + 1}" sqref="A${FILA_ENCABEZADO + 1}"/>` +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="16"/>' +
    `<cols>${anchos}</cols>` +
    `<sheetData>${xmlFilas.join('')}</sheetData>` +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" paperSize="9" fitToHeight="0"/>' +
    '<drawing r:id="rId1"/>' +
    '</worksheet>'
  )
}

// Logo de 96 × 72 px (4:3) arriba a la izquierda. 1 px = 9525 EMU.
const DIBUJO =
  XML_INICIO +
  `<xdr:wsDr xmlns:xdr="${NS_DIBUJO}" xmlns:a="${NS_A}" xmlns:r="${NS_REL}">` +
  '<xdr:oneCellAnchor>' +
  '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>76200</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from>' +
  '<xdr:ext cx="914400" cy="685800"/>' +
  '<xdr:pic>' +
  '<xdr:nvPicPr><xdr:cNvPr id="2" name="Logo Corralón Norte"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
  '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
  '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="685800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
  '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>'

const RELS_DIBUJO =
  XML_INICIO +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/image" Target="../media/logo.jpeg"/>` +
  '</Relationships>'

const relsHoja = (n) =>
  XML_INICIO +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/drawing" Target="../drawings/drawing${n}.xml"/>` +
  '</Relationships>'

const RELS_RAIZ =
  XML_INICIO +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>'

function contentTypes(cantidad) {
  const hojas = Array.from({ length: cantidad }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
  ).join('')
  return (
    XML_INICIO +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    hojas +
    '</Types>'
  )
}

/** Nombre de hoja válido para Excel: sin []:*?/\ y hasta 31 caracteres. */
function nombreHoja(texto, usados) {
  const base = String(texto).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Hoja'
  let nombre = base
  for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${base.slice(0, 27)} (${n})`
  usados.add(nombre.toLowerCase())
  return nombre
}

function workbook(nombres) {
  return (
    XML_INICIO +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
    nombres.map((nombre, i) => `<sheet name="${escapar(nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    '</sheets></workbook>'
  )
}

function relsWorkbook(cantidad) {
  return (
    XML_INICIO +
    `<Relationships xmlns="${NS_PKG_REL}">` +
    Array.from({ length: cantidad }, (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    ).join('') +
    `<Relationship Id="rId${cantidad + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    '</Relationships>'
  )
}

// Paleta del sistema: naranja #F97316, azul oscuro #1E3A5F, texto #172033,
// gris #64748B, fondo suave #F1F5F9, borde #E2E8F0, naranja suave #FFEDD5.
const relleno = (rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`
const xf = ({ numFmt = 0, font = 0, fill = 0, border = 0, alineacion = '' }) =>
  `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
  `${numFmt ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}` +
  (alineacion ? ` applyAlignment="1"><alignment ${alineacion}/></xf>` : '/>')

const STYLES =
  XML_INICIO +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<numFmts count="2">' +
  '<numFmt numFmtId="164" formatCode="&quot;$ &quot;#,##0.00;-&quot;$ &quot;#,##0.00"/>' +
  '<numFmt numFmtId="165" formatCode="+0.0%;-0.0%;0.0%"/>' +
  '</numFmts>' +
  '<fonts count="7">' +
  '<font><sz val="11"/><color rgb="FF172033"/><name val="Calibri"/></font>' + // 0 normal
  '<font><b/><sz val="16"/><color rgb="FF1E3A5F"/><name val="Calibri"/></font>' + // 1 marca
  '<font><b/><sz val="13"/><color rgb="FF172033"/><name val="Calibri"/></font>' + // 2 título
  '<font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font>' + // 3 subtítulo
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' + // 4 encabezado
  '<font><b/><sz val="11"/><color rgb="FF172033"/><name val="Calibri"/></font>' + // 5 negrita
  '<font><b/><sz val="11"/><color rgb="FF1E3A5F"/><name val="Calibri"/></font>' + // 6 grupo
  '</fonts>' +
  '<fills count="5">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  relleno('FFF97316') + // 2 naranja
  relleno('FFF1F5F9') + // 3 fondo suave (total)
  relleno('FFFFEDD5') + // 4 naranja suave (grupo)
  '</fills>' +
  '<borders count="3">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>' +
  '<border><left/><right/><top style="medium"><color rgb="FF1E3A5F"/></top><bottom/><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="13">' +
  xf({}) +
  xf({ font: 1, alineacion: 'vertical="center"' }) +
  xf({ font: 2 }) +
  xf({ font: 3 }) +
  xf({ font: 4, fill: 2, alineacion: 'horizontal="left" vertical="center"' }) +
  xf({ font: 4, fill: 2, alineacion: 'horizontal="right" vertical="center"' }) +
  xf({ border: 1 }) +
  xf({ numFmt: 164, border: 1 }) +
  xf({ numFmt: 165, border: 1 }) +
  xf({ font: 5, fill: 3, border: 2, alineacion: 'vertical="center"' }) +
  xf({ numFmt: 164, font: 5, fill: 3, border: 2, alineacion: 'vertical="center"' }) +
  xf({ font: 6, fill: 4 }) +
  xf({ border: 1, alineacion: 'horizontal="right"' }) +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

// Bytes del logo. Se leen con fetch porque, según el entorno, Vite entrega la
// imagen como data URL o como dirección: fetch resuelve los dos casos.
async function bytesDelLogo() {
  const respuesta = await fetch(logoCorralon)
  return new Uint8Array(await respuesta.arrayBuffer())
}

/**
 * Arma el informe como archivo de Excel.
 *
 * @param {Object} opciones
 * @param {string} opciones.titulo Ej. "Informe de ingresos".
 * @param {string} opciones.subtitulo Rango y filtros aplicados.
 * @param {Array<{
 *   titulo: string,
 *   hoja?: string,
 *   columnas: Array<{titulo: string, tipo: 'texto'|'moneda'|'porcentaje'}>,
 *   filas: Array<Array<string|number|null>|{grupo: string}>,
 *   total?: Array<string|number|null>,
 * }>} opciones.tablas Una hoja por tabla. Los montos van como números; la
 *   variación en porcentaje (25 = +25 %); null se muestra como "—".
 * @returns {Promise<Blob>} Archivo .xlsx listo para descargar.
 */
export async function armarInformeExcel({ titulo, subtitulo, tablas }) {
  const generado = formatearFechaHora(new Date())
  const usados = new Set()
  const nombres = tablas.map((t) => nombreHoja(t.hoja ?? t.titulo, usados))
  const logo = await bytesDelLogo()

  const archivos = [
    { nombre: '[Content_Types].xml', contenido: contentTypes(tablas.length) },
    { nombre: '_rels/.rels', contenido: RELS_RAIZ },
    { nombre: 'xl/workbook.xml', contenido: workbook(nombres) },
    { nombre: 'xl/_rels/workbook.xml.rels', contenido: relsWorkbook(tablas.length) },
    { nombre: 'xl/styles.xml', contenido: STYLES },
    { nombre: 'xl/media/logo.jpeg', contenido: logo },
  ]
  tablas.forEach((tabla, i) => {
    const n = i + 1
    archivos.push(
      { nombre: `xl/worksheets/sheet${n}.xml`, contenido: hoja(tabla, { titulo, subtitulo, generado }) },
      { nombre: `xl/worksheets/_rels/sheet${n}.xml.rels`, contenido: relsHoja(n) },
      { nombre: `xl/drawings/drawing${n}.xml`, contenido: DIBUJO },
      { nombre: `xl/drawings/_rels/drawing${n}.xml.rels`, contenido: RELS_DIBUJO },
    )
  })

  return new Blob([armarZip(archivos)], { type: TIPO_MIME_XLSX })
}
