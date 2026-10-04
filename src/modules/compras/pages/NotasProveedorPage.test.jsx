import '@testing-library/jest-dom'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import NotasProveedorPage from './NotasProveedorPage'
import * as notasApi from '../api/notasProveedorApi'
import { getFacturasConSaldoDelProveedor } from '../../tesoreria/api/facturasProveedorApi'

vi.mock('../api/notasProveedorApi', () => ({
  ESTADOS: ['disponible'],
  ETIQUETAS_ESTADO: { disponible: 'Disponible' },
  ETIQUETAS_TIPO: { CREDITO: 'Nota de Crédito', DEBITO: 'Nota de Débito' },
  LETRAS: ['A'],
  TIPOS: ['CREDITO', 'DEBITO'],
  createNota: vi.fn(),
  eliminarNota: vi.fn(),
  getNotaById: vi.fn(),
  getNotas: vi.fn(),
  puedeRegistrarNotas: vi.fn(),
}))

vi.mock('../../tesoreria/api/facturasProveedorApi', () => ({
  getFacturasConSaldoDelProveedor: vi.fn(),
  normalizarNumero: vi.fn((numero) => numero),
  normalizarSucursal: vi.fn((sucursal) => sucursal),
}))

vi.mock('../../tesoreria/api/imputacionesApi', () => ({
  calcularMaximoImputable: vi.fn(() => 2000),
  desvincularNota: vi.fn(),
  getImputacionesDeNota: vi.fn(),
  vincularNotaFactura: vi.fn(),
}))

vi.mock('../../proveedores/api/proveedoresApi', () => ({
  getProveedores: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../components/ui/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

afterEach(cleanup)

describe('NotasProveedorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    notasApi.puedeRegistrarNotas.mockResolvedValue(true)
    notasApi.getNotas.mockResolvedValue({
      notas: [{
        id: 'nota-1',
        proveedor_id: 'prov-1',
        tipo: 'CREDITO',
        letra: 'A',
        sucursal: '0001',
        numero: '00000041',
        fecha: '2026-10-04',
        importe: 2000,
        saldo_pendiente: 2000,
        estado: 'disponible',
        proveedor: { razon_social: 'Corralón Norte S.A.' },
      }],
    })
    notasApi.getNotaById.mockResolvedValue({
      id: 'nota-1',
      proveedor_id: 'prov-1',
      tipo: 'CREDITO',
      letra: 'A',
      sucursal: '0001',
      numero: '00000041',
      fecha: '2026-10-04',
      importe: 2000,
      saldo_pendiente: 2000,
      estado: 'disponible',
      proveedor: { razon_social: 'Corralón Norte S.A.' },
    })
    getFacturasConSaldoDelProveedor.mockResolvedValue([{
      id: 'factura-1',
      letra: 'A',
      sucursal: '0001',
      numero: '00000141',
      saldo_pendiente: 5000,
    }])
  })

  it('carga las facturas del proveedor de la nota al abrir su detalle', async () => {
    render(<NotasProveedorPage />)

    fireEvent.click(await screen.findByRole('button', { name: /ver detalle/i }))

    await screen.findByLabelText('Factura con saldo pendiente')

    expect(getFacturasConSaldoDelProveedor).toHaveBeenCalledWith('prov-1')
    expect(screen.getByRole('option', { name: /A 0001-00000141/i })).toBeInTheDocument()
  })
})
