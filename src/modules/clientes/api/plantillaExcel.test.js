import { describe, it, expect, vi } from 'vitest'
import { armarZip, crc32, generarPlantillaExcel } from './plantillaExcel'
import { COLUMNAS_INFO } from './importacionClientesApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

const IVA = ['Consumidor Final', 'Exento', 'Monotributo', 'Responsable Inscripto']
const TIPOS = ['Consumidor Final', 'Consumidor web', 'Empresa constructora']

// Lector de zip mínimo, independiente de armarZip: recorre el directorio
// central y devuelve { nombre: { texto, crcDeclarado, crcCalculado } }.
function leerZip(bytes) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decodificador = new TextDecoder()

  const finOffset = bytes.length - 22
  expect(vista.getUint32(finOffset, true)).toBe(0x06054b50)
  const cantidad = vista.getUint16(finOffset + 10, true)
  let cursor = vista.getUint32(finOffset + 16, true)

  const archivos = {}
  for (let i = 0; i < cantidad; i++) {
    expect(vista.getUint32(cursor, true)).toBe(0x02014b50)
    const crcDeclarado = vista.getUint32(cursor + 16, true)
    const tamano = vista.getUint32(cursor + 24, true)
    const largoNombre = vista.getUint16(cursor + 28, true)
    const offsetLocal = vista.getUint32(cursor + 42, true)
    const nombre = decodificador.decode(bytes.subarray(cursor + 46, cursor + 46 + largoNombre))

    expect(vista.getUint32(offsetLocal, true)).toBe(0x04034b50)
    const largoNombreLocal = vista.getUint16(offsetLocal + 26, true)
    const largoExtra = vista.getUint16(offsetLocal + 28, true)
    const inicio = offsetLocal + 30 + largoNombreLocal + largoExtra
    const datos = bytes.subarray(inicio, inicio + tamano)

    archivos[nombre] = {
      texto: decodificador.decode(datos),
      crcDeclarado,
      crcCalculado: crc32(datos),
    }
    cursor += 46 + largoNombre
  }
  return archivos
}

async function generar(opciones = { condicionesIva: IVA, tiposCliente: TIPOS }) {
  const blob = generarPlantillaExcel(opciones)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { blob, bytes, archivos: leerZip(bytes) }
}

const xml = (texto) => new DOMParser().parseFromString(texto, 'application/xml')

