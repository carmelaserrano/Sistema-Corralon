import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import {
  COLUMNAS_INFO,
  COLUMNAS_OBLIGATORIAS,
  COLUMNAS_PLANTILLA,
  OPCIONES_FIJAS,
  cargarReferencias,
  columnasFaltantes,
  esArchivoCsv,
  generarCsvRechazadas,
  generarPlantillaCsv,
  importarClientes,
  normalizarEncabezado,
  obtenerCatalogos,
  problemaDeColumnas,
  puedeImportarClientes,
  quitarLineaSep,
  validarFilas,
} from './importacionClientesApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

const filaFisica = {
  tipo_persona: 'fisica',
  nombre: 'Ana',
  apellido: 'López',
  razon_social: '',
  tipo_documento: 'DNI',
  numero_documento: '27111001',
  condicion_iva: 'Monotributo',
  tipo_cliente: 'Consumidor Final',
  email: 'ana@example.com',
  telefono: '3874100001',
  habilita_cta_cte: 'no',
}

const filaJuridica = {
  tipo_persona: 'juridica',
  nombre: '',
  apellido: '',
  razon_social: 'Hierros Salta SRL',
  tipo_documento: 'CUIT',
  numero_documento: '30722222225',
  condicion_iva: 'Responsable Inscripto',
  tipo_cliente: 'Empresa constructora',
  email: '',
  telefono: '3874200002',
  habilita_cta_cte: 'si',
}

