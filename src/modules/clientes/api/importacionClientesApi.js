import Papa from 'papaparse'
import { supabase } from '../../../lib/supabaseClient'

// Tabla: clientes (0031_base_sprint3.sql). Función SQL: importar_clientes (0033).

export const PERMISO_IMPORTAR = 'clientes.importar'

// Columnas que el CSV tiene que traer sí o sí (el encabezado, no el valor: el
// valor depende del tipo de persona y se valida fila por fila).
export const COLUMNAS_OBLIGATORIAS = [
  'tipo_persona',
  'nombre',
  'apellido',
  'razon_social',
  'tipo_documento',
  'numero_documento',
  'condicion_iva',
  'tipo_cliente',
  'telefono',
]

// Se pueden omitir del archivo.
export const COLUMNAS_OPCIONALES = ['email', 'habilita_cta_cte']

// Opciones fijas de las columnas que se eligen de una lista. condicion_iva y
// tipo_cliente no están acá: salen de la base (ver `obtenerCatalogos`).
export const OPCIONES_FIJAS = {
  tipo_persona: ['fisica', 'juridica'],
  tipo_documento: ['DNI', 'CUIT'],
  habilita_cta_cte: ['si', 'no'],
}

// Descripción de cada columna, en el orden de la plantilla. La usan la
// plantilla de Excel y la tabla de ayuda de la pantalla, para que digan lo
// mismo.
//   tipo: 'obligatoria' | 'segun_persona' | 'opcional'
//   lista: de dónde salen las opciones del desplegable (si tiene).
export const COLUMNAS_INFO = [
  {
    nombre: 'tipo_persona',
    tipo: 'obligatoria',
    lista: 'tipo_persona',
    ayuda: 'fisica (una persona) o juridica (una empresa).',
    ejemplo: 'fisica',
  },
  {
    nombre: 'nombre',
    tipo: 'segun_persona',
    ayuda: 'Solo para persona física.',
    ejemplo: 'Ana',
  },
  {
    nombre: 'apellido',
    tipo: 'segun_persona',
    ayuda: 'Solo para persona física.',
    ejemplo: 'López',
  },
  {
    nombre: 'razon_social',
    tipo: 'segun_persona',
    ayuda: 'Solo para persona jurídica (empresa).',
    ejemplo: '',
  },
  {
    nombre: 'tipo_documento',
    tipo: 'obligatoria',
    lista: 'tipo_documento',
    ayuda: 'DNI o CUIT.',
    ejemplo: 'DNI',
  },
  {
    nombre: 'numero_documento',
    tipo: 'obligatoria',
    ayuda: 'Solo números, sin puntos ni guiones. DNI: 7 u 8 dígitos. CUIT: 11 dígitos.',
    ejemplo: '27111001',
  },
  {
    nombre: 'condicion_iva',
    tipo: 'obligatoria',
    lista: 'condicion_iva',
    ayuda: 'Condición frente al IVA. Hay que elegir una de la lista.',
    ejemplo: 'Monotributo',
  },
  {
    nombre: 'tipo_cliente',
    tipo: 'obligatoria',
    lista: 'tipo_cliente',
    ayuda: 'Define la lista de precios que se le aplica. Hay que elegir una de la lista.',
    ejemplo: 'Consumidor Final',
  },
  {
    nombre: 'email',
    tipo: 'opcional',
    ayuda: 'Puede quedar vacío.',
    ejemplo: 'ana@example.com',
  },
  {
    nombre: 'telefono',
    tipo: 'obligatoria',
    ayuda: 'Teléfono de contacto.',
    ejemplo: '3874100001',
  },
  {
    nombre: 'habilita_cta_cte',
    tipo: 'opcional',
    lista: 'habilita_cta_cte',
    ayuda: 'si o no. Si queda vacío se toma como no.',
    ejemplo: 'no',
  },
]

// Orden de la plantilla descargable.
export const COLUMNAS_PLANTILLA = COLUMNAS_INFO.map((columna) => columna.nombre)

