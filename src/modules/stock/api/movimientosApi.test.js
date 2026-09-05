import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelarMovimiento,
  confirmarMovimiento,
  createMovimiento,
  createMovimientoMultiarticulo,
  getMovimientoById,
  getMovimientos,
  getTiposMovimiento,
  getHistorialMovimientos,
} from './movimientosApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

// Las funciones de la migración 0006 se llaman con .rpc(...).single()
function mockRpc(resultado) {
  const builder = { single: vi.fn(() => resultado) }
  supabase.rpc.mockReturnValue(builder)
  return builder
}

const transferencia = {
  tipo: 'transferencia',
  articulo_id: 'art-1',
  cantidad: 10,
  deposito_origen_id: 'dep-origen',
  deposito_destino_id: 'dep-destino',
  comprobante: 'REM-0001234',
}

describe('movimientosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('envía todos los artículos a la RPC multiartículo', async () => {
    mockRpc({ data: { id: 'mov-multi', estado_movimiento: 'confirmado' }, error: null })

    await createMovimientoMultiarticulo({
      tipo: 'egreso',
      deposito_id: 'dep-1',
      comprobante: 'REM-1',
      items: [
        { producto_id: 'art-1', cantidad: 10 },
        { producto_id: 'art-2', cantidad: '5' },
      ],
    })

    expect(supabase.rpc).toHaveBeenCalledWith('crear_movimiento_multiarticulo', {
      p_tipo: 'egreso',
      p_deposito_id: 'dep-1',
      p_items: [
        { producto_id: 'art-1', cantidad: 10 },
        { producto_id: 'art-2', cantidad: 5 },
      ],
      p_deposito_destino_id: null,
      p_comprobante: 'REM-1',
      p_observaciones: null,
    })
  })

  it('rechaza un movimiento multiartículo sin renglones', async () => {
    await expect(createMovimientoMultiarticulo({
      tipo: 'ingreso', deposito_id: 'dep-1', items: [],
    })).rejects.toMatchObject({ status: 400 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza cantidades decimales en un movimiento multiartículo', async () => {
    await expect(createMovimientoMultiarticulo({
      tipo: 'ingreso', deposito_id: 'dep-1',
      items: [{ producto_id: 'art-1', cantidad: 1.01 }],
    })).rejects.toMatchObject({ status: 400 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  // --- Alta: camino feliz (TC-STK-08-01) ---

  it('registra una transferencia y la deja pendiente', async () => {
    const resultado = {
      data: {
        id: 'mov-1',
        estado_movimiento: 'pendiente',
        fecha: '2026-08-25T10:00:00.000Z',
        comprobante: 'REM-0001234',
      },
      error: null,
    }

    mockRpc(resultado)

    const data = await createMovimiento(transferencia)

    expect(supabase.rpc).toHaveBeenCalledWith('crear_movimiento', {
      p_tipo: 'transferencia',
      p_producto_id: 'art-1',
      p_cantidad: 10,
      p_deposito_origen_id: 'dep-origen',
      p_deposito_destino_id: 'dep-destino',
      p_comprobante: 'REM-0001234',
      p_observaciones: null,
    })
    expect(data).toEqual(resultado.data)
  })

  it('registra un ingreso sin depósito origen', async () => {
    mockRpc({
      data: { id: 'mov-2', estado_movimiento: 'pendiente' },
      error: null,
    })

    await createMovimiento({
      tipo: 'ingreso',
      articulo_id: 'art-1',
      cantidad: 5,
      deposito_origen_id: 'dep-colgado',
      deposito_destino_id: 'dep-destino',
      comprobante: 'FC-A-0001',
    })

    expect(supabase.rpc).toHaveBeenCalledWith(
      'crear_movimiento',
      expect.objectContaining({
        p_tipo: 'ingreso',
        p_deposito_origen_id: null,
        p_deposito_destino_id: 'dep-destino',
      }),
    )
  })

  it('registra un egreso sin depósito destino', async () => {
    mockRpc({
      data: { id: 'mov-3', estado_movimiento: 'pendiente' },
      error: null,
    })

    await createMovimiento({
      tipo: 'egreso',
      articulo_id: 'art-1',
      cantidad: 5,
      deposito_origen_id: 'dep-origen',
      deposito_destino_id: 'dep-colgado',
      comprobante: 'REM-0009',
    })

    expect(supabase.rpc).toHaveBeenCalledWith(
      'crear_movimiento',
      expect.objectContaining({
        p_tipo: 'egreso',
        p_deposito_origen_id: 'dep-origen',
        p_deposito_destino_id: null,
      }),
    )
  })

  it('normaliza comprobante y observaciones vacíos a null', async () => {
    mockRpc({ data: { id: 'mov-4' }, error: null })

    await createMovimiento({
      ...transferencia,
      comprobante: '   ',
      observaciones: '',
    })

    expect(supabase.rpc).toHaveBeenCalledWith(
      'crear_movimiento',
      expect.objectContaining({
        p_comprobante: null,
        p_observaciones: null,
      }),
    )
  })

  // --- Alta: depósitos faltantes (TC-STK-08-03) ---

  it('rechaza una transferencia sin depósito origen', async () => {
    await expect(
      createMovimiento({ ...transferencia, deposito_origen_id: '' }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Una transferencia requiere depósito origen y destino',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza una transferencia sin depósito destino', async () => {
    await expect(
      createMovimiento({ ...transferencia, deposito_destino_id: '' }),
    ).rejects.toMatchObject({ status: 400 })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza un ingreso sin depósito destino', async () => {
    await expect(
      createMovimiento({
        tipo: 'ingreso',
        articulo_id: 'art-1',
        cantidad: 5,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Un ingreso requiere depósito destino',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza un egreso sin depósito origen', async () => {
    await expect(
      createMovimiento({
        tipo: 'egreso',
        articulo_id: 'art-1',
        cantidad: 5,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Un egreso requiere depósito origen',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza una transferencia con el mismo depósito de origen y destino', async () => {
    await expect(
      createMovimiento({
        ...transferencia,
        deposito_destino_id: 'dep-origen',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'El depósito origen y el destino deben ser distintos',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  // --- Alta: cantidad inválida (TC-STK-08-04) ---

  it('rechaza una cantidad igual a 0', async () => {
    await expect(
      createMovimiento({ ...transferencia, cantidad: 0 }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'La cantidad debe ser mayor a 0',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza una cantidad negativa', async () => {
    await expect(
      createMovimiento({ ...transferencia, cantidad: -5 }),
    ).rejects.toMatchObject({ status: 400 })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza una cantidad no numérica', async () => {
    await expect(
      createMovimiento({ ...transferencia, cantidad: 'diez' }),
    ).rejects.toMatchObject({ status: 400 })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  // --- Alta: otras validaciones ---

  it('rechaza un tipo de movimiento desconocido', async () => {
    await expect(
      createMovimiento({ ...transferencia, tipo: 'desconocido' }),
    ).rejects.toMatchObject({ status: 400 })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('registra un ajuste negativo con motivo y categoría', async () => {
    mockRpc({
      data: { id: 'mov-ajuste-1', estado_movimiento: 'pendiente' },
      error: null,
    })

    const data = await createMovimiento({
      tipo: 'ajuste',
      articulo_id: 'art-1',
      cantidad: -3,
      deposito_id: 'dep-1',
      categoria_ajuste: 'rotura',
      motivo_ajuste: 'Material dañado durante la descarga',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('crear_ajuste_inventario', {
      p_deposito_id: 'dep-1',
      p_producto_id: 'art-1',
      p_cantidad: -3,
      p_categoria: 'rotura',
      p_motivo: 'Material dañado durante la descarga',
    })
    expect(data).toEqual({
      id: 'mov-ajuste-1',
      estado_movimiento: 'pendiente',
    })
  })

  it('rechaza un ajuste sin motivo', async () => {
    await expect(
      createMovimiento({
        tipo: 'ajuste',
        articulo_id: 'art-1',
        cantidad: 3,
        deposito_id: 'dep-1',
        categoria_ajuste: 'otro',
        motivo_ajuste: ' ',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'El motivo del ajuste es obligatorio',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza un movimiento sin artículo', async () => {
    await expect(
      createMovimiento({ ...transferencia, articulo_id: '' }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'El artículo es obligatorio',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('traduce a 409 el disponible insuficiente detectado en el alta', async () => {
    mockRpc({
      data: null,
      error: {
        code: 'MV004',
        message: 'La cantidad supera el disponible del deposito origen',
      },
    })

    await expect(createMovimiento(transferencia)).rejects.toMatchObject({
      status: 409,
      message: 'La cantidad supera el disponible del deposito origen',
    })
  })

  // --- Confirmación (TC-STK-08-02, 05, 06, 07) ---

  it('confirma un movimiento pendiente', async () => {
    const resultado = {
      data: { id: 'mov-1', estado_movimiento: 'confirmado' },
      error: null,
    }

    mockRpc(resultado)

    const data = await confirmarMovimiento('mov-1')

    expect(supabase.rpc).toHaveBeenCalledWith('confirmar_movimiento', {
      p_movimiento_id: 'mov-1',
    })
    expect(data).toEqual(resultado.data)
  })

  it('rechaza confirmar sin id', async () => {
    await expect(confirmarMovimiento('')).rejects.toMatchObject({
      status: 400,
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('traduce a 409 el disponible insuficiente detectado al confirmar', async () => {
    mockRpc({
      data: null,
      error: {
        code: 'MV004',
        message: 'La cantidad supera el disponible del deposito origen',
      },
    })

    await expect(confirmarMovimiento('mov-1')).rejects.toMatchObject({
      status: 409,
    })
  })

  it('traduce a 409 un movimiento ya confirmado', async () => {
    mockRpc({
      data: null,
      error: {
        code: 'MV003',
        message: 'El movimiento ya esta confirmado',
      },
    })

    await expect(confirmarMovimiento('mov-1')).rejects.toMatchObject({
      status: 409,
      message: 'El movimiento ya esta confirmado',
    })
  })

  it('traduce a 409 un movimiento ya cancelado', async () => {
    mockRpc({
      data: null,
      error: {
        code: 'MV003',
        message: 'El movimiento ya esta cancelado',
      },
    })

    await expect(confirmarMovimiento('mov-1')).rejects.toMatchObject({
      status: 409,
    })
  })

  it('traduce a 423 el bloqueo por otro movimiento en proceso', async () => {
    mockRpc({
      data: null,
      error: {
        code: 'MV006',
        message:
          'Hay otro movimiento en proceso sobre el mismo articulo/deposito',
      },
    })

    await expect(confirmarMovimiento('mov-1')).rejects.toMatchObject({
      status: 423,
    })
  })

  it('traduce a 423 el lock_not_available que levanta PostgreSQL', async () => {
    mockRpc({
      data: null,
      error: {
        code: '55P03',
        message: 'could not obtain lock on row',
      },
    })

    await expect(confirmarMovimiento('mov-1')).rejects.toMatchObject({
      status: 423,
    })
  })

  it('traduce a 404 un movimiento inexistente', async () => {
    mockRpc({
      data: null,
      error: {
        code: 'MV002',
        message: 'El movimiento no existe',
      },
    })

    await expect(confirmarMovimiento('mov-1')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('reenvía sin traducir los errores desconocidos', async () => {
    const error = {
      code: '42P01',
      message: 'relation does not exist',
    }

    mockRpc({ data: null, error })

    await expect(confirmarMovimiento('mov-1')).rejects.toEqual(error)
  })

  // --- Cancelación ---

  it('cancela un movimiento pendiente', async () => {
    const resultado = {
      data: {
        id: 'mov-1',
        estado_movimiento: 'cancelado',
      },
      error: null,
    }

    mockRpc(resultado)

    const data = await cancelarMovimiento('mov-1')

    expect(supabase.rpc).toHaveBeenCalledWith('cancelar_movimiento', {
      p_movimiento_id: 'mov-1',
    })

    expect(data).toEqual(resultado.data)
  })

  it('rechaza cancelar sin id', async () => {
    await expect(cancelarMovimiento('')).rejects.toMatchObject({
      status: 400,
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  // --- Consultas ---

  it('obtiene los tipos de movimiento', async () => {
    const resultado = {
      data: [
        { id: '1', nombre: 'Egreso', codigo: 'egreso' },
        { id: '2', nombre: 'Ingreso', codigo: 'ingreso' },
      ],
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      order: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await getTiposMovimiento()

    expect(supabase.from).toHaveBeenCalledWith('tipos_movimiento')
    expect(data).toEqual(resultado.data)
  })

  it('lista los movimientos filtrando por estado', async () => {
    const resultado = {
      data: [
        {
          id: 'mov-1',
          estado_movimiento: 'pendiente',
        },
      ],
      count: 1,
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await getMovimientos({
      estado: 'pendiente',
    })

    expect(supabase.from).toHaveBeenCalledWith('movimientos_stock')
    expect(builder.select.mock.calls[0][0]).toContain('categoria_ajuste')
    expect(builder.select.mock.calls[0][0]).toContain('motivo_ajuste')
    expect(builder.select.mock.calls[0][0]).toContain('origen_ajuste')
    expect(builder.select.mock.calls[0][0]).toContain('inventario_fisico_id')

    expect(builder.eq).toHaveBeenCalledWith(
      'estado_movimiento',
      'pendiente',
    )

    expect(data).toMatchObject({
      movimientos: resultado.data,
      total: 1,
      totalPaginas: 1,
    })
  })

  it('lista los movimientos sin filtro de estado', async () => {
    const resultado = {
      data: [],
      count: 0,
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    await getMovimientos()

    expect(builder.eq).not.toHaveBeenCalled()
  })

  it('obtiene un movimiento por id', async () => {
    const resultado = {
      data: {
        id: 'mov-1',
      },
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await getMovimientoById('mov-1')

    expect(builder.eq).toHaveBeenCalledWith(
      'id',
      'mov-1',
    )

    expect(data).toEqual(resultado.data)
  })

  it('lanza 404 si el movimiento no existe', async () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => ({
        data: null,
        error: null,
      })),
    }

    supabase.from.mockReturnValue(builder)

    await expect(
      getMovimientoById('mov-1'),
    ).rejects.toMatchObject({
      status: 404,
    })
  })

  // --- Historial de movimientos (US-STK-10) ---

  it('consulta el historial paginado ordenado por fecha descendente', async () => {
    const resultado = {
      data: [
        {
          id: 'mov-10',
          fecha: '2026-08-27T15:30:00.000Z',
          created_by: 'usuario-uuid',
        },
      ],
      count: 21,
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await getHistorialMovimientos({
      page: 2,
      pageSize: 10,
    })

    expect(supabase.from).toHaveBeenCalledWith('movimientos_stock')

    expect(builder.order).toHaveBeenCalledWith('fecha', {
      ascending: false,
    })

    expect(builder.range).toHaveBeenCalledWith(10, 19)

    expect(data).toMatchObject({
      movimientos: resultado.data,
      total: 21,
      page: 2,
      pageSize: 10,
      totalPaginas: 3,
    })
  })

  it('aplica los filtros opcionales del historial', async () => {
    const resultado = {
      data: [],
      count: 0,
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    await getHistorialMovimientos({
      articuloId: 'art-1',
      tipoId: 'tipo-1',
      fechaDesde: '2026-08-01',
      fechaHasta: '2026-08-27',
      depositoOrigenId: 'dep-1',
      depositoDestinoId: 'dep-2',
    })

    expect(builder.eq).toHaveBeenCalledWith(
      'detalle.producto_id',
      'art-1',
    )

    expect(builder.eq).toHaveBeenCalledWith(
      'tipo_movimiento_id',
      'tipo-1',
    )

    expect(builder.eq).toHaveBeenCalledWith(
      'deposito_origen_id',
      'dep-1',
    )

    expect(builder.eq).toHaveBeenCalledWith(
      'deposito_destino_id',
      'dep-2',
    )

    expect(builder.gte).toHaveBeenCalled()
    expect(builder.lte).toHaveBeenCalled()
  })

  it('no aplica filtros cuando el historial se consulta completo', async () => {
    const resultado = {
      data: [],
      count: 0,
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    await getHistorialMovimientos()

    expect(builder.eq).not.toHaveBeenCalled()
    expect(builder.gte).not.toHaveBeenCalled()
    expect(builder.lte).not.toHaveBeenCalled()

    expect(builder.range).toHaveBeenCalledWith(
      0,
      9,
    )
  })
})
