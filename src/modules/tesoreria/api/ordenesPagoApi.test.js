import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calcularTotales,
  crearOrdenPago,
  getMediosPago,
  getOrdenesPago,
  puedeRegistrarOrdenesPago,
} from './ordenesPagoApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    is: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve(resultado)),
    maybeSingle: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const datosValidos = {
  proveedor_id: 'prov-1',
  medio_pago_id: 'medio-1',
  fecha: '2026-09-09',
  importe_total: '1000',
  facturas: [{ factura_id: 'f1', importe: '1000' }],
}

describe('ordenesPagoApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calcularTotales', () => {
    it('suma las facturas cuando no hay notas (CA 7)', () => {
      const totales = calcularTotales([{ importe: 100 }, { importe: 250.5 }], [])

      expect(totales).toEqual({ subtotal: 350.5, creditos: 0, debitos: 0, total: 350.5 })
    })

    it('una nota de crédito resta del total a pagar (CA 5)', () => {
      const totales = calcularTotales([{ importe: 1000 }], [{ tipo: 'CREDITO', importe: 200 }])

      expect(totales.creditos).toBe(200)
      expect(totales.total).toBe(800)
    })

    it('una nota de débito suma al total a pagar (CA 6)', () => {
      const totales = calcularTotales([{ importe: 1000 }], [{ tipo: 'DEBITO', importe: 150 }])

      expect(totales.debitos).toBe(150)
      expect(totales.total).toBe(1150)
    })

    it('combina créditos y débitos y redondea a centavos', () => {
      const totales = calcularTotales(
        [{ importe: 1000 }],
        [{ tipo: 'CREDITO', importe: 100.1 }, { tipo: 'DEBITO', importe: 50.2 }],
      )

      expect(totales.total).toBe(950.1)
    })

    it('no explota sin argumentos', () => {
      expect(calcularTotales()).toEqual({ subtotal: 0, creditos: 0, debitos: 0, total: 0 })
    })
  })

  describe('getMediosPago', () => {
    it('trae solo los activos, ordenados por nombre (CA 9)', async () => {
      const builder = crearQueryBuilder({ data: [{ id: 'm1', nombre: 'Efectivo' }], error: null })
      supabase.from.mockReturnValue(builder)

      const medios = await getMediosPago()

      expect(supabase.from).toHaveBeenCalledWith('medios_pago')
      expect(builder.eq).toHaveBeenCalledWith('activo', true)
      expect(builder.order).toHaveBeenCalledWith('nombre')
      expect(medios).toHaveLength(1)
    })
  })

  describe('puedeRegistrarOrdenesPago', () => {
    it('consulta el permiso tesoreria.pago.registrar', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      await puedeRegistrarOrdenesPago()

      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'tesoreria.pago.registrar',
      })
    })
  })

  describe('getOrdenesPago', () => {
    it('aplica los filtros de proveedor y fechas (CA 13)', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await getOrdenesPago({
        proveedorId: 'prov-1',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-12-31',
      })

      expect(builder.eq).toHaveBeenCalledWith('proveedor_id', 'prov-1')
      expect(builder.gte).toHaveBeenCalledWith('fecha', '2026-01-01')
      expect(builder.lte).toHaveBeenCalledWith('fecha', '2026-12-31')
      expect(builder.order).toHaveBeenCalledWith('numero', { ascending: false })
    })
  })

  describe('crearOrdenPago', () => {
    it('rechaza sin proveedor, sin medio de pago o sin facturas', async () => {
      await expect(crearOrdenPago({ ...datosValidos, proveedor_id: '' })).rejects.toMatchObject({ status: 400 })
      await expect(crearOrdenPago({ ...datosValidos, medio_pago_id: '' })).rejects.toMatchObject({ status: 400 })
      await expect(crearOrdenPago({ ...datosValidos, facturas: [] })).rejects.toMatchObject({ status: 400 })

      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('manda las facturas y las notas con importes numéricos', async () => {
      supabase.rpc.mockResolvedValue({ data: { id: 'op-1', numero: 7 }, error: null })

      const creada = await crearOrdenPago({
        ...datosValidos,
        notas: [{ nota_id: 'n1', factura_id: 'f1', importe: '200' }],
        referencia: '  transferencia 123  ',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('crear_orden_pago', {
        p_proveedor_id: 'prov-1',
        p_medio_pago_id: 'medio-1',
        p_fecha: '2026-09-09',
        p_importe_total: 1000,
        p_facturas: [{ factura_id: 'f1', importe: 1000 }],
        p_notas: [{ nota_id: 'n1', factura_id: 'f1', importe: 200 }],
        p_referencia: 'transferencia 123',
        p_observaciones: null,
      })
      expect(creada.numero).toBe(7)
    })

    it('traduce OP003 (supera el máximo imputable) a 400 con el mensaje de la base (CA 8)', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'OP003',
          message: 'El importe a imputar a la factura A-0001-00000001 (900.00) supera su saldo pendiente (máximo imputable: 500.00)',
        },
      })

      await expect(crearOrdenPago(datosValidos)).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('máximo imputable'),
      })
    })

    it('traduce OP004 (total que no coincide) a 409 informando la diferencia (CA 10)', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'OP004',
          message: 'El total imputado (900.00) no coincide con el importe de la orden (1000.00). Diferencia: 100.00',
        },
      })

      await expect(crearOrdenPago(datosValidos)).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('Diferencia'),
      })
    })

    it('traduce OP006 (comprobante no imputable) a 409 y OP002 (inexistente) a 404', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: 'OP006', message: 'La factura no está en un estado imputable' },
      })
      await expect(crearOrdenPago(datosValidos)).rejects.toMatchObject({ status: 409 })

      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: 'OP002', message: 'El proveedor no existe' },
      })
      await expect(crearOrdenPago(datosValidos)).rejects.toMatchObject({ status: 404 })
    })
  })
})
