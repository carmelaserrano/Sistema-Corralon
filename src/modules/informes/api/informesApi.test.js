import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabaseClient'
import {
  listarMediosEgresos,
  listarMediosInforme,
  obtenerEgresos,
  obtenerFacturado,
  obtenerIngresos,
} from './informesApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

function consultaMedios(resultado) {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.order.mockResolvedValue(resultado)
  supabase.from.mockReturnValue(query)
  return query
}

describe('informesApi', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('obtenerEgresos', () => {
    const filtros = { desde: '2026-10-01', hasta: '2026-10-31', agrupacion: 'mes' }

    it('llama a informe_egresos y convierte el monto a número', async () => {
      supabase.rpc.mockResolvedValue({ data: [{ fuente: 'caja', monto: '77.50' }], error: null })

      await expect(obtenerEgresos(filtros)).resolves.toEqual([{ fuente: 'caja', monto: 77.5 }])
      expect(supabase.rpc).toHaveBeenCalledWith('informe_egresos', {
        p_desde: '2026-10-01',
        p_hasta: '2026-10-31',
        p_agrupacion: 'mes',
        p_deposito_ids: null,
        p_medios: null,
      })
    })

    it('manda las sucursales y los medios elegidos', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: null })

      await expect(obtenerEgresos({ ...filtros, sucursales: ['n'], medios: ['Efectivo'] })).resolves.toEqual([])
      expect(supabase.rpc).toHaveBeenCalledWith('informe_egresos', expect.objectContaining({
        p_deposito_ids: ['n'],
        p_medios: ['Efectivo'],
      }))
    })

    it('traduce la falta de permiso', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'x' } })

      await expect(obtenerEgresos(filtros)).rejects.toMatchObject({
        message: 'No tenés permiso para ver informes',
        status: 403,
      })
    })

    it('deja pasar el mensaje de un rango inválido', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'El rango de fechas no es válido' } })

      await expect(obtenerEgresos(filtros)).rejects.toMatchObject({
        message: 'El rango de fechas no es válido',
        status: 400,
      })
    })

    it('avisa con un mensaje propio ante cualquier otro error', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } })

      await expect(obtenerEgresos(filtros)).rejects.toMatchObject({
        message: 'No pudimos calcular los egresos',
        status: 500,
      })
    })
  })

  describe('obtenerIngresos y obtenerFacturado', () => {
    it('convierte los montos a número', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: [{ monto: '10' }], error: null })
      supabase.rpc.mockResolvedValueOnce({ data: [{ monto: '20', cantidad: '2' }], error: null })
      const filtros = { desde: '2026-10-01', hasta: '2026-10-31', agrupacion: 'mes' }

      await expect(obtenerIngresos(filtros)).resolves.toEqual([{ monto: 10 }])
      await expect(obtenerFacturado(filtros)).resolves.toEqual([{ monto: 20, cantidad: 2 }])
    })

    it('fallan con mensaje propio', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: { code: 'XX000' } })
      const filtros = { desde: '2026-10-01', hasta: '2026-10-31', agrupacion: 'mes' }

      await expect(obtenerIngresos(filtros)).rejects.toMatchObject({ message: 'No pudimos calcular los ingresos' })
      await expect(obtenerFacturado(filtros)).rejects.toMatchObject({ message: 'No pudimos calcular lo facturado' })
    })
  })

  describe('medios de pago del filtro', () => {
    const medios = {
      data: [{ nombre: 'Cuenta corriente' }, { nombre: ' cuenta CORRIENTE ' }, { nombre: 'Efectivo' }, { nombre: 'Cheque' }],
      error: null,
    }

    it('los egresos excluyen cuenta corriente sin importar mayúsculas ni espacios, y no agregan Pago online', async () => {
      const query = consultaMedios(medios)

      await expect(listarMediosEgresos()).resolves.toEqual(['Efectivo', 'Cheque'])
      expect(supabase.from).toHaveBeenCalledWith('medios_pago')
      expect(query.eq).toHaveBeenCalledWith('activo', true)
    })

    it('los ingresos mantienen lo de siempre: sin cuenta corriente y con Pago online al final', async () => {
      consultaMedios(medios)

      await expect(listarMediosInforme()).resolves.toEqual(['Efectivo', 'Cheque', 'Pago online'])
    })

    it('falla con mensaje propio si no puede cargarlos', async () => {
      consultaMedios({ data: null, error: { code: 'XX000' } })

      await expect(listarMediosEgresos()).rejects.toMatchObject({ message: 'No pudimos cargar los medios de pago' })
    })
  })
})
