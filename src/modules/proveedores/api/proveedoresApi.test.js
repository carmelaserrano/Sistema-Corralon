import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CONDICIONES_FISCALES,
  createProveedor,
  getProveedores,
  puedeAltaProveedores,
} from './proveedoresApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

// Mismo helper que rubrosApi.test.js: imita el query builder de supabase-js,
// "thenable" para los casos que no terminan en .single()/.maybeSingle().
function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    maybeSingle: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const CUIT_VALIDO = '20-12345678-6'
const CUIT_NORMALIZADO = '20123456786'

const datosValidos = {
  razon_social: 'Corralón San Martín S.A.',
  cuit: CUIT_VALIDO,
  condicion_fiscal: 'responsable_inscripto',
}

const filaCorralon = {
  id: 'p1',
  razon_social: 'Corralón San Martín S.A.',
  cuit: CUIT_NORMALIZADO,
  condicion_fiscal: 'responsable_inscripto',
  estado: 'activo',
  created_at: '2026-09-03T10:00:00Z',
  proveedor_rubro: [],
}

describe('proveedoresApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('CONDICIONES_FISCALES', () => {
    it('ofrece las 4 opciones del criterio de aceptación', () => {
      expect(CONDICIONES_FISCALES.map((o) => o.value)).toEqual([
        'responsable_inscripto',
        'monotributista',
        'exento',
        'consumidor_final',
      ])
    })
  })

  describe('getProveedores', () => {
    it('lista ordenado por razón social y aplana el rubro embebido', async () => {
      const builder = crearQueryBuilder({
        data: [
          {
            ...filaCorralon,
            proveedor_rubro: [{ rubro: { id: 'r1', nombre: 'Cemento' } }],
          },
        ],
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const [proveedor] = await getProveedores()

      expect(supabase.from).toHaveBeenCalledWith('proveedores')
      expect(builder.order).toHaveBeenCalledWith('razon_social')
      expect(proveedor.rubro).toEqual({ id: 'r1', nombre: 'Cemento' })
      expect(proveedor.proveedor_rubro).toBeUndefined()
    })

    it('devuelve rubro null cuando no hay vínculo', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: [filaCorralon], error: null }),
      )

      const [proveedor] = await getProveedores()

      expect(proveedor.rubro).toBeNull()
    })

    it('filtra los inactivos por defecto', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getProveedores()

      expect(builder.eq).toHaveBeenCalledWith('estado', 'activo')
    })

    it('aplica el buscador por razón social', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await getProveedores({ search: '  corralón  ' })

      expect(builder.ilike).toHaveBeenCalledWith('razon_social', '%corralón%')
    })

    it('lanza el error cuando Supabase falla', async () => {
      const errorMock = { message: 'no se pudo conectar con la base' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(getProveedores()).rejects.toEqual(errorMock)
    })
  })

  describe('createProveedor', () => {
    // CA: Razón Social obligatoria
    it('rechaza con 400 cuando falta la razón social', async () => {
      await expect(
        createProveedor({ ...datosValidos, razon_social: '  ' }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'La Razón Social es obligatoria',
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    // CA: formato + dígito verificador de CUIT
    it('rechaza con 400 cuando el CUIT es inválido', async () => {
      await expect(
        createProveedor({ ...datosValidos, cuit: '20-12345678-0' }),
      ).rejects.toMatchObject({ status: 400, message: 'CUIT inválido' })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    // CA: Condición Fiscal obligatoria
    it('rechaza con 400 cuando falta la condición fiscal', async () => {
      await expect(
        createProveedor({ ...datosValidos, condicion_fiscal: '' }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'La condición fiscal es obligatoria',
      })
    })

    it('rechaza con 400 cuando el email tiene formato inválido', async () => {
      await expect(
        createProveedor({ ...datosValidos, email: 'no-es-un-email' }),
      ).rejects.toMatchObject({ status: 400 })
    })

    // CA: alta válida, estado activo por defecto, sin rubro
    it('crea el proveedor con el CUIT normalizado a 11 dígitos', async () => {
      const builder = crearQueryBuilder({ data: filaCorralon, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await createProveedor(datosValidos)

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          razon_social: 'Corralón San Martín S.A.',
          cuit: CUIT_NORMALIZADO,
          condicion_fiscal: 'responsable_inscripto',
        }),
      )
      expect(resultado.rubro).toBeNull()
      expect(resultado.estado).toBe('activo')
    })

    // CA: alta con rubro asociado
    it('vincula el rubro elegido y devuelve el proveedor con el rubro resuelto', async () => {
      const builderInsert = crearQueryBuilder({ data: filaCorralon, error: null })
      const builderVinculo = crearQueryBuilder({ error: null })
      const builderRefetch = crearQueryBuilder({
        data: {
          ...filaCorralon,
          proveedor_rubro: [{ rubro: { id: 'r1', nombre: 'Cemento' } }],
        },
        error: null,
      })
      supabase.from
        .mockReturnValueOnce(builderInsert)
        .mockReturnValueOnce(builderVinculo)
        .mockReturnValueOnce(builderRefetch)

      const resultado = await createProveedor(datosValidos, 'r1')

      expect(builderVinculo.insert).toHaveBeenCalledWith({
        proveedor_id: 'p1',
        rubro_id: 'r1',
      })
      expect(resultado.rubro).toEqual({ id: 'r1', nombre: 'Cemento' })
    })

    it('avisa si el proveedor se creó pero no se pudo vincular el rubro', async () => {
      const builderInsert = crearQueryBuilder({ data: filaCorralon, error: null })
      const builderVinculo = crearQueryBuilder({
        error: { message: 'foreign key violation' },
      })
      supabase.from
        .mockReturnValueOnce(builderInsert)
        .mockReturnValueOnce(builderVinculo)

      await expect(
        createProveedor(datosValidos, 'rubro-inexistente'),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('El proveedor se creó'),
      })
    })

    // CA: CUIT duplicado, con la razón social del proveedor existente
    it('rechaza con 409 e indica la razón social del proveedor existente', async () => {
      const builderInsert = crearQueryBuilder({
        data: null,
        error: { code: '23505' },
      })
      const builderBusqueda = crearQueryBuilder({
        data: { razon_social: 'Ferretería del Sur' },
        error: null,
      })
      supabase.from
        .mockReturnValueOnce(builderInsert)
        .mockReturnValueOnce(builderBusqueda)

      await expect(createProveedor(datosValidos)).rejects.toMatchObject({
        status: 409,
        message: 'Ya existe un proveedor con ese CUIT: Ferretería del Sur',
      })
    })

    it('usa un mensaje genérico si no puede resolver la razón social existente', async () => {
      const builderInsert = crearQueryBuilder({
        data: null,
        error: { code: '23505' },
      })
      const builderBusqueda = crearQueryBuilder({ data: null, error: null })
      supabase.from
        .mockReturnValueOnce(builderInsert)
        .mockReturnValueOnce(builderBusqueda)

      await expect(createProveedor(datosValidos)).rejects.toMatchObject({
        status: 409,
        message: 'Ya existe un proveedor con ese CUIT',
      })
    })

    it('traduce a 403 el INSERT que la RLS deja sin filas', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: 'PGRST116' } }),
      )

      await expect(createProveedor(datosValidos)).rejects.toMatchObject({
        status: 403,
        message:
          'No se pudo guardar el proveedor: no existe o no tenés permiso para modificarlo',
      })
    })

    it('traduce el check de condición fiscal a un mensaje legible', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: {
            code: '23514',
            message:
              'new row for relation "proveedores" violates check constraint "chk_proveedor_condicion_fiscal"',
          },
        }),
      )

      await expect(createProveedor(datosValidos)).rejects.toMatchObject({
        status: 400,
        message: 'La condición fiscal no es válida',
      })
    })

    it('propaga cualquier otro error sin traducirlo', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(createProveedor(datosValidos)).rejects.toEqual(errorMock)
    })
  })

  describe('puedeAltaProveedores', () => {
    it('consulta el permiso de alta de proveedores', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      await expect(puedeAltaProveedores()).resolves.toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'proveedores.alta',
      })
    })

    it('devuelve false cuando la función no responde true', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: null })

      await expect(puedeAltaProveedores()).resolves.toBe(false)
    })

    it('lanza el error cuando la consulta del permiso falla', async () => {
      const errorMock = { message: 'no se pudo verificar el permiso' }
      supabase.rpc.mockResolvedValue({ data: null, error: errorMock })

      await expect(puedeAltaProveedores()).rejects.toEqual(errorMock)
    })
  })
})
