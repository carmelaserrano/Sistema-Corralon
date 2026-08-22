import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getArticulos,
  getArticuloById,
  createArticulo,
  updateArticulo,
  setEstadoArticulo,
} from './articulosApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    maybeSingle: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

// Las tres verificaciones de referencia (categoría, marca, unidad) corren
// antes del insert. Este helper devuelve builders para esas tres llamadas
// y después el builder del insert/update.
function encolarReferenciasOk(builderFinal) {
  supabase.from
    .mockReturnValueOnce(crearQueryBuilder({ data: { id: 'cat' }, error: null }))
    .mockReturnValueOnce(crearQueryBuilder({ data: { id: 'mar' }, error: null }))
    .mockReturnValueOnce(crearQueryBuilder({ data: { id: 'uni' }, error: null }))
    .mockReturnValueOnce(builderFinal)
}

const articuloValido = {
  nombre: 'Cemento Portland x50kg',
  categoria_id: 'uuid-categoria',
  marca_id: 'uuid-marca',
  unidad_medida_id: 'uuid-unidad',
  codigo_barras: '7791234567890',
  descripcion: 'Bolsa de 50 kg',
}

describe('articulosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getArticulos', () => {
    it('devuelve los artículos con los datos de paginación', async () => {
      const articulosMock = [{ id: '1', nombre: 'Cemento' }]
      const builder = crearQueryBuilder({
        data: articulosMock,
        count: 25,
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const resultado = await getArticulos({ page: 2, pageSize: 10 })

      expect(supabase.from).toHaveBeenCalledWith('productos')
      expect(builder.range).toHaveBeenCalledWith(10, 19)
      expect(resultado).toEqual({
        articulos: articulosMock,
        total: 25,
        page: 2,
        pageSize: 10,
        totalPaginas: 3,
      })
    })

    it('devuelve al menos una página aunque no haya resultados', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: [], count: 0, error: null }),
      )

      const resultado = await getArticulos()

      expect(resultado.totalPaginas).toBe(1)
      expect(resultado.total).toBe(0)
    })

    it('tolera que Supabase no devuelva data ni count', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, count: null, error: null }),
      )

      const resultado = await getArticulos()

      expect(resultado.articulos).toEqual([])
      expect(resultado.total).toBe(0)
      expect(resultado.totalPaginas).toBe(1)
    })

    it('aplica los filtros de categoría, marca y estado', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await getArticulos({
        categoria_id: 'uuid-categoria',
        marca_id: 'uuid-marca',
        estado: 'activo',
      })

      expect(builder.eq).toHaveBeenCalledWith('categoria_id', 'uuid-categoria')
      expect(builder.eq).toHaveBeenCalledWith('marca_id', 'uuid-marca')
      expect(builder.eq).toHaveBeenCalledWith('estado_producto', 'activo')
    })

    it('busca por nombre, sku y código de barras', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await getArticulos({ search: '  cemento  ' })

      expect(builder.or).toHaveBeenCalledWith(
        'nombre.ilike.%cemento%,sku.ilike.%cemento%,codigo_barras.ilike.%cemento%',
      )
    })

    it('no aplica filtros cuando no se pasa ninguno', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await getArticulos()

      expect(builder.eq).not.toHaveBeenCalled()
      expect(builder.or).not.toHaveBeenCalled()
    })

    it('lanza el error cuando Supabase falla', async () => {
      const errorMock = { message: 'error de consulta' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, count: null, error: errorMock }),
      )

      await expect(getArticulos()).rejects.toEqual(errorMock)
    })
  })

  describe('getArticuloById', () => {
    it('devuelve el artículo cuando existe', async () => {
      const articulo = { id: '1', nombre: 'Cemento' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: articulo, error: null }),
      )

      await expect(getArticuloById('1')).resolves.toEqual(articulo)
    })

    it('rechaza con 404 cuando no existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: null }),
      )

      await expect(getArticuloById('1')).rejects.toMatchObject({
        status: 404,
        message: 'El artículo no existe',
      })
    })

    it('lanza el error cuando Supabase falla', async () => {
      const errorMock = { message: 'error de consulta' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(getArticuloById('1')).rejects.toEqual(errorMock)
    })
  })

  describe('createArticulo — validaciones 400', () => {
    it('rechaza cuando falta el nombre', async () => {
      await expect(
        createArticulo({ ...articuloValido, nombre: '  ' }),
      ).rejects.toMatchObject({ status: 400, message: 'El nombre es obligatorio' })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza cuando falta la categoría', async () => {
      await expect(
        createArticulo({ ...articuloValido, categoria_id: '' }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'La categoría es obligatoria',
      })
    })

    it('rechaza cuando falta la marca', async () => {
      await expect(
        createArticulo({ ...articuloValido, marca_id: '' }),
      ).rejects.toMatchObject({ status: 400, message: 'La marca es obligatoria' })
    })

    it('rechaza cuando falta la unidad de medida', async () => {
      await expect(
        createArticulo({ ...articuloValido, unidad_medida_id: '' }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'La unidad de medida es obligatoria',
      })
    })
  })

  describe('createArticulo — referencias 422', () => {
    it('rechaza con 422 cuando la categoría no existe o está inactiva', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: null }),
      )

      await expect(createArticulo(articuloValido)).rejects.toMatchObject({
        status: 422,
        message: 'La categoría seleccionada no existe o está inactiva',
      })
    })

    it('rechaza con 422 cuando la marca no existe o está inactiva', async () => {
      supabase.from
        .mockReturnValueOnce(
          crearQueryBuilder({ data: { id: 'cat' }, error: null }),
        )
        .mockReturnValueOnce(crearQueryBuilder({ data: null, error: null }))

      await expect(createArticulo(articuloValido)).rejects.toMatchObject({
        status: 422,
        message: 'La marca seleccionada no existe o está inactiva',
      })
    })

    it('rechaza con 422 cuando la unidad de medida está inactiva', async () => {
      supabase.from
        .mockReturnValueOnce(
          crearQueryBuilder({ data: { id: 'cat' }, error: null }),
        )
        .mockReturnValueOnce(
          crearQueryBuilder({ data: { id: 'mar' }, error: null }),
        )
        .mockReturnValueOnce(crearQueryBuilder({ data: null, error: null }))

      await expect(createArticulo(articuloValido)).rejects.toMatchObject({
        status: 422,
        message: 'La unidad de medida seleccionada no existe o está inactiva',
      })
    })

    it('traduce un uuid con formato inválido a 422', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '22P02' } }),
      )

      await expect(createArticulo(articuloValido)).rejects.toMatchObject({
        status: 422,
        message: 'La categoría seleccionada no existe',
      })
    })

    it('propaga otros errores de la verificación de referencias', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(createArticulo(articuloValido)).rejects.toEqual(errorMock)
    })
  })

  describe('createArticulo — alta', () => {
    it('crea el artículo con las referencias verificadas', async () => {
      const creado = { id: '1', sku: 'ART-000001', nombre: articuloValido.nombre }
      const builderInsert = crearQueryBuilder({ data: creado, error: null })
      encolarReferenciasOk(builderInsert)

      const resultado = await createArticulo(articuloValido)

      expect(builderInsert.insert).toHaveBeenCalledWith({
        nombre: 'Cemento Portland x50kg',
        descripcion: 'Bolsa de 50 kg',
        categoria_id: 'uuid-categoria',
        marca_id: 'uuid-marca',
        unidad_medida_id: 'uuid-unidad',
        codigo_barras: '7791234567890',
      })
      expect(resultado).toEqual(creado)
    })

    it('manda null cuando el código de barras y la descripción vienen vacíos', async () => {
      const builderInsert = crearQueryBuilder({ data: {}, error: null })
      encolarReferenciasOk(builderInsert)

      await createArticulo({
        ...articuloValido,
        codigo_barras: '   ',
        descripcion: '',
      })

      expect(builderInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ codigo_barras: null, descripcion: null }),
      )
    })

    it('rechaza con 409 cuando el código de barras ya existe', async () => {
      encolarReferenciasOk(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(createArticulo(articuloValido)).rejects.toMatchObject({
        status: 409,
        message: 'Ya existe un artículo con ese código de barras',
      })
    })

    it('traduce una FK violada del insert a 422', async () => {
      encolarReferenciasOk(
        crearQueryBuilder({ data: null, error: { code: '23503' } }),
      )

      await expect(createArticulo(articuloValido)).rejects.toMatchObject({
        status: 422,
      })
    })

    it('propaga cualquier otro error del insert', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      encolarReferenciasOk(crearQueryBuilder({ data: null, error: errorMock }))

      await expect(createArticulo(articuloValido)).rejects.toEqual(errorMock)
    })
  })

  describe('updateArticulo', () => {
    it('actualiza el artículo', async () => {
      const actualizado = { id: '1', nombre: 'Cemento Portland x25kg' }
      const builderUpdate = crearQueryBuilder({ data: actualizado, error: null })
      encolarReferenciasOk(builderUpdate)

      const resultado = await updateArticulo('1', articuloValido)

      expect(builderUpdate.eq).toHaveBeenCalledWith('id', '1')
      expect(resultado).toEqual(actualizado)
    })

    it('rechaza con 400 cuando falta el nombre', async () => {
      await expect(
        updateArticulo('1', { ...articuloValido, nombre: '' }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('rechaza con 409 cuando el código de barras es de otro artículo', async () => {
      encolarReferenciasOk(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(updateArticulo('1', articuloValido)).rejects.toMatchObject({
        status: 409,
      })
    })
  })

  describe('setEstadoArticulo', () => {
    it('cambia el estado a inactivo', async () => {
      const builder = crearQueryBuilder({
        data: { id: '1', estado_producto: 'inactivo' },
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const resultado = await setEstadoArticulo('1', 'inactivo')

      expect(builder.update).toHaveBeenCalledWith({
        estado_producto: 'inactivo',
      })
      expect(builder.eq).toHaveBeenCalledWith('id', '1')
      expect(resultado.estado_producto).toBe('inactivo')
    })

    it('rechaza con 400 un estado que no está permitido', async () => {
      await expect(
        setEstadoArticulo('1', 'descontinuado'),
      ).rejects.toMatchObject({
        status: 400,
        message: 'El estado debe ser "activo" o "inactivo"',
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('lanza el error cuando Supabase falla', async () => {
      const errorMock = { message: 'no se pudo actualizar' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(setEstadoArticulo('1', 'activo')).rejects.toEqual(errorMock)
    })
  })
})
