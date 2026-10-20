import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModalCobro from './ModalCobro'
import { supabase } from '../../../lib/supabaseClient'

// Se usan las APIs reales de cajas y cobros; solo se sustituye el transporte.
// Ninguna prueba se conecta a Supabase remoto.
vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}))

const venta = { id: 'venta-1', numero: 123, total: 1000, estado: 'Pendiente' }
const sesion = {
  id: 's1', caja_id: 'c1', usuario_id: 'admin-uid', estado: 'abierta',
  caja: { nombre: 'Sur/lucas', punto_venta: { numero: '0004', nombre: 'Sucursal Sur' } },
  responsable: { nombre: 'Lucas Cenzano' },
}
let consulta
let resolver
function dibujar(abierto = true) {
  return <ModalCobro abierto={abierto} venta={venta} onCobrado={vi.fn()} onCancelar={vi.fn()} />
}
function completarMedio() {
  fireEvent.change(screen.getByLabelText('Medio de pago 1'), { target: { value: 'otro' } })
  fireEvent.change(screen.getByLabelText('Importe 1'), { target: { value: '1000' } })
}
beforeEach(() => {
  vi.clearAllMocks()
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'admin-uid', email: 'admin@gmail.com' } }, error: null })
  consulta = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  consulta.select.mockReturnValue(consulta)
  consulta.eq.mockReturnValue(consulta)
  consulta.maybeSingle.mockImplementation(() => new Promise(resolve => { resolver = resolve }))
  supabase.from.mockImplementation(tabla => {
    if (tabla === 'sesiones_caja') return consulta
    if (tabla === 'medios_pago') {
      const medios = { select: () => medios, eq: () => medios, order: async () => ({ data: [{ id: 'otro', nombre: 'Otro', activo: true }], error: null }) }
      return medios
    }
    throw new Error(`Tabla inesperada: ${tabla}`)
  })
})
afterEach(cleanup)

describe('modal real + cajasApi: bloque de caja siempre visible', () => {
  it('consulta al abrir, muestra carga antes de Pago 1 y después los datos de Sur/lucas', async () => {
    const vista = render(dibujar(false))
    expect(supabase.auth.getUser).not.toHaveBeenCalled()
    vista.rerender(dibujar())
    const bloque = screen.getByRole('region', { name: 'Caja activa' })
    expect(within(bloque).getByText('Consultando caja activa…')).toBeInTheDocument()
    expect(bloque.compareDocumentPosition(screen.getByText('Pago 1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled()
    await waitFor(() => expect(consulta.maybeSingle).toHaveBeenCalledOnce())
    expect(consulta.eq).toHaveBeenCalledWith('usuario_id', 'admin-uid')
    expect(consulta.eq).toHaveBeenCalledWith('estado', 'abierta')
    expect(consulta.select.mock.calls[0][0]).toContain('responsable:usuarios_internos(nombre)')
    resolver({ data: sesion, error: null })
    await within(bloque).findByText('Sur/lucas')
    expect(within(bloque).getByText('0004 · Sucursal Sur')).toBeInTheDocument()
    expect(within(bloque).getByText('Lucas Cenzano')).toBeInTheDocument()
    expect(within(bloque).getByText('Abierta')).toBeInTheDocument()
    expect(bloque).toHaveAttribute('aria-busy', 'false')
    expect(bloque.closest('form')).toBeNull()
    completarMedio()
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeEnabled()
  })

  it('sin sesión conserva el bloque y muestra el mensaje exacto sin permitir submit', async () => {
    render(dibujar())
    await waitFor(() => expect(consulta.maybeSingle).toHaveBeenCalled())
    resolver({ data: null, error: null })
    await screen.findByText('No hay una caja abierta para registrar el cobro.')
    completarMedio()
    expect(screen.getByRole('region', { name: 'Caja activa' })).toBeInTheDocument()
    const boton = screen.getByRole('button', { name: 'Confirmar cobro' })
    expect(boton).toBeDisabled()
    fireEvent.submit(boton.closest('form'))
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('un request fallido permanece visible en el bloque y bloquea el cobro', async () => {
    render(dibujar())
    await waitFor(() => expect(consulta.maybeSingle).toHaveBeenCalled())
    resolver({ data: null, error: { code: 'PGRST200', message: 'No se pudo cargar la relación' } })
    await within(screen.getByRole('region', { name: 'Caja activa' })).findByText(/No pudimos verificar tu caja activa.*No se pudo cargar la relación/)
    completarMedio()
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled()
  })

  it('una consulta pendiente nunca deja el espacio silenciosamente vacío', async () => {
    render(dibujar())
    await waitFor(() => expect(consulta.maybeSingle).toHaveBeenCalled())
    completarMedio()
    expect(screen.getByRole('region', { name: 'Caja activa' })).toHaveTextContent('Consultando caja activa…')
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled()
  })

  it('sin datos relacionados conserva la sesión y muestra faltantes explícitos', async () => {
    render(dibujar())
    await waitFor(() => expect(consulta.maybeSingle).toHaveBeenCalled())
    resolver({ data: { ...sesion, caja: null, responsable: null }, error: null })
    const bloque = screen.getByRole('region', { name: 'Caja activa' })
    await within(bloque).findByText('Nombre de caja no disponible')
    expect(within(bloque).getByText('No disponible')).toBeInTheDocument()
    expect(within(bloque).getByText('Nombre no disponible')).toBeInTheDocument()
    expect(within(bloque).getByText('Abierta')).toBeInTheDocument()
  })

  it('ignora una respuesta anterior después de cerrar y volver a abrir', async () => {
    const vista = render(dibujar())
    await waitFor(() => expect(consulta.maybeSingle).toHaveBeenCalledOnce())
    const resolverAnterior = resolver
    vista.rerender(dibujar(false))
    vista.rerender(dibujar())
    await waitFor(() => expect(consulta.maybeSingle).toHaveBeenCalledTimes(2))
    resolver({ data: sesion, error: null })
    await screen.findByText('Sur/lucas')
    resolverAnterior({ data: null, error: null })
    await waitFor(() => expect(screen.getByRole('region', { name: 'Caja activa' })).toHaveTextContent('Sur/lucas'))
    expect(screen.queryByText('No hay una caja abierta para registrar el cobro.')).not.toBeInTheDocument()
  })
})
