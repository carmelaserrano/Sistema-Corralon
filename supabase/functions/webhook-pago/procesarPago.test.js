import { describe, expect, it, vi } from 'vitest'
import { procesarPago } from './procesarPago'

describe('webhook de pago', () => {
  it('procesa dos veces la misma notificación sin duplicar la transición', async () => {
    let estado = 'Pendiente de pago'
    let transiciones = 0
    const rpc = vi.fn(async (_nombre, datos) => {
      if (datos.p_estado === 'approved' && estado !== 'Pagado') {
        estado = 'Pagado'
        transiciones += 1
      }
      return { data: { id: datos.p_pedido, estado }, error: null }
    })
    const evento = { pedidoId: 'pedido-1', referencia: 'pago-1', estado: 'approved' }
    await procesarPago(rpc, evento)
    await procesarPago(rpc, evento)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(transiciones).toBe(1)
    expect(estado).toBe('Pagado')
  })
})
