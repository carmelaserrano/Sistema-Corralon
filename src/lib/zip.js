// Zip sin compresión (método "store"), suficiente para armar .xlsx a mano sin
// sumar una librería. Lo usan la plantilla de clientes y los informes.

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
 * @param {Array<{nombre: string, contenido: string|Uint8Array}>} archivos
 *   Texto (se guarda en UTF-8) o bytes (por ejemplo, una imagen).
 * @returns {Uint8Array}
 */
export function armarZip(archivos) {
  const codificador = new TextEncoder()
  const partes = []
  const directorio = []
  let posicion = 0

  for (const { nombre, contenido } of archivos) {
    const nombreBytes = codificador.encode(nombre)
    const datos = typeof contenido === 'string' ? codificador.encode(contenido) : contenido
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
