import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createContacto,
  deleteContacto,
  getContactosDeProveedor,
  puedeGestionarContactos,
  updateContacto,
} from './contactosApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

// Mismo helper que el resto del módulo. `order` devuelve el builder porque
// getContactosDeProveedor encadena dos ordenamientos.
function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const contactoValido = {
  nombre: 'Juan Pérez',
  cargo: 'Encargado de ventas',
  telefono: '387-4001122',
  email: 'juan@corralon.com',
  principal: true,
}

const filaContacto = {
  id: 'c1',
  proveedor_id: 'p1',
  nombre: 'Juan Pérez',
  cargo: 'Encargado de ventas',
  telefono: '387-4001122',
  email: 'juan@corralon.com',
  principal: true,
  created_at: '2026-09-03T10:00:00Z',
}

describe('contactosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getContactosDeProveedor', () => {
    it('trae los contactos del proveedor con el principal primero', async () => {
      const builder = crearQueryBuilder({ data: [filaContacto], error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await getContactosDeProveedor('p1')

      expect(supabase.from).toHaveBeenCalledWith('contactos_proveedor')
      expect(builder.eq).toHaveBeenCalledWith('proveedor_id', 'p1')
      expect(builder.order).toHaveBeenCalledWith('principal', {
        ascending: false,
      })
      expect(builder.order).toHaveBeenCalledWith('nombre')
      expect(resultado).toEqual([filaContacto])
    })

    it('devuelve una lista vacía cuando el proveedor no tiene contactos', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: null }),
      )

      await expect(getContactosDeProveedor('p1')).resolves.toEqual([])
    })

    it('lanza el error cuando la consulta falla', async () => {
      const errorMock = { message: 'no se pudo leer los contactos' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(getContactosDeProveedor('p1')).rejects.toEqual(errorMock)
    })
  })

  describe('createContacto', () => {
    // CA 1 y 2
    it('agrega el contacto al proveedor con todos sus campos', async () => {
      const builder = crearQueryBuilder({ data: filaContacto, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await createContacto('p1', {
        ...contactoValido,
        nombre: '  Juan Pérez  ',
      })

      expect(builder.insert).toHaveBeenCalledWith({
        proveedor_id: 'p1',
        nombre: 'Juan Pérez',
        cargo: 'Encargado de ventas',
        telefono: '387-4001122',
        email: 'juan@corralon.com',
        principal: true,
      })
      expect(resultado).toEqual(filaContacto)
    })

    it('manda null en cargo y email cuando vienen vacíos', async () => {
      const builder = crearQueryBuilder({ data: filaContacto, error: null })
      supabase.from.mockReturnValue(builder)

      await createContacto('p1', {
        ...contactoValido,
        cargo: '   ',
        email: '',
        principal: false,
      })

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ cargo: null, email: null, principal: false }),
      )
    })

    it('rechaza con 400 cuando falta el proveedor', async () => {
      await expect(createContacto('', contactoValido)).rejects.toMatchObject({
        status: 400,
        message: 'El proveedor es obligatorio',
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza con 400 cuando falta el nombre', async () => {
      await expect(
        createContacto('p1', { ...contactoValido, nombre: '  ' }),
      ).rejects.toMatchObject({ status: 400, message: 'El nombre es obligatorio' })
    })

    // CA 4
    it('rechaza con 400 cuando falta el teléfono', async () => {
      await expect(
        createContacto('p1', { ...contactoValido, telefono: '' }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'El teléfono es obligatorio',
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    // CA 3
    it('rechaza con el mensaje exacto cuando el email es inválido', async () => {
      await expect(
        createContacto('p1', { ...contactoValido, email: 'juan@corralon' }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Formato de correo electrónico inválido',
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('acepta un contacto sin email', async () => {
      const builder = crearQueryBuilder({ data: filaContacto, error: null })
      supabase.from.mockReturnValue(builder)

      await expect(
        createContacto('p1', { ...contactoValido, email: '' }),
      ).resolves.toEqual(filaContacto)
    })

    it('traduce el check de email de la base al mismo mensaje', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: {
            code: '23514',
            message: 'violates check constraint "chk_contacto_email"',
          },
        }),
      )

      await expect(createContacto('p1', contactoValido)).rejects.toMatchObject({
        status: 400,
        message: 'Formato de correo electrónico inválido',
      })
    })

    it('traduce el check de teléfono de la base', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: {
            code: '23514',
            message: 'violates check constraint "chk_contacto_telefono"',
          },
        }),
      )

      await expect(createContacto('p1', contactoValido)).rejects.toMatchObject({
        message: 'El teléfono es obligatorio',
      })
    })

    it('traduce el check de nombre de la base', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: {
            code: '23514',
            message: 'violates check constraint "chk_contacto_nombre"',
          },
        }),
      )

      await expect(createContacto('p1', contactoValido)).rejects.toMatchObject({
        message: 'El nombre es obligatorio',
      })
    })

    it('usa un mensaje genérico para un check desconocido', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: { code: '23514', message: 'violates check constraint "otro"' },
        }),
      )

      await expect(createContacto('p1', contactoValido)).rejects.toMatchObject({
        status: 400,
        message:
          'Revisá los datos del contacto: no cumplen una validación del sistema',
      })
    })

    // CA 5: red de seguridad del índice parcial
    it('traduce a 409 el choque del índice de principal único', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23505' } }),
      )

      await expect(createContacto('p1', contactoValido)).rejects.toMatchObject({
        status: 409,
        message: 'Ese proveedor ya tiene otro contacto marcado como principal',
      })
    })

    it('traduce a 422 un proveedor inexistente', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23503' } }),
      )

      await expect(createContacto('p1', contactoValido)).rejects.toMatchObject({
        status: 422,
        message: 'El proveedor indicado no existe',
      })
    })

    it('traduce a 403 el INSERT que la RLS deja sin filas', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: 'PGRST116' } }),
      )

      await expect(createContacto('p1', contactoValido)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('propaga cualquier otro error', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(createContacto('p1', contactoValido)).rejects.toEqual(
        errorMock,
      )
    })
  })

  describe('updateContacto', () => {
    // CA 6
    it('actualiza el contacto sin tocar el proveedor', async () => {
      const builder = crearQueryBuilder({ data: filaContacto, error: null })
      supabase.from.mockReturnValue(builder)

      await updateContacto('c1', { ...contactoValido, cargo: 'Gerente' })

      expect(builder.eq).toHaveBeenCalledWith('id', 'c1')
      expect(builder.update).toHaveBeenCalledWith({
        nombre: 'Juan Pérez',
        cargo: 'Gerente',
        telefono: '387-4001122',
        email: 'juan@corralon.com',
        principal: true,
      })
      expect(builder.update.mock.calls[0][0]).not.toHaveProperty('proveedor_id')
    })

    it('rechaza con 400 cuando el email es inválido', async () => {
      await expect(
        updateContacto('c1', { ...contactoValido, email: 'roto@' }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Formato de correo electrónico inválido',
      })
    })

    it('rechaza con 400 cuando falta el teléfono', async () => {
      await expect(
        updateContacto('c1', { ...contactoValido, telefono: '   ' }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('traduce un uuid inválido a 404', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '22P02' } }),
      )

      await expect(
        updateContacto('no-es-uuid', contactoValido),
      ).rejects.toMatchObject({ status: 404, message: 'El contacto no existe' })
    })
  })

  describe('deleteContacto', () => {
    // CA 6
    it('elimina el contacto', async () => {
      const builder = crearQueryBuilder({ error: null })
      supabase.from.mockReturnValue(builder)

      await expect(deleteContacto('c1')).resolves.toBeUndefined()

      expect(builder.delete).toHaveBeenCalled()
      expect(builder.eq).toHaveBeenCalledWith('id', 'c1')
    })

    it('traduce a 403 el borrado que la RLS descarta', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ error: { code: 'PGRST116' } }),
      )

      await expect(deleteContacto('c1')).rejects.toMatchObject({ status: 403 })
    })

    it('propaga cualquier otro error', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(crearQueryBuilder({ error: errorMock }))

      await expect(deleteContacto('c1')).rejects.toEqual(errorMock)
    })
  })

  describe('puedeGestionarContactos', () => {
    it('consulta el permiso de modificación de proveedores', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      await expect(puedeGestionarContactos()).resolves.toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'proveedores.modificar',
      })
    })

    it('devuelve false cuando no lo tiene', async () => {
      supabase.rpc.mockResolvedValue({ data: false, error: null })

      await expect(puedeGestionarContactos()).resolves.toBe(false)
    })

    it('lanza el error cuando la consulta falla', async () => {
      const errorMock = { message: 'no se pudo verificar el permiso' }
      supabase.rpc.mockResolvedValue({ data: null, error: errorMock })

      await expect(puedeGestionarContactos()).rejects.toEqual(errorMock)
    })
  })
})
