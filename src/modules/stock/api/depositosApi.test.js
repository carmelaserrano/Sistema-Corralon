import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDeposito,
  deleteDeposito,
  getDepositos,
  getTiposDeposito,
  updateDeposito,
} from './depositosApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('depositosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('obtiene los depósitos correctamente', async () => {
    const resultado = {
      data: [
        {
          id: '1',
          nombre: 'Sucursal Norte',
          direccion: 'Av. Bolivia 2500',
          localidad: 'Salta',
          capacidad_maxima: 5000,
        },
      ],
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      order: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await getDepositos()

    expect(supabase.from).toHaveBeenCalledWith('depositos')
    expect(data).toEqual(resultado.data)
  })

  it('obtiene los tipos de depósito correctamente', async () => {
    const resultado = {
      data: [
        { id: '1', nombre: 'Minorista' },
        { id: '2', nombre: 'Mayorista' },
        { id: '3', nombre: 'Mixto' },
      ],
      error: null,
    }

    const builder = {
      select: vi.fn(() => builder),
      order: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await getTiposDeposito()

    expect(supabase.from).toHaveBeenCalledWith('tipos_deposito')
    expect(data).toEqual(resultado.data)
  })

  it('crea un depósito correctamente', async () => {
    const deposito = {
      nombre: 'Sucursal Oeste',
      direccion: 'Av. Oeste 123',
      localidad: 'Salta',
      tipo_deposito_id: 'tipo-1',
      capacidad_maxima: '3000',
    }

    const resultado = {
      data: {
        id: 'deposito-1',
        ...deposito,
        capacidad_maxima: 3000,
      },
      error: null,
    }

    const builder = {
      insert: vi.fn(() => builder),
      select: vi.fn(() => builder),
      single: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await createDeposito(deposito)

    expect(supabase.from).toHaveBeenCalledWith('depositos')
    expect(builder.insert).toHaveBeenCalledWith({
      nombre: 'Sucursal Oeste',
      direccion: 'Av. Oeste 123',
      localidad: 'Salta',
      tipo_deposito_id: 'tipo-1',
      capacidad_maxima: 3000,
    })
    expect(data).toEqual(resultado.data)
  })

  it('rechaza un depósito si falta la dirección', async () => {
    const deposito = {
      nombre: 'Sucursal Oeste',
      direccion: '',
      localidad: 'Salta',
      tipo_deposito_id: 'tipo-1',
      capacidad_maxima: 3000,
    }

    await expect(createDeposito(deposito)).rejects.toMatchObject({
      status: 400,
      message: 'La dirección es obligatoria',
    })

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('rechaza una capacidad máxima inválida', async () => {
    const deposito = {
      nombre: 'Sucursal Oeste',
      direccion: 'Av. Oeste 123',
      localidad: 'Salta',
      tipo_deposito_id: 'tipo-1',
      capacidad_maxima: 0,
    }

    await expect(createDeposito(deposito)).rejects.toMatchObject({
      status: 400,
    })

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('convierte un nombre duplicado en error 409', async () => {
    const deposito = {
      nombre: 'Sucursal Norte',
      direccion: 'Av. Bolivia 2500',
      localidad: 'Salta',
      tipo_deposito_id: 'tipo-1',
      capacidad_maxima: 5000,
    }

    const builder = {
      insert: vi.fn(() => builder),
      select: vi.fn(() => builder),
      single: vi.fn(() => ({
        data: null,
        error: { code: '23505' },
      })),
    }

    supabase.from.mockReturnValue(builder)

    await expect(createDeposito(deposito)).rejects.toMatchObject({
      status: 409,
      message: 'Ya existe un depósito con ese nombre',
    })
  })

  it('actualiza un depósito correctamente', async () => {
    const deposito = {
      nombre: 'Sucursal Norte Actualizada',
      direccion: 'Av. Bolivia 2600',
      localidad: 'Salta',
      tipo_deposito_id: 'tipo-1',
      capacidad_maxima: 6000,
    }

    const resultado = {
      data: {
        id: 'deposito-1',
        ...deposito,
      },
      error: null,
    }

    const builder = {
      update: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      select: vi.fn(() => builder),
      single: vi.fn(() => resultado),
    }

    supabase.from.mockReturnValue(builder)

    const data = await updateDeposito('deposito-1', deposito)

    expect(builder.eq).toHaveBeenCalledWith('id', 'deposito-1')
    expect(data).toEqual(resultado.data)
  })

  it('rechaza borrar un depósito con stock asociado', async () => {
    const resultadoStock = {
      data: [{ id: 'stock-1' }],
      error: null,
    }

    const builderStock = {
      select: vi.fn(() => builderStock),
      eq: vi.fn(() => builderStock),
      limit: vi.fn(() => resultadoStock),
    }

    supabase.from.mockReturnValue(builderStock)

    await expect(deleteDeposito('deposito-1')).rejects.toMatchObject({
      status: 409,
      message: 'El depósito tiene stock asociado y no puede eliminarse',
    })
  })

  it('borra un depósito cuando no tiene stock asociado', async () => {
    const resultadoStock = {
      data: [],
      error: null,
    }

    const builderStock = {
      select: vi.fn(() => builderStock),
      eq: vi.fn(() => builderStock),
      limit: vi.fn(() => resultadoStock),
    }

    const builderDelete = {
      delete: vi.fn(() => builderDelete),
      eq: vi.fn(() => ({
        error: null,
      })),
    }

    supabase.from
      .mockReturnValueOnce(builderStock)
      .mockReturnValueOnce(builderDelete)

    await expect(deleteDeposito('deposito-1')).resolves.toBeUndefined()

    expect(supabase.from).toHaveBeenNthCalledWith(1, 'stock_x_deposito')
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'depositos')
    expect(builderDelete.eq).toHaveBeenCalledWith('id', 'deposito-1')
  })
})