describe('plantillaExcel', () => {
  describe('crc32', () => {
    it('da el valor de referencia del estándar', () => {
      // Vector de prueba clásico de CRC-32.
      expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
      expect(crc32(new Uint8Array(0))).toBe(0)
    })
  })

  describe('armarZip', () => {
    it('guarda los archivos con sus nombres, contenido y CRC correctos', () => {
      const bytes = armarZip([
        { nombre: 'a.txt', contenido: 'hola' },
        { nombre: 'dir/b.txt', contenido: 'mundo ñandú' },
      ])
      const archivos = leerZip(bytes)

      expect(Object.keys(archivos)).toEqual(['a.txt', 'dir/b.txt'])
      expect(archivos['a.txt'].texto).toBe('hola')
      expect(archivos['dir/b.txt'].texto).toBe('mundo ñandú')
      for (const a of Object.values(archivos)) {
        expect(a.crcDeclarado).toBe(a.crcCalculado)
      }
    })
  })

  describe('generarPlantillaExcel', () => {
    it('devuelve un archivo de Excel (.xlsx) con firma zip', async () => {
      const { blob, bytes } = await generar()

      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      // "PK": todos los zip empiezan así.
      expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
    })

    it('trae las piezas que Excel exige, todas con CRC correcto', async () => {
      const { archivos } = await generar()

      expect(Object.keys(archivos)).toEqual([
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/workbook.xml',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/worksheets/sheet1.xml',
        'xl/worksheets/sheet2.xml',
        'xl/worksheets/sheet3.xml',
      ])
      for (const a of Object.values(archivos)) {
        expect(a.crcDeclarado).toBe(a.crcCalculado)
      }
    })

    it('todos los XML están bien formados', async () => {
      const { archivos } = await generar()

      for (const [nombre, { texto }] of Object.entries(archivos)) {
        const documento = xml(texto)
        expect(documento.getElementsByTagName('parsererror'), nombre).toHaveLength(0)
      }
    })

    it('tiene tres hojas y "Clientes" es la primera (Excel solo exporta esa a CSV)', async () => {
      const { archivos } = await generar()
      const hojas = [...xml(archivos['xl/workbook.xml'].texto).getElementsByTagName('sheet')]

      expect(hojas.map((h) => h.getAttribute('name'))).toEqual([
        'Clientes',
        'Instrucciones',
        'Opciones',
      ])
    })

    it('la hoja Clientes tiene cada columna del sistema en su propia celda, en orden', async () => {
      const { archivos } = await generar()
      const celdas = [...xml(archivos['xl/worksheets/sheet1.xml'].texto).getElementsByTagName('c')]

      expect(celdas.map((c) => c.textContent)).toEqual(COLUMNAS_INFO.map((c) => c.nombre))
      expect(celdas.map((c) => c.getAttribute('r'))).toEqual(
        COLUMNAS_INFO.map((_, i) => `${String.fromCharCode(65 + i)}1`),
      )
    })

    it('pone un desplegable en cada columna con lista, apuntando a la hoja Opciones', async () => {
      const { archivos } = await generar()
      const validaciones = [
        ...xml(archivos['xl/worksheets/sheet1.xml'].texto).getElementsByTagName('dataValidation'),
      ]

      const porColumna = Object.fromEntries(
        validaciones.map((v) => [
          v.getAttribute('sqref').split(':')[0].replace(/\d+/, ''),
          v.getElementsByTagName('formula1')[0].textContent,
        ]),
      )

      // A tipo_persona, E tipo_documento, G condicion_iva, H tipo_cliente, K habilita_cta_cte
      expect(porColumna).toEqual({
        A: 'Opciones!$A$2:$A$3',
        E: 'Opciones!$B$2:$B$3',
        G: 'Opciones!$C$2:$C$5',
        H: 'Opciones!$D$2:$D$4',
        K: 'Opciones!$E$2:$E$3',
      })
      for (const v of validaciones) {
        expect(v.getAttribute('type')).toBe('list')
        // No se puede escribir un valor fuera de la lista.
        expect(v.getAttribute('showErrorMessage')).toBe('1')
      }
    })

    it('la hoja Opciones lista exactamente las opciones de la base', async () => {
      const { archivos } = await generar()
      const celdas = [...xml(archivos['xl/worksheets/sheet3.xml'].texto).getElementsByTagName('c')]
      const valor = (ref) => celdas.find((c) => c.getAttribute('r') === ref)?.textContent

      expect(valor('C1')).toBe('condicion_iva')
      expect([valor('C2'), valor('C3'), valor('C4'), valor('C5')]).toEqual(IVA)
      expect(valor('D1')).toBe('tipo_cliente')
      expect([valor('D2'), valor('D3'), valor('D4')]).toEqual(TIPOS)
      expect([valor('A2'), valor('A3')]).toEqual(['fisica', 'juridica'])
      expect([valor('B2'), valor('B3')]).toEqual(['DNI', 'CUIT'])
      expect([valor('E2'), valor('E3')]).toEqual(['si', 'no'])
    })

    it('el rango del desplegable sigue la cantidad de opciones que haya en la base', async () => {
      const { archivos } = await generar({
        condicionesIva: ['A', 'B'],
        tiposCliente: ['X', 'Y', 'Z', 'W', 'V'],
      })
      const formulas = [
        ...xml(archivos['xl/worksheets/sheet1.xml'].texto).getElementsByTagName('formula1'),
      ].map((f) => f.textContent)

      expect(formulas).toContain('Opciones!$C$2:$C$3')
      expect(formulas).toContain('Opciones!$D$2:$D$6')
    })

    it('no crea un desplegable para una lista vacía (evita un rango inválido)', async () => {
      const { archivos } = await generar({ condicionesIva: [], tiposCliente: TIPOS })
      const formulas = [
        ...xml(archivos['xl/worksheets/sheet1.xml'].texto).getElementsByTagName('formula1'),
      ].map((f) => f.textContent)

      expect(formulas.some((f) => f.includes('$C$'))).toBe(false)
      expect(formulas).toContain('Opciones!$D$2:$D$4')
    })

    it('escapa caracteres especiales de las opciones (no rompe el XML)', async () => {
      const { archivos } = await generar({
        condicionesIva: ['Tipo <A> & "B"'],
        tiposCliente: TIPOS,
      })
      const documento = xml(archivos['xl/worksheets/sheet3.xml'].texto)

      expect(documento.getElementsByTagName('parsererror')).toHaveLength(0)
      const celdas = [...documento.getElementsByTagName('c')]
      expect(celdas.find((c) => c.getAttribute('r') === 'C2').textContent).toBe('Tipo <A> & "B"')
    })

    it('guarda numero_documento y telefono como texto para no perder ceros', async () => {
      const { archivos } = await generar()
      const columnas = [
        ...xml(archivos['xl/worksheets/sheet1.xml'].texto).getElementsByTagName('col'),
      ]
      const conEstilo = columnas.filter((c) => c.getAttribute('style')).map((c) => c.getAttribute('min'))

      // F (6) numero_documento y J (10) telefono.
      expect(conEstilo).toEqual(['6', '10'])
      // El estilo apunta al formato de número 49 ("@", texto).
      expect(archivos['xl/styles.xml'].texto).toContain('numFmtId="49"')
    })

    it('la hoja Instrucciones explica cada columna', async () => {
      const { archivos } = await generar()
      const texto = xml(archivos['xl/worksheets/sheet2.xml'].texto).documentElement.textContent

      for (const info of COLUMNAS_INFO) {
        expect(texto).toContain(info.nombre)
      }
      expect(texto).toContain('CSV UTF-8')
    })

    it('funciona sin catálogos (deja sin desplegable condición de IVA y tipo de cliente)', async () => {
      const { archivos } = await generar({})
      const formulas = [
        ...xml(archivos['xl/worksheets/sheet1.xml'].texto).getElementsByTagName('formula1'),
      ].map((f) => f.textContent)

      expect(formulas).toHaveLength(3) // tipo_persona, tipo_documento, habilita_cta_cte
    })
  })
})
