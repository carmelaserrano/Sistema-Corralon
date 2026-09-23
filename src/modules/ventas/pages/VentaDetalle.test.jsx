import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VentaDetalle from './VentaDetalle'
import { getVentaById } from '../api/consultaVentasApi'
import {
  emitirComprobante,
  descargarComprobantePdf,
  puedeFacturarVentas,
  puedeAnularVentas,
} from '../api/comprobantesApi'

vi.mock('../api/consultaVentasApi', () => ({
  getVentaById: vi.fn(),
}))

vi.mock('../api/comprobantesApi', () => ({
  emitirComprobante: vi.fn(),
  descargarComprobantePdf: vi.fn(),
  puedeFacturarVentas: vi.fn(),
  puedeAnularVentas: vi.fn(),
  determinarLetraComprobante: vi.fn((cond) =>
    cond?.toLowerCase().includes('responsable inscripto') ? 'A' : 'B',
  ),
  calcularDesgloseIva: vi.fn((total) => ({
    total,
    neto: Number((total / 1.21).toFixed(2)),
    iva: Number((total - total / 1.21).toFixed(2)),
  })),
}))

const ventaBase = {
  id: 'v-10',
  numero: 10,
  estado: 'Pendiente',
  total: 1000,
  created_at: '2026-03-20T10:00:00Z',
  cliente: {
    id: 'c-1',
    tipo_persona: 'juridica',
    razon_social: 'Constructora Andes SRL',
    numero_documento: '20123456786',
    condicion_iva: { nombre: 'Responsable Inscripto' },
  },
  detalle: [
    { id: 'd-1', cantidad: 1, precio_unitario: 1000, descuento_pct: 0, subtotal: 1000, producto: { nombre: 'Cemento' } },
  ],
  cobros: [],
  comprobantes: [],
  totalCobrado: 0,
  estaCobrada: false,
  tieneCuentaCorriente: false,
}

