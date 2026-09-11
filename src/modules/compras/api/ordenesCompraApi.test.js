import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    getOrdenesCompra,
    getOrdenCompraById,
    createOrdenCompra,
    updateOrdenCompra,
    cancelarOrdenCompra,
    puedeCrearOrdenes
} from './ordenesCompraApi'
import { supabase } from '../../../lib/supabaseClient'

// Creamos un mock encadenable
const createQueryMock = () => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
})

let mockCabecera
let mockDetalle

vi.mock('../../../lib/supabaseClient', () => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
        auth: { getUser: vi.fn() }
    }
}))

describe('ordenesCompraApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockCabecera = createQueryMock()
        mockDetalle = createQueryMock()

        // Magia: Devolvemos un simulador distinto según la tabla que se consulte
        // Así evitamos que la consulta del detalle rompa la de la cabecera
        supabase.from.mockImplementation((table) => {
            if (table === 'ordenes_compra') return mockCabecera
            if (table === 'detalle_orden_compra') return mockDetalle
            return createQueryMock()
        })
    })

    describe('Permisos', () => {
        it('puedeCrearOrdenes devuelve true si el usuario tiene permiso', async () => {
            supabase.rpc.mockResolvedValueOnce({ data: true, error: null })
            const resultado = await puedeCrearOrdenes()
            expect(resultado).toBe(true)
        })

        it('puedeCrearOrdenes lanza error si la db falla', async () => {
            supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Error DB' } })
            await expect(puedeCrearOrdenes()).rejects.toEqual({ message: 'Error DB' })
        })
    })

    describe('getOrdenesCompra', () => {
        it('aplica los filtros correctamente y devuelve datos', async () => {
            mockCabecera.range.mockResolvedValueOnce({
                data: [{ id: 1 }],
                count: 1,
                error: null
            })

            const resultado = await getOrdenesCompra({
                estado: 'pendiente',
                proveedorId: 'prov-1',
                fechaDesde: '2023-01-01',
                fechaHasta: '2023-12-31'
            })

            expect(mockCabecera.eq).toHaveBeenCalledWith('estado', 'pendiente')
            expect(mockCabecera.eq).toHaveBeenCalledWith('proveedor_id', 'prov-1')
            expect(mockCabecera.gte).toHaveBeenCalledWith('fecha_emision', '2023-01-01')
            expect(mockCabecera.lte).toHaveBeenCalledWith('fecha_emision', '2023-12-31')
            expect(resultado.ordenes).toHaveLength(1)
        })

        it('lanza error si la consulta falla', async () => {
            mockCabecera.range.mockResolvedValueOnce({ data: null, error: { message: 'Error DB' } })
            await expect(getOrdenesCompra()).rejects.toEqual({ message: 'Error DB' })
        })
    })

    describe('getOrdenCompraById', () => {
        it('devuelve error 404 si el código de error es PGRST116', async () => {
            mockCabecera.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
            // Validamos por el mensaje devuelto por errorDeApi en lugar de buscar la propiedad statusCode
            await expect(getOrdenCompraById('123')).rejects.toThrow('La orden no existe')
        })

        it('lanza error genérico si ocurre otra falla', async () => {
            mockCabecera.single.mockResolvedValueOnce({ data: null, error: { message: 'Falla red' } })
            await expect(getOrdenCompraById('123')).rejects.toEqual({ message: 'Falla red' })
        })
    })

    describe('createOrdenCompra', () => {
        const ordenValida = {
            proveedor_id: 'p1',
            deposito_destino_id: 'd1',
            items: [{ producto_id: 'prod1', cantidad: 10, precio_unitario: 100 }]
        }

        it('lanza error si falta el proveedor', async () => {
            await expect(createOrdenCompra({ deposito_destino_id: 'd1' })).rejects.toThrow('El proveedor es obligatorio')
        })

        it('lanza error si falta el depósito', async () => {
            await expect(createOrdenCompra({ proveedor_id: 'p1' })).rejects.toThrow('El depósito destino es obligatorio')
        })

        it('lanza error si no hay items', async () => {
            await expect(createOrdenCompra({ proveedor_id: 'p1', deposito_destino_id: 'd1', items: [] })).rejects.toThrow('La orden debe tener al menos un artículo')
        })

        it('lanza error si falla la creación de la cabecera', async () => {
            mockCabecera.single.mockResolvedValueOnce({ data: null, error: { message: 'Error cabecera' } })
            await expect(createOrdenCompra(ordenValida)).rejects.toThrow('Error cabecera')
        })

        it('lanza error si falla la inserción de items (pero advierte de cabecera creada)', async () => {
            mockCabecera.single.mockResolvedValueOnce({ data: { id: 'orden-1' }, error: null })
            // Simulamos que la inserción del detalle falla
            mockDetalle.insert.mockResolvedValueOnce({ error: { message: 'Falla items' } })

            await expect(createOrdenCompra(ordenValida)).rejects.toThrow('Falla items')
        })
    })

    describe('updateOrdenCompra', () => {
        const ordenModificada = {
            proveedor_id: 'p1',
            deposito_destino_id: 'd1',
            items: [{ producto_id: 'prod1', cantidad: 20, precio_unitario: 150 }]
        }

        beforeEach(() => {
            supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@test.com' } } })
        })

        it('lanza error si falta proveedor o deposito o items', async () => {
            await expect(updateOrdenCompra('id1', { proveedor_id: 'p1' })).rejects.toThrow('El depósito destino es obligatorio')
        })

        it('ejecuta correctamente la actualización y el borrado previo de items', async () => {
            // 1. Select de items actuales
            mockDetalle.eq.mockResolvedValueOnce({ data: [], error: null })
            // 2. Update cabecera
            mockCabecera.single.mockResolvedValueOnce({ data: { id: 'id1' }, error: null })
            // 3. Delete items viejos
            mockDetalle.eq.mockResolvedValueOnce({ error: null })
            // 4. Insert items nuevos
            mockDetalle.insert.mockResolvedValueOnce({ error: null })

            const resultado = await updateOrdenCompra('id1', ordenModificada)
            expect(resultado.id).toBe('id1')
        })
    })

    describe('cancelarOrdenCompra', () => {
        it('lanza error si no se envía motivo', async () => {
            await expect(cancelarOrdenCompra('123', '   ')).rejects.toThrow('El motivo de cancelación es obligatorio')
        })

        it('cancela correctamente inyectando los datos de auditoría', async () => {
            supabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } } })
            mockCabecera.single.mockResolvedValueOnce({ data: { id: '123' }, error: null })

            const resultado = await cancelarOrdenCompra('123', 'Motivo válido')
            expect(resultado.id).toBe('123')
            expect(mockCabecera.update).toHaveBeenCalledWith(expect.objectContaining({
                estado: 'cancelada',
                motivo_cancelacion: 'Motivo válido',
                cancelado_by: 'user-1'
            }))
        })
    })
})