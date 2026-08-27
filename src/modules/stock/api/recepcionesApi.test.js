import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmarRecepcion,
  createRecepcion,
  getRecepcionById,
  getRecepciones,
} from './recepcionesApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

// Las funciones de la migración 0011 se llaman con .rpc(...).single()
function mockRpc(resultado) {
  const builder = { single: vi.fn(() => resultado) }
  supabase.rpc.mockReturnValue(builder)
  return builder
}

const recepcion = {
  deposito_destino_id: 'dep-destino',
  orden_compra_id: 'oc-1',
  observaciones: 'Entrega parcial',
  items: [
    { articulo_id: 'art-1', cantidad: 50, costo_unitario: 4200 },
    { articulo_id: 'art-2', cantidad: 10, costo_unitario: 1500 },
  ],
}

describe('recepcionesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Alta: camino feliz (TC-STK-09-01) ---

  it('registra una recepción con varios ítems y la deja pendiente', async () => {
    const resultado = {
      data: {
        id: 'rec-1',
        estado_recepcion: 'pendiente',
        created_at: '2026-08-25T10:00:00.000Z',
      },
      error: null,
    }

    mockRpc(resultado)

    const data = await createRecepcion(recepcion)

    expect(supabase.rpc).toHaveBeenCalledWith('crear_recepcion', {
      p_deposito_destino_id: 'dep-destino',
      p_items: [
        { producto_id: 'art-1', cantidad: 50, costo_unitario: 4200 },
        { producto_id: 'art-2', cantidad: 10, costo_unitario: 1500 },
      ],
      p_orden_compra_id: 'oc-1',
      p_observaciones: 'Entrega parcial',
    })
    expect(data).toEqual(resultado.data)
  })

  it('normaliza orden_compra_id y observaciones vacíos a null', async () => {
    mockRpc({ data: { id: 'rec-2' }, error: null })

    await createRecepcion({
      ...recepcion,
      orden_compra_id: '   ',
      observaciones: '',
    })

    expect(supabase.rpc).toHaveBeenCalledWith(
      'crear_recepcion',
      expect.objectContaining({
        p_orden_compra_id: null,
        p_observaciones: null,
      }),
    )
  })

  // --- Alta: validaciones (TC-STK-09-03) ---

  it('rechaza una recepción sin depósito destino', async () => {
    await expect(
      createRecepcion({ ...recepcion, deposito_destino_id: '' }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'El depósito destino es obligatorio',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza una recepción sin ítems', async () => {
    await expect(
      createRecepcion({ ...recepcion, items: [] }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Los ítems son obligatorios',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza un ítem sin artículo', async () => {
    await expect(
      createRecepcion({
        ...recepcion,
        items: [{ articulo_id: '', cantidad: 1, costo_unitario: 1 }],
      }),
    ).rejects.toMatchObject({ status: 400 })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza un ítem con cantidad igual a 0', async () => {
    await expect(
      createRecepcion({
        ...recepcion,
        items: [{ articulo_id: 'art-1', cantidad: 0, costo_unitario: 10 }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'La cantidad debe ser mayor a 0',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza un ítem con costo unitario negativo', async () => {
    await expect(
      createRecepcion({
        ...recepcion,
        items: [{ articulo_id: 'art-1', cantidad: 1, costo_unitario: -5 }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'El costo unitario debe ser mayor a 0',
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rechaza un ítem con costo unitario no numérico', async () => {
    await expect(
      createRecepcion({
        ...recepcion,
        items: [{ articulo_id: 'art-1', cantidad: 1, costo_unitario: 'gratis' }],
      }),
    ).rejects.toMatchObject({ status: 400 })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  // --- Confirmación (TC-STK-09-02, 04) ---

  it('confirma una recepción pendiente', async () => {
    const resultado = {
      data: { id: 'rec-1', estado_recepcion: 'confirmada' },
      error: null,
    }

    mockRpc(resultado)

    const data = await confirmarRecepcion('rec-1')

    expect(supabase.rpc).toHaveBeenCalledWith('confirmar_recepcion', {
      p_recepcion_id: 'rec-1',
    })
    expect(data).toEqual(resultado.data)
  })

  it('rechaza confirmar sin id', async () => {
    await expect(confirmarRecepcion('')).rejects.toMatchObject({ status: 400 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('traduce a 409 una recepción ya confirmada (idempotencia)', async () => {
    mockRpc({
      data: null,
      error: { code: 'RC003', message: 'La recepcion ya esta confirmada' },
    })

    await expect(confirmarRecepcion('rec-1')).rejects.toMatchObject({
      status: 409,
      message: 'La recepcion ya esta confirmada',
    })
  })

  it('traduce a 404 una recepción inexistente', async () => {
    mockRpc({
      data: null,
      error: { code: 'RC002', message: 'La recepcion no existe' },
    })

    await expect(confirmarRecepcion('rec-1')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('traduce a 423 el bloqueo por otra operación en proceso', async () => {
    mockRpc({
      data: null,
      error: {
        code: 'RC006',
        message: 'Hay otra operacion en proceso sobre el mismo articulo/deposito',
      },
    })

    await expect(confirmarRecepcion('rec-1')).rejects.toMatchObject({
      status: 423,
    })
  })

  it('traduce a 423 el lock_not_available que levanta PostgreSQL', async () => {
    mockRpc({
      data: null,
      error: { code: '55P03', message: 'could not obtain lock on row' },
    })

    await expect(confirmarRecepcion('rec-1')).rejects.toMatchObject({
      status: 423,
    })
  })

  it('reenvía sin traducir los errores desconocidos', async () => {
    const error = { code: '42P01', message: 'relation does not exist' }
    mockRpc({ data: null, error })

    await expect(confirmarRecepcion('rec-1')).rejects.toEqual(error)
  })

  // --- Consultas ---

  it('lista las recepciones filtrando por estado', async () => {
    const resultado = {
      data: [{ id: 'rec-1', estado_recepcion: 'pendiente' }],
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

    const data = await getRecepciones({ estado: 'pendiente' })

    expect(supabase.from).toHaveBeenCalledWith('recepciones')
    expect(builder.eq).toHaveBeenCalledWith('estado_recepcion', 'pendiente')
    expect(data).toMatchObject({
      recepciones: resultado.data,
      total: 1,
      totalPaginas: 1,
    })
  })

  it('lista las recepciones sin filtro de estado', async () => {
    const resultado = { data: [], count: 0, error: null }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    await getRecepciones()

    expect(builder.eq).not.toHaveBeenCalled()
  })

  it('obtiene una recepción por id', async () => {
    const resultado = { data: { id: 'rec-1' }, error: null }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await getRecepcionById('rec-1')

    expect(builder.eq).toHaveBeenCalledWith('id', 'rec-1')
    expect(data).toEqual(resultado.data)
  })

  it('lanza 404 si la recepción no existe', async () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => ({ data: null, error: null })),
    }

    supabase.from.mockReturnValue(builder)

    await expect(getRecepcionById('rec-1')).rejects.toMatchObject({
      status: 404,
    })
  })
})
