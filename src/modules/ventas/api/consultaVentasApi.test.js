import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listarVentas, getVentaById } from './consultaVentasApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const ventaMock = {
  id: 'v-1',
  numero: 101,
  estado: 'Pendiente',
  total: 5000,
  observaciones: 'Entregar por la tarde',
  created_at: '2026-03-10T14:30:00Z',
  deposito_id: 'dep-1',
  cliente: {
    id: 'c-1',
    tipo_persona: 'juridica',
    razon_social: 'Constructora Andes SRL',
    numero_documento: '20123456786',
    condicion_iva: { id: 'ci-1', nombre: 'Responsable Inscripto' },
  },
  comprobantes: [],
  cobros: [],
}

describe('consultaVentasApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listarVentas', () => {
    it('sin filtros, consulta todas las ventas ordenadas por fecha descendente', async () => {
      const builder = crearQueryBuilder({ data: [ventaMock], error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await listarVentas()

      expect(supabase.from).toHaveBeenCalledWith('ventas')
      expect(builder.select).toHaveBeenCalled()
      expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(resultado).toEqual([ventaMock])
    })

    it('aplica filtro por estado si se especifica', async () => {
      const builder = crearQueryBuilder({ data: [ventaMock], error: null })
      supabase.from.mockReturnValue(builder)

      await listarVentas({ estado: 'Pendiente' })

      expect(builder.eq).toHaveBeenCalledWith('estado', 'Pendiente')
    })

    it('aplica filtro por clienteId si se especifica', async () => {
      const builder = crearQueryBuilder({ data: [ventaMock], error: null })
      supabase.from.mockReturnValue(builder)

      await listarVentas({ clienteId: 'c-1' })

      expect(builder.eq).toHaveBeenCalledWith('cliente_id', 'c-1')
    })

    it('filtra por rango de fechas desde y hasta', async () => {
      const builder = crearQueryBuilder({ data: [ventaMock], error: null })
      supabase.from.mockReturnValue(builder)

      await listarVentas({ desde: '2026-03-01', hasta: '2026-03-10' })

      expect(builder.gte).toHaveBeenCalledWith('created_at', '2026-03-01T00:00:00')
      expect(builder.lt).toHaveBeenCalled()
      const [, valor] = builder.lt.mock.calls[0]
      expect(new Date(valor).getDate()).toBe(11)
    })

    it('devuelve array vacío si data es null', async () => {
      const builder = crearQueryBuilder({ data: null, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await listarVentas()
      expect(resultado).toEqual([])
    })

    it('propaga error si la consulta falla', async () => {
      const error = new Error('Error al consultar ventas')
      const builder = crearQueryBuilder({ data: null, error })
      supabase.from.mockReturnValue(builder)

      await expect(listarVentas()).rejects.toThrow('Error al consultar ventas')
    })
  })

  describe('getVentaById', () => {
    it('pide el SKU del producto y no una columna "codigo", que productos no tiene', async () => {
      // productos tiene sku y codigo_barras (0001/0002). Pedir `codigo` hacía
      // que PostgREST devolviera "column productos_1.codigo does not exist" y
      // el detalle de la venta no cargaba en la base real (los mocks no lo ven).
      const builder = crearQueryBuilder({ data: ventaMock, error: null })
      supabase.from.mockReturnValue(builder)

      await getVentaById('v-1')

      const seleccion = builder.select.mock.calls[0][0]
      expect(seleccion).toMatch(/producto:productos\(id, nombre, sku\)/)
      expect(seleccion).not.toMatch(/\bcodigo\b/)
    })

    it('exige id de la venta', async () => {
      await expect(getVentaById(null)).rejects.toThrow('El ID de la venta es obligatorio')
    })

    it('obtiene la venta completa y calcula estaCobrada = false si no hay cobros suficientes', async () => {
      const builder = crearQueryBuilder({ data: { ...ventaMock, total: 5000, cobros: [] }, error: null })
      supabase.from.mockReturnValue(builder)

      const venta = await getVentaById('v-1')

      expect(supabase.from).toHaveBeenCalledWith('ventas')
      expect(builder.eq).toHaveBeenCalledWith('id', 'v-1')
      expect(venta.totalCobrado).toBe(0)
      expect(venta.estaCobrada).toBe(false)
      expect(venta.tieneCuentaCorriente).toBe(false)
    })

    it('calcula estaCobrada = true cuando la suma de cobros cubre el total de la venta', async () => {
      const ventaConCobros = {
        ...ventaMock,
        total: 5000,
        cobros: [
          {
            id: 'cob-1',
            total: 3000,
            detalle: [{ id: 'dc-1', monto: 3000, medio_pago: { id: 'mp-1', nombre: 'Efectivo' } }],
          },
          {
            id: 'cob-2',
            total: 2000,
            detalle: [{ id: 'dc-2', monto: 2000, medio_pago: { id: 'mp-2', nombre: 'Tarjeta de débito' } }],
          },
        ],
      }
      const builder = crearQueryBuilder({ data: ventaConCobros, error: null })
      supabase.from.mockReturnValue(builder)

      const venta = await getVentaById('v-1')

      expect(venta.totalCobrado).toBe(5000)
      expect(venta.estaCobrada).toBe(true)
      expect(venta.tieneCuentaCorriente).toBe(false)
    })

    it('detecta tieneCuentaCorriente = true si algún cobro tiene medio Cuenta corriente', async () => {
      const ventaCtaCte = {
        ...ventaMock,
        total: 10000,
        cobros: [
          {
            id: 'cob-1',
            total: 10000,
            detalle: [{ id: 'dc-1', monto: 10000, medio_pago: { id: 'mp-3', nombre: 'Cuenta corriente' } }],
          },
        ],
      }
      const builder = crearQueryBuilder({ data: ventaCtaCte, error: null })
      supabase.from.mockReturnValue(builder)

      const venta = await getVentaById('v-1')

      expect(venta.tieneCuentaCorriente).toBe(true)
      expect(venta.estaCobrada).toBe(true)
    })

    it('lanza 404 si la venta no existe', async () => {
      const builder = crearQueryBuilder({ data: null, error: null })
      supabase.from.mockReturnValue(builder)

      await expect(getVentaById('v-999')).rejects.toMatchObject({
        status: 404,
        message: 'Venta no encontrada',
      })
    })

    it('propaga error si supabase falla', async () => {
      const error = new Error('Fallo de red')
      const builder = crearQueryBuilder({ data: null, error })
      supabase.from.mockReturnValue(builder)

      await expect(getVentaById('v-1')).rejects.toThrow('Fallo de red')
    })
  })
})
