import { beforeEach, expect, it, vi } from 'vitest'
import { getHistorialOC, getDetalleHistorialOC } from './ordenesCompraApi'
import { supabase } from '../../../lib/supabaseClient'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())

it('envía todos los filtros y devuelve el resumen completo del servidor', async () => {
  const data = { ordenes: [], total: 35, importeTotal: 1200, totalPaginas: 2 }
  supabase.rpc.mockResolvedValue({ data })
  expect(await getHistorialOC({ proveedorId: 'p1', estado: 'recibida', fechaDesde: '2026-09-01', fechaHasta: '2026-09-10', orden: 'total', ascendente: true, page: 2 })).toEqual(data)
  expect(supabase.rpc).toHaveBeenCalledWith('consultar_historial_oc', { p_proveedor: 'p1', p_estado: 'recibida', p_desde: '2026-09-01', p_hasta: '2026-09-10', p_orden: 'total', p_ascendente: true, p_pagina: 2 })
})
it('rechaza fechas invertidas antes de consultar', async () => {
  await expect(getHistorialOC({ fechaDesde: '2026-09-11', fechaHasta: '2026-09-01' })).rejects.toThrow('posterior')
  expect(supabase.rpc).not.toHaveBeenCalled()
})
it('propaga errores del servidor', async () => {
  supabase.rpc.mockResolvedValue({ error: new Error('Sin conexión') })
  await expect(getHistorialOC()).rejects.toThrow('Sin conexión')
})
it('deduplica facturas de OC/recepción y omite notas desvinculadas y pagos', async () => {
  const factura = { id: 'f1', imputaciones: [{ id: 'i1', nota: { id: 'n1' } }, { id: 'i2', nota: { id: 'n2' }, anulado_at: '2026-09-01' }, { id: 'pago', nota: null }] }
  const resultados = {
    ordenes_compra: { id: 'oc1', detalles: [] },
    recepciones: [{ id: 'r1', enlaces: [{ factura }, { factura: { id: 'f2', imputaciones: [] } }] }],
    facturas_proveedor: [factura],
  }
  supabase.from.mockImplementation(tabla => {
    const b = { then: resolve => Promise.resolve({ data: resultados[tabla] }).then(resolve) }
    for (const m of ['select', 'eq', 'single', 'order']) b[m] = vi.fn(() => b)
    return b
  })
  const result = await getDetalleHistorialOC('oc1')
  expect(result.facturas).toHaveLength(2)
  expect(result.facturas[0].imputaciones.map(i => i.id)).toEqual(['i1'])
  expect(result.recepciones).toHaveLength(1)
})
