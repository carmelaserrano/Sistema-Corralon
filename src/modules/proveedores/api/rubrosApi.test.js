import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getRubros,
  contarProveedoresDeRubro,
  createRubro,
  updateRubro,
  darDeBajaRubro,
  reactivarRubro,
  puedeGestionarRubros,
} from './rubrosApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

// Imita el query builder de supabase-js: cada filtro devuelve el mismo
// builder, y el builder es "thenable" para poder await-earlo directo
// (como hace el conteo con head: true, que no termina en .single()).
function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const filaCemento = {
  id: 'r1',
  nombre: 'Cemento',
  activo: true,
  created_at: '2026-09-02T10:00:00Z',
  created_by: 'u1',
  updated_at: '2026-09-02T10:00:00Z',
  updated_by: null,
  proveedor_rubro: [{ count: 2 }],
}

describe('rubrosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getRubros', () => {
    it('devuelve los rubros ordenados alfabéticamente con su cantidad de proveedores', async () => {
      const builder = crearQueryBuilder({
        data: [
          filaCemento,
          { ...filaCemento, id: 'r2', nombre: 'Hierros', proveedor_rubro: [] },
        ],
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const resultado = await getRubros()

      expect(supabase.from).toHaveBeenCalledWith('rubros_proveedor')
      expect(builder.order).toHaveBeenCalledWith('nombre')
      expect(resultado[0].nombre).toBe('Cemento')
      expect(resultado[0].proveedores_asociados).toBe(2)
      expect(resultado[1].proveedores_asociados).toBe(0)
    })

    it('no expone la forma cruda del conteo embebido', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: [filaCemento], error: null }),
      )

      const [rubro] = await getRubros()

      expect(rubro.proveedor_rubro).toBeUndefined()
    })

    it('filtra los dados de baja por defecto', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getRubros()

      expect(builder.eq).toHaveBeenCalledWith('activo', true)
    })

    it('incluye los inactivos cuando se pide soloActivos false', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getRubros({ soloActivos: false })

      expect(builder.eq).not.toHaveBeenCalled()
    })

    it('aplica el buscador por nombre', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getRubros({ search: '  cemen  ' })

      expect(builder.ilike).toHaveBeenCalledWith('nombre', '%cemen%')
    })

    it('no aplica el buscador cuando search viene vacío', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getRubros({ search: '   ' })

      expect(builder.ilike).not.toHaveBeenCalled()
    })

    it('tolera que Supabase devuelva data en null', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: null }),
      )

      await expect(getRubros()).resolves.toEqual([])
    })

    it('lanza el error cuando Supabase falla', async () => {
      const errorMock = { message: 'no se pudo conectar con la base' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(getRubros()).rejects.toEqual(errorMock)
    })
  })

  describe('contarProveedoresDeRubro', () => {
    it('cuenta sobre la tabla de asociación', async () => {
      const builder = crearQueryBuilder({ count: 3, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await contarProveedoresDeRubro('r1')

      expect(supabase.from).toHaveBeenCalledWith('proveedor_rubro')
      expect(builder.eq).toHaveBeenCalledWith('rubro_id', 'r1')
      expect(resultado).toBe(3)
    })

    it('devuelve 0 cuando Supabase no informa count', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ count: null, error: null }),
      )

      await expect(contarProveedoresDeRubro('r1')).resolves.toBe(0)
    })

    it('lanza el error cuando falla el conteo', async () => {
      const errorMock = { message: 'error al contar' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ count: null, error: errorMock }),
      )

      await expect(contarProveedoresDeRubro('r1')).rejects.toEqual(errorMock)
    })
  })

  describe('createRubro', () => {
    it('crea el rubro sin espacios extremos y devuelve el conteo aplanado', async () => {
      const builder = crearQueryBuilder({ data: filaCemento, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await createRubro({ nombre: '  Cemento  ' })

      expect(builder.insert).toHaveBeenCalledWith({ nombre: 'Cemento' })
      expect(resultado.proveedores_asociados).toBe(2)
    })

    it('rechaza con 400 cuando el nombre está vacío', async () => {
      await expect(createRubro({ nombre: '' })).rejects.toMatchObject({
        status: 400,
        message: 'El nombre es obligatorio',
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza con 400 cuando el nombre son solo espacios', async () => {
      await expect(createRubro({ nombre: '   ' })).rejects.toMatchObject({
        status: 400,
        message: 'El nombre es obligatorio',
      })
    })

    it('rechaza con 409 cuando el nombre ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(createRubro({ nombre: 'Cemento' })).rejects.toMatchObject({
        status: 409,
        message: 'Ya existe un rubro con ese nombre',
      })
    })

    it('traduce a 403 el INSERT que la RLS deja sin filas', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: 'PGRST116' } }),
      )

      await expect(createRubro({ nombre: 'Cemento' })).rejects.toMatchObject({
        status: 403,
        message:
          'No se pudo guardar el rubro: no existe o no tenés permiso para modificarlo',
      })
    })

    it('propaga cualquier otro error sin traducirlo', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(createRubro({ nombre: 'Cemento' })).rejects.toEqual(errorMock)
    })
  })

  describe('updateRubro', () => {
    it('actualiza el nombre del rubro', async () => {
      const builder = crearQueryBuilder({ data: filaCemento, error: null })
      supabase.from.mockReturnValue(builder)

      await updateRubro('r1', { nombre: '  Cementos y cales ' })

      expect(builder.update).toHaveBeenCalledWith({
        nombre: 'Cementos y cales',
      })
      expect(builder.eq).toHaveBeenCalledWith('id', 'r1')
    })

    it('rechaza con 400 cuando el nombre está vacío', async () => {
      await expect(updateRubro('r1', { nombre: '' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza con 409 cuando el nombre nuevo ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(
        updateRubro('r1', { nombre: 'Hierros' }),
      ).rejects.toMatchObject({ status: 409 })
    })

    it('traduce un uuid inválido a 404', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '22P02' } }),
      )

      await expect(
        updateRubro('no-es-uuid', { nombre: 'Cemento' }),
      ).rejects.toMatchObject({ status: 404, message: 'El rubro no existe' })
    })
  })

  describe('darDeBajaRubro', () => {
    it('da de baja lógica el rubro cuando no tiene proveedores', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderUpdate = crearQueryBuilder({
        data: { ...filaCemento, activo: false, proveedor_rubro: [] },
        error: null,
      })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderUpdate)

      const resultado = await darDeBajaRubro('r1')

      expect(builderUpdate.update).toHaveBeenCalledWith({ activo: false })
      expect(resultado.activo).toBe(false)
    })

    it('rechaza con 409 e informa el total cuando hay varios proveedores', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ count: 4, error: null }))

      await expect(darDeBajaRubro('r1')).rejects.toMatchObject({
        status: 409,
        message: 'No se puede eliminar el rubro: 4 proveedores lo usan',
      })
    })

    it('usa el singular cuando hay un solo proveedor', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ count: 1, error: null }))

      await expect(darDeBajaRubro('r1')).rejects.toMatchObject({
        message: 'No se puede eliminar el rubro: 1 proveedor lo usa',
      })
    })

    it('traduce a 409 el rechazo del trigger si el conteo quedó desactualizado', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderUpdate = crearQueryBuilder({
        data: null,
        error: {
          code: '23001',
          message: 'No se puede eliminar el rubro: 1 proveedor(es) lo utilizan',
        },
      })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderUpdate)

      await expect(darDeBajaRubro('r1')).rejects.toMatchObject({
        status: 409,
        message: 'No se puede eliminar el rubro: 1 proveedor(es) lo utilizan',
      })
    })

    it('usa un mensaje genérico si el trigger no informa detalle', async () => {
      supabase.from
        .mockReturnValueOnce(crearQueryBuilder({ count: 0, error: null }))
        .mockReturnValueOnce(
          crearQueryBuilder({ data: null, error: { code: '23001' } }),
        )

      await expect(darDeBajaRubro('r1')).rejects.toMatchObject({
        status: 409,
        message: 'No se puede eliminar un rubro en uso',
      })
    })
  })

  describe('reactivarRubro', () => {
    it('vuelve a activar el rubro', async () => {
      const builder = crearQueryBuilder({
        data: { ...filaCemento, activo: true },
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const resultado = await reactivarRubro('r1')

      expect(builder.update).toHaveBeenCalledWith({ activo: true })
      expect(resultado.activo).toBe(true)
    })

    it('propaga el error cuando Supabase falla', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(reactivarRubro('r1')).rejects.toEqual(errorMock)
    })
  })

  describe('puedeGestionarRubros', () => {
    it('consulta el permiso de gestión de rubros', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      await expect(puedeGestionarRubros()).resolves.toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'proveedores.rubros.gestionar',
      })
    })

    it('devuelve false cuando la función no responde true', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: null })

      await expect(puedeGestionarRubros()).resolves.toBe(false)
    })

    it('lanza el error cuando la consulta del permiso falla', async () => {
      const errorMock = { message: 'no se pudo verificar el permiso' }
      supabase.rpc.mockResolvedValue({ data: null, error: errorMock })

      await expect(puedeGestionarRubros()).rejects.toEqual(errorMock)
    })
  })
})
