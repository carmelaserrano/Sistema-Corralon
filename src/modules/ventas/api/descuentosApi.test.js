import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  PERMISO_AUTORIZAR,
  PERMISO_GESTIONAR,
  TIPOS_APLICACION,
  actualizarReglaDescuento,
  autorizarDescuentoComoSupervisor,
  crearReglaDescuento,
  listarOpcionesReferencia,
  listarReglasDescuento,
  obtenerLimiteDescuentoManual,
  puedeGestionarDescuentos,
  setLimiteDescuentoManual,
  validarDescuentoManual,
} from './descuentosApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

// Imita el query builder de supabase-js: cada filtro devuelve el mismo
// builder, y el builder es "thenable" para poder await-earlo directo, o
// terminar en .single()/.maybeSingle().
function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => Promise.resolve(resultado)),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    maybeSingle: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

function errorPg(codigo, mensaje) {
  return { code: codigo, message: mensaje }
}

describe('descuentosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('constantes', () => {
    it('TIPOS_APLICACION tiene los tres valores que acepta la base', () => {
      expect(TIPOS_APLICACION.map((t) => t.value)).toEqual([
        'tipo_cliente',
        'categoria',
        'producto',
      ])
    })

    it('los nombres de permiso son los definidos en 0031', () => {
      expect(PERMISO_GESTIONAR).toBe('precios.gestionar')
      expect(PERMISO_AUTORIZAR).toBe('ventas.descuento.autorizar')
    })
  })

  describe('listarOpcionesReferencia', () => {
    it('tipo_cliente: filtra por activo=true, tabla tipos_cliente', async () => {
      const builder = crearQueryBuilder({
        data: [{ id: 't1', nombre: 'Mayorista' }],
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const opciones = await listarOpcionesReferencia('tipo_cliente')

      expect(supabase.from).toHaveBeenCalledWith('tipos_cliente')
      expect(builder.eq).toHaveBeenCalledWith('activo', true)
      expect(opciones).toEqual([{ id: 't1', nombre: 'Mayorista' }])
    })

    it('categoria: filtra por activo=true, tabla categorias', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await listarOpcionesReferencia('categoria')

      expect(supabase.from).toHaveBeenCalledWith('categorias')
      expect(builder.eq).toHaveBeenCalledWith('activo', true)
    })

    it('producto: filtra por estado_producto=activo, no por una columna activo', async () => {
      const builder = crearQueryBuilder({
        data: [{ id: 'p1', nombre: 'Cemento' }],
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const opciones = await listarOpcionesReferencia('producto')

      expect(supabase.from).toHaveBeenCalledWith('productos')
      expect(builder.eq).toHaveBeenCalledWith('estado_producto', 'activo')
      expect(opciones).toEqual([{ id: 'p1', nombre: 'Cemento' }])
    })

    it('un tipo desconocido devuelve una lista vacía sin ir a la red', async () => {
      const opciones = await listarOpcionesReferencia('otra-cosa')
      expect(opciones).toEqual([])
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('propaga el error de la consulta', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: new Error('sin acceso') }),
      )
      await expect(listarOpcionesReferencia('categoria')).rejects.toThrow('sin acceso')
    })
  })

  describe('listarReglasDescuento', () => {
    const reglaTipoCliente = {
      id: 'r1', tipo_aplicacion: 'tipo_cliente', referencia_id: 't1', porcentaje: 10, activo: true, created_at: '2026-01-01',
    }
    const reglaCategoria = {
      id: 'r2', tipo_aplicacion: 'categoria', referencia_id: 'c1', porcentaje: 15, activo: true, created_at: '2026-01-02',
    }
    const reglaProducto = {
      id: 'r3', tipo_aplicacion: 'producto', referencia_id: 'p1', porcentaje: 20, activo: false, created_at: '2026-01-03',
    }

    function simularTablas({ reglas, tiposCliente = [], categorias = [], productos = [] }) {
      const llamadasPorTabla = []
      supabase.from.mockImplementation((tabla) => {
        llamadasPorTabla.push(tabla)
        if (tabla === 'reglas_descuento') return crearQueryBuilder({ data: reglas, error: null })
        if (tabla === 'tipos_cliente') return crearQueryBuilder({ data: tiposCliente, error: null })
        if (tabla === 'categorias') return crearQueryBuilder({ data: categorias, error: null })
        return crearQueryBuilder({ data: productos, error: null })
      })
      return llamadasPorTabla
    }

    it('resuelve el nombre de a qué aplica cada regla, con un select por tabla', async () => {
      const llamadas = simularTablas({
        reglas: [reglaTipoCliente, reglaCategoria, reglaProducto],
        tiposCliente: [{ id: 't1', nombre: 'Mayorista' }],
        categorias: [{ id: 'c1', nombre: 'Cemento' }],
        productos: [{ id: 'p1', nombre: 'Cemento Portland x50kg' }],
      })

      const reglas = await listarReglasDescuento()

      expect(reglas).toEqual([
        { ...reglaTipoCliente, referencia_nombre: 'Mayorista' },
        { ...reglaCategoria, referencia_nombre: 'Cemento' },
        { ...reglaProducto, referencia_nombre: 'Cemento Portland x50kg' },
      ])
      // Una sola llamada por tabla que hizo falta: no un select por regla.
      expect(llamadas).toEqual(['reglas_descuento', 'tipos_cliente', 'categorias', 'productos'])
    })

    it('si la referencia ya no existe (se borró), referencia_nombre queda null', async () => {
      simularTablas({ reglas: [reglaTipoCliente], tiposCliente: [] })

      const [regla] = await listarReglasDescuento()

      expect(regla.referencia_nombre).toBeNull()
    })

    it('no consulta una tabla si ninguna regla la necesita', async () => {
      const llamadas = simularTablas({
        reglas: [reglaTipoCliente],
        tiposCliente: [{ id: 't1', nombre: 'Mayorista' }],
      })

      await listarReglasDescuento()

      expect(llamadas).toEqual(['reglas_descuento', 'tipos_cliente'])
    })

    it('soloActivas filtra por activo=true', async () => {
      const builder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(builder)

      await listarReglasDescuento({ soloActivas: true })

      expect(builder.eq).toHaveBeenCalledWith('activo', true)
    })

    it('devuelve una lista vacía sin consultar los catálogos si no hay reglas', async () => {
      const llamadas = simularTablas({ reglas: [] })
      const reglas = await listarReglasDescuento()

      expect(reglas).toEqual([])
      expect(llamadas).toEqual(['reglas_descuento'])
    })
  })

  describe('crearReglaDescuento', () => {
    const reglaValida = { tipo_aplicacion: 'producto', referencia_id: 'p1', porcentaje: 10 }

    it('crea la regla con activo=true por defecto', async () => {
      const builder = crearQueryBuilder({ data: { id: 'r1', ...reglaValida, activo: true }, error: null })
      supabase.from.mockReturnValue(builder)

      const creada = await crearReglaDescuento(reglaValida)

      expect(builder.insert).toHaveBeenCalledWith({
        tipo_aplicacion: 'producto',
        referencia_id: 'p1',
        porcentaje: 10,
        activo: true,
      })
      expect(creada.id).toBe('r1')
    })

    it('respeta activo=false si se lo pasan explícito', async () => {
      const builder = crearQueryBuilder({ data: { id: 'r1' }, error: null })
      supabase.from.mockReturnValue(builder)

      await crearReglaDescuento({ ...reglaValida, activo: false })

      expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ activo: false }))
    })

    it.each([0, -1, 0.001, 100.01, NaN, undefined, ''])(
      'rechaza un porcentaje fuera de 0,01-100: %s',
      async (porcentaje) => {
        await expect(crearReglaDescuento({ ...reglaValida, porcentaje })).rejects.toThrow(
          /0,01 y 100/,
        )
        expect(supabase.from).not.toHaveBeenCalled()
      },
    )

    it('acepta los bordes 0,01 y 100', async () => {
      const builder = crearQueryBuilder({ data: { id: 'r1' }, error: null })
      supabase.from.mockReturnValue(builder)

      await expect(crearReglaDescuento({ ...reglaValida, porcentaje: 0.01 })).resolves.toBeTruthy()
      await expect(crearReglaDescuento({ ...reglaValida, porcentaje: 100 })).resolves.toBeTruthy()
    })

    it('rechaza un tipo_aplicacion inválido, sin ir a la red', async () => {
      await expect(
        crearReglaDescuento({ ...reglaValida, tipo_aplicacion: 'lo_que_sea' }),
      ).rejects.toThrow(/a qué aplica/)
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('exige referencia_id', async () => {
      await expect(
        crearReglaDescuento({ ...reglaValida, referencia_id: '' }),
      ).rejects.toThrow(/sobre qué aplica/)
    })

    it('traduce el CHECK de porcentaje de la base a un mensaje de campo', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: errorPg('23514', 'violates check constraint "chk_regla_descuento_porcentaje"'),
        }),
      )
      try {
        // Fuerza que la validación local no frene antes de llegar a la red,
        // simulando que la base tiene una regla más estricta que el cliente.
        await crearReglaDescuento(reglaValida)
        throw new Error('no debería llegar acá')
      } catch (err) {
        expect(err.campo).toBe('porcentaje')
      }
    })

    it('traduce el CHECK de tipo_aplicacion de la base a un mensaje de campo', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: errorPg('23514', 'violates check constraint "chk_regla_descuento_tipo"'),
        }),
      )
      try {
        await crearReglaDescuento(reglaValida)
        throw new Error('no debería llegar acá')
      } catch (err) {
        expect(err.campo).toBe('tipo_aplicacion')
      }
    })

    it('un CHECK de la base que no reconoce da un mensaje genérico, no el texto crudo', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({
          data: null,
          error: errorPg('23514', 'violates check constraint "otra_regla_futura"'),
        }),
      )
      await expect(crearReglaDescuento(reglaValida)).rejects.toThrow(
        /no cumplen una validación del sistema/,
      )
    })

    it('un error de permiso (42501 o PGRST116) da un mensaje claro y no el crudo de Postgres', async () => {
      for (const codigo of ['42501', 'PGRST116']) {
        supabase.from.mockReturnValue(
          crearQueryBuilder({ data: null, error: errorPg(codigo, 'texto interno de postgres') }),
        )
        await expect(crearReglaDescuento(reglaValida)).rejects.toThrow(
          /no tenés permiso para modificarla/,
        )
      }
    })

    it('un error inesperado se propaga tal cual', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ data: null, error: errorPg('99999', 'algo raro') }),
      )
      await expect(crearReglaDescuento(reglaValida)).rejects.toMatchObject({ code: '99999' })
    })
  })

  describe('actualizarReglaDescuento', () => {
    it('actualiza solo el porcentaje si es lo único que se pasa', async () => {
      const builder = crearQueryBuilder({ data: { id: 'r1', porcentaje: 20 }, error: null })
      supabase.from.mockReturnValue(builder)

      await actualizarReglaDescuento('r1', { porcentaje: 20 })

      expect(builder.update).toHaveBeenCalledWith({ porcentaje: 20 })
    })

    it('actualiza solo activo si es lo único que se pasa', async () => {
      const builder = crearQueryBuilder({ data: { id: 'r1', activo: false }, error: null })
      supabase.from.mockReturnValue(builder)

      await actualizarReglaDescuento('r1', { activo: false })

      expect(builder.update).toHaveBeenCalledWith({ activo: false })
    })

    it('permite desactivar (activo: false) sin que se confunda con "no lo mandes"', async () => {
      const builder = crearQueryBuilder({ data: { id: 'r1' }, error: null })
      supabase.from.mockReturnValue(builder)

      await actualizarReglaDescuento('r1', { activo: false })

      expect(builder.update).toHaveBeenCalledWith({ activo: false })
    })

    it('valida el porcentaje si se lo pasan', async () => {
      await expect(actualizarReglaDescuento('r1', { porcentaje: 0 })).rejects.toThrow(/0,01 y 100/)
      expect(supabase.from).not.toHaveBeenCalled()
    })
  })

  describe('puedeGestionarDescuentos', () => {
    it('consulta precios.gestionar', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })
      await expect(puedeGestionarDescuentos()).resolves.toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'precios.gestionar',
      })
    })

    it('propaga el error', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: new Error('boom') })
      await expect(puedeGestionarDescuentos()).rejects.toThrow('boom')
    })
  })

  describe('límite de descuento manual', () => {
    it('obtenerLimiteDescuentoManual devuelve null si no hay ninguno configurado', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ data: null, error: null }))
      await expect(obtenerLimiteDescuentoManual()).resolves.toBeNull()
    })

    it('obtenerLimiteDescuentoManual devuelve el número configurado', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ data: { valor: 15 }, error: null }))
      await expect(obtenerLimiteDescuentoManual()).resolves.toBe(15)
    })

    it('setLimiteDescuentoManual guarda con upsert por clave', async () => {
      const builder = crearQueryBuilder({ error: null })
      supabase.from.mockReturnValue(builder)

      await setLimiteDescuentoManual(15)

      expect(builder.upsert).toHaveBeenCalledWith(
        { clave: 'limite_descuento_manual', valor: 15 },
        { onConflict: 'clave' },
      )
    })

    it.each([-1, 100.5, NaN])('rechaza un límite fuera de 0-100: %s', async (limite) => {
      await expect(setLimiteDescuentoManual(limite)).rejects.toThrow(/0 y 100/)
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('acepta 0 (cualquier descuento manual requiere autorización)', async () => {
      supabase.from.mockReturnValue(crearQueryBuilder({ error: null }))
      await expect(setLimiteDescuentoManual(0)).resolves.toBeUndefined()
    })

    it('sin permiso, avisa con un mensaje claro (42501 o PGRST116)', async () => {
      for (const codigo of ['42501', 'PGRST116']) {
        supabase.from.mockReturnValue(
          crearQueryBuilder({ error: errorPg(codigo, 'texto interno') }),
        )
        await expect(setLimiteDescuentoManual(15)).rejects.toThrow(/no tenés permiso/i)
      }
    })

    it('un error inesperado al guardar el límite se propaga tal cual', async () => {
      supabase.from.mockReturnValue(
        crearQueryBuilder({ error: errorPg('99999', 'algo raro') }),
      )
      await expect(setLimiteDescuentoManual(15)).rejects.toMatchObject({ code: '99999' })
    })
  })

  describe('validarDescuentoManual', () => {
    it('mapea requiere_autorizacion y limite desde el RPC', async () => {
      supabase.rpc.mockResolvedValue({
        data: { requiere_autorizacion: true, limite: 15 },
        error: null,
      })

      await expect(validarDescuentoManual(20)).resolves.toEqual({
        requiereAutorizacion: true,
        limite: 15,
      })
      expect(supabase.rpc).toHaveBeenCalledWith('validar_descuento_manual', { p_porcentaje: 20 })
    })

    it('sin límite configurado, limite queda null y no exige autorización', async () => {
      supabase.rpc.mockResolvedValue({
        data: { requiere_autorizacion: false, limite: null },
        error: null,
      })

      await expect(validarDescuentoManual(50)).resolves.toEqual({
        requiereAutorizacion: false,
        limite: null,
      })
    })

    it('propaga el error del RPC', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: new Error('boom') })
      await expect(validarDescuentoManual(10)).rejects.toThrow('boom')
    })
  })

  describe('autorizarDescuentoComoSupervisor (CA-05 / CA-06)', () => {
    function clienteSupervisorFalso({ loginError = null, rpcResultado = { data: 'auth-1', error: null } } = {}) {
      return {
        auth: {
          signInWithPassword: vi.fn(() => Promise.resolve({ error: loginError })),
          signOut: vi.fn(() => Promise.resolve()),
        },
        rpc: vi.fn(() => Promise.resolve(rpcResultado)),
      }
    }

    beforeEach(() => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://ejemplo.supabase.co')
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-de-prueba')
    })

    it('crea un cliente de Supabase APARTE, sin persistir sesión (no toca el cliente compartido)', async () => {
      const falso = clienteSupervisorFalso()
      createClient.mockReturnValue(falso)

      await autorizarDescuentoComoSupervisor({
        email: 'supervisor@corralon.com',
        password: '1234',
        porcentaje: 25,
      })

      expect(createClient).toHaveBeenCalledWith(
        'https://ejemplo.supabase.co',
        'clave-de-prueba',
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
      )
      // Nada de esto pasó por el cliente compartido de la app (el del vendedor).
      expect(supabase.auth?.signInWithPassword).toBeUndefined()
      expect(supabase.rpc).not.toHaveBeenCalled()
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('autentica al supervisor y autoriza con SU sesión, no la de quien abrió el modal', async () => {
      const falso = clienteSupervisorFalso({ rpcResultado: { data: 'auth-123', error: null } })
      createClient.mockReturnValue(falso)

      const autorizacionId = await autorizarDescuentoComoSupervisor({
        email: 'supervisor@corralon.com',
        password: 'correcta',
        porcentaje: 30,
      })

      expect(falso.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'supervisor@corralon.com',
        password: 'correcta',
      })
      expect(falso.rpc).toHaveBeenCalledWith('autorizar_descuento', { p_porcentaje: 30 })
      expect(autorizacionId).toBe('auth-123')
      // Cierra la sesión del supervisor apenas termina.
      expect(falso.auth.signOut).toHaveBeenCalledTimes(1)
    })

    it('credenciales incorrectas: mensaje claro, y NUNCA llega a llamar autorizar_descuento', async () => {
      const falso = clienteSupervisorFalso({ loginError: { message: 'Invalid login credentials' } })
      createClient.mockReturnValue(falso)

      await expect(
        autorizarDescuentoComoSupervisor({ email: 'x@x.com', password: 'mala', porcentaje: 10 }),
      ).rejects.toThrow('Email o contraseña incorrectos')

      expect(falso.rpc).not.toHaveBeenCalled()
      expect(falso.auth.signOut).toHaveBeenCalledTimes(1)
    })

    it('CA-06: supervisor sin ventas.descuento.autorizar (42501) da un mensaje claro', async () => {
      const falso = clienteSupervisorFalso({
        rpcResultado: { data: null, error: errorPg('42501', 'insufficient_privilege') },
      })
      createClient.mockReturnValue(falso)

      await expect(
        autorizarDescuentoComoSupervisor({ email: 'x@x.com', password: 'ok', porcentaje: 10 }),
      ).rejects.toThrow('Ese usuario no tiene permiso para autorizar descuentos')
    })

    it('un error inesperado del RPC también da un mensaje legible', async () => {
      const falso = clienteSupervisorFalso({
        rpcResultado: { data: null, error: errorPg('08006', 'connection failure') },
      })
      createClient.mockReturnValue(falso)

      await expect(
        autorizarDescuentoComoSupervisor({ email: 'x@x.com', password: 'ok', porcentaje: 10 }),
      ).rejects.toThrow('No se pudo autorizar el descuento')
    })

    it('cierra la sesión del cliente temporal incluso si algo falla (no la deja colgada)', async () => {
      const falso = clienteSupervisorFalso({
        rpcResultado: { data: null, error: errorPg('99999', 'lo que sea') },
      })
      createClient.mockReturnValue(falso)

      await expect(
        autorizarDescuentoComoSupervisor({ email: 'x@x.com', password: 'ok', porcentaje: 10 }),
      ).rejects.toThrow()

      expect(falso.auth.signOut).toHaveBeenCalledTimes(1)
    })

    it('si el propio signOut falla, no tapa el resultado real (ni éxito ni el error original)', async () => {
      const falso = clienteSupervisorFalso({ rpcResultado: { data: 'auth-9', error: null } })
      falso.auth.signOut = vi.fn(() => Promise.reject(new Error('signOut roto')))
      createClient.mockReturnValue(falso)

      await expect(
        autorizarDescuentoComoSupervisor({ email: 'x@x.com', password: 'ok', porcentaje: 10 }),
      ).resolves.toBe('auth-9')
    })
  })
})
