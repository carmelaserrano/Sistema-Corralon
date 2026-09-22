import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listarClientes,
  crearCliente,
  actualizarCliente,
  cambiarEstadoCliente,
  listarHistorialEstado,
  listarCondicionesIva,
  listarTiposCliente,
  puedeAltaClientes,
  puedeModificarClientes,
  puedeCambiarEstadoClientes,
} from './clientesApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const CUIT_VALIDO = '20-12345678-6'
const CUIT_NORMALIZADO = '20123456786'

const fisicaValida = {
  tipo_persona: 'fisica',
  nombre: 'Ana',
  apellido: 'Gómez',
  tipo_documento: 'DNI',
  numero_documento: '30111222',
  condicion_iva_id: 'uuid-iva',
  tipo_cliente_id: 'uuid-tipo',
  telefono: '387-4001122',
  email: 'ana@correo.com',
}

const juridicaValida = {
  tipo_persona: 'juridica',
  razon_social: 'Corralón San Martín S.A.',
  tipo_documento: 'CUIT',
  numero_documento: CUIT_VALIDO,
  condicion_iva_id: 'uuid-iva',
  tipo_cliente_id: 'uuid-tipo',
  telefono: '387-4001122',
}

const filaCliente = {
  id: 'c1',
  numero: 1,
  tipo_persona: 'fisica',
  nombre: 'Ana',
  apellido: 'Gómez',
  razon_social: null,
  tipo_documento: 'DNI',
  numero_documento: '30111222',
  estado: 'Activo',
  origen: 'Mostrador',
}

