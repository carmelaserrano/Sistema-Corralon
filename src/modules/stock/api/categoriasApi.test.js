import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCategorias,
  createCategoria,
  updateCategoria,
  deleteCategoria,
  contarArticulosDeCategoria,
} from './categoriasApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}))

// Imita el query builder de supabase-js: cada filtro devuelve el mismo
// builder, y el builder es "thenable" para poder await-earlo directo
// (como hace el delete, que no termina en .single() ni en .order()).
function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

describe('categoriasApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCategorias', () => {
    it('devuelve las categorías ordenadas por nombre', async () => {
      const categoriasMock = [
        { id: '1', nombre: 'Cementos', activo: true },
        { id: '2', nombre: 'Hierros', activo: true },
      ]
      const builder = crearQueryBuilder({ data: categoriasMock, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await getCategorias()

      expect(supabase.from).toHaveBeenCalledWith('categorias')
      expect(builder.order).toHaveBeenCalledWith('nombre')
      expect(resultado).toEqual(categoriasMock)
    })

    it('filtra por activas cuando se pide soloActivas', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getCategorias({ soloActivas: true })

      expect(builder.eq).toHaveBeenCalledWith('activo', true)
    })

    it('aplica el buscador por nombre cuando se pasa search', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getCategorias({ search: '  cemen  ' })

      expect(builder.ilike).toHaveBeenCalledWith('nombre', '%cemen%')
    })

    it('no aplica el buscador cuando search viene vacío', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getCategorias({ search: '   ' })

      expect(builder.ilike).not.toHaveBeenCalled()
    })

    it('lanza el error cuando Supabase devuelve un error', async () => {
      const errorMock = { message: 'no se pudo conectar con la base' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(getCategorias()).rejects.toEqual(errorMock)
    })
  })

  describe('createCategoria', () => {
    it('crea la categoría y devuelve la fila creada', async () => {
      const creada = { id: '1', nombre: 'Cementos', activo: true }
      const builder = crearQueryBuilder({ data: creada, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await createCategoria({ nombre: '  Cementos  ' })

      expect(builder.insert).toHaveBeenCalledWith({ nombre: 'Cementos' })
      expect(resultado).toEqual(creada)
    })

    it('rechaza con 400 cuando falta el nombre', async () => {
      await expect(createCategoria({ nombre: '' })).rejects.toMatchObject({
        status: 400,
        message: 'El nombre es obligatorio',
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza con 400 cuando el nombre son solo espacios', async () => {
      await expect(createCategoria({ nombre: '   ' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza con 409 cuando el nombre ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(
        createCategoria({ nombre: 'Cementos' }),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Ya existe una categoría con ese nombre',
      })
    })

    it('propaga cualquier otro error de Supabase sin traducirlo', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(createCategoria({ nombre: 'Cementos' })).rejects.toEqual(
        errorMock,
      )
    })
  })

  describe('updateCategoria', () => {
    it('actualiza el nombre de la categoría', async () => {
      const actualizada = { id: '1', nombre: 'Cementos y cales', activo: true }
      const builder = crearQueryBuilder({ data: actualizada, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await updateCategoria('1', {
        nombre: 'Cementos y cales',
      })

      expect(builder.update).toHaveBeenCalledWith({ nombre: 'Cementos y cales' })
      expect(builder.eq).toHaveBeenCalledWith('id', '1')
      expect(resultado).toEqual(actualizada)
    })

    it('incluye el estado activo cuando se pasa', async () => {
      const builder = crearQueryBuilder({ data: {}, error: null })
      supabase.from.mockReturnValue(builder)

      await updateCategoria('1', { nombre: 'Cementos', activo: false })

      expect(builder.update).toHaveBeenCalledWith({
        nombre: 'Cementos',
        activo: false,
      })
    })

    it('rechaza con 400 cuando falta el nombre', async () => {
      await expect(updateCategoria('1', { nombre: '' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza con 409 cuando el nombre nuevo ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(
        updateCategoria('1', { nombre: 'Hierros' }),
      ).rejects.toMatchObject({ status: 409 })
    })
  })

  describe('contarArticulosDeCategoria', () => {
    it('devuelve la cantidad de artículos que usan la categoría', async () => {
      const builder = crearQueryBuilder({ count: 3, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await contarArticulosDeCategoria('1')

      expect(supabase.from).toHaveBeenCalledWith('productos')
      expect(builder.eq).toHaveBeenCalledWith('categoria_id', '1')
      expect(resultado).toBe(3)
    })

    it('devuelve 0 cuando Supabase no informa count', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ count: null, error: null }),
      )

      await expect(contarArticulosDeCategoria('1')).resolves.toBe(0)
    })

    it('lanza el error cuando falla el conteo', async () => {
      const errorMock = { message: 'error al contar' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ count: null, error: errorMock }),
      )

      await expect(contarArticulosDeCategoria('1')).rejects.toEqual(errorMock)
    })
  })

  describe('deleteCategoria', () => {
    it('elimina la categoría cuando no tiene artículos asociados', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderDelete = crearQueryBuilder({ error: null })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderDelete)

      await expect(deleteCategoria('1')).resolves.toBeUndefined()

      expect(builderDelete.delete).toHaveBeenCalled()
      expect(builderDelete.eq).toHaveBeenCalledWith('id', '1')
    })

    it('rechaza con 409 e informa el total cuando hay varios artículos', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ count: 3, error: null }))

      await expect(deleteCategoria('1')).rejects.toMatchObject({
        status: 409,
        message: 'No se puede eliminar: 3 artículos usan esta categoría',
      })
    })

    it('usa el singular cuando hay un solo artículo', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ count: 1, error: null }))

      await expect(deleteCategoria('1')).rejects.toMatchObject({
        message: 'No se puede eliminar: 1 artículo usa esta categoría',
      })
    })

    it('rechaza con 409 si la FK frena el delete pese al conteo en cero', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderDelete = crearQueryBuilder({ error: { code: '23503' } })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderDelete)

      await expect(deleteCategoria('1')).rejects.toMatchObject({
        status: 409,
        message: 'No se puede eliminar: hay artículos que usan esta categoría',
      })
    })

    it('propaga cualquier otro error del delete', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from
        .mockReturnValueOnce(crearQueryBuilder({ count: 0, error: null }))
        .mockReturnValueOnce(crearQueryBuilder({ error: errorMock }))

      await expect(deleteCategoria('1')).rejects.toEqual(errorMock)
    })
  })
})
