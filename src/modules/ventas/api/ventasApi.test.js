import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listarDepositos,
  buscarClientes,
  calcularPrecioVenta,
  validarDescuentoManual,
  buscarArticulos,
  registrarVenta,
  agregarArticuloALineas,
  calcularTotalesVenta,
  redondear,
} from './ventasApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    in: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

describe('ventasApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listarDepositos', () => {
    it('obtiene la lista de depósitos ordenados por nombre', async () => {
      const mockDepositos = [
        { id: 'dep-1', nombre: 'Depósito Centro' },
        { id: 'dep-2', nombre: 'Depósito Norte' },
      ]
      const builder = crearQueryBuilder({ data: mockDepositos, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await listarDepositos()

      expect(supabase.from).toHaveBeenCalledWith('depositos')
      expect(builder.select).toHaveBeenCalledWith('id, nombre, direccion, localidad')
      expect(builder.order).toHaveBeenCalledWith('nombre', { ascending: true })
      expect(resultado).toEqual(mockDepositos)
    })

    it('lanza error si la consulta falla', async () => {
      const errorMock = new Error('Error al consultar depósitos')
      const builder = crearQueryBuilder({ data: null, error: errorMock })
      supabase.from.mockReturnValue(builder)

      await expect(listarDepositos()).rejects.toThrow('Error al consultar depósitos')
    })
  })

  describe('buscarClientes', () => {
    const mockClientes = [
      {
        id: 'cli-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        numero_documento: '30111222',
        estado: 'Activo',
      },
    ]

    it('busca clientes habilitados sin texto de filtro', async () => {
      const builder = crearQueryBuilder({ data: mockClientes, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await buscarClientes()

      expect(supabase.from).toHaveBeenCalledWith('clientes')
      expect(builder.eq).toHaveBeenCalledWith('estado', 'Activo')
      expect(builder.or).not.toHaveBeenCalled()
      expect(resultado).toEqual(mockClientes)
    })

    it('aplica filtro or al buscar por nombre o documento', async () => {
      const builder = crearQueryBuilder({ data: mockClientes, error: null })
      supabase.from.mockReturnValue(builder)

      const resultado = await buscarClientes('Pérez')

      expect(builder.or).toHaveBeenCalledWith(
        'nombre.ilike.%Pérez%,apellido.ilike.%Pérez%,razon_social.ilike.%Pérez%,numero_documento.ilike.%Pérez%',
      )
      expect(resultado).toEqual(mockClientes)
    })

    it('lanza error si la base de datos falla', async () => {
      const builder = crearQueryBuilder({
        data: null,
        error: new Error('Error de conexión'),
      })
      supabase.from.mockReturnValue(builder)

      await expect(buscarClientes('test')).rejects.toThrow('Error de conexión')
    })
  })

  describe('calcularPrecioVenta', () => {
    it('requiere producto_id', async () => {
      await expect(calcularPrecioVenta('')).rejects.toThrow(
        'El producto es obligatorio para calcular precio',
      )
    })

    it('invoca el RPC calcular_precio_venta con cantidad por defecto', async () => {
      supabase.rpc.mockResolvedValue({ data: 1500.5, error: null })

      const precio = await calcularPrecioVenta('prod-1', 'cli-1')

      expect(supabase.rpc).toHaveBeenCalledWith('calcular_precio_venta', {
        p_producto: 'prod-1',
        p_cliente: 'cli-1',
        p_cantidad: 1,
      })
      expect(precio).toBe(1500.5)
    })

    it('devuelve null si no hay precio cargado', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: null })

      const precio = await calcularPrecioVenta('prod-1')
      expect(precio).toBeNull()
    })

    it('lanza error si falla el RPC', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: new Error('Error en RPC'),
      })

      await expect(calcularPrecioVenta('prod-1')).rejects.toThrow('Error en RPC')
    })
  })

  describe('validarDescuentoManual', () => {
    it('valida que el porcentaje esté entre 0 y 100', async () => {
      await expect(validarDescuentoManual(-5)).rejects.toThrow(
        'El porcentaje debe estar entre 0 y 100',
      )
      await expect(validarDescuentoManual(105)).rejects.toThrow(
        'El porcentaje debe estar entre 0 y 100',
      )
      await expect(validarDescuentoManual('invalido')).rejects.toThrow(
        'El porcentaje debe estar entre 0 y 100',
      )
    })

    it('invoca el RPC validar_descuento_manual correctamente', async () => {
      supabase.rpc.mockResolvedValue({
        data: { requiere_autorizacion: false, limite: null },
        error: null,
      })

      const resultado = await validarDescuentoManual(10)

      expect(supabase.rpc).toHaveBeenCalledWith('validar_descuento_manual', {
        p_porcentaje: 10,
      })
      expect(resultado).toEqual({
        requiere_autorizacion: false,
        limite: null,
      })
    })
  })

  describe('buscarArticulos', () => {
    it('requiere depósito obligatorio', async () => {
      await expect(buscarArticulos('')).rejects.toThrow(
        'El depósito es obligatorio para buscar artículos',
      )
    })

    it('devuelve lista vacía si no hay stock disponible en el depósito', async () => {
      const stockBuilder = crearQueryBuilder({ data: [], error: null })
      supabase.from.mockReturnValue(stockBuilder)

      const resultado = await buscarArticulos('dep-1')

      expect(supabase.from).toHaveBeenCalledWith('v_stock_disponible')
      expect(stockBuilder.eq).toHaveBeenCalledWith('deposito_id', 'dep-1')
      expect(stockBuilder.gt).toHaveBeenCalledWith('disponible', 0)
      expect(resultado).toEqual([])
    })

    it('obtiene productos con stock disponible y resuelve precios', async () => {
      const mockStock = [{ producto_id: 'p1', disponible: 15 }]
      const mockProductos = [
        {
          id: 'p1',
          sku: 'CEM-001',
          nombre: 'Cemento Portland',
          descripcion: 'Bolsa 50kg',
          codigo_barras: '7791234567890',
          estado_producto: 'activo',
          unidad_medida: { abreviatura: 'bolsa' },
        },
      ]

      const stockBuilder = crearQueryBuilder({ data: mockStock, error: null })
      const prodBuilder = crearQueryBuilder({ data: mockProductos, error: null })

      supabase.from.mockImplementation((tabla) => {
        if (tabla === 'v_stock_disponible') return stockBuilder
        if (tabla === 'productos') return prodBuilder
        return crearQueryBuilder({ data: [], error: null })
      })

      supabase.rpc.mockResolvedValue({ data: 1200, error: null })

      const resultado = await buscarArticulos('dep-1', 'Cemento', 'cli-1')

      expect(stockBuilder.gt).toHaveBeenCalledWith('disponible', 0)
      expect(prodBuilder.in).toHaveBeenCalledWith('id', ['p1'])
      expect(prodBuilder.or).toHaveBeenCalledWith(
        'nombre.ilike.%Cemento%,sku.ilike.%Cemento%,codigo_barras.ilike.%Cemento%',
      )
      expect(resultado).toHaveLength(1)
      expect(resultado[0]).toEqual({
        id: 'p1',
        producto_id: 'p1',
        sku: 'CEM-001',
        nombre: 'Cemento Portland',
        descripcion: 'Bolsa 50kg',
        codigo_barras: '7791234567890',
        unidad_medida: 'bolsa',
        stock_disponible: 15,
        disponible: 15,
        precio_unitario: 1200,
      })
    })
  })

  describe('registrarVenta', () => {
    const cabeceraValida = {
      deposito_id: 'dep-1',
      cliente_id: 'cli-1',
      observaciones: 'Pago en mostrador',
    }

    const itemsValidos = [
      {
        producto_id: 'p1',
        cantidad: 10,
        precio_unitario: 500,
        descuento_pct: 0,
      },
    ]

    it('valida cabecera obligatoria', async () => {
      await expect(registrarVenta(null, itemsValidos)).rejects.toThrow(
        'El depósito es obligatorio',
      )
      await expect(
        registrarVenta({ deposito_id: 'dep-1' }, itemsValidos),
      ).rejects.toThrow('El cliente es obligatorio')
    })

    it('valida que existan items', async () => {
      await expect(registrarVenta(cabeceraValida, [])).rejects.toThrow(
        'La venta debe tener al menos un artículo',
      )
      await expect(registrarVenta(cabeceraValida, null)).rejects.toThrow(
        'La venta debe tener al menos un artículo',
      )
    })

    it('valida datos de cada ítem', async () => {
      await expect(
        registrarVenta(cabeceraValida, [{ cantidad: 5, precio_unitario: 100 }]),
      ).rejects.toThrow('Cada artículo debe tener un producto válido')

      await expect(
        registrarVenta(cabeceraValida, [
          { producto_id: 'p1', cantidad: 0, precio_unitario: 100 },
        ]),
      ).rejects.toThrow('La cantidad debe ser mayor a 0')

      await expect(
        registrarVenta(cabeceraValida, [
          { producto_id: 'p1', cantidad: 5, precio_unitario: 0 },
        ]),
      ).rejects.toThrow('El precio unitario debe ser mayor a 0')

      await expect(
        registrarVenta(cabeceraValida, [
          { producto_id: 'p1', cantidad: 5, precio_unitario: 100, descuento_pct: 120 },
        ]),
      ).rejects.toThrow('El porcentaje de descuento debe estar entre 0 y 100')
    })

    it('registra una venta exitosamente llamando al RPC registrar_venta', async () => {
      const mockVentaCreada = {
        id: 'v1',
        numero: 101,
        estado: 'Pendiente',
        total: 5000,
      }

      const rpcBuilder = {
        single: vi.fn(() => Promise.resolve({ data: mockVentaCreada, error: null })),
      }
      supabase.rpc.mockReturnValue(rpcBuilder)

      const resultado = await registrarVenta(cabeceraValida, itemsValidos)

      expect(supabase.rpc).toHaveBeenCalledWith('registrar_venta', {
        p_cabecera: {
          deposito_id: 'dep-1',
          cliente_id: 'cli-1',
          observaciones: 'Pago en mostrador',
        },
        p_items: [
          {
            producto_id: 'p1',
            cantidad: 10,
            precio_unitario: 500,
            descuento_pct: 0,
            autorizacion_descuento_id: null,
          },
        ],
      })
      expect(resultado).toEqual(mockVentaCreada)
    })

    it('mapea STOCK_INSUFICIENTE a status 422', async () => {
      const rpcBuilder = {
        single: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: {
              code: 'P0001',
              message:
                'STOCK_INSUFICIENTE: producto p1 — disponible 5 — solicitado 10',
            },
          }),
        ),
      }
      supabase.rpc.mockReturnValue(rpcBuilder)

      let errorCapturado
      try {
        await registrarVenta(cabeceraValida, itemsValidos)
      } catch (err) {
        errorCapturado = err
      }

      expect(errorCapturado).toBeDefined()
      expect(errorCapturado.status).toBe(422)
      expect(errorCapturado.code).toBe('STOCK_INSUFICIENTE')
      expect(errorCapturado.message).toContain('STOCK_INSUFICIENTE')
    })

    it('mapea falta de permisos a status 403', async () => {
      const rpcBuilder = {
        single: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: {
              code: '42501',
              message: 'No tenés permiso para registrar ventas',
            },
          }),
        ),
      }
      supabase.rpc.mockReturnValue(rpcBuilder)

      let errorCapturado
      try {
        await registrarVenta(cabeceraValida, itemsValidos)
      } catch (err) {
        errorCapturado = err
      }

      expect(errorCapturado).toBeDefined()
      expect(errorCapturado.status).toBe(403)
      expect(errorCapturado.message).toBe('No tenés permiso para registrar ventas')
    })

    it('mapea errores genéricos P0001 (sin STOCK_INSUFICIENTE) a status 400', async () => {
      const rpcBuilder = {
        single: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: {
              code: 'P0001',
              message: 'El descuento del 15% requiere una autorización válida y vigente',
            },
          }),
        ),
      }
      supabase.rpc.mockReturnValue(rpcBuilder)

      let errorCapturado
      try {
        await registrarVenta(cabeceraValida, itemsValidos)
      } catch (err) {
        errorCapturado = err
      }

      expect(errorCapturado).toBeDefined()
      expect(errorCapturado.status).toBe(400)
      expect(errorCapturado.code).toBeUndefined()
      expect(errorCapturado.message).toBe('El descuento del 15% requiere una autorización válida y vigente')
    })
  })

  describe('redondear', () => {
    it('redondea números a 2 decimales', () => {
      expect(redondear(10.555)).toBe(10.56)
      expect(redondear(10.554)).toBe(10.55)
      expect(redondear(0)).toBe(0)
    })
  })

  describe('agregarArticuloALineas (CA-07)', () => {
    const articulo1 = {
      producto_id: 'p1',
      nombre: 'Cemento Portland',
      sku: 'CEM-001',
      unidad_medida: 'bolsa',
      stock_disponible: 50,
      precio_unitario: 1000,
    }

    it('agrega un nuevo artículo al carrito si no existía', () => {
      const lineasIniciales = []
      const resultado = agregarArticuloALineas(lineasIniciales, articulo1, 2, 1000)

      expect(resultado).toHaveLength(1)
      expect(resultado[0]).toEqual({
        producto_id: 'p1',
        nombre: 'Cemento Portland',
        sku: 'CEM-001',
        unidad_medida: 'bolsa',
        stock_disponible: 50,
        cantidad: 2,
        precio_unitario: 1000,
        descuento_pct: 0,
        autorizacion_descuento_id: null,
        subtotal: 2000,
      })
    })

    it('suma la cantidad a la línea existente si se agrega el mismo artículo (CA-07)', () => {
      const lineaExistente = {
        producto_id: 'p1',
        nombre: 'Cemento Portland',
        sku: 'CEM-001',
        unidad_medida: 'bolsa',
        stock_disponible: 50,
        cantidad: 3,
        precio_unitario: 1000,
        descuento_pct: 0,
        autorizacion_descuento_id: null,
        subtotal: 3000,
      }

      const resultado = agregarArticuloALineas([lineaExistente], articulo1, 2, 1000)

      expect(resultado).toHaveLength(1)
      expect(resultado[0].cantidad).toBe(5)
      expect(resultado[0].subtotal).toBe(5000)
    })

    it('recalcula subtotal con descuento existente al sumar cantidad', () => {
      const lineaConDescuento = {
        producto_id: 'p1',
        nombre: 'Cemento Portland',
        sku: 'CEM-001',
        unidad_medida: 'bolsa',
        stock_disponible: 50,
        cantidad: 2,
        precio_unitario: 1000,
        descuento_pct: 10,
        autorizacion_descuento_id: 'aut-1',
        subtotal: 1800,
      }

      const resultado = agregarArticuloALineas([lineaConDescuento], articulo1, 3, 1000)

      expect(resultado).toHaveLength(1)
      expect(resultado[0].cantidad).toBe(5)
      // 5 * 1000 * (1 - 10/100) = 4500
      expect(resultado[0].subtotal).toBe(4500)
    })

    it('mantiene las otras líneas intactas al sumar duplicados', () => {
      const linea1 = {
        producto_id: 'p1',
        nombre: 'Cemento Portland',
        cantidad: 2,
        precio_unitario: 1000,
        descuento_pct: 0,
        subtotal: 2000,
      }
      const linea2 = {
        producto_id: 'p2',
        nombre: 'Arena fina',
        cantidad: 1,
        precio_unitario: 500,
        descuento_pct: 0,
        subtotal: 500,
      }

      const resultado = agregarArticuloALineas([linea1, linea2], articulo1, 1, 1000)

      expect(resultado).toHaveLength(2)
      expect(resultado[0].cantidad).toBe(3)
      expect(resultado[0].subtotal).toBe(3000)
      expect(resultado[1]).toEqual(linea2)
    })
  })

  describe('calcularTotalesVenta (CA-04)', () => {
    it('calcula total monetario y cantidad de artículos en tiempo real', () => {
      const lineas = [
        { cantidad: 5, subtotal: 5000 },
        { cantidad: 2, subtotal: 1250.5 },
      ]

      const { total, totalArticulos, cantidadItems } = calcularTotalesVenta(lineas)

      expect(total).toBe(6250.5)
      expect(totalArticulos).toBe(7)
      expect(cantidadItems).toBe(2)
    })

    it('devuelve ceros si la lista está vacía', () => {
      const { total, totalArticulos, cantidadItems } = calcularTotalesVenta([])

      expect(total).toBe(0)
      expect(totalArticulos).toBe(0)
      expect(cantidadItems).toBe(0)
    })
  })
})
