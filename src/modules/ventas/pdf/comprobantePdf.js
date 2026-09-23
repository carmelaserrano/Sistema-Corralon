import { jsPDF } from 'jspdf'

/**
 * Datos por defecto del emisor (Corralón).
 */
export const EMISOR_DEFAULT = {
  razonSocial: 'Corralón Central S.R.L.',
  cuit: '30-71234567-8',
  condicionIva: 'IVA Responsable Inscripto',
  domicilio: 'Av. Entre Ríos 1234, Salta, Argentina',
  ingresosBrutos: '30-71234567-8',
  inicioActividades: '01/01/2020',
  puntoVentaPredeterminado: '0001',
}

const CODIGOS_AFIP = {
  factura: { A: '01', B: '06', C: '11' },
  nota_credito: { A: '03', B: '08', C: '13' },
  nota_debito: { A: '02', B: '07', C: '12' },
}

const NOMBRES_TIPO = {
  factura: 'FACTURA',
  nota_credito: 'NOTA DE CRÉDITO',
  nota_debito: 'NOTA DE DÉBITO',
}

function formatearNumero8(numero) {
  return String(numero || 0).padStart(8, '0')
}

function formatearPv4(pv) {
  return String(pv || '1').padStart(4, '0')
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return new Date().toLocaleDateString('es-AR')
  const fecha = new Date(fechaStr)
  return isNaN(fecha.getTime()) ? String(fechaStr) : fecha.toLocaleDateString('es-AR')
}

function formatearMoneda(val) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(val || 0)
}

/**
 * Genera un documento jsPDF con el diseño fiscal AFIP de la factura o comprobante.
 *
 * @param {Object} params
 * @param {Object} params.comprobante Fila de comprobantes_venta
 * @param {Object} params.venta Fila de venta con cliente y detalle_venta
 * @param {Object} [params.emisor] Datos del emisor comercial
 * @returns {jsPDF} Instancia de jsPDF
 */
