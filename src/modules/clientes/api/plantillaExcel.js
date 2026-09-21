import { COLUMNAS_INFO, OPCIONES_FIJAS } from './importacionClientesApi'

// Genera la plantilla de importación como un .xlsx (Excel) con:
//   - la hoja "Clientes": encabezados de colores, columnas ya separadas y
//     listas desplegables que solo dejan elegir opciones válidas;
//   - la hoja "Instrucciones": paso a paso y qué poner en cada columna;
//   - la hoja "Opciones": las listas que alimentan los desplegables.
//
// Un .xlsx es un zip de archivos XML. Se arma a mano (zip sin comprimir) para
// no sumar una librería. Excel solo exporta a CSV la primera hoja, así que
// "Clientes" es la primera.

const TIPO_MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Hasta qué fila se aplican los desplegables.
const ULTIMA_FILA_CON_LISTA = 5000

// Índices de cellXfs en styles.xml.
const ESTILO = {
  normal: 0,
  encabezadoObligatoria: 1,
  encabezadoSegunPersona: 2,
  encabezadoOpcional: 3,
  texto: 4,
  negrita: 5,
  ajustado: 6,
  encabezadoTabla: 7,
}

const ESTILO_ENCABEZADO = {
  obligatoria: ESTILO.encabezadoObligatoria,
  segun_persona: ESTILO.encabezadoSegunPersona,
  opcional: ESTILO.encabezadoOpcional,
}

const ETIQUETA_TIPO = {
  obligatoria: 'Siempre',
  segun_persona: 'Según el tipo de persona',
  opcional: 'Opcional',
}

// Orden de las columnas de la hoja "Opciones".
const LISTAS = ['tipo_persona', 'tipo_documento', 'condicion_iva', 'tipo_cliente', 'habilita_cta_cte']

// Estas columnas se guardan como texto: si no, Excel convierte los teléfonos
// que empiezan con 0 en números y les borra el cero.
const COLUMNAS_TEXTO = ['numero_documento', 'telefono']

const XML_INICIO = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

const letra = (indice) => String.fromCharCode(65 + indice)

