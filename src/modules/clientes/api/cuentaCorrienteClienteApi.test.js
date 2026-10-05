import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabaseClient'
import {
  actualizarCondicionesCredito,
  listarMediosCobranza,
  listarMovimientosCtaCte,
  listarVentasPendientesCtaCte,
  obtenerResumenCtaCte,
  registrarReciboCobranza,
} from './cuentaCorrienteClienteApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

describe('cuentaCorrienteClienteApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('obtenerResumenCtaCte', () => {
    it('falla si no se proporciona el ID de cliente', async () => {
      await expect(obtenerResumenCtaCte('')).rejects.toThrow('El ID de cliente es obligatorio')
    })

    it('llama a la RPC obtener_resumen_cta_cte_cliente y retorna el resultado', async () => {
      const resumen = {
        cliente_id: 'c1',
        habilita_cta_cte: true,
        limite_credito: 500000,
        plazo_credito_dias: 30,
        saldo_deudor: 120000,
        credito_disponible: 380000,
        facturas_pendientes_count: 2,
      }
      supabase.rpc.mockResolvedValueOnce({ data: resumen, error: null })

      const resultado = await obtenerResumenCtaCte('c1')

      expect(supabase.rpc).toHaveBeenCalledWith('obtener_resumen_cta_cte_cliente', {
        p_cliente_id: 'c1',
      })
      expect(resultado).toEqual(resumen)
    })

    it('propaga el error si la RPC falla', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('Error de conexión') })
      await expect(obtenerResumenCtaCte('c1')).rejects.toThrow('Error de conexión')
    })
  })

  describe('listarMovimientosCtaCte', () => {
    it('falla si no se proporciona el clienteId', async () => {
      await expect(listarMovimientosCtaCte('')).rejects.toThrow('El ID de cliente es obligatorio')
    })

    it('consulta la vista vw_cuenta_corriente_cliente aplicando filtros opcionales', async () => {
      const movimientos = [
        {
          cliente_id: 'c1',
          fecha: '2026-09-01',
          tipo_movimiento: 'factura',
          comprobante: 'FC-A-0001-00000123',
          debe: 50000,
          haber: 0,
          saldo_acumulado: 50000,
        },
      ]

      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        lte: vi.fn(() => builder),
        order: vi.fn((col) => {
          if (col === 'created_at') return Promise.resolve({ data: movimientos, error: null })
          return builder
        }),
      }

      supabase.from.mockReturnValueOnce(builder)

      const resultado = await listarMovimientosCtaCte('c1', {
        desde: '2026-09-01',
        hasta: '2026-09-30',
      })

      expect(supabase.from).toHaveBeenCalledWith('vw_cuenta_corriente_cliente')
      expect(builder.eq).toHaveBeenCalledWith('cliente_id', 'c1')
      expect(builder.gte).toHaveBeenCalledWith('fecha', '2026-09-01')
      expect(builder.lte).toHaveBeenCalledWith('fecha', '2026-09-30')
      expect(resultado).toEqual(movimientos)
    })
  })

  describe('listarVentasPendientesCtaCte', () => {
    it('falla si no se proporciona clienteId', async () => {
      await expect(listarVentasPendientesCtaCte('')).rejects.toThrow('El ID de cliente es obligatorio')
    })

    it('invoca listar_ventas_pendientes_cta_cte', async () => {
      const pendientes = [
        {
          venta_id: 'v1',
          numero: 10,
          fecha: '2026-09-05',
          total_credito: 10000,
          total_imputado: 0,
          saldo_pendiente: 10000,
        },
      ]
      supabase.rpc.mockResolvedValueOnce({ data: pendientes, error: null })

      const res = await listarVentasPendientesCtaCte('c1')

      expect(supabase.rpc).toHaveBeenCalledWith('listar_ventas_pendientes_cta_cte', {
        p_cliente_id: 'c1',
      })
      expect(res).toEqual(pendientes)
    })
  })

  describe('registrarReciboCobranza', () => {
    it('valida campos obligatorios (cliente y medios)', async () => {
      await expect(registrarReciboCobranza({ clienteId: '', medios: [] })).rejects.toThrow(
        'El cliente es obligatorio',
      )
      await expect(
        registrarReciboCobranza({ clienteId: 'c1', medios: [] }),
      ).rejects.toThrow('Debe especificar al menos un medio de cobro')
    })

    it('llama a registrar_recibo_cobranza con el payload adecuado', async () => {
      const recibo = {
        id: 'r1',
        numero: 1,
        total: 50000,
        total_imputado: 50000,
        saldo_a_cuenta: 0,
      }
      supabase.rpc.mockResolvedValueOnce({ data: recibo, error: null })

      const res = await registrarReciboCobranza({
        clienteId: 'c1',
        fecha: '2026-09-10',
        medios: [{ medio_pago_id: 'm1', monto: 50000, referencia: 'TRX-123' }],
        imputaciones: [{ venta_id: 'v1', monto_imputado: 50000 }],
        observaciones: 'Pago factura pendiente',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('registrar_recibo_cobranza', {
        p_cliente_id: 'c1',
        p_fecha: '2026-09-10',
        p_medios: [{ medio_pago_id: 'm1', monto: 50000, referencia: 'TRX-123' }],
        p_imputaciones: [{ venta_id: 'v1', monto_imputado: 50000 }],
        p_observaciones: 'Pago factura pendiente',
      })
      expect(res).toEqual(recibo)
    })
  })

  describe('actualizarCondicionesCredito', () => {
    it('valida clienteId', async () => {
      await expect(actualizarCondicionesCredito('', {})).rejects.toThrow('El cliente es obligatorio')
    })

    it('actualiza los campos de crédito en clientes', async () => {
      const builder = {
        update: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        select: vi.fn(() => builder),
        single: vi.fn(() =>
          Promise.resolve({
            data: { id: 'c1', habilita_cta_cte: true, limite_credito: 1000000, plazo_credito_dias: 60 },
            error: null,
          }),
        ),
      }
      supabase.from.mockReturnValueOnce(builder)

      const res = await actualizarCondicionesCredito('c1', {
        habilita_cta_cte: true,
        limite_credito: 1000000,
        plazo_credito_dias: 60,
      })

      expect(supabase.from).toHaveBeenCalledWith('clientes')
      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          habilita_cta_cte: true,
          limite_credito: 1000000,
          plazo_credito_dias: 60,
        }),
      )
      expect(res.limite_credito).toBe(1000000)
    })
  })

  describe('listarMediosCobranza', () => {
    it('consulta medios_pago activos y excluye cuenta corriente', async () => {
      const mockMedios = [
        { id: 'm1', nombre: 'Efectivo', activo: true },
        { id: 'm2', nombre: 'Cuenta Corriente', activo: true },
        { id: 'm3', nombre: 'Transferencia bancaria', activo: true },
      ]

      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => Promise.resolve({ data: mockMedios, error: null })),
      }
      supabase.from.mockReturnValueOnce(builder)

      const res = await listarMediosCobranza()

      expect(supabase.from).toHaveBeenCalledWith('medios_pago')
      expect(builder.select).toHaveBeenCalledWith('id, nombre, activo')
      expect(builder.eq).toHaveBeenCalledWith('activo', true)
      expect(builder.order).toHaveBeenCalledWith('nombre')
      expect(res).toEqual([
        { id: 'm1', nombre: 'Efectivo', activo: true },
        { id: 'm3', nombre: 'Transferencia bancaria', activo: true },
      ])
    })

    it('propaga el error si falla la consulta', async () => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => Promise.resolve({ data: null, error: new Error('Error de base de datos') })),
      }
      supabase.from.mockReturnValueOnce(builder)

      await expect(listarMediosCobranza()).rejects.toThrow('Error de base de datos')
    })
  })
})
