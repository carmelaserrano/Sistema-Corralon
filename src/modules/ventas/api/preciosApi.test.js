import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabaseClient'
import {
  asignarListaATipo,
  crearListaPrecio,
  desactivarListaPrecio,
  editarListaPrecio,
  guardarPrecio,
  listarListasPrecio,
  listarProductosConPrecio,
  listarTiposCliente,
  puedeGestionarPrecios,
} from './preciosApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const listaGeneral = {
  id: 'lista-1',
  nombre: 'General',
  activo: true,
  created_at: '2026-09-01T10:00:00Z',
}

describe('preciosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista las listas de precios ordenadas por nombre', async () => {
    const builder = crearQueryBuilder({ data: [listaGeneral], error: null })
    supabase.from.mockReturnValue(builder)

    await expect(listarListasPrecio()).resolves.toEqual([listaGeneral])

    expect(supabase.from).toHaveBeenCalledWith('listas_precio')
    expect(builder.order).toHaveBeenCalledWith('nombre')
  })

  it('crea una lista con el nombre sin espacios extremos', async () => {
    const builder = crearQueryBuilder({ data: listaGeneral, error: null })
    supabase.from.mockReturnValue(builder)

    await expect(crearListaPrecio('  General  ')).resolves.toEqual(listaGeneral)

    expect(builder.insert).toHaveBeenCalledWith({ nombre: 'General' })
  })

  it('informa un mensaje comprensible cuando el nombre está duplicado', async () => {
    supabase.from.mockReturnValue(
      crearQueryBuilder({ data: null, error: { code: '23505' } }),
    )

    await expect(crearListaPrecio('General')).rejects.toMatchObject({
      status: 409,
      message: 'Ya existe una lista de precios con ese nombre',
    })
  })

  it('edita el nombre de una lista', async () => {
    const builder = crearQueryBuilder({
      data: { ...listaGeneral, nombre: 'Minorista' },
      error: null,
    })
    supabase.from.mockReturnValue(builder)

    await editarListaPrecio('lista-1', { nombre: ' Minorista ' })

    expect(builder.update).toHaveBeenCalledWith({ nombre: 'Minorista' })
    expect(builder.eq).toHaveBeenCalledWith('id', 'lista-1')
  })

  it('desactiva una lista mediante baja lógica sin invocar delete', async () => {
    const builder = crearQueryBuilder({
      data: { ...listaGeneral, activo: false },
      error: null,
    })
    supabase.from.mockReturnValue(builder)

    const resultado = await desactivarListaPrecio('lista-1')

    expect(builder.update).toHaveBeenCalledWith({ activo: false })
    expect(builder.delete).toBeUndefined()
    expect(resultado.activo).toBe(false)
  })

  it('lista todos los productos activos con el precio de la lista', async () => {
    const productosBuilder = crearQueryBuilder({
      data: [
        { id: 'p1', sku: 'CEM-01', nombre: 'Cemento' },
        { id: 'p2', sku: 'CAL-01', nombre: 'Cal' },
      ],
      error: null,
    })
    const preciosBuilder = crearQueryBuilder({
      data: [
        {
          id: 'precio-1',
          lista_precio_id: 'lista-1',
          producto_id: 'p1',
          precio: 8500,
        },
      ],
      error: null,
    })
    supabase.from
      .mockReturnValueOnce(productosBuilder)
      .mockReturnValueOnce(preciosBuilder)

    const resultado = await listarProductosConPrecio('lista-1')

    expect(productosBuilder.eq).toHaveBeenCalledWith(
      'estado_producto',
      'activo',
    )
    expect(preciosBuilder.eq).toHaveBeenCalledWith(
      'lista_precio_id',
      'lista-1',
    )
    expect(resultado[0]).toMatchObject({
      id: 'p1',
      precio_id: 'precio-1',
      precio: 8500,
    })
  })

  it('marca con precio null al producto activo que no tiene precio', async () => {
    supabase.from
      .mockReturnValueOnce(
        crearQueryBuilder({
          data: [{ id: 'p2', sku: 'CAL-01', nombre: 'Cal' }],
          error: null,
        }),
      )
      .mockReturnValueOnce(crearQueryBuilder({ data: [], error: null }))

    await expect(
      listarProductosConPrecio('lista-1'),
    ).resolves.toEqual([
      {
        id: 'p2',
        sku: 'CAL-01',
        nombre: 'Cal',
        precio_id: null,
        precio: null,
      },
    ])
  })

  it.each([0, -1, ''])('rechaza el precio no positivo %j', async (precio) => {
    await expect(
      guardarPrecio('lista-1', 'p1', precio),
    ).rejects.toMatchObject({
      status: 400,
      message: 'El precio debe ser mayor a 0',
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('guarda un precio válido con upsert por lista y producto', async () => {
    const precioGuardado = {
      id: 'precio-1',
      lista_precio_id: 'lista-1',
      producto_id: 'p1',
      precio: 9200.5,
    }
    const builder = crearQueryBuilder({ data: precioGuardado, error: null })
    supabase.from.mockReturnValue(builder)

    await expect(
      guardarPrecio('lista-1', 'p1', '9200.50'),
    ).resolves.toEqual(precioGuardado)

    expect(builder.upsert).toHaveBeenCalledWith(
      {
        lista_precio_id: 'lista-1',
        producto_id: 'p1',
        precio: 9200.5,
      },
      { onConflict: 'lista_precio_id,producto_id' },
    )
  })

  it('asigna una lista activa a un tipo de cliente', async () => {
    const listaBuilder = crearQueryBuilder({
      data: { id: 'lista-1' },
      error: null,
    })
    const tipoActualizado = {
      id: 'tipo-1',
      nombre: 'Mayorista',
      lista_precio_id: 'lista-1',
      activo: true,
    }
    const tipoBuilder = crearQueryBuilder({
      data: tipoActualizado,
      error: null,
    })
    supabase.from
      .mockReturnValueOnce(listaBuilder)
      .mockReturnValueOnce(tipoBuilder)

    await expect(
      asignarListaATipo('tipo-1', 'lista-1'),
    ).resolves.toEqual(tipoActualizado)

    expect(listaBuilder.eq).toHaveBeenCalledWith('activo', true)
    expect(tipoBuilder.update).toHaveBeenCalledWith({
      lista_precio_id: 'lista-1',
    })
  })

  it('rechaza la asignación de una lista inactiva', async () => {
    supabase.from.mockReturnValue(
      crearQueryBuilder({ data: null, error: { code: 'PGRST116' } }),
    )

    await expect(
      asignarListaATipo('tipo-1', 'lista-inactiva'),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Elegí una lista de precios activa',
    })
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('propaga el error de Supabase al validar la lista asignable', async () => {
    const errorSupabase = { code: '08006', message: 'connection failure' }
    supabase.from.mockReturnValue(
      crearQueryBuilder({ data: null, error: errorSupabase }),
    )

    await expect(
      asignarListaATipo('tipo-1', 'lista-1'),
    ).rejects.toEqual(errorSupabase)
  })

  it('propaga correctamente un error no traducido de Supabase', async () => {
    const errorSupabase = { code: '08006', message: 'connection failure' }
    supabase.from.mockReturnValue(
      crearQueryBuilder({ data: null, error: errorSupabase }),
    )

    await expect(listarListasPrecio()).rejects.toEqual(errorSupabase)
  })

  it('lista los tipos de cliente activos', async () => {
    const builder = crearQueryBuilder({ data: [], error: null })
    supabase.from.mockReturnValue(builder)

    await listarTiposCliente()

    expect(builder.eq).toHaveBeenCalledWith('activo', true)
  })

  it('consulta el permiso precios.gestionar', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null })

    await expect(puedeGestionarPrecios()).resolves.toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
      p_nombre: 'precios.gestionar',
    })
  })
})
