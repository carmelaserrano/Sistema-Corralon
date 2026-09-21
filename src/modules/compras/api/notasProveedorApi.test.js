import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ESTADOS,
  ETIQUETAS_ESTADO,
  TIPOS,
  createNota,
  eliminarNota,
  getNotas,
  puedeRegistrarNotas,
} from './notasProveedorApi'
import { supabase } from '../../../lib/supabaseClient'
import { vincularNotaFactura } from '../../tesoreria/api/imputacionesApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

vi.mock('../../tesoreria/api/imputacionesApi', () => ({
  vincularNotaFactura: vi.fn(),
}))

// Mismo helper "thenable" que facturasProveedorApi.test.js.
function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    maybeSingle: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

const datosValidos = {
  proveedor_id: 'prov-1',
  tipo: 'CREDITO',
  letra: 'A',
  sucursal: '1',
  numero: '1234',
  fecha: '2026-09-01',
  importe: '500',
}

describe('notasProveedorApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('TIPOS / ESTADOS', () => {
    it('ofrece CREDITO y DEBITO (CA 2)', () => {
      expect(TIPOS).toEqual(['CREDITO', 'DEBITO'])
    })

    it('etiqueta los estados como pide la historia (CA 9)', () => {
      expect(ESTADOS.map((e) => ETIQUETAS_ESTADO[e])).toEqual([
        'Disponible',
        'Aplicada parcial',
        'Aplicada',
        'Anulada',
      ])
    })
  })

  describe('puedeRegistrarNotas', () => {
    it('consulta el permiso tesoreria.nota_credito.registrar', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      const resultado = await puedeRegistrarNotas()

      expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', {
        p_nombre: 'tesoreria.nota_credito.registrar',
      })
      expect(resultado).toBe(true)
    })
  })

  describe('getNotas', () => {
    it('lista ordenado por fecha descendente', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await getNotas()

      expect(supabase.from).toHaveBeenCalledWith('notas_proveedor')
      expect(builder.order).toHaveBeenCalledWith('fecha', { ascending: false })
    })

    it('aplica los filtros de proveedor, tipo, estado y fechas (CA 9)', async () => {
      const builder = crearQueryBuilder({ data: [], count: 0, error: null })
      supabase.from.mockReturnValue(builder)

      await getNotas({
        proveedorId: 'prov-1',
        tipo: 'DEBITO',
        estado: 'disponible',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-12-31',
      })

      expect(builder.eq).toHaveBeenCalledWith('proveedor_id', 'prov-1')
      expect(builder.eq).toHaveBeenCalledWith('tipo', 'DEBITO')
      expect(builder.eq).toHaveBeenCalledWith('estado', 'disponible')
      expect(builder.gte).toHaveBeenCalledWith('fecha', '2026-01-01')
      expect(builder.lte).toHaveBeenCalledWith('fecha', '2026-12-31')
    })
  })

  describe('createNota', () => {
    it('rechaza si falta el proveedor', async () => {
      await expect(createNota({ ...datosValidos, proveedor_id: '' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza un tipo fuera de CREDITO/DEBITO', async () => {
      await expect(createNota({ ...datosValidos, tipo: 'OTRO' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza una letra fuera de A/B/C/M', async () => {
      await expect(createNota({ ...datosValidos, letra: 'X' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza sucursal/número con más dígitos de los permitidos', async () => {
      await expect(createNota({ ...datosValidos, numero: '123456789' })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('completa sucursal/número con ceros a la izquierda antes de insertar (CA 3)', async () => {
      const builder = crearQueryBuilder({ data: { id: 'n1' }, error: null })
      supabase.from.mockReturnValue(builder)

      await createNota(datosValidos)

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ sucursal: '0001', numero: '00001234' }),
      )
    })

    it('crea la imputación cuando se elige una factura, por el importe completo', async () => {
      const builder = crearQueryBuilder({ data: { id: 'n1' }, error: null })
      supabase.from.mockReturnValue(builder)

      await createNota({ ...datosValidos, factura_id: 'fact-1' })

      // El vínculo vive en `imputaciones` desde S2-17, no en una columna.
      expect(builder.insert).toHaveBeenCalledWith(
        expect.not.objectContaining({ factura_id: expect.anything() }),
      )
      expect(vincularNotaFactura).toHaveBeenCalledWith({
        notaId: 'n1',
        facturaId: 'fact-1',
        importe: 500,
      })
    })

    it('no crea ninguna imputación si no se elige factura: la nota queda Disponible', async () => {
      const builder = crearQueryBuilder({ data: { id: 'n1' }, error: null })
      supabase.from.mockReturnValue(builder)

      await createNota(datosValidos)

      expect(vincularNotaFactura).not.toHaveBeenCalled()
    })

    it('avisa que la nota quedó Disponible si falla la vinculación', async () => {
      const builder = crearQueryBuilder({ data: { id: 'n1' }, error: null })
      supabase.from.mockReturnValue(builder)
      vincularNotaFactura.mockRejectedValueOnce(new Error('La factura ya está totalmente pagada'))

      await expect(
        createNota({ ...datosValidos, factura_id: 'fact-1' }),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('Quedó Disponible'),
      })
    })

    it('traduce el duplicado (23505) al mensaje de la historia (CA 8)', async () => {
      const builder = crearQueryBuilder({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      })
      supabase.from.mockReturnValue(builder)

      await expect(createNota(datosValidos)).rejects.toMatchObject({
        message: 'La nota ya fue registrada',
        status: 409,
      })
    })

    it('traduce NT003 (factura de otro proveedor) a 409', async () => {
      const builder = crearQueryBuilder({
        data: null,
        error: { code: 'NT003', message: 'La factura vinculada no pertenece al proveedor de la nota' },
      })
      supabase.from.mockReturnValue(builder)

      await expect(createNota(datosValidos)).rejects.toMatchObject({
        message: 'La factura vinculada no pertenece al proveedor de la nota',
        status: 409,
      })
    })
  })

  describe('eliminarNota', () => {
    it('traduce NT001 (nota aplicada) a 409 con el mensaje del backend (CA 10)', async () => {
      supabase.rpc.mockResolvedValue({
        error: { code: 'NT001', message: 'La nota ya está aplicada y no puede eliminarse. Imputada en: A-0001-00001234' },
      })

      await expect(eliminarNota('n1')).rejects.toMatchObject({
        message: 'La nota ya está aplicada y no puede eliminarse. Imputada en: A-0001-00001234',
        status: 409,
      })
    })

    it('traduce NT002 (no existe) a 404', async () => {
      supabase.rpc.mockResolvedValue({ error: { code: 'NT002', message: 'La nota no existe' } })

      await expect(eliminarNota('n1')).rejects.toMatchObject({ status: 404 })
    })

    it('llama al RPC con el id de la nota cuando se puede eliminar', async () => {
      supabase.rpc.mockResolvedValue({ error: null })

      await eliminarNota('n1')

      expect(supabase.rpc).toHaveBeenCalledWith('eliminar_nota_proveedor', { p_id: 'n1' })
    })
  })
})
