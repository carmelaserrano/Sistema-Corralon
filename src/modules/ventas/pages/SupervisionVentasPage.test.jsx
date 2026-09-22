import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SupervisionVentasPage from './SupervisionVentasPage'
import {
  anularVenta,
  getHistorialEstadoVenta,
  listarVentasSupervision,
  marcarEntregada,
  puedeAnularVentas,
  puedeEntregarVentas,
} from '../api/estadosVentaApi'

vi.mock('../api/estadosVentaApi', () => ({
  anularVenta: vi.fn(),
  getHistorialEstadoVenta: vi.fn(),
  listarVentasSupervision: vi.fn(),
  marcarEntregada: vi.fn(),
  puedeAnularVentas: vi.fn(),
  puedeEntregarVentas: vi.fn(),
}))

function errorDeApi(mensaje, status, extra = {}) {
  const error = new Error(mensaje)
  error.status = status
  Object.assign(error, extra)
  return error
}

const ventaPendiente = {
  id: 'v1', numero: 10, estado: 'Pendiente', total: 1000, created_at: '2026-01-15T10:00:00Z',
  cliente: { id: 'c1', tipo_persona: 'fisica', nombre: 'Ana', apellido: 'Gómez', razon_social: null },
}
const ventaFacturada = {
  id: 'v2', numero: 11, estado: 'Facturada', total: 2000, created_at: '2026-01-16T10:00:00Z',
  cliente: { id: 'c2', tipo_persona: 'juridica', nombre: null, apellido: null, razon_social: 'Cemento SA' },
}
const ventaEntregada = {
  id: 'v3', numero: 12, estado: 'Entregada', total: 3000, created_at: '2026-01-17T10:00:00Z',
  cliente: { id: 'c1', tipo_persona: 'fisica', nombre: 'Ana', apellido: 'Gómez', razon_social: null },
}
const ventaAnulada = {
  id: 'v4', numero: 13, estado: 'Anulada', total: 4000, created_at: '2026-01-18T10:00:00Z',
  cliente: { id: 'c1', tipo_persona: 'fisica', nombre: 'Ana', apellido: 'Gómez', razon_social: null },
}

