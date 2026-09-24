import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actualizarTelefono,
  completarRegistro,
  ingresar,
  MENSAJE_CREDENCIALES,
  MENSAJE_DUPLICADO,
  METADATO_REGISTRO,
  obtenerClienteActual,
  registrar,
  salir,
  validarRegistro,
} from './clienteWebApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), getUser: vi.fn() },
  },
}))

function builder(resultado) {
  const b = { then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject) }
  for (const nombre of ['select', 'update', 'eq']) b[nombre] = vi.fn(() => b)
  b.maybeSingle = vi.fn(() => Promise.resolve(resultado))
  b.single = vi.fn(() => Promise.resolve(resultado))
  return b
}

const formulario = {
  nombre: ' Ana ',
  apellido: 'Suárez',
  tipo_documento: 'DNI',
  numero_documento: '30.111.222',
  email: ' Ana@Example.com ',
  telefono: '387 400-0002',
  password: 'secreta123',
}
const perfil = { nombre: 'Ana', apellido: 'Suárez', tipo_documento: 'DNI', numero_documento: '30111222', telefono: '387 400-0002' }
const usuario = { id: 'usuario-1', user_metadata: {} }
const clienteMostrador = { id: 'cliente-mostrador', nombre: 'Juan', apellido: 'Pérez', numero_documento: '30111222', origen: 'Mostrador' }

beforeEach(() => vi.resetAllMocks())

describe('validarRegistro', () => {
  it('normaliza documento sin puntos y email en minúsculas', () => {
    expect(validarRegistro(formulario)).toEqual({ ...perfil, email: 'ana@example.com', password: 'secreta123' })
  })
  it('acepta un CUIT de persona física con guiones', () => {
    expect(validarRegistro({ ...formulario, tipo_documento: 'CUIT', numero_documento: '20-12345678-6' }).numero_documento)
      .toBe('20123456786')
  })
  it.each([
    [{ nombre: '  ' }, 'nombre'],
    [{ apellido: '' }, 'apellido'],
    [{ numero_documento: '123' }, 'numero_documento'],
    [{ tipo_documento: 'CUIT', numero_documento: '20-12345678-5' }, 'numero_documento'],
    [{ tipo_documento: 'CUIT', numero_documento: '30-71234567-1' }, 'numero_documento'],
    [{ tipo_documento: 'LE' }, 'tipo_documento'],
    [{ email: 'ana@' }, 'email'],
    [{ telefono: 'abc' }, 'telefono'],
    [{ password: 'corta' }, 'password'],
  ])('rechaza %j indicando el campo', (cambio, campo) => {
    expect(() => validarRegistro({ ...formulario, ...cambio })).toThrow(expect.objectContaining({ campo, status: 400 }))
  })
})

describe('registrar', () => {
  it('con confirmación de email guarda el registro pendiente en los metadatos y no llama a la RPC', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'nuevo' }, session: null }, error: null })
    expect(await registrar(formulario)).toEqual({ estado: 'confirmar_email' })
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'secreta123',
      options: { data: { [METADATO_REGISTRO]: perfil }, emailRedirectTo: `${window.location.origin}/tienda` },
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
  it('CA-02: un email ya registrado responde igual que uno nuevo (Supabase lo oculta)', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'falso', identities: [] }, session: null }, error: null })
    expect(await registrar(formulario)).toEqual({ estado: 'confirmar_email' })
  })
  it('CA-02: si Supabase informa el email duplicado, el mensaje es genérico', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: {}, error: { code: 'user_already_exists', message: 'User already registered' } })
    await expect(registrar(formulario)).rejects.toMatchObject({ message: MENSAJE_DUPLICADO, status: 409 })
  })
  it('CA-01: con sesión inmediata crea el cliente con la RPC', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'nuevo' }, session: {} }, error: null })
    supabase.rpc.mockResolvedValue({ data: 'cliente-nuevo', error: null })
    expect(await registrar(formulario)).toEqual({ estado: 'registrado', clienteId: 'cliente-nuevo' })
    expect(supabase.rpc).toHaveBeenCalledWith('registrar_cliente_web', { p_datos: perfil })
  })
  it('no llama a Supabase si el formulario es inválido', async () => {
    await expect(registrar({ ...formulario, email: 'x' })).rejects.toMatchObject({ campo: 'email' })
    expect(supabase.auth.signUp).not.toHaveBeenCalled()
  })
  it.each([
    [{ code: 'weak_password', message: 'weak' }, { campo: 'password', status: 400 }],
    [{ status: 429, message: 'rate limit' }, { status: 429 }],
    [{ status: 500, message: 'detalle interno' }, { status: 500, message: expect.not.stringContaining('detalle') }],
  ])('traduce el error de Auth %j', async (error, esperado) => {
    supabase.auth.signUp.mockResolvedValue({ data: {}, error })
    await expect(registrar(formulario)).rejects.toMatchObject(esperado)
  })
})

describe('completarRegistro', () => {
  it('CA-02: documento con usuario web → mensaje genérico, sin el detalle de la base', async () => {
    supabase.rpc.mockResolvedValue({ error: { code: '23505', message: 'Juan Pérez ya existe' } })
    await expect(completarRegistro(perfil)).rejects.toMatchObject({ message: MENSAJE_DUPLICADO, status: 409 })
  })
  it.each([
    [{ code: '22023', message: 'El DNI debe tener 7 u 8 dígitos' }, { status: 400, message: 'El DNI debe tener 7 u 8 dígitos' }],
    [{ code: '42501', message: 'sin sesión' }, { status: 401 }],
    [{ code: 'XX000', message: 'interno' }, { status: 500 }],
  ])('traduce %j', async (error, esperado) => {
    supabase.rpc.mockResolvedValue({ error })
    await expect(completarRegistro(perfil)).rejects.toMatchObject(esperado)
  })
  it('envía solo los datos de perfil, nunca un usuario ni un email', async () => {
    supabase.rpc.mockResolvedValue({ data: 'c1', error: null })
    await completarRegistro({ ...perfil, usuario_web_id: 'otro', email: 'x@y.com' })
    expect(supabase.rpc).toHaveBeenCalledWith('registrar_cliente_web', { p_datos: perfil })
  })
})

