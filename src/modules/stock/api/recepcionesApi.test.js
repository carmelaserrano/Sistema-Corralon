import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRecepcion, getRecepcionById, getRecepciones, getDetalleOrdenRecepcion, getOrdenesRecepcion, puedeRegistrarRecepciones } from './recepcionesApi'
import { supabase } from '../../../lib/supabaseClient'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
const base = () => ({ orden_compra_id: 'oc-1', deposito_destino_id: 'dep-1', observaciones: ' Entrega ', items: [
  { orden_compra_detalle_id: 'd-1', nombre: 'Cemento', cantidad: 4, pendiente: 8, costo_unitario: 999 },
  { orden_compra_detalle_id: 'd-2', nombre: 'Arena', cantidad: 0, pendiente: 2 },
] })
function consulta(resultado) {
  const builder = { then: (resolve) => Promise.resolve(resultado).then(resolve) }
  for (const metodo of ['select', 'eq', 'in', 'order', 'range', 'maybeSingle']) builder[metodo] = vi.fn(() => builder)
  supabase.from.mockReturnValue(builder)
  return builder
}
beforeEach(() => { vi.resetAllMocks(); supabase.rpc.mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { numero: 12, estado_recepcion: 'confirmada' }, error: null }) }) })
describe('Recepción de OC', () => {
  it('confirma en una sola RPC, omite ceros y no envía costo, proveedor, fecha ni remito manipulables', async () => {
    expect(await createRecepcion(base())).toEqual({ numero: 12, estado_recepcion: 'confirmada' })
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('registrar_recepcion_oc', {
      p_orden_compra_id: 'oc-1', p_deposito_destino_id: 'dep-1', p_observaciones: 'Entrega',
      p_items: [{ orden_compra_detalle_id: 'd-1', cantidad: 4 }],
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it.each(['orden_compra_id', 'deposito_destino_id'])('requiere %s antes de enviar', async (campo) => {
    await expect(createRecepcion({ ...base(), [campo]: '' })).rejects.toMatchObject({ status: 400 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
  it.each([-1, 1.5, '', null, undefined, NaN, Infinity])('rechaza cantidad inválida %s', async (cantidad) => {
    const form = base(); form.items[0].cantidad = cantidad
    await expect(createRecepcion(form)).rejects.toThrow('entero')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
  it.each([{ items: [] }, { items: [{ orden_compra_detalle_id: 'd-1', cantidad: 0, pendiente: 8 }] }])('impide recepción vacía', async ({ items }) => {
    await expect(createRecepcion({ ...base(), items })).rejects.toThrow('Debe recibir al menos un producto')
  })
  it('informa el máximo y el producto cuando supera pendiente', async () => {
    const form = base(); form.items[0].cantidad = 9
    await expect(createRecepcion(form)).rejects.toThrow('Cantidad máxima admitida para Cemento: 8')
  })
  it('admite recibir exactamente lo pendiente', async () => {
    const form = base(); form.items[0].cantidad = '8'
    await expect(createRecepcion(form)).resolves.toHaveProperty('estado_recepcion', 'confirmada')
  })
  it('rechaza duplicados', async () => {
    const form = base(); form.items.push(form.items[0])
    await expect(createRecepcion(form)).rejects.toThrow('no repetirse')
  })
  it.each([['RC001',400], ['RC003',409], ['RC006',423], ['55P03',423], ['42501',403]])('preserva rechazo de servidor %s', async (code, status) => {
    supabase.rpc.mockReturnValue({ single: vi.fn().mockResolvedValue({ error: { code, message: 'Rechazo de la base' } }) })
    await expect(createRecepcion(base())).rejects.toMatchObject({ status, message: 'Rechazo de la base' })
  })
  it('lista solo OC elegibles', async () => {
    const builder = consulta({ data: [{ id: 'oc-1' }] })
    expect(await getOrdenesRecepcion()).toEqual([{ id: 'oc-1' }])
    expect(builder.in).toHaveBeenCalledWith('estado', ['pendiente', 'parcialmente_recibida'])
  })
  it('calcula pendiente descontando lo recibido', async () => {
    consulta({ data: [{ id: 'd-1', cantidad: '10', cantidad_recibida: '4' }] })
    expect(await getDetalleOrdenRecepcion('oc-1')).toEqual([{ id: 'd-1', cantidad: '10', cantidad_recibida: '4', pendiente: 6 }])
  })
  it('pagina el historial confirmado', async () => {
    const builder = consulta({ data: [{ id: 'rec-1' }], count: 23 })
    expect(await getRecepciones({ estado: 'confirmada', page: 2 })).toMatchObject({ totalPaginas: 3, page: 2 })
    expect(builder.eq).toHaveBeenCalledWith('estado_recepcion', 'confirmada')
    expect(builder.range).toHaveBeenCalledWith(10, 19)
  })
  it('informa recepción inexistente', async () => {
    consulta({ data: null }); await expect(getRecepcionById('x')).rejects.toMatchObject({ status: 404 })
  })
  it('propaga errores de lectura', async () => {
    consulta({ error: new Error('Sin conexión') }); await expect(getOrdenesRecepcion()).rejects.toThrow('Sin conexión')
  })
  it('consulta el permiso específico', async () => {
    supabase.rpc.mockResolvedValue({ data: true })
    expect(await puedeRegistrarRecepciones()).toBe(true)
  })
})
