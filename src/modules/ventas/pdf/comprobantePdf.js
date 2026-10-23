import { jsPDF } from 'jspdf'
import logoCorralon from '../../ecommerce/pdf/logo-corralon-norte.jpg?inline'
import { DATOS_COMERCIALES } from '../../ecommerce/datosComerciales'
import { formatearFechaHora } from '../../../lib/fechas'

/**
 * Datos por defecto del emisor: los mismos de Corralón Norte que usa el
 * comprobante de compra de la tienda web.
 */
export const EMISOR_DEFAULT = {
  razonSocial: 'Corralón Norte',
  subtitulo: 'Materiales para la Construcción · Ferretería · Logística de Obra',
  cuit: '30-71234567-8',
  condicionIva: 'IVA Responsable Inscripto',
  domicilio: DATOS_COMERCIALES.domicilio,
  telefono: `${DATOS_COMERCIALES.telefono} / WhatsApp: ${DATOS_COMERCIALES.whatsapp}`,
  email: DATOS_COMERCIALES.email,
  ingresosBrutos: '30-71234567-8',
  inicioActividades: '01/01/2020',
  puntoVentaPredeterminado: '0001',
}

// Paleta compartida con el comprobante de la tienda web.
const NARANJA = [242, 100, 25]
const TEXTO = [30, 30, 30]
const TEXTO_SUAVE = [90, 90, 90]
const FONDO_SUAVE = [248, 249, 250]
const FONDO_TABLA = [235, 238, 242]
const LINEA_SUAVE = [225, 228, 232]

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

  // Una columna `date` de Postgres llega como 'YYYY-MM-DD'. new Date() la
  // interpreta como medianoche UTC, que en Argentina (UTC-3) es el día
  // ANTERIOR: el vencimiento del CAE salía un día antes. Se arma como fecha
  // local para que se muestre el día que realmente está guardado.
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaStr))
  const fecha = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(fechaStr)

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
 * Genera la factura o nota (diseño fiscal AFIP) con el mismo estilo que el
 * comprobante de compra de la tienda web: logo, franja naranja y totales destacados.
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

  // Medios con los que se cobró la venta (vienen con el comprobante).
  const mediosCobro = (venta?.cobros || [])
    .flatMap((cobro) => cobro.detalle || [])
    .map((d) => d.medio_pago?.nombre)
    .filter(Boolean)
  const medioPago = [...new Set(mediosCobro)].join(' + ')

  // Borde exterior y franja naranja (mismo estilo que el comprobante web)
  doc.setLineWidth(0.4)
  doc.setDrawColor(50, 50, 50)
  doc.rect(10, 10, 190, 277)
  doc.setFillColor(...NARANJA)
  doc.rect(10, 10, 190, 4, 'F')

  // --------------------------------------------------------------------------
  // CABECERA: logo y emisor a la izquierda, letra al centro, comprobante a la derecha
  // --------------------------------------------------------------------------
  doc.addImage(logoCorralon, 'JPEG', 14, 17, 20, 15)

  doc.setFillColor(245, 245, 245)
  doc.setDrawColor(60, 60, 60)
  doc.rect(98, 17, 14, 15, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...TEXTO)
  doc.text(letra, 105, 26.5, { align: 'center' })
  doc.setFontSize(6.5)
  doc.text(`COD. ${codigoAfip}`, 105, 30.5, { align: 'center' })

  doc.setLineWidth(0.2)
  doc.line(105, 32, 105, 64)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text(emisor.razonSocial, 37, 24)
  if (emisor.subtitulo) {
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...TEXTO_SUAVE)
    // Hasta dos líneas, para que no quede cortado a mitad de frase.
    doc.splitTextToSize(emisor.subtitulo, 58).slice(0, 2).forEach((linea, i) => doc.text(linea, 37, 29 + i * 3))
  }

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70, 70, 70)
  const datosEmisor = [
    `Dirección: ${emisor.domicilio}`,
    emisor.telefono && `Tel: ${emisor.telefono}`,
    emisor.email && `Email: ${emisor.email}`,
    emisor.condicionIva,
  ].filter(Boolean)
  datosEmisor.forEach((linea, i) => doc.text(doc.splitTextToSize(linea, 86)[0], 15, 40 + i * 5))

  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text(tipoTitulo, 115, 24)

  doc.setFontSize(11)
  doc.setTextColor(...NARANJA)
  doc.text(`Nº ${formatearPv4(pvNumero)}-${compNumero}`, 115, 31)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  doc.text(`Punto de Venta: ${formatearPv4(pvNumero)}    Comp. Nro: ${compNumero}`, 115, 38)
  doc.text(`Fecha de Emisión: ${fechaEmision}`, 115, 43)
  doc.text(`CUIT: ${emisor.cuit}`, 115, 48)
  doc.text(`Ingresos Brutos: ${emisor.ingresosBrutos}`, 115, 53)
  doc.text(`Inicio de Actividades: ${emisor.inicioActividades}`, 115, 58)

  doc.setLineWidth(0.3)
  doc.setDrawColor(60, 60, 60)
  doc.line(10, 64, 200, 64)

  // --------------------------------------------------------------------------
  // DATOS DEL CLIENTE
  // --------------------------------------------------------------------------
  doc.setFillColor(...FONDO_SUAVE)
  doc.rect(10, 64, 190, 24, 'F')

  doc.setFontSize(8.5)
  doc.setTextColor(...TEXTO)
  const dato = (etiqueta, valor, x, y, xValor) => {
    doc.setFont('helvetica', 'bold')
    doc.text(etiqueta, x, y)
    doc.setFont('helvetica', 'normal')
    doc.text(doc.splitTextToSize(String(valor), 200 - xValor - 4)[0], xValor, y)
  }
  dato('Razón Social / Nombre:', nombreCli, 14, 70, 52)
  dato('Documento:', docCli, 125, 70, 145)
  dato('Condición IVA:', condIvaCli, 14, 77, 52)
  if (venta?.numero) dato('Venta Nº:', String(venta.numero), 125, 77, 145)
  dato('Domicilio:', domicilioCli, 14, 84, 52)

  doc.line(10, 88, 200, 88)

  // --------------------------------------------------------------------------
  // TABLA DE ÍTEMS / DETALLE
  // --------------------------------------------------------------------------
  const encabezadoTabla = (yCabecera) => {
    doc.setFillColor(...FONDO_TABLA)
    doc.rect(10, yCabecera, 190, 7, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text('Código / Descripción', 14, yCabecera + 4.5)
    doc.text('Cant.', 115, yCabecera + 4.5, { align: 'right' })
    doc.text('Precio Unit.', 142, yCabecera + 4.5, { align: 'right' })
    doc.text('Desc. %', 165, yCabecera + 4.5, { align: 'right' })
    doc.text('Subtotal', 195, yCabecera + 4.5, { align: 'right' })
  }
  encabezadoTabla(88)

  const items = venta?.detalle_venta || venta?.detalle || []
  let y = 100
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXTO)

  if (items.length === 0) {
    doc.text('Comprobante global / Sin detalle de artículos', 14, y)
    y += 7
  } else {
    items.forEach((item) => {
      if (y > 200) {
        doc.addPage()
        doc.setLineWidth(0.4)
        doc.setDrawColor(50, 50, 50)
        doc.rect(10, 10, 190, 277)
        encabezadoTabla(14)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...TEXTO)
        y = 26
      }
      const prodNombre = item.producto?.nombre || item.producto_nombre || 'Artículo'
      const prodCodigo = item.producto?.sku ? `[${item.producto.sku}] ` : ''
      const cant = Number(item.cantidad || 1)
      const precioUnit = Number(item.precio_unitario || 0)
      const descPct = Number(item.descuento_pct || 0)
      const subtotal = Number(item.subtotal || cant * precioUnit * (1 - descPct / 100))

      // Se corta por ancho (hasta la columna Cant.), en el límite de una
      // palabra y con "…", no a los 50 caracteres a mitad de palabra.
      const [primeraLinea, ...resto] = doc.splitTextToSize(`${prodCodigo}${prodNombre}`, 88)
      doc.setFontSize(8.5)
      doc.text(resto.length > 0 ? `${primeraLinea.trimEnd()}…` : primeraLinea, 14, y)
      doc.text(String(cant), 115, y, { align: 'right' })
      doc.text(formatearMoneda(precioUnit), 142, y, { align: 'right' })
      doc.text(descPct > 0 ? `${descPct}%` : '0%', 165, y, { align: 'right' })
      doc.text(formatearMoneda(subtotal), 195, y, { align: 'right' })

      doc.setDrawColor(...LINEA_SUAVE)
      doc.setLineWidth(0.1)
      doc.line(12, y + 2.5, 198, y + 2.5)
      y += 6.5
    })
  }

  // --------------------------------------------------------------------------
  // TOTALES
  // --------------------------------------------------------------------------
  const yTotales = Math.max(y + 6, 200)
  doc.setLineWidth(0.2)
  doc.setDrawColor(60, 60, 60)
  doc.line(10, yTotales - 3, 200, yTotales - 3)

  const total = Number(comprobante?.total || venta?.total || 0)
  const neto = Number(comprobante?.neto || (total / 1.21).toFixed(2))
  const iva = Number(comprobante?.iva || (total - neto).toFixed(2))

  doc.setFontSize(8.5)
  doc.setTextColor(60, 60, 60)
  const filaTotal = (etiqueta, valor, yFila) => {
    doc.setFont('helvetica', 'bold')
    doc.text(etiqueta, 125, yFila)
    doc.setFont('helvetica', 'normal')
    doc.text(formatearMoneda(valor), 195, yFila, { align: 'right' })
  }
  if (letra === 'A') {
    filaTotal('Subtotal Neto Gravado:', neto, yTotales + 2)
    filaTotal('IVA 21%:', iva, yTotales + 8)
  } else {
    filaTotal('Subtotal:', neto, yTotales + 2)
    filaTotal('IVA Contenido (21%):', iva, yTotales + 8)
  }

  doc.setFillColor(...FONDO_SUAVE)
  doc.rect(120, yTotales + 12, 78, 10, 'F')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text('IMPORTE TOTAL:', 125, yTotales + 18.5)
  doc.setTextColor(...NARANJA)
  doc.text(formatearMoneda(total), 195, yTotales + 18.5, { align: 'right' })

  if (medioPago) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(40, 40, 40)
    doc.text(`Medio de pago: ${medioPago}`, 14, yTotales + 18.5)
  }

  // --------------------------------------------------------------------------
  // PIE FISCAL / CAE
  // --------------------------------------------------------------------------
  const yPie = 252
  const cae = comprobante?.cae || 'HOMOLOGACIÓN'
  // Sin vencimiento cargado no se inventa uno (antes imprimía la fecha de hoy).
  const caeVto = comprobante?.cae_vencimiento ? formatearFecha(comprobante.cae_vencimiento) : '—'

  doc.setDrawColor(60, 60, 60)
  doc.setLineWidth(0.2)
  doc.line(10, yPie, 200, yPie)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXTO)
  doc.text(`CAE Nº: ${cae}`, 14, yPie + 8)
  doc.text(`Fecha de Vto. de CAE: ${caeVto}`, 140, yPie + 8)

  doc.setFillColor(245, 245, 245)
  doc.rect(10, 272, 190, 15, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(100, 100, 100)
  doc.text('Comprobante emitido en ambiente de HOMOLOGACIÓN — Sin validez fiscal ante AFIP', 105, 278, {
    align: 'center',
  })
  doc.setFont('helvetica', 'normal')
  doc.text(`Generado el ${formatearFechaHora(new Date())} · Sistema Corralón Norte`, 105, 283, { align: 'center' })

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

  if (guardar && typeof window !== 'undefined' && doc.save) {
    doc.save(nombreArchivo)
  }

  return doc.output('blob')
}