describe('VentaDetalle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    puedeFacturarVentas.mockResolvedValue(true)
    puedeAnularVentas.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('muestra estado de carga mientras consulta la API', () => {
    getVentaById.mockReturnValue(new Promise(() => {}))
    render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)
    expect(screen.getByText('Cargando detalle de venta…')).toBeInTheDocument()
  })

  it('muestra mensaje de error si falla la consulta', async () => {
    getVentaById.mockRejectedValue(new Error('Fallo al obtener venta'))
    render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Fallo al obtener venta')).toBeInTheDocument()
    })
  })

  describe('CA-01: Habilitación de Facturar según cobro o cuenta corriente', () => {
    it('deshabilita el botón Facturar si la venta Pendiente NO está cobrada ni tiene cta cte', async () => {
      getVentaById.mockResolvedValue({
        ...ventaBase,
        estaCobrada: false,
        tieneCuentaCorriente: false,
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)

      await waitFor(() => {
        const btnFacturar = screen.getByRole('button', { name: /Facturar \(Factura A\)/i })
        expect(btnFacturar).toBeInTheDocument()
        expect(btnFacturar).toBeDisabled()
      })

      expect(
        screen.getByText(/Requiere estar cobrada o tener Cuenta corriente para facturar/i),
      ).toBeInTheDocument()
    })

    it('sin permiso para facturar, el botón queda deshabilitado y el motivo es el permiso (no el cobro)', async () => {
      puedeFacturarVentas.mockResolvedValue(false)
      getVentaById.mockResolvedValue({
        ...ventaBase,
        totalCobrado: 1000,
        estaCobrada: true,
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)

      // La venta SÍ está cobrada: no corresponde decir que "requiere estar cobrada".
      expect(await screen.findByText('No tenés permiso para facturar ventas.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Facturar \(Factura A\)/i })).toBeDisabled()
      expect(screen.queryByText(/Requiere estar cobrada/i)).not.toBeInTheDocument()
    })

    it('habilita el botón Facturar si la venta Pendiente está cobrada', async () => {
      getVentaById.mockResolvedValue({
        ...ventaBase,
        totalCobrado: 1000,
        estaCobrada: true,
        tieneCuentaCorriente: false,
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)

      await waitFor(() => {
        const btnFacturar = screen.getByRole('button', { name: /Facturar/i })
        expect(btnFacturar).not.toBeDisabled()
      })
    })

    it('habilita el botón Facturar si la venta Pendiente tiene medio Cuenta corriente', async () => {
      getVentaById.mockResolvedValue({
        ...ventaBase,
        totalCobrado: 0,
        estaCobrada: false,
        tieneCuentaCorriente: true,
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)

      await waitFor(() => {
        const btnFacturar = screen.getByRole('button', { name: /Facturar/i })
        expect(btnFacturar).not.toBeDisabled()
      })
    })
  })

  describe('CA-02: Determinación de Letra A vs B', () => {
    it('muestra Factura A para cliente Responsable Inscripto', async () => {
      getVentaById.mockResolvedValue({
        ...ventaBase,
        estaCobrada: true,
        cliente: {
          ...ventaBase.cliente,
          condicion_iva: { nombre: 'Responsable Inscripto' },
        },
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText(/Letra de comprobante: Factura A/i)).toBeInTheDocument()
      })
    })

    it('muestra Factura B para cliente Consumidor Final', async () => {
      getVentaById.mockResolvedValue({
        ...ventaBase,
        estaCobrada: true,
        cliente: {
          id: 'c-2',
          tipo_persona: 'fisica',
          nombre: 'Juan',
          apellido: 'Pérez',
          condicion_iva: { nombre: 'Consumidor Final' },
        },
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText(/Letra de comprobante: Factura B/i)).toBeInTheDocument()
      })
    })
  })

  describe('Emisión de Factura y CA-07 (Impedir refacturación)', () => {
    it('permite confirmar la emisión y emite la factura exitosamente', async () => {
      const onEmitido = vi.fn()
      getVentaById.mockResolvedValue({
        ...ventaBase,
        estaCobrada: true,
      })
      emitirComprobante.mockResolvedValue({
        id: 'comp-1',
        tipo_comprobante: 'factura',
        letra: 'A',
        numero: 1,
        punto_venta_id: 'pv-1',
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} onComprobanteEmitido={onEmitido} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Facturar \(Factura A\)/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Facturar \(Factura A\)/i }))

      expect(screen.getByText(/Confirmar Emisión de Factura A/i)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Confirmar y Emitir/i }))

      await waitFor(() => {
        expect(emitirComprobante).toHaveBeenCalledWith('v-10', 'factura')
        expect(screen.getByText(/Factura A emitida con éxito/i)).toBeInTheDocument()
        expect(onEmitido).toHaveBeenCalled()
      })
    })

    it('el aviso de éxito muestra el punto de venta y número reales, no el UUID', async () => {
      const recargada = {
        ...ventaBase,
        estado: 'Facturada',
        estaCobrada: true,
        comprobantes: [
          {
            id: 'comp-1',
            tipo_comprobante: 'factura',
            letra: 'A',
            numero: 5,
            estado: 'Emitido',
            total: 1000,
            punto_venta: { id: 'pv-uuid', numero: '3' },
          },
        ],
      }
      getVentaById
        .mockResolvedValueOnce({ ...ventaBase, estaCobrada: true })
        .mockResolvedValueOnce(recargada)
      emitirComprobante.mockResolvedValue({
        id: 'comp-1',
        tipo_comprobante: 'factura',
        letra: 'A',
        numero: 5,
        // emitir_comprobante devuelve el id (UUID) del punto de venta, no su número.
        punto_venta_id: '3f2a9c1e-7b1d-4c55-9d0e-aaaaaaaaaaaa',
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)
      fireEvent.click(await screen.findByRole('button', { name: /Facturar \(Factura A\)/i }))
      fireEvent.click(screen.getByRole('button', { name: /Confirmar y Emitir/i }))

      const aviso = await screen.findByText(/Factura A emitida con éxito/i)
      expect(aviso).toHaveTextContent('0003-00000005')
      expect(aviso).not.toHaveTextContent('3f2a9c1e')
    })

    it('si no se pudo recargar el comprobante, el aviso muestra solo el número (nunca el UUID)', async () => {
      getVentaById
        .mockResolvedValueOnce({ ...ventaBase, estaCobrada: true })
        .mockResolvedValueOnce({ ...ventaBase, estado: 'Facturada', comprobantes: [] })
      emitirComprobante.mockResolvedValue({
        id: 'comp-1',
        tipo_comprobante: 'factura',
        letra: 'B',
        numero: 12,
        punto_venta_id: '3f2a9c1e-7b1d-4c55-9d0e-aaaaaaaaaaaa',
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)
      fireEvent.click(await screen.findByRole('button', { name: /Facturar/i }))
      fireEvent.click(screen.getByRole('button', { name: /Confirmar y Emitir/i }))

      const aviso = await screen.findByText(/Factura B emitida con éxito/i)
      expect(aviso).toHaveTextContent('Nº 00000012')
      expect(aviso).not.toHaveTextContent('3f2a9c1e')
    })

    it('no ofrece el botón de facturar si la venta ya está Facturada (CA-07)', async () => {
      getVentaById.mockResolvedValue({
        ...ventaBase,
        estado: 'Facturada',
        comprobantes: [
          {
            id: 'comp-1',
            tipo_comprobante: 'factura',
            letra: 'A',
            numero: 1,
            total: 1000,
            neto: 826.45,
            iva: 173.55,
            cae: 'HOMOLOGACIÓN',
            estado: 'Emitido',
          },
        ],
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Venta Nº 10 — Constructora Andes SRL')).toBeInTheDocument()
      })

      expect(screen.queryByRole('button', { name: /Facturar \(Factura/i })).not.toBeInTheDocument()
    })
  })

  describe('CA-04: Descarga de PDF', () => {
    it('ofrece botón Descargar PDF para comprobantes emitidos y llama a la API', async () => {
      getVentaById.mockResolvedValue({
        ...ventaBase,
        estado: 'Facturada',
        comprobantes: [
          {
            id: 'comp-1',
            tipo_comprobante: 'factura',
            letra: 'A',
            numero: 1,
            total: 1000,
            neto: 826.45,
            iva: 173.55,
            cae: 'HOMOLOGACIÓN',
            estado: 'Emitido',
          },
        ],
      })
      descargarComprobantePdf.mockResolvedValue(new Blob())

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Descargar PDF/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Descargar PDF/i }))

      await waitFor(() => {
        expect(descargarComprobantePdf).toHaveBeenCalledWith('comp-1', true)
      })
    })
  })

  describe('CA-05: Emisión de Nota de Crédito', () => {
    it('ofrece botón Emitir Nota de Crédito para venta Facturada y emite la NC total', async () => {
      const onEmitido = vi.fn()
      getVentaById.mockResolvedValue({
        ...ventaBase,
        estado: 'Facturada',
        comprobantes: [
          {
            id: 'comp-1',
            tipo_comprobante: 'factura',
            letra: 'A',
            numero: 1,
            total: 1000,
            estado: 'Emitido',
          },
        ],
      })
      emitirComprobante.mockResolvedValue({
        id: 'nc-1',
        tipo_comprobante: 'nota_credito',
        letra: 'A',
        numero: 1,
        total: 1000,
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} onComprobanteEmitido={onEmitido} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Emitir Nota de Crédito/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Emitir Nota de Crédito/i }))

      expect(screen.getByText(/Saldo disponible a acreditar de la factura/i)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Confirmar Nota de Crédito/i }))

      await waitFor(() => {
        expect(emitirComprobante).toHaveBeenCalledWith('v-10', 'nota_credito', null)
        expect(screen.getByText(/Nota de Crédito A emitida con éxito/i)).toBeInTheDocument()
      })
    })

    it('permite emitir una Nota de Crédito parcial con monto específico', async () => {
      getVentaById.mockResolvedValue({
        ...ventaBase,
        estado: 'Facturada',
        comprobantes: [
          {
            id: 'comp-1',
            tipo_comprobante: 'factura',
            letra: 'A',
            numero: 1,
            total: 1000,
            estado: 'Emitido',
          },
        ],
      })
      emitirComprobante.mockResolvedValue({
        id: 'nc-2',
        tipo_comprobante: 'nota_credito',
        letra: 'A',
        numero: 2,
        total: 400,
      })

      render(<VentaDetalle ventaId="v-10" onCerrar={vi.fn()} />)

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Emitir Nota de Crédito/i }))
      })

      // Seleccionar opción parcial
      fireEvent.click(screen.getByLabelText(/Parcial/i))

      const inputMonto = screen.getByLabelText(/Monto a acreditar/i)
      fireEvent.change(inputMonto, { target: { value: '400' } })

      fireEvent.click(screen.getByRole('button', { name: /Confirmar Nota de Crédito/i }))

      await waitFor(() => {
        expect(emitirComprobante).toHaveBeenCalledWith('v-10', 'nota_credito', [{ monto: 400 }])
      })
    })
  })

  it('cierra el modal al pulsar la tecla Escape', async () => {
    const onCerrar = vi.fn()
    getVentaById.mockResolvedValue(ventaBase)

    render(<VentaDetalle ventaId="v-10" onCerrar={onCerrar} />)

    await waitFor(() => {
      expect(screen.getByText('Venta Nº 10 — Constructora Andes SRL')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCerrar).toHaveBeenCalled()
  })
})
