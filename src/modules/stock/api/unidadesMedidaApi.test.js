import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getUnidadesMedida,
  createUnidadMedida,
  updateUnidadMedida,
  setEstadoUnidadMedida,
} from './unidadesMedidaApi'
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
    ilike: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const unidadValida = {
  nombre: 'Bolsa',
  abreviatura: 'bol',
  factor_conversion: 1,
  unidad_base_id: '',
}

describe('unidadesMedidaApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getUnidadesMedida', () => {
    it('devuelve las unidades ordenadas por nombre', async () => {
      const unidadesMock = [
        { id: '1', nombre: 'Bolsa', abreviatura: 'bol', factor_conversion: 1 },
        { id: '2', nombre: 'Kilogramo', abreviatura: 'kg', factor_conversion: 1 },
      ]
      const builder = crearQueryBuilder({ data: unidadesMock, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await getUnidadesMedida()

      expect(supabase.from).toHaveBeenCalledWith('unidades_medida')
      expect(builder.order).toHaveBeenCalledWith('nombre')
      expect(resultado).toEqual(unidadesMock)
    })

    it('filtra por activas cuando se pide soloActivas', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getUnidadesMedida({ soloActivas: true })

      expect(builder.eq).toHaveBeenCalledWith('activo', true)
    })

    it('aplica el buscador por nombre cuando se pasa search', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getUnidadesMedida({ search: '  bol  ' })

      expect(builder.ilike).toHaveBeenCalledWith('nombre', '%bol%')
    })

    it('no aplica el buscador cuando search viene vacío', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getUnidadesMedida({ search: '  ' })

      expect(builder.ilike).not.toHaveBeenCalled()
    })

    it('lanza el error cuando Supabase devuelve un error', async () => {
      const errorMock = { message: 'no se pudo conectar con la base' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(getUnidadesMedida()).rejects.toEqual(errorMock)
    })
  })

  describe('createUnidadMedida', () => {
    it('crea la unidad y normaliza los datos enviados', async () => {
      const creada = { id: '1', nombre: 'Bolsa', abreviatura: 'bol' }
      const builder = crearQueryBuilder({ data: creada, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await createUnidadMedida({
        nombre: '  Bolsa  ',
        abreviatura: '  bol  ',
        factor_conversion: '1',
        unidad_base_id: '',
      })

      expect(builder.insert).toHaveBeenCalledWith({
        nombre: 'Bolsa',
        abreviatura: 'bol',
        factor_conversion: 1,
        unidad_base_id: null,
      })
      expect(resultado).toEqual(creada)
    })

    it('manda la unidad base cuando se elige una', async () => {
      const builder = crearQueryBuilder({ data: {}, error: null })
      supabase.from.mockReturnValue(builder)

      await createUnidadMedida({
        ...unidadValida,
        nombre: 'Pallet',
        factor_conversion: 40,
        unidad_base_id: 'uuid-bolsa',
      })

      expect(builder.insert).toHaveBeenCalledWith({
        nombre: 'Pallet',
        abreviatura: 'bol',
        factor_conversion: 40,
        unidad_base_id: 'uuid-bolsa',
      })
    })

    it('rechaza con 400 cuando falta el nombre', async () => {
      await expect(
        createUnidadMedida({ ...unidadValida, nombre: '' }),
      ).rejects.toMatchObject({ status: 400, message: 'El nombre es obligatorio' })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza con 400 cuando falta la abreviatura', async () => {
      await expect(
        createUnidadMedida({ ...unidadValida, abreviatura: '   ' }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'La abreviatura es obligatoria',
      })
    })

    it('rechaza con 400 cuando el factor de conversión es 0', async () => {
      await expect(
        createUnidadMedida({ ...unidadValida, factor_conversion: 0 }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'El factor de conversión debe ser mayor a 0',
      })
    })

    it('rechaza con 400 cuando el factor de conversión es negativo', async () => {
      await expect(
        createUnidadMedida({ ...unidadValida, factor_conversion: -5 }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('rechaza con 400 cuando el factor de conversión viene vacío', async () => {
      await expect(
        createUnidadMedida({ ...unidadValida, factor_conversion: '' }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('rechaza con 400 cuando el factor de conversión no es un número', async () => {
      await expect(
        createUnidadMedida({ ...unidadValida, factor_conversion: 'mucho' }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('rechaza con 409 cuando el nombre ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(createUnidadMedida(unidadValida)).rejects.toMatchObject({
        status: 409,
        message: 'Ya existe una unidad de medida con ese nombre',
      })
    })

    it('rechaza con 422 cuando la unidad base no existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23503' } }),
      )

      await expect(
        createUnidadMedida({ ...unidadValida, unidad_base_id: 'uuid-inexistente' }),
      ).rejects.toMatchObject({
        status: 422,
        message: 'La unidad base referenciada no existe',
      })
    })

    it('traduce el check de autoreferencia a 400', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: {
            code: '23514',
            message: 'violates check constraint "unidades_medida_base_distinta"',
          },
        }),
      )

      await expect(createUnidadMedida(unidadValida)).rejects.toMatchObject({
        status: 400,
        message: 'Una unidad no puede ser su propia unidad base',
      })
    })

    it('traduce cualquier otro check a 400 por factor de conversión', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: {
            code: '23514',
            message: 'violates check constraint "unidades_medida_factor_positivo"',
          },
        }),
      )

      await expect(createUnidadMedida(unidadValida)).rejects.toMatchObject({
        status: 400,
        message: 'El factor de conversión debe ser mayor a 0',
      })
    })

    it('propaga cualquier otro error de Supabase sin traducirlo', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(createUnidadMedida(unidadValida)).rejects.toEqual(errorMock)
    })
  })

  describe('updateUnidadMedida', () => {
    it('actualiza la unidad', async () => {
      const actualizada = { id: '1', nombre: 'Bolsa 50kg' }
      const builder = crearQueryBuilder({ data: actualizada, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await updateUnidadMedida('1', {
        ...unidadValida,
        nombre: 'Bolsa 50kg',
      })

      expect(builder.eq).toHaveBeenCalledWith('id', '1')
      expect(resultado).toEqual(actualizada)
    })

    it('incluye el estado activo cuando se pasa', async () => {
      const builder = crearQueryBuilder({ data: {}, error: null })
      supabase.from.mockReturnValue(builder)

      await updateUnidadMedida('1', { ...unidadValida, activo: false })

      expect(builder.update).toHaveBeenCalledWith({
        nombre: 'Bolsa',
        abreviatura: 'bol',
        factor_conversion: 1,
        unidad_base_id: null,
        activo: false,
      })
    })

    it('rechaza con 400 si la unidad se elige a sí misma como base', async () => {
      await expect(
        updateUnidadMedida('1', { ...unidadValida, unidad_base_id: '1' }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Una unidad no puede ser su propia unidad base',
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza con 400 cuando falta el nombre', async () => {
      await expect(
        updateUnidadMedida('1', { ...unidadValida, nombre: '' }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('rechaza con 409 cuando el nombre nuevo ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(
        updateUnidadMedida('1', unidadValida),
      ).rejects.toMatchObject({ status: 409 })
    })
  })

  describe('setEstadoUnidadMedida', () => {
    it('desactiva la unidad', async () => {
      const builder = crearQueryBuilder({
        data: { id: '1', activo: false },
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const resultado = await setEstadoUnidadMedida('1', false)

      expect(builder.update).toHaveBeenCalledWith({ activo: false })
      expect(builder.eq).toHaveBeenCalledWith('id', '1')
      expect(resultado).toEqual({ id: '1', activo: false })
    })

    it('lanza el error cuando Supabase falla', async () => {
      const errorMock = { message: 'no se pudo actualizar' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(setEstadoUnidadMedida('1', true)).rejects.toEqual(errorMock)
    })
  })
})
