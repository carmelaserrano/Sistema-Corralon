import { jsPDF } from 'jspdf'

/**
 * Datos del corralón emisor para el remito web.
 */
export const EMISOR_CORRALON = {
  razonSocial: 'Corralón Carmela Serrano',
  subtitulo: 'Materiales para la Construcción · Ferretería · Logística de Obra',
  cuit: '30-71234567-8',
  domicilio: 'Av. Entre Ríos 1450, Salta Capital, Salta',
  telefono: '(0387) 431-9000 · WhatsApp: +54 9 387 512-3456',
  email: 'ventas@carmelaserrano.com.ar',
  web: 'ecommerce.carmelaserrano.com.ar',
}

function formatearMoneda(val) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(val || 0)
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return new Date().toLocaleDateString('es-AR')
  const fecha = new Date(fechaStr)
  return isNaN(fecha.getTime())
    ? String(fechaStr)
    : fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Genera el documento PDF del comprobante/remito de pedido web del corralón.
 *
 * @param {Object} params
 * @param {Object} params.pedido Datos del pedido web (numero, estado, tipo_entrega, total, created_at, domicilio)
 * @param {Array<Object>} params.items Líneas de productos (cantidad, precio_unitario, subtotal, producto)
 * @param {Object} [params.cliente] Datos del cliente (nombre, apellido, razon_social, numero_documento, telefono, email)
 * @param {Object} [params.emisor] Datos comerciales del emisor
 * @returns {jsPDF}
 */