export function generarComprobantePdf({ comprobante, venta, emisor = EMISOR_DEFAULT }) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const tipoKey = comprobante?.tipo_comprobante || 'factura'
  const letra = comprobante?.letra || 'B'
  const tipoTitulo = NOMBRES_TIPO[tipoKey] || 'FACTURA'
  const codigoAfip = CODIGOS_AFIP[tipoKey]?.[letra] || '06'

  const pvNumero = comprobante?.punto_venta?.numero || comprobante?.punto_venta_id || emisor.puntoVentaPredeterminado
  const compNumero = formatearNumero8(comprobante?.numero)
  const fechaEmision = formatearFecha(comprobante?.fecha_emision || comprobante?.created_at)

  const cliente = venta?.cliente || {}
  const nombreCli =
    cliente.tipo_persona === 'juridica'
      ? cliente.razon_social
      : `${cliente.apellido || ''} ${cliente.nombre || ''}`.trim() || 'Consumidor Final'
  const docCli = cliente.numero_documento ? `${cliente.tipo_documento || 'DNI'}: ${cliente.numero_documento}` : '—'
  const condIvaCli = cliente.condicion_iva?.nombre || cliente.condicion_iva || 'Consumidor Final'
  const domicilioCli = cliente.domicilios?.[0]
    ? `${cliente.domicilios[0].calle || ''} ${cliente.domicilios[0].numero || ''}, ${cliente.domicilios[0].localidad || ''}`.trim()
    : '—'

  // Borde exterior
  doc.setLineWidth(0.4)
  doc.setDrawColor(60, 60, 60)
  doc.rect(10, 10, 190, 277)

  // --------------------------------------------------------------------------
  // CABECERA FISCAL CON LETRA EN EL CENTRO
  // --------------------------------------------------------------------------
  // Caja de la Letra central
  doc.setFillColor(245, 245, 245)
  doc.rect(98, 10, 14, 14, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(30, 30, 30)
  doc.text(letra, 105, 19, { align: 'center' })
  doc.setFontSize(7)
  doc.text(`COD. ${codigoAfip}`, 105, 23, { align: 'center' })

  // Línea divisoria central
  doc.setLineWidth(0.2)
  doc.line(105, 24, 105, 58)

  // Columna Izquierda: Emisor
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(emisor.razonSocial, 15, 20)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(emisor.condicionIva, 15, 26)
  doc.text(emisor.domicilio, 15, 31)

  // Columna Derecha: Tipo de Comprobante, Número y Fechas
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(tipoTitulo, 115, 20)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`Punto de Venta: ${formatearPv4(pvNumero)}    Comp. Nro: ${compNumero}`, 115, 26)

  doc.setFont('helvetica', 'normal')
  doc.text(`Fecha de Emisión: ${fechaEmision}`, 115, 32)
  doc.text(`CUIT: ${emisor.cuit}`, 115, 37)
  doc.text(`Ingresos Brutos: ${emisor.ingresosBrutos}`, 115, 42)
  doc.text(`Inicio de Actividades: ${emisor.inicioActividades}`, 115, 47)

  // Línea horizontal que separa cabecera de datos de cliente
  doc.line(10, 58, 200, 58)

  // --------------------------------------------------------------------------
  // DATOS DEL CLIENTE
  // --------------------------------------------------------------------------
  doc.setFillColor(248, 249, 250)
  doc.rect(10, 58, 190, 24, 'F')

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text(`Razón Social / Nombre:`, 14, 64)
  doc.setFont('helvetica', 'normal')
  doc.text(nombreCli, 50, 64)

  doc.setFont('helvetica', 'bold')
  doc.text(`Doc / CUIT:`, 130, 64)
  doc.setFont('helvetica', 'normal')
  doc.text(docCli, 150, 64)

  doc.setFont('helvetica', 'bold')
  doc.text(`Condición IVA:`, 14, 71)
  doc.setFont('helvetica', 'normal')
  doc.text(condIvaCli, 50, 71)

  doc.setFont('helvetica', 'bold')
  doc.text(`Domicilio:`, 14, 78)
  doc.setFont('helvetica', 'normal')
  doc.text(domicilioCli, 50, 78)

  doc.line(10, 82, 200, 82)

  // --------------------------------------------------------------------------
  // TABLA DE ÍTEMS / DETALLE
  // --------------------------------------------------------------------------
  // Cabecera de la tabla
  doc.setFillColor(235, 238, 242)
  doc.rect(10, 82, 190, 7, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text('Código / Descripción', 14, 86.5)
  doc.text('Cant.', 115, 86.5, { align: 'right' })
  doc.text('Precio Unit.', 142, 86.5, { align: 'right' })
  doc.text('Desc. %', 165, 86.5, { align: 'right' })
  doc.text('Subtotal', 195, 86.5, { align: 'right' })

  doc.line(10, 89, 200, 89)

  // Filas de detalle
  const items = venta?.detalle_venta || venta?.detalle || []
  let y = 94
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(30, 30, 30)

  if (items.length === 0) {
    doc.text('Comprobante global / Sin detalle de artículos', 14, y)
    y += 7
  } else {
    items.forEach((item) => {
      if (y > 220) {
        doc.addPage()
        y = 20
      }
      const prodNombre = item.producto?.nombre || item.producto_nombre || 'Artículo'
      const prodCodigo = item.producto?.codigo ? `[${item.producto.codigo}] ` : ''
      const cant = Number(item.cantidad || 1)
      const precioUnit = Number(item.precio_unitario || 0)
      const descPct = Number(item.descuento_pct || 0)
      const subtotal = Number(item.subtotal || cant * precioUnit * (1 - descPct / 100))

      doc.text(`${prodCodigo}${prodNombre}`.substring(0, 50), 14, y)
      doc.text(String(cant), 115, y, { align: 'right' })
      doc.text(formatearMoneda(precioUnit), 142, y, { align: 'right' })
      doc.text(descPct > 0 ? `${descPct}%` : '0%', 165, y, { align: 'right' })
      doc.text(formatearMoneda(subtotal), 195, y, { align: 'right' })

      y += 6
    })
  }

  // --------------------------------------------------------------------------
  // TOTALES
  // --------------------------------------------------------------------------
  const yTotales = Math.max(y + 6, 215)
  doc.setLineWidth(0.2)
  doc.line(10, yTotales - 4, 200, yTotales - 4)

  const total = Number(comprobante?.total || venta?.total || 0)
  const neto = Number(comprobante?.neto || (total / 1.21).toFixed(2))
  const iva = Number(comprobante?.iva || (total - neto).toFixed(2))

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')

  if (letra === 'A') {
    doc.text('Subtotal Neto Gravado:', 130, yTotales)
    doc.setFont('helvetica', 'normal')
    doc.text(formatearMoneda(neto), 195, yTotales, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.text('IVA 21%:', 130, yTotales + 6)
    doc.setFont('helvetica', 'normal')
    doc.text(formatearMoneda(iva), 195, yTotales + 6, { align: 'right' })

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Importe Total:', 130, yTotales + 13)
    doc.text(formatearMoneda(total), 195, yTotales + 13, { align: 'right' })
  } else {
    doc.text('Subtotal:', 130, yTotales)
    doc.setFont('helvetica', 'normal')
    doc.text(formatearMoneda(neto), 195, yTotales, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.text('IVA Contenido (21%):', 130, yTotales + 6)
    doc.setFont('helvetica', 'normal')
    doc.text(formatearMoneda(iva), 195, yTotales + 6, { align: 'right' })

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Importe Total:', 130, yTotales + 13)
    doc.text(formatearMoneda(total), 195, yTotales + 13, { align: 'right' })
  }

  // --------------------------------------------------------------------------
  // PIE FISCAL / CAE
  // --------------------------------------------------------------------------
  const yPie = 250
  doc.line(10, yPie, 200, yPie)

  const cae = comprobante?.cae || 'HOMOLOGACIÓN'
  const caeVto = formatearFecha(comprobante?.cae_vencimiento)

  doc.setFillColor(250, 250, 250)
  doc.rect(10, yPie, 190, 37, 'F')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`CAE Nº: ${cae}`, 14, yPie + 8)
  doc.text(`Fecha de Vto. de CAE: ${caeVto}`, 140, yPie + 8)

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(90, 90, 90)
  doc.text('Comprobante emitido en ambiente de HOMOLOGACIÓN — Sin validez fiscal ante AFIP', 105, yPie + 16, {
    align: 'center',
  })
  doc.text(
    'Sistema-Corralon · Gestión Comercial y Emisión de Comprobantes Electrónicos',
    105,
    yPie + 22,
    { align: 'center' },
  )

  return doc
}

/**
 * Descarga el PDF del comprobante en el navegador o devuelve un Blob.
 *
 * @param {Object} params
 * @param {Object} params.comprobante
 * @param {Object} params.venta
 * @param {Object} [params.emisor]
 * @param {boolean} [params.guardar=true] Si descarga automáticamente el archivo
 * @returns {Blob} Blob del PDF
 */
export function exportarComprobantePdf({ comprobante, venta, emisor = EMISOR_DEFAULT, guardar = true }) {
  const doc = generarComprobantePdf({ comprobante, venta, emisor })
  const nombreArchivo = `${comprobante?.tipo_comprobante || 'comprobante'}_${comprobante?.letra || ''}_${comprobante?.numero || '00000000'}.pdf`

  if (guardar && typeof window !== 'undefined' && doc.save && process.env.NODE_ENV !== 'test') {
    doc.save(nombreArchivo)
  }

  return doc.output('blob')
}