describe('ingresar y salir', () => {
  it('CA-04: con datos correctos devuelve el usuario', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: usuario }, error: null })
    expect(await ingresar(' Ana@Example.com ', 'secreta123')).toBe(usuario)
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'secreta123' })
  })
  it('CA-04: con datos incorrectos el mensaje es genérico', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } })
    await expect(ingresar('ana@example.com', 'mala')).rejects.toMatchObject({ message: MENSAJE_CREDENCIALES, status: 401 })
    await expect(ingresar(undefined, undefined)).rejects.toMatchObject({ message: MENSAJE_CREDENCIALES })
  })
  it('avisa si falta confirmar el email', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'email_not_confirmed' } })
    await expect(ingresar('ana@example.com', 'secreta123')).rejects.toMatchObject({ status: 403 })
  })
  it('salir cierra la sesión y propaga errores', async () => {
    supabase.auth.signOut.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error('red') })
    await expect(salir()).resolves.toBeUndefined()
    await expect(salir()).rejects.toThrow('red')
  })
})

describe('obtenerClienteActual', () => {
  it('devuelve null sin sesión o si getUser falla', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
      .mockResolvedValueOnce({ data: {}, error: new Error('jwt') })
    expect(await obtenerClienteActual()).toBeNull()
    expect(await obtenerClienteActual()).toBeNull()
    expect(await obtenerClienteActual(null)).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('lee el cliente propio por usuario_web_id', async () => {
    const consulta = builder({ data: clienteMostrador, error: null })
    supabase.auth.getUser.mockResolvedValue({ data: { user: usuario }, error: null })
    supabase.from.mockReturnValue(consulta)
    expect(await obtenerClienteActual()).toBe(clienteMostrador)
    expect(consulta.eq).toHaveBeenCalledWith('usuario_web_id', 'usuario-1')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
  it('CA-03: completa el registro pendiente y devuelve el cliente de mostrador vinculado', async () => {
    const pendiente = { ...usuario, user_metadata: { [METADATO_REGISTRO]: perfil } }
    supabase.from.mockReturnValueOnce(builder({ data: null, error: null }))
      .mockReturnValueOnce(builder({ data: clienteMostrador, error: null }))
    supabase.rpc.mockResolvedValue({ data: 'cliente-mostrador', error: null })
    const cliente = await obtenerClienteActual(pendiente)
    expect(supabase.rpc).toHaveBeenCalledWith('registrar_cliente_web', { p_datos: perfil })
    expect(cliente).toMatchObject({ id: 'cliente-mostrador', origen: 'Mostrador' })
  })
  it('CA-03: si el documento ya tiene usuario web, falla con el mensaje genérico', async () => {
    supabase.from.mockReturnValue(builder({ data: null, error: null }))
    supabase.rpc.mockResolvedValue({ error: { code: '23505', message: 'duplicado' } })
    await expect(obtenerClienteActual({ ...usuario, user_metadata: { [METADATO_REGISTRO]: perfil } }))
      .rejects.toMatchObject({ message: MENSAJE_DUPLICADO })
  })
  it('un usuario sin cliente ni registro pendiente (p. ej. interno) no tiene cliente', async () => {
    supabase.from.mockReturnValue(builder({ data: null, error: null }))
    expect(await obtenerClienteActual(usuario)).toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
  it('propaga errores de lectura', async () => {
    supabase.from.mockReturnValue(builder({ data: null, error: new Error('lectura') }))
    await expect(obtenerClienteActual(usuario)).rejects.toThrow('lectura')
  })
})

describe('actualizarTelefono (CA-05)', () => {
  it('actualiza solo el teléfono de la fila propia', async () => {
    const consulta = builder({ data: { ...clienteMostrador, telefono: '3875551234' }, error: null })
    supabase.auth.getUser.mockResolvedValue({ data: { user: usuario } })
    supabase.from.mockReturnValue(consulta)
    expect(await actualizarTelefono(' 3875551234 ')).toMatchObject({ telefono: '3875551234' })
    expect(consulta.update).toHaveBeenCalledWith({ telefono: '3875551234' })
    expect(consulta.eq).toHaveBeenCalledWith('usuario_web_id', 'usuario-1')
  })
  it('valida el teléfono antes de consultar', async () => {
    await expect(actualizarTelefono('')).rejects.toMatchObject({ campo: 'telefono', status: 400 })
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('exige sesión', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    await expect(actualizarTelefono('3875551234')).rejects.toMatchObject({ status: 401 })
  })
  it('traduce el rechazo de la RLS y propaga otros errores', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: usuario } })
    supabase.from.mockReturnValueOnce(builder({ data: null, error: { code: 'PGRST116' } }))
      .mockReturnValueOnce(builder({ data: null, error: new Error('red') }))
    await expect(actualizarTelefono('3875551234')).rejects.toMatchObject({ status: 403 })
    await expect(actualizarTelefono('3875551234')).rejects.toThrow('red')
  })
})
