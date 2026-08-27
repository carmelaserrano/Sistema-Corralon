import { supabase } from '../../../lib/supabaseClient'

const TABLA = 'stock_x_deposito'

// productos va con !inner (no solo embed) porque hace falta filtrar por
// producto.categoria_id desde la tabla de arriba. Mismo patrón que
// COLUMNAS_HISTORIAL en movimientosApi.js (detalle_movimiento!inner para
// poder filtrar por detalle.producto_id).
const COLUMNAS_STOCK = `
  id,
  cantidad,
  comprometido,
  deposito:depositos (id, nombre),
  producto:productos!inner (
    id,
    sku,
    nombre,
    costo_medio_ponderado,
    categoria:categorias (id, nombre)
  )
`

function consultaStockFiltrada({ categoria_id = '', deposito_id = '' } = {}) {
  let consulta = supabase.from(TABLA).select(COLUMNAS_STOCK)

  if (deposito_id) consulta = consulta.eq('deposito_id', deposito_id)
  if (categoria_id) consulta = consulta.eq('producto.categoria_id', categoria_id)

  return consulta
}

// "Disponible" (cantidad - comprometido) no se guarda en la base (docs/der.md):
// se calcula acá, mismo criterio que configuracionStockApi.js.
function conDisponible(fila) {
  return {
    ...fila,
    disponible: Number(fila.cantidad) - Number(fila.comprometido),
  }
}

/**
 * Reporte de stock actual por artículo, categoría y depósito.
 */
export async function getReporteStockActual(filtros = {}) {
  const { data, error } = await consultaStockFiltrada(filtros).order(
    'deposito_id',
  )

  if (error) throw error

  return (data ?? []).map(conDisponible)
}

/**
 * Reporte de quiebres de stock: artículos con disponible = 0 en el depósito.
 */
export async function getReporteQuiebres(filtros = {}) {
  const { data, error } = await consultaStockFiltrada(filtros)

  if (error) throw error

  return (data ?? [])
    .map(conDisponible)
    .filter((fila) => fila.disponible === 0)
}

/**
 * Reporte de valorización de stock: cantidad * costo medio ponderado por
 * artículo, más el total general de lo filtrado.
 */
export async function getReporteValorizacion(filtros = {}) {
  const { data, error } = await consultaStockFiltrada(filtros).order(
    'deposito_id',
  )

  if (error) throw error

  const filas = (data ?? []).map((fila) => ({
    ...fila,
    valor_total:
      Number(fila.cantidad) * Number(fila.producto?.costo_medio_ponderado ?? 0),
  }))

  const valorTotalGeneral = filas.reduce((acc, fila) => acc + fila.valor_total, 0)

  return { filas, valorTotalGeneral }
}

// El proyecto no exporta a .xlsx real (no hay backend ni librería de
// planillas); CSV cubre "exportable a CSV/Excel" porque Excel lo abre
// nativamente, sin sumar una dependencia nueva para esto.
function escaparCsv(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

/**
 * Arma el contenido CSV a partir de columnas ({ titulo, valor(fila) }) y
 * filas. Separada de descargarCsv para poder testearla sin DOM.
 */
export function armarCsv(columnas, filas) {
  const encabezado = columnas.map((columna) => escaparCsv(columna.titulo))
  const renglones = filas.map((fila) =>
    columnas.map((columna) => escaparCsv(columna.valor(fila))),
  )

  return [encabezado, ...renglones].map((linea) => linea.join(',')).join('\n')
}

/**
 * Genera el CSV y dispara la descarga en el navegador.
 */
export function descargarCsv(nombreArchivo, columnas, filas) {
  const contenido = armarCsv(columnas, filas)
  const blob = new Blob(['﻿' + contenido], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)

  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}