// Separador de las plantillas y del CSV de rechazadas. Excel con la
// configuración regional en español usa ";" y NO abre en columnas un CSV
// separado por comas: lo deja todo en la columna A.
const SEPARADOR_CSV = ';'
// Primera línea que le indica el separador a Excel, sin importar su idioma.
const LINEA_SEP = `sep=${SEPARADOR_CSV}\n`

const REGEX_DNI = /^\d{7,8}$/
const REGEX_CUIT = /^\d{11}$/
// Misma regla que chk_cliente_email en 0031.
const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const TAMANO_LOTE_CONSULTA = 100

const texto = (valor) => (valor ?? '').toString().trim()
const sinAcentos = (valor) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
// Igual que lower(btrim(...)) de importar_clientes: no se quitan acentos para
// que la vista previa y la base coincidan al resolver los catálogos.
const clave = (valor) => texto(valor).toLowerCase()

/**
 * Contenido de la plantilla CSV: solo el encabezado, sin filas de ejemplo
 * (una fila de ejemplo olvidada terminaría importada como cliente real).
 * Va separada por ";" y con la línea `sep=;` para que Excel la abra con cada
 * columna en su lugar. `quitarLineaSep` la descarta al leer el archivo.
 *
 * @returns {string}
 */
export function generarPlantillaCsv() {
  return `${LINEA_SEP}${COLUMNAS_PLANTILLA.join(SEPARADOR_CSV)}\n`
}

/**
 * Descarta la línea `sep=;` que llevan las plantillas, si el archivo la trae.
 * Se usa como `beforeFirstChunk` de papaparse.
 *
 * @param {string} texto
 * @returns {string}
 */
export function quitarLineaSep(texto) {
  return texto.replace(/^sep=.\r?\n/i, '')
}

/**
 * Indica si el nombre de archivo es un .csv. Se mira la extensión y no el
 * MIME: Windows suele informar los CSV como application/vnd.ms-excel.
 *
 * @param {string} nombreArchivo
 * @returns {boolean}
 */
export function esArchivoCsv(nombreArchivo) {
  return /\.csv$/i.test(texto(nombreArchivo))
}

/**
 * Normaliza un encabezado del CSV: sin BOM, sin espacios y en minúsculas.
 *
 * @param {string} encabezado
 * @returns {string}
 */
export function normalizarEncabezado(encabezado) {
  return texto((encabezado ?? '').toString().replace(/^\uFEFF/, '')).toLowerCase()
}

/**
 * Devuelve las columnas obligatorias que no están en el archivo.
 *
 * @param {Array<string>} columnas Encabezados ya normalizados.
 * @returns {Array<string>}
 */
export function columnasFaltantes(columnas) {
  const presentes = new Set((columnas ?? []).map(normalizarEncabezado))
  return COLUMNAS_OBLIGATORIAS.filter((columna) => !presentes.has(columna))
}

/**
 * Explica, en lenguaje llano, qué está mal con las columnas del archivo.
 *
 * @param {Array<string>} columnas Encabezados tal como los leyó el parser.
 * @returns {string|null} El mensaje, o null si las columnas están bien.
 */
export function problemaDeColumnas(columnas) {
  // Se ignoran los nombres que el parser inventa (_1, _2…) para las celdas de
  // encabezado vacías.
  const encontradas = (columnas ?? [])
    .map(normalizarEncabezado)
    .filter((columna) => columna && !/^_\d+$/.test(columna))

  // Caso típico: un CSV separado por comas abierto en Excel en español queda
  // todo en la columna A, y al guardarlo el encabezado sigue siendo una sola
  // "columna" con todos los nombres adentro (y comas o ";" en el medio).
  const encabezadoPegado = encontradas.some((columna) => /[,;\t]/.test(columna))
  if (encontradas.length <= 1 || encabezadoPegado) {
    return (
      'El archivo tiene una sola columna: los datos no están separados en columnas. ' +
      'Descargá la plantilla de Excel, completala y guardala como «CSV UTF-8 (delimitado por comas)».'
    )
  }

  const faltantes = columnasFaltantes(columnas)
  if (faltantes.length === 0) return null

  return (
    `Al archivo le faltan columnas obligatorias: ${faltantes.join(', ')}. ` +
    `Columnas encontradas: ${encontradas.join(', ')}.`
  )
}

