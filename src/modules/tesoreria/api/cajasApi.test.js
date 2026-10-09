import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabaseClient'
import {
  abrirCaja,
  cerrarCaja,
  guardarCaja,
  listarMovimientosCaja,
  listarPuntosVenta,
  obtenerSesionCajaActiva,
  puedeGestionarCajas,
  registrarMovimientoCaja,
} from './cajasApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getUser: vi.fn() } },
}))

describe('cajasApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('consulta el permiso con el nombre solicitado', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null })

    await expect(puedeGestionarCajas('cajas.abrir')).resolves.toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
      p_nombre: 'cajas.abrir',
    })
  })

  it('consulta solo la sesión abierta del usuario actual aunque sea administrador', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.maybeSingle.mockResolvedValue({
      data: { id: 's-1', usuario_id: 'u-1', estado: 'abierta' },
      error: null,
    })
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    })
    supabase.from.mockReturnValue(query)

    await obtenerSesionCajaActiva()

    expect(query.eq).toHaveBeenNthCalledWith(1, 'usuario_id', 'u-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'estado', 'abierta')
  })

  it('abre una caja con saldo inicial numérico', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 's-1' }, error: null })

    await abrirCaja('c-1', '1250.50')

    expect(supabase.rpc).toHaveBeenCalledWith('abrir_caja', {
      p_caja_id: 'c-1',
      p_saldo_inicial: 1250.5,
    })
  })

  it('rechaza saldo inicial o arqueo inválidos antes de llamar a la base', async () => {
    await expect(abrirCaja('c-1', -1)).rejects.toMatchObject({ status: 400 })
    await expect(cerrarCaja('s-1', 'no numérico')).rejects.toMatchObject({ status: 400 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('cierra una sesión con el importe físico declarado', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 's-1', diferencia: -50 }, error: null })

    await cerrarCaja('s-1', '950')

    expect(supabase.rpc).toHaveBeenCalledWith('cerrar_caja', {
      p_sesion_caja_id: 's-1',
      p_monto_declarado: 950,
    })
  })

  it('registra movimientos manuales con motivo y respaldo obligatorios', async () => {
    await expect(registrarMovimientoCaja({
      tipo: 'egreso',
      medio_pago_id: 'm-1',
      monto: 250,
      motivo: 'Compra de insumos',
      comprobante: '',
    })).rejects.toMatchObject({ status: 400 })

    supabase.rpc.mockResolvedValue({ data: { id: 'mov-1' }, error: null })
    await registrarMovimientoCaja({
      tipo: 'egreso',
      medio_pago_id: 'm-1',
      monto: '250.50',
      motivo: '  Compra de insumos  ',
      comprobante: '  Ticket 19  ',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('registrar_movimiento_caja', {
      p_tipo: 'egreso',
      p_medio_pago_id: 'm-1',
      p_monto: 250.5,
      p_motivo: 'Compra de insumos',
      p_comprobante: 'Ticket 19',
    })
  })

  it('conserva la referencia de la sesión al listar sus movimientos', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.order.mockResolvedValue({ data: [{ id: 'mov-1' }], error: null })
    supabase.from.mockReturnValue(query)

    await expect(listarMovimientosCaja('s-1')).resolves.toEqual([{ id: 'mov-1' }])
    expect(supabase.from).toHaveBeenCalledWith('movimientos_caja')
    expect(query.eq).toHaveBeenCalledWith('sesion_caja_id', 's-1')
  })

  it('lista puntos de venta activos con su sucursal asociada', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.order.mockResolvedValue({
      data: [{ id: 'pv-2', deposito_id: 'dep-1', deposito: { nombre: 'Sucursal Norte' } }],
      error: null,
    })
    supabase.from.mockReturnValue(query)

    await expect(listarPuntosVenta()).resolves.toEqual([
      { id: 'pv-2', deposito_id: 'dep-1', deposito: { nombre: 'Sucursal Norte' } },
    ])
    expect(supabase.from).toHaveBeenCalledWith('puntos_venta')
    expect(query.select).toHaveBeenCalledWith(
      'id, numero, nombre, deposito_id, deposito:depositos(id, nombre)',
    )
    expect(query.eq).toHaveBeenCalledWith('activo', true)
  })

  it('valida campos obligatorios al crear o actualizar una caja', async () => {
    await expect(guardarCaja({ nombre: ' Caja 1 ' })).rejects.toMatchObject({ status: 400 })
    await expect(guardarCaja({
      nombre: 'Caja 1',
      punto_venta_id: 'pv-1',
    })).rejects.toMatchObject({ status: 400 })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('contrato SQL de gestión de cajas', () => {
  const migracion = readFileSync(
    'supabase/migrations/0062_gestion_cajas_y_sesiones.sql',
    'utf8',
  )
  const migracionSucursales = readFileSync(
    'supabase/migrations/0064_puntos_venta_por_sucursal.sql',
    'utf8',
  )

  it('define los permisos, unicidad de sesión abierta y políticas RLS', () => {
    expect(migracion).toContain("'cajas.abrir'")
    expect(migracion).toContain("'cajas.cerrar'")
    expect(migracion).toContain("'cajas.operar'")
    expect(migracion).toContain("'cajas.administrar'")
    expect(migracion).toMatch(/enable row level security/i)
    expect(migracion).toMatch(/uq_sesion_caja_abierta_por_caja[\s\S]*where estado = 'abierta'/)
    expect(migracion).toMatch(/uq_sesion_caja_abierta_por_usuario[\s\S]*where estado = 'abierta'/)
  })

  it('imputa cada detalle cobrado a su sesión y mantiene movimientos inmutables', () => {
    expect(migracion).toMatch(/before insert on public\.cobros_venta[\s\S]*asociar_sesion_caja_a_cobro/)
    expect(migracion).toMatch(/after insert on public\.detalle_cobro[\s\S]*registrar_movimiento_por_detalle_cobro/)
    expect(migracion).toContain('Debe abrir una caja antes de registrar un cobro')
    expect(migracion).toContain('Los movimientos de caja son inmutables')
  })

  it('calcula el arqueo únicamente con movimientos en efectivo', () => {
    expect(migracion).toMatch(/v_sesion\.saldo_inicial[\s\S]*sum\(case when mc\.tipo = 'ingreso' then mc\.monto else -mc\.monto end\)/)
    expect(migracion).toMatch(/lower\(mp\.nombre\) = 'efectivo'/)
    expect(migracion).toContain('monto_declarado - v_saldo_teorico')
  })

  it('asocia cada sucursal con su punto de venta y factura según el depósito', () => {
    expect(migracionSucursales).toMatch(/add column if not exists deposito_id uuid/i)
    expect(migracionSucursales).toMatch(/where d\.nombre ilike 'Sucursal %'/i)
    expect(migracionSucursales).toMatch(/uq_punto_venta_deposito[\s\S]*on public\.puntos_venta \(deposito_id\)/i)
    expect(migracionSucursales).toMatch(/chk_caja_cajero_asignado[\s\S]*usuario_asignado_id is not null/i)
    expect(migracionSucursales).toMatch(/pv\.deposito_id = v_venta\.deposito_id/i)
    expect(migracionSucursales).toMatch(/v_punto_venta_id is null and not exists[\s\S]*pv\.deposito_id = v_venta\.deposito_id/i)
  })
})