function escapar(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function celda(columna, fila, valor, estilo = ESTILO.normal) {
  const ref = `${letra(columna)}${fila}`
  if (valor === '' || valor === null || valor === undefined) {
    return estilo === ESTILO.normal ? '' : `<c r="${ref}" s="${estilo}"/>`
  }
  return (
    `<c r="${ref}" s="${estilo}" t="inlineStr">` +
    `<is><t xml:space="preserve">${escapar(valor)}</t></is></c>`
  )
}

function fila(numero, celdas, atributos = '') {
  return `<row r="${numero}"${atributos}>${celdas.join('')}</row>`
}

function hoja({ vistas = '', columnas, filas, validaciones = '' }) {
  return (
    XML_INICIO +
    `<worksheet xmlns="${NS_MAIN}">` +
    `<sheetViews>${vistas || '<sheetView workbookViewId="0"/>'}</sheetViews>` +
    `<cols>${columnas}</cols>` +
    `<sheetData>${filas.join('')}</sheetData>` +
    validaciones +
    '</worksheet>'
  )
}

function columna(indice, ancho, estilo) {
  const n = indice + 1
  const atributoEstilo = estilo ? ` style="${estilo}"` : ''
  return `<col min="${n}" max="${n}" width="${ancho}" customWidth="1"${atributoEstilo}/>`
}

// --- Hoja "Clientes" -----------------------------------------------------------

function hojaClientes(listas) {
  const encabezados = COLUMNAS_INFO.map((info, i) =>
    celda(i, 1, info.nombre, ESTILO_ENCABEZADO[info.tipo]),
  )

  // Ancho: lo que necesite el encabezado o la opción más larga de la lista.
  const columnas = COLUMNAS_INFO.map((info, i) => {
    const masLargaLista = Math.max(0, ...(listas[info.lista] ?? []).map((v) => v.length))
    const ancho = Math.max(16, info.nombre.length + 4, masLargaLista + 6)
    return columna(i, ancho, COLUMNAS_TEXTO.includes(info.nombre) ? ESTILO.texto : 0)
  }).join('')

  // Un desplegable por columna que tiene lista, apuntando a la hoja "Opciones".
  const validaciones = COLUMNAS_INFO.flatMap((info, i) => {
    if (!info.lista) return []
    const valores = listas[info.lista]
    if (!valores || valores.length === 0) return []

    const colOpciones = letra(LISTAS.indexOf(info.lista))
    const rango = `Opciones!$${colOpciones}$2:$${colOpciones}$${valores.length + 1}`
    return [
      `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" ` +
        `errorTitle="Valor no válido" error="Elegí una de las opciones de la lista." ` +
        `promptTitle="${escapar(info.nombre)}" prompt="Elegí una opción de la lista." ` +
        `sqref="${letra(i)}2:${letra(i)}${ULTIMA_FILA_CON_LISTA}">` +
        `<formula1>${rango}</formula1></dataValidation>`,
    ]
  })

  return hoja({
    vistas:
      '<sheetView tabSelected="1" workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
      '</sheetView>',
    columnas,
    filas: [fila(1, encabezados, ' ht="32" customHeight="1"')],
    validaciones:
      validaciones.length > 0
        ? `<dataValidations count="${validaciones.length}">${validaciones.join('')}</dataValidations>`
        : '',
  })
}

// --- Hoja "Instrucciones" --------------------------------------------------------

function hojaInstrucciones() {
  const pasos = [
    ['Cómo completar la hoja «Clientes»', ESTILO.negrita],
    ['1. Completá una fila por cliente en la hoja «Clientes», desde la fila 2. No cambies ni borres los encabezados.'],
    ['2. Las columnas con lista (tipo_persona, tipo_documento, condicion_iva, tipo_cliente, habilita_cta_cte) se eligen del desplegable: no se puede escribir otra cosa.'],
    ['3. Color del encabezado: azul = obligatoria, naranja = depende del tipo de persona, gris = opcional.'],
    ['4. Al terminar: Archivo → Guardar como → «CSV UTF-8 (delimitado por comas)». Excel avisa que solo se guarda la primera hoja: es lo correcto.'],
    ['5. En el sistema, pantalla Importar clientes, subí ese archivo.'],
  ]

  const filas = pasos.map(([texto, estilo], i) => fila(i + 1, [celda(0, i + 1, texto, estilo)]))

  const inicioTabla = pasos.length + 2
  filas.push(
    fila(
      inicioTabla,
      ['Columna', 'Cuándo se completa', 'Qué poner', 'Ejemplo'].map((t, i) =>
        celda(i, inicioTabla, t, ESTILO.encabezadoTabla),
      ),
    ),
  )
  COLUMNAS_INFO.forEach((info, i) => {
    const n = inicioTabla + 1 + i
    filas.push(
      fila(n, [
        celda(0, n, info.nombre, ESTILO.negrita),
        celda(1, n, ETIQUETA_TIPO[info.tipo]),
        celda(2, n, info.ayuda, ESTILO.ajustado),
        celda(3, n, info.ejemplo),
      ]),
    )
  })

  return hoja({
    columnas: [columna(0, 22), columna(1, 26), columna(2, 70), columna(3, 24)].join(''),
    filas,
  })
}

// --- Hoja "Opciones" ----------------------------------------------------------------

function hojaOpciones(listas) {
  const alto = Math.max(...LISTAS.map((nombre) => (listas[nombre] ?? []).length))

  const filas = [
    fila(1, LISTAS.map((nombre, i) => celda(i, 1, nombre, ESTILO.encabezadoTabla))),
  ]
  for (let r = 0; r < alto; r++) {
    filas.push(
      fila(
        r + 2,
        LISTAS.map((nombre, i) => celda(i, r + 2, (listas[nombre] ?? [])[r])),
      ),
    )
  }

  return hoja({
    columnas: LISTAS.map((_, i) => columna(i, 24)).join(''),
    filas,
  })
}

// --- Piezas fijas del paquete --------------------------------------------------------

const CONTENT_TYPES =
  XML_INICIO +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>'

const RELS_RAIZ =
  XML_INICIO +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>'

const WORKBOOK =
  XML_INICIO +
  `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
  '<bookViews><workbookView activeTab="0"/></bookViews>' +
  '<sheets>' +
  '<sheet name="Clientes" sheetId="1" r:id="rId1"/>' +
  '<sheet name="Instrucciones" sheetId="2" r:id="rId2"/>' +
  '<sheet name="Opciones" sheetId="3" r:id="rId3"/>' +
  '</sheets></workbook>'

const RELS_WORKBOOK =
  XML_INICIO +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${NS_REL}/worksheet" Target="worksheets/sheet2.xml"/>` +
  `<Relationship Id="rId3" Type="${NS_REL}/worksheet" Target="worksheets/sheet3.xml"/>` +
  `<Relationship Id="rId4" Type="${NS_REL}/styles" Target="styles.xml"/>` +
  '</Relationships>'

function relleno(rgb) {
  return `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`
}

const ENCABEZADO_XF = (fillId) =>
  `<xf numFmtId="0" fontId="1" fillId="${fillId}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">` +
  '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>'

const STYLES =
  XML_INICIO +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="3">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="6">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  relleno('FF2F5597') + // azul: obligatoria
  relleno('FFC55A11') + // naranja: según el tipo de persona
  relleno('FF7F7F7F') + // gris: opcional
  relleno('FFD9D9D9') + // gris claro: encabezado de tablas de ayuda
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="8">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  ENCABEZADO_XF(2) +
  ENCABEZADO_XF(3) +
  ENCABEZADO_XF(4) +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

// --- Zip (sin compresión) ----------------------------------------------------------------

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  return tabla
})()

