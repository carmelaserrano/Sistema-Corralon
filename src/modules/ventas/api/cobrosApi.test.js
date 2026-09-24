import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabaseClient'
import {
  esCuentaCorriente,
  esEfectivo,
  esTarjeta,
  esTransferencia,
  listarMediosPago,
  puedeRegistrarCobros,
  registrarCobro,
} from './cobrosApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(resultado)),
  }
  return builder
}

describe('cobrosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista únicamente los medios de pago activos y ordenados', async () => {
    const builder = crearQueryBuilder({
      data: [{ id: 'm1', nombre: 'Efectivo', activo: true }],
      error: null,
    })
    supabase.from.mockReturnValue(builder)

    const medios = await listarMediosPago()

    expect(supabase.from).toHaveBeenCalledWith('medios_pago')
    expect(builder.select).toHaveBeenCalledWith('id, nombre, activo')
    expect(builder.eq).toHaveBeenCalledWith('activo', true)
    expect(builder.order).toHaveBeenCalledWith('nombre')
    expect(medios).toHaveLength(1)
  })

  it('consulta el permiso ventas.cobrar', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null })

    await expect(puedeRegistrarCobros()).resolves.toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
      p_nombre: 'ventas.cobrar',
    })
  })

  it('registra múltiples medios normalizando importes y referencias', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        venta_id: 'v1',
        cobro_id: 'c1',
        numero: 18,
        total: 1000.5,
        cobrada: true,
        estado_venta: 'Pendiente',
      },
      error: null,
    })
    supabase.rpc.mockReturnValue({ single })

    const resultado = await registrarCobro('v1', [
      {
        medio_pago_id: 'efectivo',
        monto: '400.50',
        monto_recibido: '500',
      },
      {
        medio_pago_id: 'tarjeta',
        monto: '600',
        referencia: '  1234  ',
      },
    ])

    expect(supabase.rpc).toHaveBeenCalledWith('registrar_cobro', {
      p_venta: 'v1',
      p_detalle: [
        {
          medio_pago_id: 'efectivo',
          monto: 400.5,
          monto_recibido: 500,
          referencia: null,
        },
        {
          medio_pago_id: 'tarjeta',
          monto: 600,
          monto_recibido: null,
          referencia: '1234',
        },
      ],
    })
    expect(single).toHaveBeenCalledOnce()
    expect(resultado.numero).toBe(18)
    expect(resultado).toMatchObject({ cobrada: true, estado_venta: 'Pendiente' })
  })

  it('rechaza el detalle vacío, importes no positivos y recibidos inválidos', async () => {
    await expect(registrarCobro('v1', [])).rejects.toMatchObject({ status: 400 })
    await expect(
      registrarCobro('v1', [{ medio_pago_id: 'm1', monto: 0 }]),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      registrarCobro('v1', [
        { medio_pago_id: 'm1', monto: 10, monto_recibido: 'abc' },
      ]),
    ).rejects.toMatchObject({ status: 400 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('traduce total incorrecto y doble cobro a errores comprensibles', async () => {
    const single = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'CV004', message: 'Diferencia: 100.00' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'CV003', message: 'La venta ya tiene un cobro registrado' },
      })
    supabase.rpc.mockReturnValue({ single })
    const detalle = [{ medio_pago_id: 'm1', monto: 100 }]

    await expect(registrarCobro('v1', detalle)).rejects.toMatchObject({
      status: 409,
      message: 'Diferencia: 100.00',
    })
    await expect(registrarCobro('v1', detalle)).rejects.toMatchObject({
      status: 409,
      message: 'La venta ya tiene un cobro registrado',
    })
  })

  it('propaga sin alterar un error desconocido de Supabase', async () => {
    const error = { code: 'XX999', message: 'Conexión interrumpida' }
    supabase.rpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: null, error }),
    })

    await expect(
      registrarCobro('v1', [{ medio_pago_id: 'm1', monto: 100 }]),
    ).rejects.toBe(error)
  })

  it('clasifica los medios por su nombre sin depender de IDs fijos', () => {
    expect(esEfectivo({ nombre: ' Efectivo ' })).toBe(true)
    expect(esTarjeta({ nombre: 'Tarjeta de crédito' })).toBe(true)
    expect(esTransferencia({ nombre: 'Transferencia bancaria' })).toBe(true)
    expect(esCuentaCorriente({ nombre: 'Cuenta corriente' })).toBe(true)
    expect(esEfectivo(null)).toBe(false)
  })
})

describe('contrato SQL de registrar_cobro', () => {
  const migracion = readFileSync(
    'supabase/migrations/0041_cobro_ventas.sql',
    'utf8',
  )
  const baseSprint3 = readFileSync(
    'supabase/migrations/0033_base_sprint3.sql',
    'utf8',
  )

  it('conserva el CHECK operativo original sin agregar Cobrada', () => {
    expect(baseSprint3).toMatch(
      /chk_venta_estado check \(estado in \('Pendiente','Facturada','Entregada','Anulada'\)\)/,
    )
    expect(migracion).not.toMatch(/alter table public\.ventas/i)
    expect(migracion).not.toContain("'Cobrada'")
  })

  it('registra el cobro sin modificar ventas.estado y devuelve el estado real', () => {
    expect(migracion).not.toMatch(/update\s+public\.ventas/i)
    expect(migracion).toMatch(/v_estado_venta\s*<>\s*'Pendiente'/)
    expect(migracion).toMatch(
      /select p_venta, v_cobro_id, v_cobro_numero, v_total_venta,[\s\S]*true, v_estado_venta/,
    )
  })

  it('considera cobrada una venta por la existencia de cobros_venta', () => {
    expect(migracion).toMatch(
      /if exists \(select 1 from public\.cobros_venta cv where cv\.venta_id = p_venta\)/,
    )
    expect(migracion).toMatch(/La venta ya tiene un cobro registrado/)
  })

  it('mantiene la exclusión única por venta para la concurrencia', () => {
    expect(migracion).toMatch(
      /create unique index if not exists uq_cobros_venta_venta[\s\S]*on public\.cobros_venta \(venta_id\)/,
    )
    expect(migracion).toMatch(/for update of v, c/)
    expect(migracion).toMatch(/when unique_violation/)
  })
})
