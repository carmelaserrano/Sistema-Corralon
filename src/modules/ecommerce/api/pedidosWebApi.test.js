import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  armarLineaDeTiempo,
  avanzarEstadoPedido,
  listarMisPedidos,
  listarPedidosWeb,
  obtenerSeguimientoPedido,
  puedeGestionarPedidos,
  siguientesEstados,
} from './pedidosWebApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }))

function builder(resultado) {
  const consulta = { then: (ok, fail) => Promise.resolve(resultado).then(ok, fail) }
  for (const metodo of ['select', 'eq', 'order', 'maybeSingle']) consulta[metodo] = vi.fn(() => consulta)
  return consulta
}

beforeEach(() => vi.resetAllMocks())

describe('siguientesEstados (matriz de transiciones)', () => {
  it.each([
    [{ estado: 'Pendiente de pago', tipo_entrega: 'retiro' }, ['Cancelado']],
    [{ estado: 'Pagado', tipo_entrega: 'retiro' }, ['En preparación', 'Cancelado']],
    [{ estado: 'En preparación', tipo_entrega: 'retiro' }, ['Listo para retirar']],
    [{ estado: 'En preparación', tipo_entrega: 'envio' }, ['Enviado']],
    [{ estado: 'Listo para retirar', tipo_entrega: 'retiro' }, ['Entregado']],
    [{ estado: 'Enviado', tipo_entrega: 'envio' }, ['Entregado']],
  ])('%o puede pasar a %o', (pedido, esperados) => {
    expect(siguientesEstados(pedido)).toEqual(esperados)
  })

  it('no ofrece marcar como Pagado a mano ni saltear pasos', () => {
    expect(siguientesEstados({ estado: 'Pendiente de pago' })).not.toContain('Pagado')
    expect(siguientesEstados({ estado: 'Pagado' })).not.toContain('Entregado')
    expect(siguientesEstados({ estado: 'En preparación', tipo_entrega: 'retiro' })).not.toContain('Enviado')
  })

  it('no permite cancelar después de empezar la preparación', () => {
    for (const estado of ['En preparación', 'Listo para retirar', 'Enviado']) {
      expect(siguientesEstados({ estado, tipo_entrega: 'envio' })).not.toContain('Cancelado')
    }
  })

  it('Entregado y Cancelado son finales', () => {
    expect(siguientesEstados({ estado: 'Entregado' })).toEqual([])
    expect(siguientesEstados({ estado: 'Cancelado' })).toEqual([])
    expect(siguientesEstados(null)).toEqual([])
  })
})

describe('armarLineaDeTiempo', () => {
  const creado = '2026-09-20T10:00:00Z'

  it('sigue el camino de retiro con la fecha de cada cambio', () => {
    const linea = armarLineaDeTiempo(
      { estado: 'En preparación', tipo_entrega: 'retiro', created_at: creado },
      [
        { estado_nuevo: 'En preparación', created_at: '2026-09-21T09:00:00Z' },
        { estado_nuevo: 'Pendiente de pago', created_at: creado },
        { estado_nuevo: 'Pagado', created_at: '2026-09-20T10:05:00Z' },
      ],
    )
    expect(linea.map((p) => p.estado)).toEqual(['Pendiente de pago', 'Pagado', 'En preparación', 'Listo para retirar', 'Entregado'])
    expect(linea.map((p) => p.completado)).toEqual([true, true, true, false, false])
    expect(linea[2]).toMatchObject({ actual: true, fecha: '2026-09-21T09:00:00Z' })
    expect(linea[3].fecha).toBeNull()
  })

  it('usa Enviado para pedidos con envío', () => {
    const linea = armarLineaDeTiempo({ estado: 'Pagado', tipo_entrega: 'envio', created_at: creado }, [])
    expect(linea[3].estado).toBe('Enviado')
  })

  it('toma la fecha de creación cuando el pedido seed no tiene historial', () => {
    const linea = armarLineaDeTiempo({ estado: 'Pagado', tipo_entrega: 'retiro', created_at: creado }, [])
    expect(linea[0]).toMatchObject({ fecha: creado, completado: true })
    expect(linea[1]).toMatchObject({ fecha: null, completado: true, actual: true })
  })

  it('en un pedido cancelado muestra solo los pasos alcanzados y el motivo', () => {
    const linea = armarLineaDeTiempo(
      { estado: 'Cancelado', tipo_entrega: 'retiro', created_at: creado },
      [
        { estado_nuevo: 'Pagado', created_at: '2026-09-20T10:05:00Z' },
        { estado_nuevo: 'Cancelado', motivo: 'Sin stock', created_at: '2026-09-20T12:00:00Z' },
      ],
    )
    expect(linea.map((p) => p.estado)).toEqual(['Pendiente de pago', 'Pagado', 'Cancelado'])
    expect(linea[2]).toMatchObject({ actual: true, motivo: 'Sin stock' })
  })
})