describe('clientesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listarClientes', () => {
    it('devuelve los clientes con los datos de paginación', async () => {
      const builder = crearQueryBuilder({
        data: [filaCliente],
        count: 45,
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const resultado = await listarClientes({ pagina: 2 })

      expect(supabase.from).toHaveBeenCalledWith('clientes')
      expect(builder.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      })
      expect(builder.range).toHaveBeenCalledWith(20, 39)
      expect(resultado).toEqual({
        clientes: [filaCliente],
        total: 45,
        pagina: 2,
        pageSize: 20,
        totalPaginas: 3,
      })
    })

    it('pagina de a 20 por defecto (CA-08)', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await listarClientes()

      expect(builder.range).toHaveBeenCalledWith(0, 19)
    })

    // CA-08: nombre, apellido, razón social, DNI o CUIT
    it('busca por nombre, apellido, razón social y número de documento', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await listarClientes({ search: '  gomez  ' })

      expect(builder.or).toHaveBeenCalledWith(
        'nombre.ilike.%gomez%,apellido.ilike.%gomez%,razon_social.ilike.%gomez%,numero_documento.ilike.%gomez%',
      )
    })

    it('no aplica el buscador cuando search viene vacío', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await listarClientes({ search: '   ' })

      expect(builder.or).not.toHaveBeenCalled()
    })

    it('devuelve al menos una página aunque no haya resultados', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: [], count: 0, error: null }),
      )

      const resultado = await listarClientes()

      expect(resultado.totalPaginas).toBe(1)
    })

    it('tolera que Supabase no devuelva data ni count', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, count: null, error: null }),
      )

      const resultado = await listarClientes()

      expect(resultado.clientes).toEqual([])
      expect(resultado.total).toBe(0)
    })

    it('lanza el error cuando Supabase falla', async () => {
      const errorMock = { message: 'no se pudo conectar con la base' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, count: null, error: errorMock }),
      )

      await expect(listarClientes()).rejects.toEqual(errorMock)
    })

    // CA-03
    it('filtra por Activo y Bloqueado por defecto', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await listarClientes()

      expect(builder.in).toHaveBeenCalledWith('estado', ['Activo', 'Bloqueado'])
    })

    it('filtra por los estados que se pidan', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await listarClientes({ estados: ['Inactivo'] })

      expect(builder.in).toHaveBeenCalledWith('estado', ['Inactivo'])
    })

    it('no filtra por estado cuando se pide una lista vacía', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await listarClientes({ estados: [] })

      expect(builder.in).not.toHaveBeenCalled()
    })
  })

  describe('crearCliente — validaciones (CA-01, CA-03, CA-05, CA-06)', () => {
    it('rechaza cuando falta el tipo de persona', async () => {
      await expect(
        crearCliente({ ...fisicaValida, tipo_persona: '' }),
      ).rejects.toMatchObject({
        status: 400,
        campo: 'tipo_persona',
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('persona física: rechaza sin nombre', async () => {
      await expect(
        crearCliente({ ...fisicaValida, nombre: '  ' }),
      ).rejects.toMatchObject({ status: 400, campo: 'nombre' })
    })

    it('persona física: rechaza sin apellido', async () => {
      await expect(
        crearCliente({ ...fisicaValida, apellido: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'apellido' })
    })

    it('persona jurídica: rechaza sin razón social', async () => {
      await expect(
        crearCliente({ ...juridicaValida, razon_social: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'razon_social' })
    })

    it('rechaza un tipo de documento inválido', async () => {
      await expect(
        crearCliente({ ...fisicaValida, tipo_documento: 'PASAPORTE' }),
      ).rejects.toMatchObject({ status: 400, campo: 'tipo_documento' })
    })

    it('rechaza sin número de documento', async () => {
      await expect(
        crearCliente({ ...fisicaValida, numero_documento: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'numero_documento' })
    })

    // CA-03: DNI que no tiene 7 u 8 dígitos
    it('rechaza un DNI de menos de 7 dígitos', async () => {
      await expect(
        crearCliente({ ...fisicaValida, numero_documento: '123456' }),
      ).rejects.toMatchObject({
        status: 400,
        campo: 'numero_documento',
        message: 'El DNI debe tener 7 u 8 dígitos',
      })
    })

    it('acepta un DNI de 8 dígitos', async () => {
      const builder = crearQueryBuilder({ data: filaCliente, error: null })
      supabase.from.mockReturnValue(builder)

      await expect(
        crearCliente({ ...fisicaValida, numero_documento: '30111222' }),
      ).resolves.toEqual(filaCliente)
    })

    // CA-03: CUIT con dígito verificador inválido
    it('rechaza un CUIT con dígito verificador inválido', async () => {
      await expect(
        crearCliente({ ...juridicaValida, numero_documento: '20-12345678-9' }),
      ).rejects.toMatchObject({
        status: 400,
        campo: 'numero_documento',
        message: 'CUIT inválido',
      })
    })

    it('acepta un CUIT válido', async () => {
      const builder = crearQueryBuilder({ data: filaCliente, error: null })
      supabase.from.mockReturnValue(builder)

      await expect(crearCliente(juridicaValida)).resolves.toEqual(filaCliente)
    })

    // CA-05: ambos obligatorios
    it('rechaza sin condición de IVA', async () => {
      await expect(
        crearCliente({ ...fisicaValida, condicion_iva_id: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'condicion_iva_id' })
    })

    it('rechaza sin tipo de cliente', async () => {
      await expect(
        crearCliente({ ...fisicaValida, tipo_cliente_id: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'tipo_cliente_id' })
    })

    // CA-06: teléfono obligatorio, email con formato
    it('rechaza sin teléfono', async () => {
      await expect(
        crearCliente({ ...fisicaValida, telefono: '  ' }),
      ).rejects.toMatchObject({ status: 400, campo: 'telefono' })
    })

    it('rechaza un email con formato inválido', async () => {
      await expect(
        crearCliente({ ...fisicaValida, email: 'ana@correo' }),
      ).rejects.toMatchObject({ status: 400, campo: 'email' })
    })

    it('acepta un cliente sin email: es opcional', async () => {
      const builder = crearQueryBuilder({ data: filaCliente, error: null })
      supabase.from.mockReturnValue(builder)

      await expect(
        crearCliente({ ...fisicaValida, email: '' }),
      ).resolves.toEqual(filaCliente)
    })
  })

  describe('crearCliente — alta (CA-02)', () => {
    it('crea el cliente sin mandar numero, estado ni origen', async () => {
      const builder = crearQueryBuilder({ data: filaCliente, error: null })
      supabase.from.mockReturnValue(builder)

      await crearCliente(fisicaValida)

      const payload = builder.insert.mock.calls[0][0]
      expect(payload).not.toHaveProperty('numero')
      expect(payload).not.toHaveProperty('estado')
      expect(payload).not.toHaveProperty('origen')
      expect(payload).toEqual({
        tipo_persona: 'fisica',
        nombre: 'Ana',
        apellido: 'Gómez',
        razon_social: null,
        tipo_documento: 'DNI',
        numero_documento: '30111222',
        condicion_iva_id: 'uuid-iva',
        tipo_cliente_id: 'uuid-tipo',
        telefono: '387-4001122',
        email: 'ana@correo.com',
      })
    })

    it('normaliza el CUIT a 11 dígitos sin guiones', async () => {
      const builder = crearQueryBuilder({ data: filaCliente, error: null })
      supabase.from.mockReturnValue(builder)

      await crearCliente(juridicaValida)

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ numero_documento: CUIT_NORMALIZADO }),
      )
    })

    it('deja null nombre/apellido para una persona jurídica', async () => {
      const builder = crearQueryBuilder({ data: filaCliente, error: null })
      supabase.from.mockReturnValue(builder)

      await crearCliente(juridicaValida)

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: null,
          apellido: null,
          razon_social: 'Corralón San Martín S.A.',
        }),
      )
    })

    // CA-04
    it('rechaza con 409 cuando el documento ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "uq_cliente_documento"',
          },
        }),
      )

      await expect(crearCliente(fisicaValida)).rejects.toMatchObject({
        status: 409,
        campo: 'numero_documento',
        message: 'Ya existe un cliente con ese documento',
      })
    })

    it('rechaza con 409 genérico ante otro índice único', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: { code: '23505', message: 'uq_cliente_numero' },
        }),
      )

      await expect(crearCliente(fisicaValida)).rejects.toMatchObject({
        status: 409,
        message: 'Ya existe un cliente con esos datos',
      })
    })

    it('traduce el check de DNI de la base', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: { code: '23514', message: 'violates check "chk_cliente_dni"' },
        }),
      )

      await expect(crearCliente(fisicaValida)).rejects.toMatchObject({
        status: 400,
        campo: 'numero_documento',
        message: 'El DNI debe tener 7 u 8 dígitos',
      })
    })

    it('traduce el check de CUIT de la base', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: { code: '23514', message: 'violates check "chk_cliente_cuit"' },
        }),
      )

      await expect(crearCliente(juridicaValida)).rejects.toMatchObject({
        status: 400,
        message: 'CUIT inválido',
      })
    })

    it('traduce el check de teléfono de la base', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: {
            code: '23514',
            message: 'violates check "chk_cliente_telefono_no_vacio"',
          },
        }),
      )

      await expect(crearCliente(fisicaValida)).rejects.toMatchObject({
        status: 400,
        campo: 'telefono',
      })
    })

    it('traduce el check de email de la base', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: { code: '23514', message: 'violates check "chk_cliente_email"' },
        }),
      )

      await expect(crearCliente(fisicaValida)).rejects.toMatchObject({
        status: 400,
        campo: 'email',
      })
    })

    it('traduce el check de nombre/razón social de la base', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: { code: '23514', message: 'violates check "chk_cliente_nombre"' },
        }),
      )

      await expect(crearCliente(fisicaValida)).rejects.toMatchObject({
        status: 400,
        message:
          'Completá nombre y apellido, o razón social, según el tipo de persona',
      })
    })

    it('usa un mensaje genérico para un check desconocido', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: { code: '23514', message: 'violates check "otro_check"' },
        }),
      )

      await expect(crearCliente(fisicaValida)).rejects.toMatchObject({
        status: 400,
        message: 'Revisá los datos: no cumplen una validación del sistema',
      })
    })

    it('rechaza con 422 cuando la condición de IVA o el tipo de cliente no existen', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: '23503' } }),
      )

      await expect(crearCliente(fisicaValida)).rejects.toMatchObject({
        status: 422,
      })
    })

    it('traduce a 403 el insert que la RLS deja sin filas', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: { code: 'PGRST116' } }),
      )

      await expect(crearCliente(fisicaValida)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('propaga cualquier otro error sin traducirlo', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(crearCliente(fisicaValida)).rejects.toEqual(errorMock)
    })
  })

  describe('actualizarCliente (CA-07)', () => {
    it('actualiza el cliente sin mandar el número', async () => {
      const builder = crearQueryBuilder({ data: filaCliente, error: null })
      supabase.from.mockReturnValue(builder)

      await actualizarCliente('c1', fisicaValida)

      expect(builder.eq).toHaveBeenCalledWith('id', 'c1')
      expect(builder.update.mock.calls[0][0]).not.toHaveProperty('numero')
    })

    it('rechaza con 400 cuando falta un obligatorio', async () => {
      await expect(
        actualizarCliente('c1', { ...fisicaValida, telefono: '' }),
      ).rejects.toMatchObject({ status: 400, campo: 'telefono' })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rechaza con 409 cuando el documento nuevo ya existe', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: { code: '23505', message: 'uq_cliente_documento' },
        }),
      )

      await expect(
        actualizarCliente('c1', fisicaValida),
      ).rejects.toMatchObject({ status: 409, campo: 'numero_documento' })
    })
  })

  describe('listarCondicionesIva', () => {
    it('sólo trae las activas por defecto', async () => {
      const builder = crearQueryBuilder({
        data: [{ id: '1', nombre: 'Responsable Inscripto', activo: true }],
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const resultado = await listarCondicionesIva()

      expect(supabase.from).toHaveBeenCalledWith('condiciones_iva')
      expect(builder.eq).toHaveBeenCalledWith('activo', true)
      expect(builder.order).toHaveBeenCalledWith('nombre')
      expect(resultado).toHaveLength(1)
    })

    it('trae todas cuando soloActivas es false', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await listarCondicionesIva({ soloActivas: false })

      expect(builder.eq).not.toHaveBeenCalled()
    })

    it('devuelve una lista vacía cuando no hay datos', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: null }),
      )

      await expect(listarCondicionesIva()).resolves.toEqual([])
    })

    it('lanza el error cuando falla la consulta', async () => {
      const errorMock = { message: 'error de conexión' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(listarCondicionesIva()).rejects.toEqual(errorMock)
    })
  })

  describe('listarTiposCliente', () => {
    it('sólo trae los activos por defecto', async () => {
      const builder = crearQueryBuilder({
        data: [{ id: '1', nombre: 'Consumidor Final', activo: true }],
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const resultado = await listarTiposCliente()

      expect(supabase.from).toHaveBeenCalledWith('tipos_cliente')
      expect(builder.eq).toHaveBeenCalledWith('activo', true)
      expect(resultado).toHaveLength(1)
    })

    it('trae todos cuando soloActivas es false', async () => {
      const builder = crearQueryBuilder({ data: null, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await listarTiposCliente({ soloActivas: false })

      expect(builder.eq).not.toHaveBeenCalled()
      expect(resultado).toEqual([])
    })

    it('lanza el error cuando falla la consulta', async () => {
      const errorMock = { message: 'error de conexión' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(listarTiposCliente()).rejects.toEqual(errorMock)
    })
  })

  describe('puedeAltaClientes', () => {
    it('consulta el permiso clientes.alta', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      await expect(puedeAltaClientes()).resolves.toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'clientes.alta',
      })
    })

    it('devuelve false cuando no lo tiene', async () => {
      supabase.rpc.mockResolvedValue({ data: false, error: null })

      await expect(puedeAltaClientes()).resolves.toBe(false)
    })

    it('lanza el error cuando la consulta falla', async () => {
      const errorMock = { message: 'no se pudo verificar el permiso' }
      supabase.rpc.mockResolvedValue({ data: null, error: errorMock })

      await expect(puedeAltaClientes()).rejects.toEqual(errorMock)
    })
  })

  describe('puedeModificarClientes', () => {
    it('consulta el permiso clientes.modificar', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      await expect(puedeModificarClientes()).resolves.toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'clientes.modificar',
      })
    })

    it('lanza el error cuando la consulta falla', async () => {
      const errorMock = { message: 'no se pudo verificar el permiso' }
      supabase.rpc.mockResolvedValue({ data: null, error: errorMock })

      await expect(puedeModificarClientes()).rejects.toEqual(errorMock)
    })
  })

  // Igual que en movimientosApi.test.js: las funciones que se llaman con
  // .rpc(...).single() necesitan un builder propio.
  function mockRpcSingle(resultado) {
    const builder = { single: vi.fn(() => Promise.resolve(resultado)) }
    supabase.rpc.mockReturnValue(builder)
    return builder
  }

  describe('cambiarEstadoCliente', () => {
    // CA-01
    it('cambia el estado con motivo', async () => {
      const actualizado = { ...filaCliente, estado: 'Bloqueado' }
      mockRpcSingle({ data: actualizado, error: null })

      const resultado = await cambiarEstadoCliente(
        'c1',
        'Bloqueado',
        'Cheques rechazados',
      )

      expect(supabase.rpc).toHaveBeenCalledWith('cambiar_estado_cliente', {
        p_cliente: 'c1',
        p_estado_nuevo: 'Bloqueado',
        p_motivo: 'Cheques rechazados',
      })
      expect(resultado).toEqual(actualizado)
    })

    it('pasar a Activo no requiere motivo', async () => {
      mockRpcSingle({ data: { ...filaCliente, estado: 'Activo' }, error: null })

      await expect(
        cambiarEstadoCliente('c1', 'Activo'),
      ).resolves.toMatchObject({ estado: 'Activo' })

      expect(supabase.rpc).toHaveBeenCalledWith('cambiar_estado_cliente', {
        p_cliente: 'c1',
        p_estado_nuevo: 'Activo',
        p_motivo: null,
      })
    })

    it('rechaza con 400 un estado que no es válido', async () => {
      await expect(
        cambiarEstadoCliente('c1', 'Cancelado', 'motivo'),
      ).rejects.toMatchObject({ status: 400, campo: 'estado' })
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('rechaza con 400 cuando falta el motivo y no es Activo', async () => {
      await expect(
        cambiarEstadoCliente('c1', 'Inactivo', ''),
      ).rejects.toMatchObject({ status: 400, campo: 'motivo' })
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('rechaza con 400 cuando el motivo son sólo espacios', async () => {
      await expect(
        cambiarEstadoCliente('c1', 'Bloqueado', '   '),
      ).rejects.toMatchObject({ status: 400, campo: 'motivo' })
    })

    it('traduce el rechazo de motivo que viene de la base', async () => {
      mockRpcSingle({
        data: null,
        error: {
          code: '23514',
          message: 'El motivo es obligatorio para pasar a Bloqueado',
        },
      })

      await expect(
        cambiarEstadoCliente('c1', 'Bloqueado', 'x'),
      ).rejects.toMatchObject({ status: 400, campo: 'motivo' })
    })

    it('traduce el check de estado de la base', async () => {
      mockRpcSingle({
        data: null,
        error: { code: '23514', message: 'violates check "chk_cliente_estado"' },
      })

      await expect(
        cambiarEstadoCliente('c1', 'Activo'),
      ).rejects.toMatchObject({ status: 400, campo: 'estado' })
    })

    it('usa un mensaje genérico para un check desconocido', async () => {
      mockRpcSingle({
        data: null,
        error: { code: '23514', message: 'violates check "otro"' },
      })

      await expect(
        cambiarEstadoCliente('c1', 'Activo'),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Revisá los datos: no cumplen una validación del sistema',
      })
    })

    // CA-04: lo levanta el trigger sin permiso, o la RPC si no encontró la fila
    it('traduce a 403 la falta de permiso o de fila', async () => {
      mockRpcSingle({
        data: null,
        error: {
          code: '42501',
          message: 'No tenés permiso para cambiar el estado del cliente',
        },
      })

      await expect(
        cambiarEstadoCliente('c1', 'Bloqueado', 'x'),
      ).rejects.toMatchObject({
        status: 403,
        message: 'No tenés permiso para cambiar el estado del cliente',
      })
    })

    it('usa un mensaje por defecto si la base no informa detalle', async () => {
      mockRpcSingle({ data: null, error: { code: '42501' } })

      await expect(
        cambiarEstadoCliente('c1', 'Bloqueado', 'x'),
      ).rejects.toMatchObject({
        status: 403,
        message:
          'No se pudo cambiar el estado: no existe o no tenés permiso para modificarlo',
      })
    })

    it('propaga cualquier otro error sin traducirlo', async () => {
      const errorMock = { code: '08006', message: 'connection failure' }
      mockRpcSingle({ data: null, error: errorMock })

      await expect(
        cambiarEstadoCliente('c1', 'Bloqueado', 'x'),
      ).rejects.toEqual(errorMock)
    })
  })

  describe('listarHistorialEstado', () => {
    // CA-02
    it('devuelve los cambios del más reciente al más antiguo', async () => {
      const historial = [
        {
          id: 'h1',
          estado_anterior: 'Activo',
          estado_nuevo: 'Bloqueado',
          motivo: 'Cheques rechazados',
          usuario_id: 'u1',
          created_at: '2026-09-10T12:00:00Z',
        },
      ]
      const builder = crearQueryBuilder({ data: historial, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await listarHistorialEstado('c1')

      expect(supabase.from).toHaveBeenCalledWith('historial_estado_cliente')
      expect(builder.eq).toHaveBeenCalledWith('cliente_id', 'c1')
      expect(builder.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      })
      expect(resultado).toEqual(historial)
    })

    it('devuelve una lista vacía cuando no hay datos', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: null }),
      )

      await expect(listarHistorialEstado('c1')).resolves.toEqual([])
    })

    it('lanza el error cuando la consulta falla', async () => {
      const errorMock = { message: 'error al leer el historial' }
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorMock }),
      )

      await expect(listarHistorialEstado('c1')).rejects.toEqual(errorMock)
    })
  })

  describe('puedeCambiarEstadoClientes', () => {
    // CA-04
    it('consulta el permiso clientes.estado', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      await expect(puedeCambiarEstadoClientes()).resolves.toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'clientes.estado',
      })
    })

    it('devuelve false cuando no lo tiene', async () => {
      supabase.rpc.mockResolvedValue({ data: false, error: null })

      await expect(puedeCambiarEstadoClientes()).resolves.toBe(false)
    })

    it('lanza el error cuando la consulta falla', async () => {
      const errorMock = { message: 'no se pudo verificar el permiso' }
      supabase.rpc.mockResolvedValue({ data: null, error: errorMock })

      await expect(puedeCambiarEstadoClientes()).rejects.toEqual(errorMock)
    })
  })
})
