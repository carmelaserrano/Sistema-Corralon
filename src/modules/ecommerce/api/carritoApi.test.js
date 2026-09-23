import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fusionarCarrito, guardarItems, normalizarItems, obtenerCarrito, validarItems } from './carritoApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

const linea = (overrides = {}) => ({ producto_id: 'producto-1', cantidad: 3, nombre: 'Cemento', imagen_url: '/cemento.png', precio: 100.15, disponible: true, motivo: null, ajustado: false, ...overrides })
function builder(resultado) {
  const b = { then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject) }
  for (const nombre of ['select', 'eq', 'maybeSingle', 'order']) b[nombre] = vi.fn(() => b)
  return b
}

beforeEach(() => vi.resetAllMocks())

describe('normalización del carrito', () => {
  it('acumula productos repetidos y omite las cantidades cero', () => {
    expect(normalizarItems([{ productoId: 'a', cantidad: 1.5 }, { productoId: 'b', cantidad: 0 }, { productoId: 'a', cantidad: 2 }]))
      .toEqual([{ producto_id: 'a', cantidad: 3.5 }])
  })
  it.each([null, {}, [{ cantidad: 1 }], [{ productoId: '', cantidad: 1 }], [{ productoId: 'a', cantidad: -1 }], [{ productoId: 'a', cantidad: NaN }], [{ productoId: 'a', cantidad: Infinity }], [{ productoId: 'a', cantidad: '2' }]])('rechaza entradas inválidas: %j', (items) => {
    expect(() => normalizarItems(items)).toThrow()
  })
  it('rechaza acumulaciones que desbordan', () => {
    expect(() => normalizarItems([{ productoId: 'a', cantidad: Number.MAX_VALUE }, { productoId: 'a', cantidad: Number.MAX_VALUE }])).toThrow('demasiado grande')
  })
})

describe('validarItems', () => {
  it('no consulta la base para un carrito vacío', async () => {
    expect(await validarItems([])).toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
  it('usa el tope del servidor y calcula el subtotal en centavos', async () => {
    supabase.rpc.mockResolvedValue({ data: [linea({ ajustado: true })], error: null })
    const items = await validarItems([{ productoId: 'producto-1', cantidad: 99 }])
    expect(supabase.rpc).toHaveBeenCalledWith('validar_carrito_web', { p_items: [{ producto_id: 'producto-1', cantidad: 99 }] })
    expect(items[0]).toMatchObject({ cantidad: 3, ajustado: true, precioUnitario: 100.15, subtotal: 300.45, nombre: 'Cemento', imagenUrl: '/cemento.png' })
  })
  it('conserva productos no disponibles sin sumarlos al total', async () => {
    supabase.rpc.mockResolvedValue({ data: [linea({ disponible: false, precio: null, motivo: 'Sin precio disponible' })] })
    expect((await validarItems([{ productoId: 'producto-1', cantidad: 3 }]))[0])
      .toMatchObject({ disponible: false, precioUnitario: null, subtotal: 0, motivo: 'Sin precio disponible' })
  })
  it('propaga errores y rechaza respuestas incompletas', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: { message: 'sin conexión' } }).mockResolvedValueOnce({ data: null })
    await expect(validarItems([{ productoId: 'a', cantidad: 1 }])).rejects.toMatchObject({ message: 'sin conexión' })
    await expect(validarItems([{ productoId: 'a', cantidad: 1 }])).rejects.toThrow('respuesta')
  })
})

describe('persistencia y fusión', () => {
  it('lee el carrito propio y enriquece sus líneas', async () => {
    const carrito = builder({ data: { id: 'carrito-1' } })
    const lineas = builder({ data: [{ producto_id: 'producto-1', cantidad: '3' }] })
    supabase.from.mockReturnValueOnce(carrito).mockReturnValueOnce(lineas)
    supabase.rpc.mockResolvedValue({ data: [linea()] })
    expect(await obtenerCarrito('cliente-1')).toHaveLength(1)
    expect(carrito.eq).toHaveBeenCalledWith('cliente_id', 'cliente-1')
    expect(lineas.eq).toHaveBeenCalledWith('carrito_id', 'carrito-1')
  })
  it('devuelve [] para un cliente sin carrito', async () => {
    supabase.from.mockReturnValue(builder({ data: null }))
    expect(await obtenerCarrito('cliente-1')).toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
  it('propaga errores de lectura del carrito y de sus líneas', async () => {
    supabase.from.mockReturnValueOnce(builder({ error: new Error('carrito') }))
    await expect(obtenerCarrito('cliente-1')).rejects.toThrow('carrito')
    supabase.from.mockReturnValueOnce(builder({ data: { id: 'c' } })).mockReturnValueOnce(builder({ error: new Error('líneas') }))
    await expect(obtenerCarrito('cliente-1')).rejects.toThrow('líneas')
  })
  it('guarda y vacía mediante una sola transacción del servidor', async () => {
    supabase.rpc.mockResolvedValue({ data: [] })
    expect(await guardarItems('cliente-1', [])).toEqual([])
    expect(supabase.rpc).toHaveBeenCalledWith('guardar_carrito_web', { p_cliente_id: 'cliente-1', p_items: [], p_fusion_id: null })
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('reutiliza el identificador de fusión en los reintentos', async () => {
    supabase.rpc.mockResolvedValue({ data: [linea({ cantidad: 5 })] })
    for (let n = 0; n < 2; n++) {
      expect((await fusionarCarrito('cliente-1', [{ productoId: 'producto-1', cantidad: 2 }], 'fusion-1'))[0].cantidad).toBe(5)
    }
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'guardar_carrito_web', { p_cliente_id: 'cliente-1', p_items: [{ producto_id: 'producto-1', cantidad: 2 }], p_fusion_id: 'fusion-1' })
  })
  it('genera un identificador de fusión si no se proporciona', async () => {
    supabase.rpc.mockResolvedValue({ data: [] })
    await fusionarCarrito('cliente-1', [])
    expect(supabase.rpc.mock.calls[0][1].p_fusion_id).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('exige cliente y propaga fallos de guardado', async () => {
    await expect(obtenerCarrito(null)).rejects.toThrow('cliente')
    await expect(guardarItems(null, [])).rejects.toThrow('cliente')
    supabase.rpc.mockResolvedValue({ error: new Error('sin permiso') })
    await expect(guardarItems('otro-cliente', [])).rejects.toThrow('sin permiso')
  })
})
