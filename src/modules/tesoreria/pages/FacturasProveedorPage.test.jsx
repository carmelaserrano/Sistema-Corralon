import '@testing-library/jest-dom'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import FacturasProveedorPage from './FacturasProveedorPage'
import * as facturasApi from '../api/facturasProveedorApi'
import { getNotasDisponiblesDelProveedor } from '../../compras/api/notasProveedorApi'

vi.mock('../api/facturasProveedorApi', () => ({
  ESTADOS: ['pendiente'],
  ETIQUETAS_ESTADO: { pendiente: 'Impaga' },
  LETRAS: ['A'],
  calcularDiferenciaImporte: vi.fn(() => 0),
  calcularDiferenciaOc: vi.fn(() => 0),
  createFactura: vi.fn(),
  getFacturaById: vi.fn(),
  getFacturas: vi.fn(),
  getOrdenesCompraDelProveedor: vi.fn(),
  getRecepcionesConfirmadasDelProveedor: vi.fn(),
  normalizarNumero: vi.fn((numero) => numero),
  normalizarSucursal: vi.fn((sucursal) => sucursal),
  puedeRegistrarFacturas: vi.fn(),
  tieneDesglose: vi.fn(() => false),
}))

vi.mock('../../compras/api/notasProveedorApi', () => ({
  ETIQUETAS_TIPO: { CREDITO: 'Nota de Crédito', DEBITO: 'Nota de Débito' },
  getNotasDisponiblesDelProveedor: vi.fn(),
}))

vi.mock('../api/imputacionesApi', () => ({
  calcularMaximoImputable: vi.fn(() => 2000),
  desvincularNota: vi.fn(),
  vincularNotaFactura: vi.fn(),
}))

vi.mock('../../proveedores/api/proveedoresApi', () => ({
  getProveedores: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../components/ui/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

afterEach(cleanup)

describe('FacturasProveedorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    facturasApi.puedeRegistrarFacturas.mockResolvedValue(true)
    facturasApi.getFacturas.mockResolvedValue({
      facturas: [{
        id: 'factura-1',
        proveedor_id: 'prov-1',
        letra: 'A',
        sucursal: '0001',
        numero: '00000141',
        fecha_emision: '2026-10-04',
        importe_total: 5000,
        saldo_pendiente: 5000,
        estado: 'pendiente',
        proveedor: { razon_social: 'Corralón Norte S.A.' },
      }],
    })
    facturasApi.getFacturaById.mockResolvedValue({
      id: 'factura-1',
      proveedor_id: 'prov-1',
      letra: 'A',
      sucursal: '0001',
      numero: '00000141',
      fecha_emision: '2026-10-04',
      importe_total: 5000,
      saldo_pendiente: 5000,
      estado: 'pendiente',
      proveedor: { razon_social: 'Corralón Norte S.A.' },
      recepciones: [],
      imputaciones: [],
    })
    getNotasDisponiblesDelProveedor.mockResolvedValue([{
      id: 'nota-1',
      tipo: 'CREDITO',
      letra: 'A',
      sucursal: '0001',
      numero: '00000041',
      saldo_pendiente: 2000,
    }])
  })

  it('carga notas disponibles por proveedor al abrir el detalle de la factura', async () => {
    render(<FacturasProveedorPage />)

    fireEvent.click(await screen.findByRole('button', { name: /ver detalle/i }))

    await screen.findByLabelText('Vincular una nota disponible')

    expect(getNotasDisponiblesDelProveedor).toHaveBeenCalledWith('prov-1')
    expect(screen.getByRole('option', { name: /Nota de Crédito A 0001-00000041/i })).toBeInTheDocument()
  })
})
