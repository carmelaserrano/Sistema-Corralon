import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listarDomicilios,
  crearDomicilio,
  actualizarDomicilio,
  marcarPrincipal,
  darDeBaja,
} from './domiciliosApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(resultado)),
    maybeSingle: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const domicilioValido = {
  alias: 'Obra Tres Cerritos',
  calle: 'Av. Tavella',
  numero: '1200',
  localidad: 'Salta',
  provincia: 'Salta',
}

const filaDomicilio = {
  id: 'd1',
  cliente_id: 'c1',
  alias: 'Obra Tres Cerritos',
  calle: 'Av. Tavella',
  numero: '1200',
  localidad: 'Salta',
  provincia: 'Salta',
  codigo_postal: null,
  referencias: null,
  es_principal: true,
  activo: true,
}

describe('domiciliosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listarDomicilios', () => {
    // CA-01
    it('lista los domicilios activos con el principal primero', async () => {
      const builder = crearQueryBuilder({ data: [filaDomicilio], error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await listarDomicilios('c1')

      expect(supabase.from).toHaveBeenCalledWith('domicilios_cliente')
      expect(builder.eq).toHaveBeenCalledWith('cliente_id', 'c1')
      expect(builder.eq).toHaveBeenCalledWith('activo', true)
      expect(builder.order).toHaveBeenCalledWith('es_principal', {
        ascending: false,
      })
      expect(builder.order).toHaveBeenCalledWith('alias')
      expect(resultado).toEqual([filaDomicilio])
    })

    it('devuelve una lista vacía cuando no hay datos', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: null }),
      )

      await expect(listarDomicilios('c1')).resolves.toEqual([])
    })

    it('lanza el error cuando la consulta falla', async () => {
      const errorMock = { message: 'no se pudo conectar con la base' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(listarDomicilios('c1')).rejects.toEqual(errorMock)
    })
  })

  describe('crearDomicilio — validaciones (CA-02)', () => {
    it('rechaza sin alias', async () => {
      await expect(
        crearDomicilio('c1', { ...domicilioValido, alias: '  ' }),
      ).rejects.toMatchObject({ status: 400, campo: 'alias' })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza sin calle', async () => {
      await expect(
        crearDomicilio('c1', { ...domicilioValido, calle: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'calle' })
    })

    it('rechaza sin número', async () => {
      await expect(
        crearDomicilio('c1', { ...domicilioValido, numero: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'numero' })
    })

    it('rechaza sin localidad', async () => {
      await expect(
        crearDomicilio('c1', { ...domicilioValido, localidad: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'localidad' })
    })

    it('rechaza sin provincia', async () => {
      await expect(
        crearDomicilio('c1', { ...domicilioValido, provincia: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'provincia' })
    })
  })

  describe('crearDomicilio — alta', () => {
    // CA-04
    it('el primer domicilio del cliente queda como principal automáticamente', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderInsert = crearQueryBuilder({ data: filaDomicilio, error: null })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderInsert)

      await crearDomicilio('c1', domicilioValido)

      expect(builderInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ es_principal: true, cliente_id: 'c1' }),
      )
    })

    it('el segundo domicilio no queda como principal', async () => {
      const builderConteo = crearQueryBuilder({ count: 1, error: null })
      const builderInsert = crearQueryBuilder({
        data: { ...filaDomicilio, es_principal: false },
        error: null,
      })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderInsert)

      await crearDomicilio('c1', domicilioValido)

      expect(builderInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ es_principal: false }),
      )
    })

    it('normaliza los campos opcionales vacíos a null', async () => {
      const builderConteo = crearQueryBuilder({ count: 1, error: null })
      const builderInsert = crearQueryBuilder({ data: filaDomicilio, error: null })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderInsert)

      await crearDomicilio('c1', {
        ...domicilioValido,
        codigo_postal: '  ',
        referencias: '',
      })

      expect(builderInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ codigo_postal: null, referencias: null }),
      )
    })

    it('propaga el error si falla el conteo', async () => {
      const errorMock = { message: 'error al contar' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ count: null, error: errorMock }),
      )

      await expect(crearDomicilio('c1', domicilioValido)).rejects.toEqual(
        errorMock,
      )
    })

    // CA-06
    it('rechaza con 409 cuando el alias ya existe para el cliente', async () => {
      const builderConteo = crearQueryBuilder({ count: 1, error: null })
      const builderInsert = crearQueryBuilder({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "ux_domicilio_alias_activo"',
        },
      })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderInsert)

      await expect(
        crearDomicilio('c1', domicilioValido),
      ).rejects.toMatchObject({
        status: 409,
        campo: 'alias',
        message: 'Ya existe un domicilio con ese alias para este cliente',
      })
    })

    it('traduce el choque del índice de principal único', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderInsert = crearQueryBuilder({
        data: null,
        error: { code: '23505', message: 'ux_domicilio_principal' },
      })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderInsert)

      await expect(
        crearDomicilio('c1', domicilioValido),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Ya hay otro domicilio marcado como principal, intentá de nuevo',
      })
    })

    it('traduce cualquier otro duplicado con un mensaje genérico', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderInsert = crearQueryBuilder({
        data: null,
        error: { code: '23505', message: 'otro índice' },
      })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderInsert)

      await expect(
        crearDomicilio('c1', domicilioValido),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Ya existe un domicilio con esos datos',
      })
    })

    it('rechaza con 422 cuando el cliente no existe', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderInsert = crearQueryBuilder({
        data: null,
        error: { code: '23503' },
      })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderInsert)

      await expect(
        crearDomicilio('c1', domicilioValido),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('traduce a 403 el insert que la RLS deja sin filas', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const builderInsert = crearQueryBuilder({
        data: null,
        error: { code: 'PGRST116' },
      })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderInsert)

      await expect(
        crearDomicilio('c1', domicilioValido),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('propaga cualquier otro error sin traducirlo', async () => {
      const builderConteo = crearQueryBuilder({ count: 0, error: null })
      const errorMock = { code: '08006', message: 'connection failure' }
      const builderInsert = crearQueryBuilder({ data: null, error: errorMock })
      supabase.from
        .mockReturnValueOnce(builderConteo)
        .mockReturnValueOnce(builderInsert)

      await expect(crearDomicilio('c1', domicilioValido)).rejects.toEqual(
        errorMock,
      )
    })
  })

  describe('actualizarDomicilio', () => {
    it('actualiza los datos sin tocar es_principal ni activo', async () => {
      const builder = crearQueryBuilder({ data: filaDomicilio, error: null })
      supabase.from.mockReturnValue(builder)

      await actualizarDomicilio('d1', domicilioValido)

      expect(builder.eq).toHaveBeenCalledWith('id', 'd1')
      const payload = builder.update.mock.calls[0][0]
      expect(payload).not.toHaveProperty('es_principal')
      expect(payload).not.toHaveProperty('activo')
      expect(payload).not.toHaveProperty('cliente_id')
    })

    it('rechaza con 400 cuando falta un obligatorio', async () => {
      await expect(
        actualizarDomicilio('d1', { ...domicilioValido, calle: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'calle' })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza con 409 cuando el alias nuevo ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: { code: '23505', message: 'ux_domicilio_alias_activo' },
        }),
      )

      await expect(
        actualizarDomicilio('d1', domicilioValido),
      ).rejects.toMatchObject({ status: 409, campo: 'alias' })
    })

    it('traduce un uuid inválido a 404', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '22P02' } }),
      )

      await expect(
        actualizarDomicilio('no-es-uuid', domicilioValido),
      ).rejects.toMatchObject({ status: 404, message: 'El domicilio no existe' })
    })
  })

  describe('marcarPrincipal', () => {
    // CA-03
    it('desmarca al principal anterior y marca el nuevo', async () => {
      const builderLectura = crearQueryBuilder({
        data: { cliente_id: 'c1' },
        error: null,
      })
      const builderDesmarcar = crearQueryBuilder({ error: null })
      const builderMarcar = crearQueryBuilder({
        data: { ...filaDomicilio, id: 'd2', es_principal: true },
        error: null,
      })
      supabase.from
        .mockReturnValueOnce(builderLectura)
        .mockReturnValueOnce(builderDesmarcar)
        .mockReturnValueOnce(builderMarcar)

      const resultado = await marcarPrincipal('d2')

      expect(builderDesmarcar.update).toHaveBeenCalledWith({
        es_principal: false,
      })
      expect(builderDesmarcar.eq).toHaveBeenCalledWith('cliente_id', 'c1')
      expect(builderDesmarcar.eq).toHaveBeenCalledWith('es_principal', true)
      expect(builderDesmarcar.neq).toHaveBeenCalledWith('id', 'd2')

      expect(builderMarcar.update).toHaveBeenCalledWith({ es_principal: true })
      expect(builderMarcar.eq).toHaveBeenCalledWith('id', 'd2')

      expect(resultado.es_principal).toBe(true)
    })

    it('rechaza con 404 cuando el domicilio no existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: null }),
      )

      await expect(marcarPrincipal('no-existe')).rejects.toMatchObject({
        status: 404,
        message: 'El domicilio no existe',
      })
    })

    it('propaga el error de la lectura inicial', async () => {
      const errorMock = { message: 'error de conexión' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(marcarPrincipal('d1')).rejects.toEqual(errorMock)
    })

    it('propaga el error si falla el paso de desmarcar', async () => {
      const errorMock = { message: 'no se pudo desmarcar' }
      const builderLectura = crearQueryBuilder({
        data: { cliente_id: 'c1' },
        error: null,
      })
      const builderDesmarcar = crearQueryBuilder({ error: errorMock })
      supabase.from
        .mockReturnValueOnce(builderLectura)
        .mockReturnValueOnce(builderDesmarcar)

      await expect(marcarPrincipal('d2')).rejects.toEqual(errorMock)
    })

    it('traduce a 403 cuando la RLS deja el update sin filas', async () => {
      const builderLectura = crearQueryBuilder({
        data: { cliente_id: 'c1' },
        error: null,
      })
      const builderDesmarcar = crearQueryBuilder({ error: null })
      const builderMarcar = crearQueryBuilder({
        data: null,
        error: { code: 'PGRST116' },
      })
      supabase.from
        .mockReturnValueOnce(builderLectura)
        .mockReturnValueOnce(builderDesmarcar)
        .mockReturnValueOnce(builderMarcar)

      await expect(marcarPrincipal('d2')).rejects.toMatchObject({
        status: 403,
      })
    })
  })

  describe('darDeBaja', () => {
    // CA-05
    it('desactiva el domicilio y lo desmarca como principal', async () => {
      const builder = crearQueryBuilder({ data: { id: 'd1' }, error: null })
      supabase.from.mockReturnValue(builder)

      await expect(darDeBaja('d1')).resolves.toBeUndefined()

      expect(builder.update).toHaveBeenCalledWith({
        activo: false,
        es_principal: false,
      })
      expect(builder.eq).toHaveBeenCalledWith('id', 'd1')
    })

    it('traduce a 403 cuando la RLS deja el update sin filas', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: 'PGRST116' } }),
      )

      await expect(darDeBaja('d1')).rejects.toMatchObject({ status: 403 })
    })

    it('propaga cualquier otro error', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(darDeBaja('d1')).rejects.toEqual(errorMock)
    })
  })
})