function parsearBooleano(valor) {
  const v = sinAcentos(texto(valor)).toLowerCase()
  if (v === '' || ['no', 'n', 'false', '0'].includes(v)) return { valor: false, valido: true }
  if (['si', 's', 'true', '1', 'x'].includes(v)) return { valor: true, valido: true }
  return { valor: false, valido: false }
}

// Deja la fila con los valores exactos que espera importar_clientes.
function normalizarFila(fila) {
  return {
    tipo_persona: sinAcentos(texto(fila.tipo_persona)).toLowerCase(),
    nombre: texto(fila.nombre),
    apellido: texto(fila.apellido),
    razon_social: texto(fila.razon_social),
    tipo_documento: texto(fila.tipo_documento).toUpperCase(),
    numero_documento: texto(fila.numero_documento).replace(/[.\-\s]/g, ''),
    condicion_iva: texto(fila.condicion_iva),
    tipo_cliente: texto(fila.tipo_cliente),
    email: texto(fila.email),
    telefono: texto(fila.telefono),
    habilita_cta_cte: parsearBooleano(fila.habilita_cta_cte).valor,
  }
}

function documentoValido(datos) {
  if (datos.tipo_documento === 'DNI') return REGEX_DNI.test(datos.numero_documento)
  if (datos.tipo_documento === 'CUIT') return REGEX_CUIT.test(datos.numero_documento)
  return false
}

const claveDocumento = (datos) => `${datos.tipo_documento}:${datos.numero_documento}`

function erroresDeFila(fila, datos, referencias) {
  const errores = []

  if (datos.tipo_persona === 'fisica') {
    if (!datos.nombre) errores.push('Falta el nombre')
    if (!datos.apellido) errores.push('Falta el apellido')
    if (datos.razon_social) errores.push('Una persona física no lleva razón social')
  } else if (datos.tipo_persona === 'juridica') {
    if (!datos.razon_social) errores.push('Falta la razón social')
    if (datos.nombre || datos.apellido) {
      errores.push('Una persona jurídica no lleva nombre ni apellido')
    }
  } else {
    errores.push('Tipo de persona inválido (usar fisica o juridica)')
  }

  if (datos.tipo_documento !== 'DNI' && datos.tipo_documento !== 'CUIT') {
    errores.push('Tipo de documento inválido (usar DNI o CUIT)')
  } else if (!datos.numero_documento) {
    errores.push('Falta el número de documento')
  } else if (datos.tipo_documento === 'DNI' && !REGEX_DNI.test(datos.numero_documento)) {
    errores.push('DNI inválido: debe tener 7 u 8 dígitos')
  } else if (datos.tipo_documento === 'CUIT' && !REGEX_CUIT.test(datos.numero_documento)) {
    errores.push('CUIT inválido: debe tener 11 dígitos')
  }

  if (!datos.telefono) errores.push('Falta el teléfono')
  if (datos.email && !REGEX_EMAIL.test(datos.email)) errores.push('Email inválido')

  if (!datos.condicion_iva) {
    errores.push('Falta la condición de IVA')
  } else if (referencias.condicionesIva && !referencias.condicionesIva.has(clave(datos.condicion_iva))) {
    errores.push(`Condición de IVA inexistente: "${datos.condicion_iva}"`)
  }

  if (!datos.tipo_cliente) {
    errores.push('Falta el tipo de cliente')
  } else if (referencias.tiposCliente && !referencias.tiposCliente.has(clave(datos.tipo_cliente))) {
    errores.push(`Tipo de cliente inexistente: "${datos.tipo_cliente}"`)
  }

  if (!parsearBooleano(fila.habilita_cta_cte).valido) {
    errores.push('Valor inválido en habilita_cta_cte (usar si o no)')
  }

  return errores
}