describe('SupervisionVentasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    puedeEntregarVentas.mockResolvedValue(true)
    puedeAnularVentas.mockResolvedValue(true)
    listarVentasSupervision.mockResolvedValue([ventaFacturada, ventaPendiente])
    getHistorialEstadoVenta.mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listado (CA-01)', () => {
    it('lista las ventas con número, fecha, cliente, total y estado', async () => {
      render(<SupervisionVentasPage />)

      const filaPendiente = (await screen.findByText('10')).closest('tr')
      expect(within(filaPendiente).getByText('Gómez, Ana')).toBeInTheDocument()
      expect(within(filaPendiente).getByText('$ 1.000,00')).toBeInTheDocument()
      expect(within(filaPendiente).getByText('Pendiente')).toBeInTheDocument()

      const filaFacturada = screen.getByText('11').closest('tr')
      expect(within(filaFacturada).getByText('Cemento SA')).toBeInTheDocument()
      expect(within(filaFacturada).getByText('Facturada')).toBeInTheDocument()
    })

    it('sin ventas, muestra el estado vacío', async () => {
      listarVentasSupervision.mockResolvedValue([])
      render(<SupervisionVentasPage />)
      expect(await screen.findByText('No hay ventas para estos filtros')).toBeInTheDocument()
    })

    it('si falla la carga, muestra el error', async () => {
      listarVentasSupervision.mockRejectedValue(new Error('sin conexión'))
      render(<SupervisionVentasPage />)
      expect(await screen.findByText('sin conexión')).toBeInTheDocument()
    })
  })

  describe('filtros (CA-01)', () => {
    it('carga sin filtros al entrar', async () => {
      render(<SupervisionVentasPage />)
      await screen.findByText('10')
      expect(listarVentasSupervision).toHaveBeenCalledWith({})
    })

    it('Filtrar manda estado, desde y hasta', async () => {
      render(<SupervisionVentasPage />)
      await screen.findByText('10')

      fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'Facturada' } })
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-01-01' } })
      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-01-31' } })
      fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }))

      await waitFor(() =>
        expect(listarVentasSupervision).toHaveBeenLastCalledWith({
          estado: 'Facturada',
          desde: '2026-01-01',
          hasta: '2026-01-31',
        }),
      )
    })

    it('Limpiar vacía los filtros y vuelve a cargar sin ellos', async () => {
      render(<SupervisionVentasPage />)
      await screen.findByText('10')

      fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'Anulada' } })
      fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))

      expect(screen.getByLabelText('Estado').value).toBe('')
      await waitFor(() => expect(listarVentasSupervision).toHaveBeenLastCalledWith({}))
    })
  })

  describe('detalle de una venta (CA-06)', () => {
    it('Ver detalle abre el modal con la venta y su historial', async () => {
      getHistorialEstadoVenta.mockResolvedValue([
        { id: 'h1', estado_anterior: null, estado_nuevo: 'Pendiente', motivo: null, usuario_id: 'u1', created_at: '2026-01-15T10:00:00Z' },
      ])
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('10')).closest('tr')

      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))

      expect(await screen.findByText('Nº 10 — Gómez, Ana')).toBeInTheDocument()
      expect(getHistorialEstadoVenta).toHaveBeenCalledWith('v1')
      // La tabla de ventas sigue en el DOM detrás del modal, así que se
      // busca la fila del historial específicamente, no en toda la pantalla.
      expect(
        within(screen.getByRole('dialog')).getByRole('row', { name: /Pendiente/ }),
      ).toBeInTheDocument()
    })

    it('sin historial, muestra el mensaje correspondiente', async () => {
      render(<SupervisionVentasPage />)
      fireEvent.click((await screen.findByText('10')).closest('tr').querySelector('button'))
      expect(
        await screen.findByText('Esta venta no registra cambios de estado.'),
      ).toBeInTheDocument()
    })

    it('cierra con el botón X, con Escape, y tocando el fondo (no el panel)', async () => {
      render(<SupervisionVentasPage />)
      fireEvent.click((await screen.findByText('10')).closest('tr').querySelector('button'))
      await screen.findByRole('dialog')

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      fireEvent.click((await screen.findByText('10')).closest('tr').querySelector('button'))
      await screen.findByRole('dialog')
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      fireEvent.click((await screen.findByText('10')).closest('tr').querySelector('button'))
      const { container } = { container: document.body }
      fireEvent.mouseDown(container.querySelector('.modal-backdrop'))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('Marcar entregada (CA-03)', () => {
    it('se ofrece solo para una venta Facturada, con el permiso', async () => {
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('11')).closest('tr')
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))

      expect(await screen.findByRole('button', { name: 'Marcar entregada' })).toBeInTheDocument()
    })

    it('no se ofrece para una Pendiente', async () => {
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('10')).closest('tr')
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))

      await screen.findByRole('dialog')
      expect(screen.queryByRole('button', { name: 'Marcar entregada' })).not.toBeInTheDocument()
    })

    it('sin el permiso ventas.entregar, no se ofrece aunque esté Facturada', async () => {
      puedeEntregarVentas.mockResolvedValue(false)
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('11')).closest('tr')
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))

      await screen.findByRole('dialog')
      expect(screen.queryByRole('button', { name: 'Marcar entregada' })).not.toBeInTheDocument()
    })

    it('al confirmar, llama a marcarEntregada y actualiza la fila sin cerrar el modal', async () => {
      marcarEntregada.mockResolvedValue({ id: 'v2', estado: 'Entregada' })
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('11')).closest('tr')
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))

      fireEvent.click(await screen.findByRole('button', { name: 'Marcar entregada' }))

      expect(marcarEntregada).toHaveBeenCalledWith('v2')
      expect(await screen.findByText('Venta marcada como entregada')).toBeInTheDocument()
      // El modal sigue abierto y ya no ofrece "Marcar entregada" (Entregada es final).
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Marcar entregada' })).not.toBeInTheDocument()
      // La fila del listado también se actualizó.
      expect(within(fila).getByText('Entregada')).toBeInTheDocument()
    })

    it('si falla, muestra el error sin romper el modal', async () => {
      marcarEntregada.mockRejectedValue(new Error('No se pudo marcar la venta como entregada'))
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('11')).closest('tr')
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Marcar entregada' }))

      expect(
        await screen.findByText('No se pudo marcar la venta como entregada'),
      ).toBeInTheDocument()
    })
  })

  describe('Anular (CA-04)', () => {
    it('se ofrece para una Pendiente, con el permiso', async () => {
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('10')).closest('tr')
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))
      expect(await screen.findByRole('button', { name: 'Anular' })).toBeInTheDocument()
    })

    it('sin el permiso ventas.anular, no se ofrece', async () => {
      puedeAnularVentas.mockResolvedValue(false)
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('10')).closest('tr')
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))
      await screen.findByRole('dialog')
      expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
    })

    it('exige motivo antes de llamar a la API', async () => {
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('10')).closest('tr')
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Anular' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

      expect(await screen.findByText('El motivo es obligatorio para anular')).toBeInTheDocument()
      expect(anularVenta).not.toHaveBeenCalled()
    })

    it('confirma con motivo, llama a anularVenta y actualiza la fila', async () => {
      anularVenta.mockResolvedValue({ id: 'v1', estado: 'Anulada' })
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('10')).closest('tr')
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Anular' }))

      fireEvent.change(screen.getByLabelText('Motivo de la anulación'), {
        target: { value: 'el cliente se arrepintió' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

      await waitFor(() => expect(anularVenta).toHaveBeenCalledWith('v1', 'el cliente se arrepintió'))
      expect(await screen.findByText('Venta anulada')).toBeInTheDocument()
      // El form de motivo se cierra solo tras confirmar.
      expect(screen.queryByLabelText('Motivo de la anulación')).not.toBeInTheDocument()
      expect(within(fila).getByText('Anulada')).toBeInTheDocument()
    })

    it('Cancelar cierra el formulario sin llamar a la API', async () => {
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('10')).closest('tr')
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Anular' }))
      fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: 'algo' } })

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByLabelText('Motivo de la anulación')).not.toBeInTheDocument()
      expect(anularVenta).not.toHaveBeenCalled()
    })

    it('CA-05: sobre una Facturada, el error de "necesita Nota de Crédito" se muestra tal cual', async () => {
      anularVenta.mockRejectedValue(
        errorDeApi(
          'Una venta facturada no se puede anular directamente: generá una Nota de Crédito por el total',
          409,
          { requiereNotaCredito: true },
        ),
      )
      render(<SupervisionVentasPage />)
      const fila = (await screen.findByText('11')).closest('tr') // ventaFacturada
      fireEvent.click(within(fila).getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Anular' }))
      fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: 'motivo' } })
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

      expect(
        await screen.findByText(/generá una Nota de Crédito por el total/),
      ).toBeInTheDocument()
      // Sigue Facturada: no se aplicó ningún cambio local optimista sobre un error.
      expect(within(fila).getByText('Facturada')).toBeInTheDocument()
    })
  })

  describe('estados finales (Entregada / Anulada)', () => {
    it('una venta Entregada no ofrece ninguna acción', async () => {
      listarVentasSupervision.mockResolvedValue([ventaEntregada])
      render(<SupervisionVentasPage />)
      fireEvent.click((await screen.findByText('12')).closest('tr').querySelector('button'))

      await screen.findByRole('dialog')
      expect(screen.queryByRole('button', { name: 'Marcar entregada' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
    })

    it('una venta Anulada no ofrece ninguna acción', async () => {
      listarVentasSupervision.mockResolvedValue([ventaAnulada])
      render(<SupervisionVentasPage />)
      fireEvent.click((await screen.findByText('13')).closest('tr').querySelector('button'))

      await screen.findByRole('dialog')
      expect(screen.queryByRole('button', { name: 'Marcar entregada' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
    })
  })

  describe('cambiar de venta sin arrastrar estado (misma lección que Clientes/Domicilios)', () => {
    it('abrir el detalle de otra venta muestra un formulario de anulación limpio', async () => {
      render(<SupervisionVentasPage />)
      const filaPendiente = (await screen.findByText('10')).closest('tr')
      fireEvent.click(within(filaPendiente).getByRole('button', { name: 'Ver detalle' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Anular' }))
      fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: 'texto viejo' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      const filaFacturada = screen.getByText('11').closest('tr')
      fireEvent.click(within(filaFacturada).getByRole('button', { name: 'Ver detalle' }))

      expect(await screen.findByText('Nº 11 — Cemento SA')).toBeInTheDocument()
      expect(screen.queryByLabelText('Motivo de la anulación')).not.toBeInTheDocument()
    })
  })
})