export function generarRemitoWebPdf({
  pedido,
  items = [],
  cliente = {},
  emisor = EMISOR_CORRALON,
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const numeroPedido = String(pedido?.numero || '0').padStart(6, '0')
  const fecha = formatearFecha(pedido?.created_at)
  const esEnvio = pedido?.tipo_entrega === 'envio'
  const modalidadTexto = esEnvio ? 'ENVÍO A OBRA / DOMICILIO' : 'RETIRO EN SUCURSAL / CORRALÓN'

  const nombreCliente =
    cliente.razon_social ||
    `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim() ||
    'Cliente Web'
  const docCliente = cliente.numero_documento
    ? `${cliente.tipo_documento || 'DNI/CUIT'}: ${cliente.numero_documento}`
    : 'Consumidor Final'
  const telCliente = cliente.telefono || '—'
  const emailCliente = cliente.email || '—'

  // Borde perimetral exterior
  doc.setLineWidth(0.4)
  doc.setDrawColor(50, 50, 50)
  doc.rect(10, 10, 190, 277)

  // --------------------------------------------------------------------------
  // CABECERA COMERCIAL
  // --------------------------------------------------------------------------
  doc.setFillColor(242, 100, 25) // Tono naranja corralón
  doc.rect(10, 10, 190, 4, 'F')

  // Letra central distintiva "W" (Venta Web / Remito no fiscal)
  doc.setFillColor(245, 245, 245)
  doc.rect(98, 14, 14, 14, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(30, 30, 30)
  doc.text('R', 105, 23.5, { align: 'center' })
  doc.setFontSize(6.5)
  doc.text('REMITO WEB', 105, 27, { align: 'center' })

  // Línea divisoria central
  doc.setLineWidth(0.2)
  doc.line(105, 28, 105, 60)

  // Columna Izquierda: Emisor
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text(emisor.razonSocial, 15, 22)

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70, 70, 70)
  doc.text(emisor.subtitulo, 15, 27)
  doc.text(`Dirección: ${emisor.domicilio}`, 15, 32)
  doc.text(`Tel / WhatsApp: ${emisor.telefono}`, 15, 37)
  doc.text(`Email: ${emisor.email}`, 15, 42)
  doc.text(`CUIT: ${emisor.cuit}`, 15, 47)

  // Columna Derecha: Datos del Pedido
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text('COMPROBANTE DE COMPRA WEB', 115, 22)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(242, 100, 25)
  doc.text(`PEDIDO Nº: ${numeroPedido}`, 115, 28)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  doc.text(`Fecha de compra: ${fecha}`, 115, 34)
  doc.text(`Estado del pedido: ${pedido?.estado || 'Pagado'}`, 115, 39)
  doc.setFont('helvetica', 'bold')
  doc.text(`Modalidad: ${modalidadTexto}`, 115, 45)

  // Separador horizontal
  doc.setLineWidth(0.3)
  doc.setDrawColor(60, 60, 60)
  doc.line(10, 52, 200, 52)

  // --------------------------------------------------------------------------
  // DATOS DEL DESTINATARIO Y ENTREGA
  // --------------------------------------------------------------------------
  doc.setFillColor(248, 249, 250)
  doc.rect(10, 52, 190, 28, 'F')

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Cliente / Razón Social:', 14, 58)
  doc.setFont('helvetica', 'normal')
  doc.text(nombreCliente, 52, 58)

  doc.setFont('helvetica', 'bold')
  doc.text('Identificación:', 125, 58)
  doc.setFont('helvetica', 'normal')
  doc.text(docCliente, 150, 58)

  doc.setFont('helvetica', 'bold')
  doc.text('Teléfono de Contacto:', 14, 65)
  doc.setFont('helvetica', 'normal')
  doc.text(telCliente, 52, 65)

  doc.setFont('helvetica', 'bold')
  doc.text('Correo Electrónico:', 125, 65)
  doc.setFont('helvetica', 'normal')
  doc.text(emailCliente, 155, 65)

  // Datos del domicilio si es envío
  const dom = pedido?.domicilio
  let direccionEntrega = 'Retiro en mostrador / Sector Carga Pesada (Casa Central)'
  if (esEnvio) {
    if (dom) {
      direccionEntrega = `${dom.calle || ''} ${dom.numero || ''}, ${dom.localidad || 'Salta'}${
        dom.provincia ? ` (${dom.provincia})` : ''
      }`
      if (dom.referencias) direccionEntrega += ` · Indicaciones: ${dom.referencias}`
    } else {
      direccionEntrega = 'Entrega a coordinar con logística de flete'
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.text('Lugar de Entrega / Obra:', 14, 73)
  doc.setFont('helvetica', 'normal')
  const [lineaDir, ...restoDir] = doc.splitTextToSize(direccionEntrega, 140)
  doc.text(restoDir.length > 0 ? `${lineaDir}…` : lineaDir, 52, 73)

  doc.line(10, 80, 200, 80)

  // --------------------------------------------------------------------------
  // TABLA DE MATERIALES Y ARTÍCULOS
  // --------------------------------------------------------------------------
  doc.setFillColor(235, 238, 242)
  doc.rect(10, 80, 190, 7, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text('SKU / Material', 14, 84.5)
  doc.text('Cant.', 120, 84.5, { align: 'right' })
  doc.text('Precio Unit.', 150, 84.5, { align: 'right' })
  doc.text('Subtotal', 195, 84.5, { align: 'right' })

  doc.line(10, 87, 200, 87)

  let y = 92
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(30, 30, 30)

  if (items.length === 0) {
    doc.text('Sin desglose de artículos', 14, y)
    y += 7
  } else {
    items.forEach((item) => {
      if (y > 200) {
        doc.addPage()
        y = 20
      }
      const nombre = item.producto?.nombre || item.nombre || 'Material de construcción'
      const sku = item.producto?.sku ? `[${item.producto.sku}] ` : ''
      const cant = Number(item.cantidad || 1)
      const precioUnit = Number(item.precio_unitario || item.precio || 0)
      const subtotal = Number(item.subtotal || cant * precioUnit)

      const [lineaProd] = doc.splitTextToSize(`${sku}${nombre}`, 95)
      doc.text(lineaProd, 14, y)
      doc.text(String(cant), 120, y, { align: 'right' })
      doc.text(formatearMoneda(precioUnit), 150, y, { align: 'right' })
      doc.text(formatearMoneda(subtotal), 195, y, { align: 'right' })

      y += 6.5
    })
  }

  // --------------------------------------------------------------------------
  // TOTALES
  // --------------------------------------------------------------------------
  const yTotales = Math.max(y + 6, 195)
  doc.setLineWidth(0.2)
  doc.line(10, yTotales - 3, 200, yTotales - 3)

  const total = Number(pedido?.total || 0)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(60, 60, 60)
  doc.text('Subtotal Materiales:', 125, yTotales + 2)
  doc.setFont('helvetica', 'normal')
  doc.text(formatearMoneda(total), 195, yTotales + 2, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.text('Flete / Logística:', 125, yTotales + 8)
  doc.setFont('helvetica', 'normal')
  doc.text(esEnvio ? 'Bonificado en Salta' : 'Sin cargo (Retiro)', 195, yTotales + 8, {
    align: 'right',
  })

  // Caja Total
  doc.setFillColor(248, 249, 250)
  doc.rect(120, yTotales + 12, 78, 10, 'F')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text('TOTAL GENERAL:', 125, yTotales + 18.5)
  doc.setTextColor(242, 100, 25)
  doc.text(formatearMoneda(total), 195, yTotales + 18.5, { align: 'right' })

  // --------------------------------------------------------------------------
  // CONFORMIDAD DE ENTREGA / FIRMA EN OBRA
  // --------------------------------------------------------------------------
  const yFirma = 238
  doc.setDrawColor(180, 180, 180)
  doc.line(10, yFirma - 4, 200, yFirma - 4)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text('CONFORMIDAD DE RECEPCIÓN Y DESCARGA EN OBRA', 14, yFirma)

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  doc.text(
    'Recibí en conformidad los materiales detallados precedentemente, en perfecto estado de conservación y embalaje.',
    14,
    yFirma + 4.5,
  )

  // Líneas de firma
  doc.setDrawColor(100, 100, 100)
  doc.setLineWidth(0.3)
  doc.line(20, yFirma + 24, 75, yFirma + 24)
  doc.line(85, yFirma + 24, 140, yFirma + 24)
  doc.line(150, yFirma + 24, 190, yFirma + 24)

  doc.setFontSize(7.5)
  doc.setTextColor(80, 80, 80)
  doc.text('Firma del Receptor', 47.5, yFirma + 28, { align: 'center' })
  doc.text('Aclaración de Firma', 112.5, yFirma + 28, { align: 'center' })
  doc.text('DNI / Fecha y Hora', 170, yFirma + 28, { align: 'center' })

  // Pie de página legal
  doc.setFillColor(245, 245, 245)
  doc.rect(10, 275, 190, 12, 'F')
  doc.setFontSize(6.5)
  doc.setTextColor(100, 100, 100)
  doc.text(
    'Documento no válido como factura. Para solicitar Factura A o B correspondiente a esta compra web, comuníquese a administracion@carmelaserrano.com.ar informando el número de pedido.',
    105,
    280,
    { align: 'center' },
  )
  doc.text(
    `Comprobante generado el ${new Date().toLocaleString('es-AR')} · Sistema Corralón Web`,
    105,
    284,
    { align: 'center' },
  )

  return doc
}

/**
 * Descarga directamente el archivo PDF en el navegador del usuario.
 */
export function descargarRemitoWebPdf({
  pedido,
  items = [],
  cliente = {},
  emisor = EMISOR_CORRALON,
}) {
  const doc = generarRemitoWebPdf({ pedido, items, cliente, emisor })
  const nombreArchivo = `remito-pedido-web-${pedido?.numero || 'doc'}.pdf`
  doc.save(nombreArchivo)
  return doc
}
