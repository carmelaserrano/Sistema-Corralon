import { jsPDF } from 'jspdf'
import logoCorralon from '../../ecommerce/pdf/logo-corralon-norte.jpg?inline'
import { formatearFechaHora } from '../../../lib/fechas'

/**
 * Arma el PDF de un informe: encabezado, subtítulo y una o más tablas.
 *
 * @param {Object} opciones
 * @param {string} opciones.titulo Ej. "Informe de ingresos".
 * @param {string} opciones.subtitulo Rango y filtros aplicados.
 * @param {Array<{titulo: string, columnas: string[], filas: string[][]}>} opciones.tablas
 * @returns {jsPDF} Documento listo para `.save(nombre)`.
 */
export function armarInformePdf({ titulo, subtitulo, tablas }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const anchoPagina = doc.internal.pageSize.getWidth()
  const altoPagina = doc.internal.pageSize.getHeight()
  const margen = 12
  let y = margen

  // Franja naranja y encabezado (paleta Corralón Norte).
  doc.setFillColor(249, 115, 22)
  doc.rect(0, 0, anchoPagina, 4, 'F')
  // Logo a la izquierda (4:3, como en el remito web) y textos al lado.
  doc.addImage(logoCorralon, 'JPEG', margen, 7, 24, 18)
  const xTexto = margen + 28
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(30, 58, 95)
  doc.text('CORRALÓN NORTE', xTexto, (y += 2))
  doc.setFontSize(13)
  doc.setTextColor(23, 32, 51)
  doc.text(titulo, xTexto, (y += 7))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(subtitulo, xTexto, (y += 6))
  doc.text(`Generado el ${formatearFechaHora(new Date())}`, anchoPagina - margen, y, { align: 'right' })
  y += 6

  for (const tabla of tablas) {
    const anchoColumna = (anchoPagina - margen * 2) / tabla.columnas.length
    const alto = 6.5
    const saltoSiHaceFalta = (necesario) => {
      if (y + necesario > altoPagina - margen) {
        doc.addPage()
        y = margen
      }
    }

    saltoSiHaceFalta(alto * 3)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(23, 32, 51)
    doc.text(tabla.titulo, margen, (y += 6))
    y += 2

    const fila = (celdas, encabezado) => {
      saltoSiHaceFalta(alto)
      if (encabezado) {
        doc.setFillColor(241, 245, 249)
        doc.rect(margen, y, anchoPagina - margen * 2, alto, 'F')
      }
      doc.setFont('helvetica', encabezado ? 'bold' : 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(23, 32, 51)
      celdas.forEach((celda, i) => {
        // Primera columna a la izquierda; montos a la derecha.
        const x = i === 0 ? margen + 2 : margen + anchoColumna * (i + 1) - 2
        doc.text(String(celda), x, y + 4.5, { align: i === 0 ? 'left' : 'right' })
      })
      doc.setDrawColor(226, 232, 240)
      doc.line(margen, y + alto, anchoPagina - margen, y + alto)
      y += alto
    }

    fila(tabla.columnas, true)
    tabla.filas.forEach((celdas) => fila(celdas, false))
    y += 4
  }

  return doc
}