/**
 * Valida las filas de un CSV contra las reglas de `clientes` (pura, sin red).
 *
 * Clasifica cada fila como:
 *  - 'error': no cumple las reglas (documento inválido, datos faltantes, etc.).
 *    Un documento repetido dentro del archivo marca TODAS sus apariciones como
 *    error: no se elige cuál es la buena, el administrador tiene que decidirlo.
 *  - 'duplicada': el documento ya existe en el sistema.
 *  - 'nueva': lista para importar.
 *
 * @param {Array<Object>} filas Filas parseadas del CSV (claves = encabezados).
 * @param {Object} [referencias]
 * @param {Set<string>} [referencias.existentes] Documentos ya cargados, como
 *   "DNI:30111222" / "CUIT:20123456786".
 * @param {Set<string>} [referencias.condicionesIva] Nombres en minúsculas.
 *   Si se omite, no se valida contra el catálogo.
 * @param {Set<string>} [referencias.tiposCliente] Ídem.
 * @returns {Array<{numeroFila: number, fila: Object, datos: Object,
 *   estado: 'nueva'|'duplicada'|'error', motivo?: string}>}
 *   `numeroFila` es la línea del archivo (el encabezado es la 1). `datos` es
 *   la fila normalizada, lista para `importarClientes`.
 */
export function validarFilas(filas, referencias = {}) {
  const existentes = referencias.existentes ?? new Set()

  const items = (filas ?? []).map((fila, indice) => {
    const datos = normalizarFila(fila)
    return {
      numeroFila: indice + 2,
      fila,
      datos,
      errores: erroresDeFila(fila, datos, referencias),
    }
  })

  // Documentos repetidos: solo cuentan los que tienen tipo y formato válidos.
  const apariciones = new Map()
  for (const item of items) {
    if (!documentoValido(item.datos)) continue
    const key = claveDocumento(item.datos)
    apariciones.set(key, [...(apariciones.get(key) ?? []), item.numeroFila])
  }

  return items.map(({ numeroFila, fila, datos, errores }) => {
    const filasRepetidas = documentoValido(datos) ? apariciones.get(claveDocumento(datos)) : null
    if (filasRepetidas && filasRepetidas.length > 1) {
      errores.push(`Documento repetido en el archivo (filas ${filasRepetidas.join(', ')})`)
    }

    if (errores.length > 0) {
      return { numeroFila, fila, datos, estado: 'error', motivo: errores.join('; ') }
    }
    if (existentes.has(claveDocumento(datos))) {
      return {
        numeroFila,
        fila,
        datos,
        estado: 'duplicada',
        motivo: 'El documento ya existe en el sistema',
      }
    }
    return { numeroFila, fila, datos, estado: 'nueva' }
  })
}

/**
 * Indica si el usuario actual puede importar clientes.
 *
 * @returns {Promise<boolean>}
 */
export async function puedeImportarClientes() {
  const { data, error } = await supabase.rpc('usuario_tiene_permiso', {
    p_nombre: PERMISO_IMPORTAR,
  })

  if (error) throw error
  return data === true
}

/**
 * Trae las opciones válidas de condicion_iva y tipo_cliente (los activos de la
 * base). Con ellas se arman los desplegables de la plantilla y la ayuda de la
 * pantalla, y se validan las filas.
 *
 * @returns {Promise<{condicionesIva: Array<string>, tiposCliente: Array<string>}>}
 *   Nombres tal como están cargados, ordenados alfabéticamente.
 */
export async function obtenerCatalogos() {
  const [iva, tipos] = await Promise.all([
    supabase.from('condiciones_iva').select('nombre').eq('activo', true),
    supabase.from('tipos_cliente').select('nombre').eq('activo', true),
  ])
  if (iva.error) throw iva.error
  if (tipos.error) throw tipos.error

  const nombres = (filas) =>
    (filas ?? []).map((fila) => fila.nombre).sort((a, b) => a.localeCompare(b, 'es'))

  return { condicionesIva: nombres(iva.data), tiposCliente: nombres(tipos.data) }
}