/**
 * CRC-32 de un arreglo de bytes (el que exige el formato zip).
 *
 * @param {Uint8Array} bytes
 * @returns {number} Entero sin signo de 32 bits.
 */
export function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = TABLA_CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// Fecha y hora DOS fijas (2026-01-01 00:00): el contenido no depende del reloj.
const DOS_HORA = 0
const DOS_FECHA = ((2026 - 1980) << 9) | (1 << 5) | 1

/**
 * Arma un zip con los archivos dados, sin comprimir (método "store").
 *
 * @param {Array<{nombre: string, contenido: string}>} archivos
 * @returns {Uint8Array}
 */
export function armarZip(archivos) {
  const codificador = new TextEncoder()
  const partes = []
  const directorio = []
  let posicion = 0

  for (const { nombre, contenido } of archivos) {
    const nombreBytes = codificador.encode(nombre)
    const datos = codificador.encode(contenido)
    const crc = crc32(datos)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // versión necesaria
    local.setUint16(6, 0x0800, true) // bandera: nombres en UTF-8
    local.setUint16(8, 0, true) // método: sin compresión
    local.setUint16(10, DOS_HORA, true)
    local.setUint16(12, DOS_FECHA, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, datos.length, true)
    local.setUint32(22, datos.length, true)
    local.setUint16(26, nombreBytes.length, true)
    local.setUint16(28, 0, true)
    partes.push(new Uint8Array(local.buffer), nombreBytes, datos)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true) // versión con la que se creó
    central.setUint16(6, 20, true) // versión necesaria
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, DOS_HORA, true)
    central.setUint16(14, DOS_FECHA, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, datos.length, true)
    central.setUint32(24, datos.length, true)
    central.setUint16(28, nombreBytes.length, true)
    central.setUint32(42, posicion, true) // dónde empieza el archivo
    directorio.push(new Uint8Array(central.buffer), nombreBytes)

    posicion += 30 + nombreBytes.length + datos.length
  }

  const tamanoDirectorio = directorio.reduce((suma, parte) => suma + parte.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(8, archivos.length, true)
  fin.setUint16(10, archivos.length, true)
  fin.setUint32(12, tamanoDirectorio, true)
  fin.setUint32(16, posicion, true)

  const todas = [...partes, ...directorio, new Uint8Array(fin.buffer)]
  const resultado = new Uint8Array(todas.reduce((suma, parte) => suma + parte.length, 0))
  let desplazamiento = 0
  for (const parte of todas) {
    resultado.set(parte, desplazamiento)
    desplazamiento += parte.length
  }
  return resultado
}

/**
 * Genera la plantilla de importación de clientes como archivo de Excel.
 *
 * @param {Object} opciones
 * @param {Array<string>} opciones.condicionesIva Nombres válidos de condicion_iva.
 * @param {Array<string>} opciones.tiposCliente Nombres válidos de tipo_cliente.
 * @returns {Blob} Archivo .xlsx listo para descargar.
 */
export function generarPlantillaExcel({ condicionesIva = [], tiposCliente = [] } = {}) {
  const listas = {
    ...OPCIONES_FIJAS,
    condicion_iva: condicionesIva,
    tipo_cliente: tiposCliente,
  }

  const bytes = armarZip([
    { nombre: '[Content_Types].xml', contenido: CONTENT_TYPES },
    { nombre: '_rels/.rels', contenido: RELS_RAIZ },
    { nombre: 'xl/workbook.xml', contenido: WORKBOOK },
    { nombre: 'xl/_rels/workbook.xml.rels', contenido: RELS_WORKBOOK },
    { nombre: 'xl/styles.xml', contenido: STYLES },
    { nombre: 'xl/worksheets/sheet1.xml', contenido: hojaClientes(listas) },
    { nombre: 'xl/worksheets/sheet2.xml', contenido: hojaInstrucciones() },
    { nombre: 'xl/worksheets/sheet3.xml', contenido: hojaOpciones(listas) },
  ])

  return new Blob([bytes], { type: TIPO_MIME_XLSX })
}
