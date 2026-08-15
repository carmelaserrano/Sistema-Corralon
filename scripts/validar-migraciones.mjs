#!/usr/bin/env node
// Valida que los archivos en supabase/migrations/ sigan la convención del
// equipo antes de que se puedan aplicar. Sin dependencias externas: solo
// usa los módulos de Node.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ETIQUETA_DIRECTORIO = 'supabase/migrations'
const DIRECTORIO_MIGRACIONES = join(__dirname, '..', 'supabase', 'migrations')

// Cuatro dígitos + guion bajo + snake_case en minúsculas + .sql
const PATRON_NOMBRE = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/

function formatearNumero(numero) {
  return String(numero).padStart(4, '0')
}

function main() {
  let archivos

  try {
    archivos = readdirSync(DIRECTORIO_MIGRACIONES).filter((archivo) =>
      archivo.endsWith('.sql'),
    )
  } catch (error) {
    console.error(
      `No se pudo leer el directorio "${ETIQUETA_DIRECTORIO}": ${error.message}`,
    )
    process.exit(1)
    return
  }

  if (archivos.length === 0) {
    console.error(`No se encontraron archivos .sql en "${ETIQUETA_DIRECTORIO}".`)
    process.exit(1)
    return
  }

  const errores = []
  const numerosVistos = new Map() // numero -> [nombres de archivo]

  for (const archivo of archivos.sort()) {
    const coincidencia = archivo.match(PATRON_NOMBRE)

    if (!coincidencia) {
      errores.push(
        `- "${archivo}" no sigue el patrón NNNN_nombre_descriptivo.sql ` +
          '(cuatro dígitos, guion bajo, snake_case en minúsculas).',
      )
      continue
    }

    const numero = Number(coincidencia[1])
    const archivosConEseNumero = numerosVistos.get(numero) ?? []
    archivosConEseNumero.push(archivo)
    numerosVistos.set(numero, archivosConEseNumero)

    const rutaCompleta = join(DIRECTORIO_MIGRACIONES, archivo)
    const contenido = readFileSync(rutaCompleta, 'utf-8')
    if (contenido.trim().length === 0) {
      errores.push(`- "${archivo}" está vacío.`)
    }
  }

  for (const [numero, nombresArchivo] of numerosVistos) {
    if (nombresArchivo.length > 1) {
      errores.push(
        `- El número ${formatearNumero(numero)} está repetido en: ${nombresArchivo.join(', ')}.`,
      )
    }
  }

  const numerosOrdenados = [...numerosVistos.keys()].sort((a, b) => a - b)
  for (let i = 0; i < numerosOrdenados.length; i++) {
    const esperado = i + 1
    if (numerosOrdenados[i] !== esperado) {
      errores.push(
        `- La numeración tiene un hueco: se esperaba ${formatearNumero(esperado)} y se encontró ${formatearNumero(numerosOrdenados[i])}. Las migraciones deben numerarse en forma correlativa empezando en 0001, sin saltos.`,
      )
      break
    }
  }

  if (errores.length > 0) {
    console.error(`Se encontraron problemas en "${ETIQUETA_DIRECTORIO}":\n`)
    console.error(errores.join('\n'))
    console.error('\nCorregí los archivos de migración antes de continuar.')
    process.exit(1)
    return
  }

  console.log(
    `Migraciones OK: ${archivos.length} archivo(s) válidos en "${ETIQUETA_DIRECTORIO}".`,
  )
}

main()
