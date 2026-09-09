import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LETRAS,
  calcularDiferenciaImporte,
  calcularDiferenciaOc,
  createFactura,
  getFacturas,
  normalizarNumero,
  normalizarSucursal,
  puedeRegistrarFacturas,
  tieneDesglose,
} from './facturasProveedorApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

vi.mock('../../compras/api/ordenesCompraApi', () => ({
  getOrdenesCompra: vi.fn(),
}))

// Mismo helper "thenable" que usan proveedoresApi.test.js / rubrosApi.test.js
// para imitar el query builder de supabase-js.
function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    maybeSingle: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const datosValidos = {
  proveedor_id: 'prov-1',
  letra: 'A',
  sucursal: '1',
  numero: '1234',
  fecha_emision: '2026-09-01',
  importe_total: '1000',
}

describe('facturasProveedorApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('LETRAS', () => {
    it('ofrece únicamente A, B, C y M (CA 2)', () => {
      expect(LETRAS).toEqual(['A', 'B', 'C', 'M'])
    })
  })

  describe('normalizarSucursal / normalizarNumero', () => {
    it('completa con ceros a la izquierda hasta 4 y 8 dígitos (CA 6)', () => {
      expect(normalizarSucursal('1')).toBe('0001')
      expect(normalizarNumero('1234')).toBe('00001234')
    })

    it('deja igual un valor que ya tiene el largo esperado', () => {
      expect(normalizarSucursal('0007')).toBe('0007')
      expect(normalizarNumero('00007654')).toBe('00007654')
    })
  })

  describe('tieneDesglose', () => {
    it('es false cuando no se cargó ni neto ni impuestos', () => {
      expect(tieneDesglose({ importe_neto: '', impuestos: '' })).toBe(false)
      expect(tieneDesglose({})).toBe(false)
    })

    it('es true si se cargó al menos uno de los dos', () => {
      expect(tieneDesglose({ importe_neto: '100', impuestos: '' })).toBe(true)
      expect(tieneDesglose({ importe_neto: '', impuestos: '21' })).toBe(true)
    })
  })

  describe('calcularDiferenciaImporte', () => {
    it('da 0 cuando el total coincide con neto + impuestos (CA 7)', () => {
      expect(calcularDiferenciaImporte(100, 21, 121)).toBe(0)
    })

    it('devuelve la diferencia redondeada a centavos', () => {
      expect(calcularDiferenciaImporte(100, 21, 130)).toBe(9)
    })
  })

  describe('calcularDiferenciaOc', () => {
    it('devuelve null si no hay OC vinculada (CA 4 es opcional)', () => {
      expect(calcularDiferenciaOc(100, null)).toBeNull()
    })

    it('devuelve la diferencia contra el total de la OC (CA 8)', () => {
      expect(calcularDiferenciaOc(150, { total: 100 })).toBe(50)
    })
  })

  describe('puedeRegistrarFacturas', () => {
    it('consulta el permiso tesoreria.factura.registrar', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      const resultado = await puedeRegistrarFacturas()

      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'tesoreria.factura.registrar',
      })
      expect(resultado).toBe(true)
    })
  })

  describe('getFacturas', () => {
    it('lista ordenado por fecha de emisión descendente', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await getFacturas()

      expect(supabase.from).toHaveBeenCalledWith('facturas_proveedor')
      expect(builder.order).toHaveBeenCalledWith('fecha_emision', { ascending: false })
    })

    it('aplica los filtros de proveedor, fechas y estado (CA 10)', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await getFacturas({
        proveedorId: 'prov-1',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-12-31',
        estado: 'pendiente',
      })

      expect(builder.eq).toHaveBeenCalledWith('proveedor_id', 'prov-1')
      expect(builder.gte).toHaveBeenCalledWith('fecha_emision', '2026-01-01')
      expect(builder.lte).toHaveBeenCalledWith('fecha_emision', '2026-12-31')
      expect(builder.eq).toHaveBeenCalledWith('estado', 'pendiente')
    })
  })

  describe('createFactura', () => {
    it('rechaza si falta el proveedor', async () => {
      await expect(createFactura({ ...datosValidos, proveedor_id: '' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza una letra fuera de A/B/C/M', async () => {
      await expect(createFactura({ ...datosValidos, letra: 'X' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza sucursal/número con más dígitos de los permitidos', async () => {
      await expect(
        createFactura({ ...datosValidos, sucursal: '12345' }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('exige confirmación si el total no coincide con neto + impuestos (CA 7)', async () => {
      const promesa = createFactura({
        ...datosValidos,
        importe_neto: '100',
        impuestos: '21',
        importe_total: '200',
      })

      await expect(promesa).rejects.toMatchObject({
        status: 409,
        requiereConfirmacion: true,
        diferenciaImporte: 79,
      })
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('no exige confirmación si no se cargó neto ni impuestos', async () => {
      const builder = crearQueryBuilder({
        data: { id: 'f1', letra: 'A', sucursal: '0001', numero: '00001234' },
        error: null,
      })
      supabase.from.mockReturnValue(builder)

      const creada = await createFactura(datosValidos)

      expect(creada.id).toBe('f1')
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ sucursal: '0001', numero: '00001234' }),
      )
    })

    it('guarda igual si se pasa forzarDiferencia (CA 7)', async () => {
      const builder = crearQueryBuilder({ data: { id: 'f1' }, error: null })
      supabase.from.mockReturnValue(builder)

      const creada = await createFactura({
        ...datosValidos,
        importe_neto: '100',
        impuestos: '21',
        importe_total: '200',
        forzarDiferencia: true,
      })

      expect(creada.id).toBe('f1')
    })

    it('traduce el duplicado (23505) al mensaje de la historia (CA 5)', async () => {
      const builder = crearQueryBuilder({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      })
      supabase.from.mockReturnValue(builder)

      await expect(createFactura(datosValidos)).rejects.toMatchObject({
        message: 'La factura ya fue registrada',
        status: 409,
      })
    })

    it('traduce la violación de chk_factura_letra', async () => {
      const builder = crearQueryBuilder({
        data: null,
        error: { code: '23514', message: 'violates check constraint "chk_factura_letra"' },
      })
      supabase.from.mockReturnValue(builder)

      await expect(createFactura(datosValidos)).rejects.toMatchObject({
        message: 'La letra debe ser A, B, C o M',
        status: 400,
      })
    })
  })
})