describe('importacionClientesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('plantilla y archivo', () => {
    it('la plantilla CSV trae todas las columnas separadas por ";" y ninguna fila de ejemplo', () => {
      const lineas = generarPlantillaCsv().trim().split('\n')

      // Primera línea: le dice a Excel el separador. Segunda: el encabezado.
      expect(lineas).toHaveLength(2)
      expect(lineas[0]).toBe('sep=;')
      expect(lineas[1].split(';')).toEqual(COLUMNAS_PLANTILLA)
      for (const columna of COLUMNAS_OBLIGATORIAS) {
        expect(COLUMNAS_PLANTILLA).toContain(columna)
      }
    })

    it('la plantilla CSV se puede volver a leer: al descartar sep=; quedan las columnas', () => {
      const { meta } = Papa.parse(quitarLineaSep(generarPlantillaCsv()), { header: true })
      expect(meta.fields).toEqual(COLUMNAS_PLANTILLA)
      expect(columnasFaltantes(meta.fields)).toEqual([])
    })

    it('COLUMNAS_INFO describe cada columna de la plantilla, en orden, y cubre las obligatorias', () => {
      expect(COLUMNAS_INFO.map((c) => c.nombre)).toEqual(COLUMNAS_PLANTILLA)
      for (const columna of COLUMNAS_OBLIGATORIAS) {
        expect(COLUMNAS_INFO.map((c) => c.nombre)).toContain(columna)
      }
      for (const info of COLUMNAS_INFO) {
        expect(['obligatoria', 'segun_persona', 'opcional']).toContain(info.tipo)
        expect(info.ayuda.length).toBeGreaterThan(0)
      }
    })

    it('las listas fijas coinciden con lo que acepta la validación', () => {
      const validas = OPCIONES_FIJAS.tipo_persona.flatMap((tipoPersona) =>
        OPCIONES_FIJAS.tipo_documento.map((tipoDocumento) => ({
          tipoPersona,
          tipoDocumento,
        })),
      )
      for (const { tipoPersona, tipoDocumento } of validas) {
        const fila =
          tipoPersona === 'fisica'
            ? { ...filaFisica, tipo_documento: tipoDocumento, numero_documento: '12345678901' }
            : { ...filaJuridica, tipo_documento: tipoDocumento, numero_documento: '12345678901' }
        // Con 11 dígitos el CUIT es válido; el DNI no: lo que importa es que
        // ninguna opción de la lista sea rechazada por su tipo.
        const [r] = validarFilas([fila])
        expect(r.motivo ?? '').not.toContain('Tipo de persona inválido')
        expect(r.motivo ?? '').not.toContain('Tipo de documento inválido')
      }
      for (const valor of OPCIONES_FIJAS.habilita_cta_cte) {
        const [r] = validarFilas([{ ...filaFisica, habilita_cta_cte: valor }])
        expect(r.estado).toBe('nueva')
      }
    })

    it('acepta solo archivos .csv, sin importar mayúsculas', () => {
      expect(esArchivoCsv('clientes.csv')).toBe(true)
      expect(esArchivoCsv('CLIENTES.CSV')).toBe(true)
      expect(esArchivoCsv('clientes.xlsx')).toBe(false)
      expect(esArchivoCsv('clientes.csv.exe')).toBe(false)
      expect(esArchivoCsv('')).toBe(false)
      expect(esArchivoCsv(undefined)).toBe(false)
    })

    it('normaliza los encabezados: BOM, espacios y mayúsculas', () => {
      expect(normalizarEncabezado('\uFEFFTipo_Persona ')).toBe('tipo_persona')
    })
  })

  describe('columnasFaltantes', () => {
    it('no informa nada si están todas las obligatorias', () => {
      expect(columnasFaltantes(COLUMNAS_PLANTILLA)).toEqual([])
    })

    it('las opcionales (email, habilita_cta_cte) pueden faltar', () => {
      const sinOpcionales = COLUMNAS_PLANTILLA.filter(
        (c) => c !== 'email' && c !== 'habilita_cta_cte',
      )
      expect(columnasFaltantes(sinOpcionales)).toEqual([])
    })

    it('informa exactamente cuáles obligatorias faltan', () => {
      const columnas = COLUMNAS_PLANTILLA.filter(
        (c) => c !== 'telefono' && c !== 'numero_documento',
      )
      expect(columnasFaltantes(columnas)).toEqual(['numero_documento', 'telefono'])
    })

    it('reconoce encabezados con BOM, espacios o mayúsculas', () => {
      const columnas = COLUMNAS_PLANTILLA.map((c, i) =>
        i === 0 ? `\uFEFF${c.toUpperCase()}` : ` ${c} `,
      )
      expect(columnasFaltantes(columnas)).toEqual([])
    })

    it('un archivo sin encabezados válidos las reporta todas', () => {
      expect(columnasFaltantes(['a', 'b'])).toEqual(COLUMNAS_OBLIGATORIAS)
      expect(columnasFaltantes(undefined)).toEqual(COLUMNAS_OBLIGATORIAS)
    })
  })

  describe('validarFilas', () => {
    it('marca como nueva una fila válida y devuelve los datos normalizados', () => {
      const [resultado] = validarFilas([filaFisica])

      expect(resultado.estado).toBe('nueva')
      expect(resultado.motivo).toBeUndefined()
      expect(resultado.numeroFila).toBe(2)
      expect(resultado.datos).toMatchObject({
        tipo_persona: 'fisica',
        tipo_documento: 'DNI',
        numero_documento: '27111001',
        habilita_cta_cte: false,
      })
    })

    it('numera las filas como en el archivo (el encabezado es la línea 1)', () => {
      const resultados = validarFilas([
        filaFisica,
        { ...filaFisica, numero_documento: '27111002' },
      ])
      expect(resultados.map((r) => r.numeroFila)).toEqual([2, 3])
    })

    it('normaliza documento con puntos o guiones y tipo de persona con acento', () => {
      const [dni, cuit] = validarFilas([
        { ...filaFisica, numero_documento: '27.111.001' },
        { ...filaJuridica, tipo_persona: 'Jurídica', numero_documento: '30-72222222-5' },
      ])

      expect(dni.estado).toBe('nueva')
      expect(dni.datos.numero_documento).toBe('27111001')
      expect(cuit.estado).toBe('nueva')
      expect(cuit.datos.tipo_persona).toBe('juridica')
      expect(cuit.datos.numero_documento).toBe('30722222225')
    })

    it('rechaza un DNI que no tiene 7 u 8 dígitos', () => {
      const resultados = validarFilas([
        { ...filaFisica, numero_documento: '123456' },
        { ...filaFisica, numero_documento: '123456789' },
        { ...filaFisica, numero_documento: '2711100A' },
      ])

      for (const r of resultados) {
        expect(r.estado).toBe('error')
        expect(r.motivo).toContain('DNI inválido')
      }
    })

    it('rechaza un CUIT que no tiene 11 dígitos', () => {
      const resultados = validarFilas([
        { ...filaJuridica, numero_documento: '3071234' },
        { ...filaJuridica, numero_documento: '20-1234567-X' },
      ])

      for (const r of resultados) {
        expect(r.estado).toBe('error')
        expect(r.motivo).toContain('CUIT inválido')
      }
    })

    it('no valida el dígito verificador del CUIT: alcanza con 11 dígitos', () => {
      const [resultado] = validarFilas([{ ...filaJuridica, numero_documento: '11111111111' }])
      expect(resultado.estado).toBe('nueva')
    })

    it('rechaza un tipo de documento que no es DNI ni CUIT', () => {
      const [resultado] = validarFilas([{ ...filaFisica, tipo_documento: 'PASAPORTE' }])
      expect(resultado.estado).toBe('error')
      expect(resultado.motivo).toContain('Tipo de documento inválido')
    })

    it('rechaza un documento vacío', () => {
      const [resultado] = validarFilas([{ ...filaFisica, numero_documento: '' }])
      expect(resultado.estado).toBe('error')
      expect(resultado.motivo).toContain('Falta el número de documento')
    })

    it('exige nombre y apellido a una persona física, y le prohíbe razón social', () => {
      const [sinNombre, conRazon] = validarFilas([
        { ...filaFisica, nombre: '', apellido: '' },
        { ...filaFisica, numero_documento: '27111002', razon_social: 'Ana SRL' },
      ])

      expect(sinNombre.motivo).toContain('Falta el nombre')
      expect(sinNombre.motivo).toContain('Falta el apellido')
      expect(conRazon.estado).toBe('error')
      expect(conRazon.motivo).toContain('no lleva razón social')
    })

    it('exige razón social a una persona jurídica, y le prohíbe nombre y apellido', () => {
      const [sinRazon, conNombre] = validarFilas([
        { ...filaJuridica, razon_social: '' },
        { ...filaJuridica, numero_documento: '30733333336', nombre: 'Ana' },
      ])

      expect(sinRazon.motivo).toContain('Falta la razón social')
      expect(conNombre.estado).toBe('error')
      expect(conNombre.motivo).toContain('no lleva nombre ni apellido')
    })

    it('rechaza un tipo de persona desconocido', () => {
      const [resultado] = validarFilas([{ ...filaFisica, tipo_persona: 'empresa' }])
      expect(resultado.estado).toBe('error')
      expect(resultado.motivo).toContain('Tipo de persona inválido')
    })

    it('exige teléfono y valida el formato del email cuando viene', () => {
      const [sinTelefono, emailMalo, sinEmail] = validarFilas([
        { ...filaFisica, telefono: '' },
        { ...filaFisica, numero_documento: '27111002', email: 'no-es-un-mail' },
        { ...filaFisica, numero_documento: '27111003', email: '' },
      ])

      expect(sinTelefono.motivo).toContain('Falta el teléfono')
      expect(emailMalo.motivo).toContain('Email inválido')
      expect(sinEmail.estado).toBe('nueva')
    })

    it('interpreta habilita_cta_cte y rechaza valores desconocidos', () => {
      const [si, no, vacio, raro] = validarFilas([
        { ...filaFisica, numero_documento: '27111001', habilita_cta_cte: 'Sí' },
        { ...filaFisica, numero_documento: '27111002', habilita_cta_cte: 'NO' },
        { ...filaFisica, numero_documento: '27111003', habilita_cta_cte: '' },
        { ...filaFisica, numero_documento: '27111004', habilita_cta_cte: 'quizás' },
      ])

      expect(si.datos.habilita_cta_cte).toBe(true)
      expect(no.datos.habilita_cta_cte).toBe(false)
      expect(vacio.datos.habilita_cta_cte).toBe(false)
      expect(raro.estado).toBe('error')
      expect(raro.motivo).toContain('habilita_cta_cte')
    })

    it('acumula todos los motivos de una fila con varios errores', () => {
      const [resultado] = validarFilas([
        { ...filaFisica, numero_documento: '12', telefono: '', email: 'x' },
      ])

      expect(resultado.estado).toBe('error')
      expect(resultado.motivo).toContain('DNI inválido')
      expect(resultado.motivo).toContain('Falta el teléfono')
      expect(resultado.motivo).toContain('Email inválido')
    })

    it('valida condición de IVA y tipo de cliente contra el catálogo cuando se lo pasan', () => {
      const referencias = {
        condicionesIva: new Set(['monotributo']),
        tiposCliente: new Set(['consumidor final']),
      }
      const [ok, ivaMalo, tipoMalo] = validarFilas(
        [
          filaFisica,
          { ...filaFisica, numero_documento: '27111002', condicion_iva: 'Inventada' },
          { ...filaFisica, numero_documento: '27111003', tipo_cliente: 'VIP' },
        ],
        referencias,
      )

      expect(ok.estado).toBe('nueva')
      expect(ivaMalo.motivo).toContain('Condición de IVA inexistente: "Inventada"')
      expect(tipoMalo.motivo).toContain('Tipo de cliente inexistente: "VIP"')
    })

    it('compara los catálogos sin distinguir mayúsculas ni espacios', () => {
      const referencias = {
        condicionesIva: new Set(['monotributo']),
        tiposCliente: new Set(['consumidor final']),
      }
      const [resultado] = validarFilas(
        [{ ...filaFisica, condicion_iva: '  MONOTRIBUTO ', tipo_cliente: 'consumidor FINAL' }],
        referencias,
      )
      expect(resultado.estado).toBe('nueva')
    })

    it('exige condición de IVA y tipo de cliente aunque no haya catálogo', () => {
      const [resultado] = validarFilas([{ ...filaFisica, condicion_iva: '', tipo_cliente: '' }])
      expect(resultado.motivo).toContain('Falta la condición de IVA')
      expect(resultado.motivo).toContain('Falta el tipo de cliente')
    })

    describe('documentos repetidos dentro del mismo archivo', () => {
      it('marca con error todas las apariciones y no elige ninguna', () => {
        const resultados = validarFilas([
          filaFisica,
          { ...filaFisica, numero_documento: '27111002' },
          { ...filaFisica, nombre: 'Ana María' },
          { ...filaFisica, nombre: 'Ana Otra' },
        ])

        expect(resultados.map((r) => r.estado)).toEqual(['error', 'nueva', 'error', 'error'])
        expect(resultados[0].motivo).toContain('Documento repetido en el archivo (filas 2, 4, 5)')
        expect(resultados[2].motivo).toContain('filas 2, 4, 5')
        expect(resultados[3].motivo).toContain('filas 2, 4, 5')
      })

      it('un mismo número con distinto tipo de documento no es repetido', () => {
        const resultados = validarFilas([
          filaFisica,
          { ...filaFisica, tipo_documento: 'CUIT', numero_documento: '27111001' },
        ])

        // El segundo falla por otra razón (CUIT de 8 dígitos), pero no por repetido.
        expect(resultados[0].estado).toBe('nueva')
        expect(resultados[1].motivo).not.toContain('repetido')
      })

      it('el formato con puntos y sin puntos cuenta como el mismo documento', () => {
        const resultados = validarFilas([
          filaFisica,
          { ...filaFisica, numero_documento: '27.111.001' },
        ])
        expect(resultados.map((r) => r.estado)).toEqual(['error', 'error'])
      })

      it('un documento inválido repetido no se informa como repetido', () => {
        const resultados = validarFilas([
          { ...filaFisica, numero_documento: '12' },
          { ...filaFisica, numero_documento: '12' },
        ])
        for (const r of resultados) {
          expect(r.motivo).toContain('DNI inválido')
          expect(r.motivo).not.toContain('repetido')
        }
      })
    })

    describe('documentos que ya existen en el sistema', () => {
      it('marca como duplicada, con motivo, una fila válida cuyo documento ya existe', () => {
        const [resultado] = validarFilas([filaFisica], {
          existentes: new Set(['DNI:27111001']),
        })

        expect(resultado.estado).toBe('duplicada')
        expect(resultado.motivo).toBe('El documento ya existe en el sistema')
      })

      it('compara por tipo y número: el mismo número con otro tipo no es duplicado', () => {
        const [resultado] = validarFilas([filaFisica], {
          existentes: new Set(['CUIT:27111001']),
        })
        expect(resultado.estado).toBe('nueva')
      })

      it('un error de validación gana sobre el duplicado', () => {
        const [resultado] = validarFilas([{ ...filaFisica, telefono: '' }], {
          existentes: new Set(['DNI:27111001']),
        })
        expect(resultado.estado).toBe('error')
      })
    })

    it('devuelve una lista vacía si no hay filas', () => {
      expect(validarFilas([])).toEqual([])
      expect(validarFilas(undefined)).toEqual([])
    })
  })

  describe('archivo de prueba qa/s3-04/clientes_legacy.csv', () => {
    it('da 15 nuevas, 3 duplicadas y 2 con CUIT inválido', () => {
      const contenido = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../../../qa/s3-04/clientes_legacy.csv'),
        'utf8',
      )
      const { data, meta } = Papa.parse(contenido, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizarEncabezado,
      })

      expect(columnasFaltantes(meta.fields)).toEqual([])
      expect(data).toHaveLength(20)

      // Documentos ya cargados por el seed de S3-00 (0031).
      const resultados = validarFilas(data, {
        existentes: new Set(['DNI:30111222', 'DNI:28555444', 'CUIT:20123456786']),
        condicionesIva: new Set(['responsable inscripto', 'monotributo', 'consumidor final', 'exento']),
        tiposCliente: new Set(['consumidor final', 'empresa constructora', 'consumidor web']),
      })

      const cuenta = (estado) => resultados.filter((r) => r.estado === estado).length
      expect(cuenta('nueva')).toBe(15)
      expect(cuenta('duplicada')).toBe(3)
      expect(cuenta('error')).toBe(2)
      expect(resultados.filter((r) => r.estado === 'error').every((r) => r.motivo.includes('CUIT inválido'))).toBe(true)
    })
  })

  describe('generarCsvRechazadas', () => {
    it('incluye solo duplicadas y con error, con su motivo y el número de fila', () => {
      const resultados = validarFilas(
        [
          filaFisica,
          { ...filaFisica, numero_documento: '27111002' },
          { ...filaFisica, numero_documento: '12' },
        ],
        { existentes: new Set(['DNI:27111002']) },
      )

      const { data, meta } = Papa.parse(quitarLineaSep(generarCsvRechazadas(resultados)), {
        header: true,
        skipEmptyLines: true,
      })

      expect(meta.fields).toEqual(['fila_archivo', ...COLUMNAS_PLANTILLA, 'estado', 'motivo'])
      expect(data).toHaveLength(2)
      expect(data[0]).toMatchObject({
        fila_archivo: '3',
        numero_documento: '27111002',
        estado: 'Duplicada',
        motivo: 'El documento ya existe en el sistema',
      })
      expect(data[1]).toMatchObject({ fila_archivo: '4', estado: 'Con error' })
      expect(data[1].motivo).toContain('DNI inválido')
    })

    it('conserva los valores originales del archivo, no los normalizados', () => {
      const resultados = validarFilas([{ ...filaFisica, numero_documento: '27.111', tipo_persona: 'Física' }])
      const { data } = Papa.parse(quitarLineaSep(generarCsvRechazadas(resultados)), { header: true })

      expect(data[0].numero_documento).toBe('27.111')
      expect(data[0].tipo_persona).toBe('Física')
    })

    it('solo trae el encabezado si no hay rechazadas', () => {
      const csv = quitarLineaSep(generarCsvRechazadas(validarFilas([filaFisica])))
      expect(csv.trim().split(/\r?\n/)).toHaveLength(1)
    })

    it('va separado por ";" y con la línea sep=; para que Excel lo abra en columnas', () => {
      const csv = generarCsvRechazadas(validarFilas([{ ...filaFisica, numero_documento: '12' }]))
      const [primera, encabezado] = csv.split(/\r?\n/)

      expect(primera).toBe('sep=;')
      expect(encabezado.split(';')).toEqual([
        'fila_archivo',
        ...COLUMNAS_PLANTILLA,
        'estado',
        'motivo',
      ])
    })
  })

  describe('quitarLineaSep', () => {
    it('descarta la línea sep=; del principio', () => {
      expect(quitarLineaSep('sep=;\na;b\n1;2')).toBe('a;b\n1;2')
      expect(quitarLineaSep('SEP=,\r\na,b')).toBe('a,b')
    })

    it('no toca archivos que no la traen', () => {
      expect(quitarLineaSep('a;b\n1;2')).toBe('a;b\n1;2')
      expect(quitarLineaSep('sep_x;b\n1;2')).toBe('sep_x;b\n1;2')
    })
  })

  describe('problemaDeColumnas', () => {
    it('no informa nada si están todas las columnas obligatorias', () => {
      expect(problemaDeColumnas(COLUMNAS_PLANTILLA)).toBeNull()
    })

    it('informa cuáles faltan y cuáles encontró', () => {
      const mensaje = problemaDeColumnas(['tipo_persona', 'nombre', 'Otra columna'])

      expect(mensaje).toContain('faltan columnas obligatorias')
      expect(mensaje).toContain('numero_documento')
      expect(mensaje).toContain('telefono')
      expect(mensaje).toContain('Columnas encontradas: tipo_persona, nombre, otra columna')
    })

    it('explica el caso de todo pegado en una sola columna', () => {
      const mensaje = problemaDeColumnas([COLUMNAS_PLANTILLA.join(',')])

      expect(mensaje).toContain('una sola columna')
      expect(mensaje).toContain('plantilla de Excel')
    })

    it('detecta el encabezado pegado aunque el parser agregue columnas vacías (_1, _2…)', () => {
      // Es lo que devuelve papaparse con el archivo que guardó Excel en español.
      const mensaje = problemaDeColumnas([COLUMNAS_PLANTILLA.join(','), '', '_1', '_2', '_3'])

      expect(mensaje).toContain('una sola columna')
      expect(mensaje).not.toContain('faltan columnas')
    })

    it('un archivo sin encabezados también cuenta como una sola columna', () => {
      expect(problemaDeColumnas([])).toContain('una sola columna')
      expect(problemaDeColumnas(undefined)).toContain('una sola columna')
      expect(problemaDeColumnas(['', ''])).toContain('una sola columna')
    })
  })

  describe('CSV guardado por Excel en español (el caso real)', () => {
    const leer = (texto) =>
      Papa.parse(quitarLineaSep(texto), {
        header: true,
        skipEmptyLines: 'greedy',
        delimitersToGuess: [';', ',', '\t'],
        transformHeader: normalizarEncabezado,
      })

    it('detecta el archivo del que se armó con la plantilla vieja (encabezado en una celda)', () => {
      // Excel abrió la plantilla separada por comas con todo en la columna A;
      // al guardar, el encabezado sigue siendo una sola "columna".
      const guardado =
        COLUMNAS_PLANTILLA.join(',') +
        ';;;;;;\r\nfisica;carmela;serrano;DNI;45774284;Monotributo;Consumidor Final\r\n'

      const { meta } = leer(guardado)

      expect(columnasFaltantes(meta.fields).length).toBeGreaterThan(0)
      expect(problemaDeColumnas(meta.fields)).toBeTruthy()
    })

    it('lee bien un archivo con ";" completado a partir de la plantilla', () => {
      const guardado = [
        COLUMNAS_PLANTILLA.join(';'),
        'fisica;Carmela;Serrano;;DNI;45774284;Monotributo;Consumidor Final;;3874100001;no',
      ].join('\r\n')

      const { data, meta } = leer(guardado)

      expect(problemaDeColumnas(meta.fields)).toBeNull()
      const [resultado] = validarFilas(data)
      expect(resultado.estado).toBe('nueva')
      expect(resultado.datos).toMatchObject({ nombre: 'Carmela', numero_documento: '45774284' })
    })

    it('lee bien la plantilla CSV completa a mano, con su línea sep=;', () => {
      const conDatos =
        generarPlantillaCsv() +
        'fisica;Ana;López;;DNI;27111001;Monotributo;Consumidor Final;;3874100001;no\n'

      const { data, meta } = leer(conDatos)

      expect(meta.fields).toEqual(COLUMNAS_PLANTILLA)
      expect(validarFilas(data)[0].estado).toBe('nueva')
    })

    it('sigue leyendo los archivos separados por comas', () => {
      const guardado = [
        COLUMNAS_PLANTILLA.join(','),
        'fisica,Ana,López,,DNI,27111001,Monotributo,Consumidor Final,,3874100001,no',
      ].join('\n')

      const { data, meta } = leer(guardado)

      expect(problemaDeColumnas(meta.fields)).toBeNull()
      expect(validarFilas(data)[0].estado).toBe('nueva')
    })

    it('un archivo separado por ";" con nombres que llevan coma no se rompe', () => {
      const guardado = [
        COLUMNAS_PLANTILLA.join(';'),
        'fisica;"Ana, María";López;;DNI;27111001;Monotributo;Consumidor Final;;3874100001;no',
      ].join('\n')

      const { data } = leer(guardado)

      expect(data[0].nombre).toBe('Ana, María')
    })
  })

  describe('obtenerCatalogos', () => {
    it('devuelve los nombres activos de IVA y tipos de cliente, ordenados', async () => {
      supabase.from.mockImplementation((tabla) => ({
        select: () => ({
          eq: (columna, valor) => {
            expect([columna, valor]).toEqual(['activo', true])
            return Promise.resolve(
              tabla === 'condiciones_iva'
                ? { data: [{ nombre: 'Monotributo' }, { nombre: 'Exento' }], error: null }
                : { data: [{ nombre: 'Web' }, { nombre: 'Consumidor Final' }], error: null },
            )
          },
        }),
      }))

      await expect(obtenerCatalogos()).resolves.toEqual({
        condicionesIva: ['Exento', 'Monotributo'],
        tiposCliente: ['Consumidor Final', 'Web'],
      })
    })

    it('propaga el error si una consulta falla', async () => {
      supabase.from.mockImplementation(() => ({
        select: () => ({ eq: () => Promise.resolve({ data: null, error: new Error('sin acceso') }) }),
      }))

      await expect(obtenerCatalogos()).rejects.toThrow('sin acceso')
    })
  })

  describe('puedeImportarClientes', () => {
    it('consulta el permiso clientes.importar', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      await expect(puedeImportarClientes()).resolves.toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'clientes.importar',
      })
    })

    it('devuelve false si no tiene el permiso', async () => {
      supabase.rpc.mockResolvedValue({ data: false, error: null })
      await expect(puedeImportarClientes()).resolves.toBe(false)
    })

    it('propaga el error de la consulta', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: new Error('boom') })
      await expect(puedeImportarClientes()).rejects.toThrow('boom')
    })
  })

  describe('cargarReferencias', () => {
    function simularTablas({ iva, tipos, clientes }) {
      const consultasClientes = []
      supabase.from.mockImplementation((tabla) => {
        if (tabla === 'condiciones_iva') {
          return { select: () => ({ eq: () => Promise.resolve(iva) }) }
        }
        if (tabla === 'tipos_cliente') {
          return { select: () => ({ eq: () => Promise.resolve(tipos) }) }
        }
        return {
          select: () => ({
            in: (columna, numeros) => {
              consultasClientes.push({ columna, numeros })
              return Promise.resolve(clientes)
            },
          }),
        }
      })
      return consultasClientes
    }

    it('arma los catálogos en minúsculas y los documentos existentes como tipo:numero', async () => {
      const consultas = simularTablas({
        iva: { data: [{ nombre: 'Monotributo' }], error: null },
        tipos: { data: [{ nombre: 'Consumidor Final' }], error: null },
        clientes: { data: [{ tipo_documento: 'DNI', numero_documento: '27111001' }], error: null },
      })

      const referencias = await cargarReferencias([
        filaFisica,
        { ...filaFisica, numero_documento: '27.111.002' },
        { ...filaFisica, numero_documento: '12' }, // inválido: no se consulta
      ])

      expect(referencias.condicionesIva).toEqual(new Set(['monotributo']))
      expect(referencias.tiposCliente).toEqual(new Set(['consumidor final']))
      expect(referencias.existentes).toEqual(new Set(['DNI:27111001']))
      expect(consultas).toHaveLength(1)
      expect(consultas[0].columna).toBe('numero_documento')
      expect(consultas[0].numeros.sort()).toEqual(['27111001', '27111002'])
    })

    it('consulta los documentos en lotes de 100', async () => {
      const filas = Array.from({ length: 250 }, (_, i) => ({
        ...filaFisica,
        numero_documento: String(20000000 + i),
      }))
      const consultas = simularTablas({
        iva: { data: [], error: null },
        tipos: { data: [], error: null },
        clientes: { data: [], error: null },
      })

      await cargarReferencias(filas)

      expect(consultas.map((c) => c.numeros.length)).toEqual([100, 100, 50])
    })

    it('no consulta clientes si ningún documento es válido', async () => {
      const consultas = simularTablas({
        iva: { data: [], error: null },
        tipos: { data: [], error: null },
        clientes: { data: [], error: null },
      })

      await cargarReferencias([{ ...filaFisica, numero_documento: '' }])
      expect(consultas).toHaveLength(0)
    })

    it('propaga el error de una consulta', async () => {
      simularTablas({
        iva: { data: null, error: new Error('sin acceso') },
        tipos: { data: [], error: null },
        clientes: { data: [], error: null },
      })

      await expect(cargarReferencias([filaFisica])).rejects.toThrow('sin acceso')
    })
  })

  describe('importarClientes', () => {
    it('llama a importar_clientes una sola vez con todas las filas y traduce el resumen', async () => {
      supabase.rpc.mockResolvedValue({
        data: { importadas: 2, duplicadas: 1, con_error: 0 },
        error: null,
      })
      const filas = [{ numero_documento: '1' }, { numero_documento: '2' }, { numero_documento: '3' }]

      const resumen = await importarClientes(filas)

      expect(supabase.rpc).toHaveBeenCalledTimes(1)
      expect(supabase.rpc).toHaveBeenCalledWith('importar_clientes', { p_filas: filas })
      expect(resumen).toEqual({ importadas: 2, duplicadas: 1, conError: 0 })
    })

    it('no llama a la base si no hay filas para importar', async () => {
      await expect(importarClientes([])).resolves.toEqual({
        importadas: 0,
        duplicadas: 0,
        conError: 0,
      })
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('informa la falta de permiso con un mensaje claro', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'x' } })

      await expect(importarClientes([{}])).rejects.toThrow('No tenés permiso para importar clientes')
    })

    it('ante un error inesperado avisa que no se importó ninguna fila', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: '23514', message: 'violates check constraint' },
      })

      await expect(importarClientes([{}])).rejects.toThrow(
        /violates check constraint.*No se importó ninguna fila/,
      )
    })
  })
})
