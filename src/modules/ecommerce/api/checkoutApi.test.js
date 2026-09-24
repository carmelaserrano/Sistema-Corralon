import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearPedidoWeb, iniciarPago, obtenerPedido, resolverPagoSimulado } from './checkoutApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), functions: { invoke: vi.fn() } } }))

function builder(resultado) {
  const consulta = { then: (ok, fail) => Promise.resolve(resultado).then(ok, fail) }
  for (const metodo of ['select', 'eq', 'maybeSingle']) consulta[metodo] = vi.fn(() => consulta)
  return consulta
}

beforeEach(() => vi.resetAllMocks())

describe('crearPedidoWeb', () => {
  it('envía la entrega elegida y conserva el checkout idempotente', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'pedido-1', estado: 'Pendiente de pago' }, error: null })
    await expect(crearPedidoWeb({ checkoutId: 'checkout-1', tipoEntrega: 'envio', domicilioId: 'domicilio-1' })).resolves.toMatchObject({ id: 'pedido-1' })
    expect(supabase.rpc).toHaveBeenCalledWith('crear_pedido_web', { p_datos: { checkout_id: 'checkout-1', tipo_entrega: 'envio', domicilio_id: 'domicilio-1' } })
  })

  it('no permite envío sin domicilio ni un tipo desconocido', async () => {
    await expect(crearPedidoWeb({ checkoutId: 'x', tipoEntrega: 'envio' })).rejects.toThrow('domicilio')
    await expect(crearPedidoWeb({ checkoutId: 'x', tipoEntrega: 'moto' })).rejects.toThrow('retiro')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('propaga el producto informado por falta de stock', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('Stock insuficiente para Cemento') })
    await expect(crearPedidoWeb({ checkoutId: 'x', tipoEntrega: 'retiro' })).rejects.toThrow('Cemento')
  })
})

describe('pago', () => {
  it('inicia la preferencia y exige una URL de retorno', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { init_point: 'https://mp.test', preference_id: 'pref-1' }, error: null })
    await expect(iniciarPago('pedido-1')).resolves.toMatchObject({ preference_id: 'pref-1' })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('crear-preferencia-pago', { body: { pedido_id: 'pedido-1' } })
    supabase.functions.invoke.mockResolvedValue({ data: {}, error: null })
    await expect(iniciarPago('pedido-1')).rejects.toThrow('dirección')
  })

  it('solo acepta aprobar o rechazar en la pasarela simulada', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { pedido: { id: 'pedido-1', estado: 'Pagado' } }, error: null })
    await expect(resolverPagoSimulado('pedido-1', 'approved')).resolves.toMatchObject({ estado: 'Pagado' })
    await expect(resolverPagoSimulado('pedido-1', 'otro')).rejects.toThrow('no válido')
  })

  it('traduce el mensaje devuelto por una Edge Function', async () => {
    const error = { context: { json: vi.fn().mockResolvedValue({ error: 'Pedido vencido' }) } }
    supabase.functions.invoke.mockResolvedValue({ data: null, error })
    await expect(iniciarPago('pedido-1')).rejects.toThrow('Pedido vencido')
  })
})

describe('obtenerPedido', () => {
  it('consulta el pedido propio y permite una respuesta vacía', async () => {
    supabase.from.mockReturnValueOnce(builder({ data: { id: 'pedido-1' }, error: null }))
    await expect(obtenerPedido('pedido-1')).resolves.toMatchObject({ id: 'pedido-1' })
    expect(supabase.from).toHaveBeenCalledWith('pedidos_web')
    await expect(obtenerPedido(null)).resolves.toBeNull()
  })
})
