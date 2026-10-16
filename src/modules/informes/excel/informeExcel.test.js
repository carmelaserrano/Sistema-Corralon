import { describe, expect, it } from 'vitest'
import { armarInformeExcel } from './informeExcel'

// El zip va sin compresión: el XML de cada parte se puede leer como texto.
async function contenido(blob) {
  return new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()))
}

const columnas = [
  { titulo: 'Período', tipo: 'texto' },
  { titulo: 'Mostrador', tipo: 'moneda' },
  { titulo: 'Total', tipo: 'moneda' },
]

describe('armarInformeExcel', () => {
  it('arma un .xlsx con una hoja por tabla, logo y montos como números', async () => {
    const blob = await armarInformeExcel({
      titulo: 'Informe de ingresos',
      subtitulo: 'agosto 2026',
      tablas: [
        { titulo: 'Cobrado por período', hoja: 'Cobrado', columnas, filas: [['ago 2026', 1500.5, 1500.5]], total: ['Total', 1500.5, 1500.5] },
        { titulo: 'Facturado por período', hoja: 'Facturado', columnas, filas: [['ago 2026', 900, 900]] },
      ],
    })

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const xml = await contenido(blob)
    expect(xml).toContain('<sheet name="Cobrado" sheetId="1" r:id="rId1"/>')
    expect(xml).toContain('<sheet name="Facturado" sheetId="2" r:id="rId2"/>')
    expect(xml).toContain('xl/media/logo.jpeg')
    expect(xml).toContain('<c r="B7" s="7"><v>1500.5</v></c>')
    // Fila de total en negrita con formato de moneda.
    expect(xml).toContain('<c r="B8" s="10"><v>1500.5</v></c>')
  })

  it('muestra grupos, variación en porcentaje y "—" cuando no hay valor', async () => {
    const xml = await contenido(await armarInformeExcel({
      titulo: 'Informe de ingresos',
      subtitulo: 'A contra B',
      tablas: [{
        titulo: 'Comparación',
        columnas: [{ titulo: 'Concepto', tipo: 'texto' }, { titulo: 'Variación', tipo: 'porcentaje' }],
        filas: [{ grupo: 'Por fuente' }, ['Mostrador', 25], ['Tienda online', null]],
      }],
    }))

    expect(xml).toContain('<c r="A7" s="11" t="inlineStr"><is><t xml:space="preserve">Por fuente</t></is></c>')
    expect(xml).toContain('<c r="B8" s="8"><v>0.25</v></c>')
    expect(xml).toContain('<c r="B9" s="12" t="inlineStr"><is><t xml:space="preserve">—</t></is></c>'.replace('—', 'â\u0080\u0094'))
  })
})