describe('avanzarEstadoPedido', () => {
  it('llama a la función de la base con el motivo limpio', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'p1', estado: 'Cancelado' }, error: null })
    await expect(avanzarEstadoPedido('p1', 'Cancelado', '  Cliente se arrepintió ')).resolves.toMatchObject({ estado: 'Cancelado' })
    expect(supabase.rpc).toHaveBeenCalledWith('avanzar_estado_pedido', {
      p_pedido: 'p1', p_estado: 'Cancelado', p_motivo: 'Cliente se arrepintió',
    })
  })

  it('manda motivo null en avances sin motivo', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'p1', estado: 'En preparación' }, error: null })
    await avanzarEstadoPedido('p1', 'En preparación')
    expect(supabase.rpc).toHaveBeenCalledWith('avanzar_estado_pedido', expect.objectContaining({ p_motivo: null }))
  })

  it('exige motivo para cancelar sin llamar a la base', async () => {
    await expect(avanzarEstadoPedido('p1', 'Cancelado', '   ')).rejects.toMatchObject({ status: 400, campo: 'motivo' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza estados desconocidos o un pedido faltante', async () => {
    await expect(avanzarEstadoPedido('p1', 'Perdido')).rejects.toMatchObject({ status: 400 })
    await expect(avanzarEstadoPedido('', 'Entregado')).rejects.toMatchObject({ status: 400 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('traduce una transición inválida a 409 con el mensaje de la base', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Transición no permitida: Pagado → Entregado' } })
    await expect(avanzarEstadoPedido('p1', 'Entregado')).rejects.toMatchObject({ status: 409, message: 'Transición no permitida: Pagado → Entregado' })
  })

  it('traduce la falta de permiso a 403', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'No tenés permiso para gestionar pedidos web' } })
    await expect(avanzarEstadoPedido('p1', 'En preparación')).rejects.toMatchObject({ status: 403 })
  })

  it('traduce el motivo faltante informado por la base', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'El motivo es obligatorio para cancelar un pedido' } })
    await expect(avanzarEstadoPedido('p1', 'Cancelado', 'x')).rejects.toMatchObject({ status: 400, campo: 'motivo' })
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'otro check' } })
    await expect(avanzarEstadoPedido('p1', 'Cancelado', 'x')).rejects.toMatchObject({ status: 400 })
  })

  it('propaga errores inesperados sin cambiarlos', async () => {
    const error = new Error('se cayó la red')
    supabase.rpc.mockResolvedValue({ data: null, error })
    await expect(avanzarEstadoPedido('p1', 'Entregado')).rejects.toBe(error)
  })
})

describe('consultas', () => {
  it('lista los pedidos del cliente, del más reciente al más antiguo', async () => {
    const consulta = builder({ data: [{ id: 'p1' }], error: null })
    supabase.from.mockReturnValue(consulta)
    await expect(listarMisPedidos('cliente-1')).resolves.toEqual([{ id: 'p1' }])
    expect(consulta.eq).toHaveBeenCalledWith('cliente_id', 'cliente-1')
    expect(consulta.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('sin cliente no consulta', async () => {
    await expect(listarMisPedidos(null)).resolves.toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('devuelve null si la RLS oculta el pedido (CA-05)', async () => {
    supabase.from.mockReturnValue(builder({ data: null, error: null }))
    await expect(obtenerSeguimientoPedido('ajeno')).resolves.toBeNull()
    expect(supabase.from).toHaveBeenCalledTimes(1)
    await expect(obtenerSeguimientoPedido(null)).resolves.toBeNull()
  })

  it('trae el pedido con ítems e historial', async () => {
    supabase.from
      .mockReturnValueOnce(builder({ data: { id: 'p1', estado: 'Pagado' }, error: null }))
      .mockReturnValueOnce(builder({ data: [{ id: 'i1' }], error: null }))
      .mockReturnValueOnce(builder({ data: [{ id: 'h1', estado_nuevo: 'Pagado' }], error: null }))
    await expect(obtenerSeguimientoPedido('p1')).resolves.toEqual({
      pedido: { id: 'p1', estado: 'Pagado' },
      items: [{ id: 'i1' }],
      historial: [{ id: 'h1', estado_nuevo: 'Pagado' }],
    })
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'detalle_pedido_web')
    expect(supabase.from).toHaveBeenNthCalledWith(3, 'historial_estado_pedido')
  })

  it('propaga el error de los ítems', async () => {
    const error = new Error('falló')
    supabase.from
      .mockReturnValueOnce(builder({ data: { id: 'p1' }, error: null }))
      .mockReturnValueOnce(builder({ data: null, error }))
      .mockReturnValueOnce(builder({ data: [], error: null }))
    await expect(obtenerSeguimientoPedido('p1')).rejects.toBe(error)
  })

  it('filtra el backoffice por estado', async () => {
    const consulta = builder({ data: [], error: null })
    supabase.from.mockReturnValue(consulta)
    await listarPedidosWeb({ estado: 'Pagado' })
    expect(consulta.eq).toHaveBeenCalledWith('estado', 'Pagado')
    consulta.eq.mockClear()
    await listarPedidosWeb()
    expect(consulta.eq).not.toHaveBeenCalled()
  })

  it('propaga errores de las listas', async () => {
    const error = new Error('falló')
    supabase.from.mockReturnValue(builder({ data: null, error }))
    await expect(listarPedidosWeb()).rejects.toBe(error)
    await expect(listarMisPedidos('c1')).rejects.toBe(error)
  })

  it('consulta el permiso de gestión', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null })
    await expect(puedeGestionarPedidos()).resolves.toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', { p_nombre: 'ecommerce.pedidos.gestionar' })
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('x') })
    await expect(puedeGestionarPedidos()).rejects.toThrow('x')
  })
})
