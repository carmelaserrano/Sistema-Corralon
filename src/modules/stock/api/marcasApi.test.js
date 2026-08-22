import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getMarcas,
  createMarca,
  updateMarca,
  deleteMarca,
  contarArticulosDeMarca,
} from './marcasApi'
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

describe('marcasApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getMarcas', () => {
    it('devuelve las marcas ordenadas por nombre', async () => {
      const marcasMock = [
        { id: '1', nombre: 'Acindar', activo: true },
        { id: '2', nombre: 'Loma Negra', activo: true },
      ]
      const builder = crearQueryBuilder({ data: marcasMock, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await getMarcas()

      expect(supabase.from).toHaveBeenCalledWith('marcas')
      expect(builder.order).toHaveBeenCalledWith('nombre')
      expect(resultado).toEqual(marcasMock)
    })

    it('filtra por activas cuando se pide soloActivas', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getMarcas({ soloActivas: true })

      expect(builder.eq).toHaveBeenCalledWith('activo', true)
    })

    it('aplica el buscador por nombre cuando se pasa search', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getMarcas({ search: '  loma  ' })

      expect(builder.ilike).toHaveBeenCalledWith('nombre', '%loma%')
    })

    it('no aplica el buscador cuando search viene vacío', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getMarcas({ search: '   ' })

      expect(builder.ilike).not.toHaveBeenCalled()
    })

    it('lanza el error cuando Supabase devuelve un error', async () => {
      const errorMock = { message: 'no se pudo conectar con la base' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(getMarcas()).rejects.toEqual(errorMock)
    })
  })

  describe('createMarca', () => {
    it('crea la marca y devuelve la fila creada', async () => {
      const creada = { id: '1', nombre: 'Loma Negra', activo: true }
      const builder = crearQueryBuilder({ data: creada, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await createMarca({ nombre: '  Loma Negra  ' })

      expect(builder.insert).toHaveBeenCalledWith({ nombre: 'Loma Negra' })
      expect(resultado).toEqual(creada)
    })

    it('rechaza con 400 cuando falta el nombre', async () => {
      await expect(createMarca({ nombre: '' })).rejects.toMatchObject({
        status: 400,
        message: 'El nombre es obligatorio',
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza con 400 cuando el nombre son solo espacios', async () => {
      await expect(createMarca({ nombre: '   ' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza con 409 cuando el nombre ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(createMarca({ nombre: 'Loma Negra' })).rejects.toMatchObject({
        status: 409,
        message: 'Ya existe una marca con ese nombre',
      })
    })

    it('propaga cualquier otro error de Supabase sin traducirlo', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(createMarca({ nombre: 'Loma Negra' })).rejects.toEqual(
        errorMock,
      )
    })
  })

  describe('updateMarca', () => {
    it('actualiza el nombre de la marca', async () => {
      const actualizada = { id: '1', nombre: 'Loma Negra SA', activo: true }
      const builder = crearQueryBuilder({ data: actualizada, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await updateMarca('1', { nombre: 'Loma Negra SA' })

      expect(builder.update).toHaveBeenCalledWith({ nombre: 'Loma Negra SA' })
      expect(builder.eq).toHaveBeenCalledWith('id', '1')
      expect(resultado).toEqual(actualizada)
    })

    it('incluye el estado activo cuando se pasa', async () => {
      const builder = crearQueryBuilder({ data: {}, error: null })
      supabase.from.mockReturnValue(builder)

      await updateMarca('1', { nombre: 'Acindar', activo: false })

      expect(builder.update).toHaveBeenCalledWith({
        nombre: 'Acindar',
        activo: false,
      })
    })

    it('rechaza con 400 cuando falta el nombre', async () => {
      await expect(updateMarca('1', { nombre: '' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza con 409 cuando el nombre nuevo ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(updateMarca('1', { nombre: 'Acindar' })).rejects.toMatchObject(
        { status: 409 },
      )
    })
  })

  describe('contarArticulosDeMarca', () => {
    it('devuelve la cantidad de artículos que usan la marca', async () => {
      const builder = crearQueryBuilder({ count: 5, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await contarArticulosDeMarca('1')

      expect(supabase.from).toHaveBeenCalledWith('productos')
      expect(builder.eq).toHaveBeenCalledWith('marca_id', '1')
      expect(resultado).toBe(5)
    })

    it('devuelve 0 cuando Supabase no informa count', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ count: null, error: null }),
      )

      await expect(contarArticulosDeMarca('1')).resolves.toBe(0)
    })

    it('lanza el error cuando falla el conteo', async () => {
      const errorMock = { message: 'error al contar' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ count: null, error: errorMock }),
      )

      await expect(contarArticulosDeMarca('1')).rejects.toEqual(errorMock)
    })
  })

  describe('deleteMarca', () => {
    it('elimina la marca cuando no tiene artículos asociados', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderDelete = crearQueryBuilder({ error: null })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderDelete)

      await expect(deleteMarca('1')).resolves.toBeUndefined()

      expect(builderDelete.delete).toHaveBeenCalled()
      expect(builderDelete.eq).toHaveBeenCalledWith('id', '1')
    })

    it('rechaza con 409 e informa el total cuando hay varios artículos', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ count: 4, error: null }))

      await expect(deleteMarca('1')).rejects.toMatchObject({
        status: 409,
        message: 'No se puede eliminar: 4 artículos usan esta marca',
      })
    })

    it('usa el singular cuando hay un solo artículo', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ count: 1, error: null }))

      await expect(deleteMarca('1')).rejects.toMatchObject({
        message: 'No se puede eliminar: 1 artículo usa esta marca',
      })
    })

    it('rechaza con 409 si la FK frena el delete pese al conteo en cero', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderDelete = crearQueryBuilder({ error: { code: '23503' } })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderDelete)

      await expect(deleteMarca('1')).rejects.toMatchObject({
        status: 409,
        message: 'No se puede eliminar: hay artículos que usan esta marca',
      })
    })

    it('propaga cualquier otro error del delete', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from
        .mockReturnValueOnce(crearQueryBuilder({ count: 0, error: null }))
        .mockReturnValueOnce(crearQueryBuilder({ error: errorMock }))

      await expect(deleteMarca('1')).rejects.toEqual(errorMock)
    })
  })
})