/**
 * Trae lo que la vista previa necesita para clasificar las filas: los
 * catálogos (condiciones de IVA y tipos de cliente activos) y cuáles de los
 * documentos del archivo ya existen en el sistema.
 *
 * @param {Array<Object>} filas Filas parseadas del CSV.
 * @returns {Promise<{existentes: Set<string>, condicionesIva: Set<string>,
 *   tiposCliente: Set<string>}>}
 */
export async function cargarReferencias(filas) {
  const catalogos = await obtenerCatalogos()

  const numeros = new Set()
  for (const fila of filas ?? []) {
    const datos = normalizarFila(fila)
    if (documentoValido(datos)) numeros.add(datos.numero_documento)
  }

  const existentes = new Set()
  const lista = [...numeros]
  for (let i = 0; i < lista.length; i += TAMANO_LOTE_CONSULTA) {
    const { data, error } = await supabase
      .from('clientes')
      .select('tipo_documento, numero_documento')
      .in('numero_documento', lista.slice(i, i + TAMANO_LOTE_CONSULTA))
    if (error) throw error
    for (const cliente of data ?? []) {
      existentes.add(`${cliente.tipo_documento}:${cliente.numero_documento}`)
    }
  }

  return {
    existentes,
    condicionesIva: new Set(catalogos.condicionesIva.map(clave)),
    tiposCliente: new Set(catalogos.tiposCliente.map(clave)),
  }
}

/**
 * Importa las filas nuevas en una única transacción (todo o nada) llamando a
 * la función SQL `importar_clientes`. Va en una sola llamada a propósito:
 * partirla en lotes rompería el todo o nada.
 *
 * @param {Array<Object>} filasNuevas Campo `datos` de las filas 'nueva'.
 * @returns {Promise<{importadas: number, duplicadas: number, conError: number}>}
 * @throws {Error} Si algo falla: en ese caso no se importó ninguna fila.
 */
export async function importarClientes(filasNuevas) {
  if (!Array.isArray(filasNuevas) || filasNuevas.length === 0) {
    return { importadas: 0, duplicadas: 0, conError: 0 }
  }

  const { data, error } = await supabase.rpc('importar_clientes', {
    p_filas: filasNuevas,
  })

  if (error) {
    if (error.code === '42501') {
      throw new Error('No tenés permiso para importar clientes')
    }
    throw new Error(
      `No se pudo completar la importación: ${error.message || 'error desconocido'}. No se importó ninguna fila.`,
    )
  }

  return {
    importadas: data?.importadas ?? 0,
    duplicadas: data?.duplicadas ?? 0,
    conError: data?.con_error ?? 0,
  }
}

/**
 * Arma el CSV con las filas rechazadas (duplicadas y con error) y su motivo,
 * con los mismos encabezados de la plantilla para poder corregirlo y volver a
 * subirlo. Separado por ";" y con la línea `sep=;`, igual que la plantilla,
 * para que Excel lo abra con cada dato en su columna.
 *
 * @param {Array<Object>} resultados Salida de `validarFilas`.
 * @returns {string} Contenido CSV; solo trae el encabezado si no hay rechazadas.
 */
export function generarCsvRechazadas(resultados) {
  const rechazadas = (resultados ?? []).filter((r) => r.estado !== 'nueva')

  const cuerpo = Papa.unparse(
    {
      fields: ['fila_archivo', ...COLUMNAS_PLANTILLA, 'estado', 'motivo'],
      data: rechazadas.map((r) => [
        r.numeroFila,
        ...COLUMNAS_PLANTILLA.map((columna) => r.fila?.[columna] ?? ''),
        r.estado === 'duplicada' ? 'Duplicada' : 'Con error',
        r.motivo ?? '',
      ]),
    },
    { delimiter: SEPARADOR_CSV },
  )

  return `${LINEA_SEP}${cuerpo}`
}
