import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calcularMaximoImputable,
  desvincularNota,
  vincularNotaFactura,
} from './imputacionesApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

const notaCredito = { tipo: 'CREDITO', saldo_pendiente: 500 }
const notaDebito = { tipo: 'DEBITO', saldo_pendiente: 500 }

describe('imputacionesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calcularMaximoImputable', () => {
    it('para una nota de CRÉDITO toma el menor entre el saldo de la nota y el de la factura (CA 5)', () => {
      expect(calcularMaximoImputable(notaCredito, { saldo_pendiente: 300 })).toBe(300)
      expect(calcularMaximoImputable(notaCredito, { saldo_pendiente: 900 })).toBe(500)
    })

    it('para una nota de DÉBITO solo mira el saldo de la nota, porque aumenta el de la factura', () => {
      expect(calcularMaximoImputable(notaDebito, { saldo_pendiente: 10 })).toBe(500)
    })

    it('nunca devuelve un máximo negativo', () => {
      expect(calcularMaximoImputable(notaCredito, { saldo_pendiente: -100 })).toBe(0)
    })

    it('devuelve 0 si falta la nota o la factura', () => {
      expect(calcularMaximoImputable(null, { saldo_pendiente: 100 })).toBe(0)
      expect(calcularMaximoImputable(notaCredito, null)).toBe(0)
    })
  })

  describe('vincularNotaFactura', () => {
    it('llama al RPC con los tres parámetros', async () => {
      supabase.rpc.mockResolvedValue({ data: { id: 'imp-1' }, error: null })

      const creada = await vincularNotaFactura({
        notaId: 'n1',
        facturaId: 'f1',
        importe: '250.50',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('vincular_nota_factura', {
        p_nota_id: 'n1',
        p_factura_id: 'f1',
        p_importe: 250.5,
      })
      expect(creada.id).toBe('imp-1')
    })

    it('rechaza un importe no positivo sin llegar a la base', async () => {
      await expect(
        vincularNotaFactura({ notaId: 'n1', facturaId: 'f1', importe: '0' }),
      ).rejects.toMatchObject({ status: 400 })

      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('traduce IM001 (supera el máximo imputable) a 400 con el mensaje de la base (CA 5)', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: 'IM001', message: 'El importe a imputar (900.00) supera el máximo imputable (500.00)' },
      })

      await expect(
        vincularNotaFactura({ notaId: 'n1', facturaId: 'f1', importe: 900 }),
      ).rejects.toMatchObject({
        message: 'El importe a imputar (900.00) supera el máximo imputable (500.00)',
        status: 400,
      })
    })

    it('traduce IM003 (factura totalmente pagada) a 409 (CA 7)', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: 'IM003', message: 'La factura ya está totalmente pagada' },
      })

      await expect(
        vincularNotaFactura({ notaId: 'n1', facturaId: 'f1', importe: 100 }),
      ).rejects.toMatchObject({ status: 409 })
    })

    it('traduce IM002 (no existe) a 404', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: 'IM002', message: 'La nota no existe' },
      })

      await expect(
        vincularNotaFactura({ notaId: 'n1', facturaId: 'f1', importe: 100 }),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('traduce IM004 (proveedores distintos) y IM006 (ya vinculada) a 409', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: 'IM004', message: 'La nota y la factura son de proveedores distintos' },
      })
      await expect(
        vincularNotaFactura({ notaId: 'n1', facturaId: 'f1', importe: 100 }),
      ).rejects.toMatchObject({ status: 409 })

      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: 'IM006', message: 'La nota ya está vinculada a esa factura' },
      })
      await expect(
        vincularNotaFactura({ notaId: 'n1', facturaId: 'f1', importe: 100 }),
      ).rejects.toMatchObject({ status: 409 })
    })
  })

  describe('desvincularNota', () => {
    it('llama al RPC con el id de la imputación (CA 6)', async () => {
      supabase.rpc.mockResolvedValue({ error: null })

      await desvincularNota('imp-1')

      expect(supabase.rpc).toHaveBeenCalledWith('desvincular_nota_factura', {
        p_imputacion_id: 'imp-1',
      })
    })

    it('traduce IM005 (ya deshecha) a 409', async () => {
      supabase.rpc.mockResolvedValue({
        error: { code: 'IM005', message: 'La vinculación ya fue deshecha' },
      })

      await expect(desvincularNota('imp-1')).rejects.toMatchObject({ status: 409 })
    })
  })
})
