import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  escaparLike,
  listarCatalogo,
  listarFiltrosCatalogo,
  obtenerProducto,
  puedePublicar,
  listarPublicacion,
  publicarProducto,
  validarImagen,
  subirImagen,
  POR_PAGINA,
  TAMANO_MAXIMO_IMAGEN,
} from './catalogoApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}))

function crearQueryBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    in: vi.fn(() => builder),
    or: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve(resultado)),
    single: vi.fn(() => Promise.resolve(resultado)),
    maybeSingle: vi.fn(() => Promise.resolve(resultado)),
    then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
  }
  return builder
}

function crearStorage({ errorSubida = null } = {}) {
  const bucket = {
    upload: vi.fn(() => Promise.resolve({ data: {}, error: errorSubida })),
    getPublicUrl: vi.fn((ruta) => ({ data: { publicUrl: `https://cdn.test/productos/${ruta}` } })),
    remove: vi.fn(() => Promise.resolve({ data: [], error: null })),
  }
  supabase.storage.from.mockReturnValue(bucket)
  return bucket
}

const fila = (overrides = {}) => ({
  id: 'p1',
  sku: 'CEM-01',
  nombre: 'Cemento',
  imagen_url: null,
  precio: '1500.50',
  disponible: true,
  categoria_id: 'c1',
  categoria_nombre: 'Construcción',
  marca_id: 'm1',
  marca_nombre: 'Loma Negra',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('escaparLike', () => {
  it('escapa %, _ y la barra invertida', () => {
    expect(escaparLike('50%_a\\b')).toBe('50\\%\\_a\\\\b')
  })

  it('deja intacto el texto común', () => {
    expect(escaparLike('Cemento Portland')).toBe('Cemento Portland')
  })
})

describe('listarCatalogo', () => {
  it('lee de v_catalogo_web con conteo exacto, solo con precio y ordena por nombre asc por defecto', async () => {
    const builder = crearQueryBuilder({ data: [fila()], error: null, count: 1 })
    supabase.from.mockReturnValue(builder)

    const resultado = await listarCatalogo()

    expect(supabase.from).toHaveBeenCalledWith('v_catalogo_web')
    expect(builder.select).toHaveBeenCalledWith(expect.not.stringContaining('cantidad'), { count: 'exact' })
    expect(builder.gt).toHaveBeenCalledWith('precio', 0)
    expect(builder.order).toHaveBeenNthCalledWith(1, 'nombre', { ascending: true })
    expect(builder.order).toHaveBeenNthCalledWith(2, 'id', { ascending: true })
    expect(builder.range).toHaveBeenCalledWith(0, POR_PAGINA - 1)
    expect(builder.ilike).not.toHaveBeenCalled()
    expect(builder.eq).not.toHaveBeenCalled()
    expect(resultado).toEqual({ items: [{ ...fila(), precio: 1500.5 }], total: 1 })
  })

  it('busca por nombre escapando los comodines', async () => {
    const builder = crearQueryBuilder({ data: [], error: null, count: 0 })
    supabase.from.mockReturnValue(builder)

    await listarCatalogo({ busqueda: '  100%_arena ' })

    expect(builder.ilike).toHaveBeenCalledWith('nombre', '%100\\%\\_arena%')
  })

  it('filtra por categoría y marca', async () => {
    const builder = crearQueryBuilder({ data: [], error: null, count: 0 })
    supabase.from.mockReturnValue(builder)

    await listarCatalogo({ categoriaId: 'c1', marcaId: 'm2' })

    expect(builder.eq).toHaveBeenCalledWith('categoria_id', 'c1')
    expect(builder.eq).toHaveBeenCalledWith('marca_id', 'm2')
  })

  it.each([
    ['precio', 'asc', true],
    ['precio', 'desc', false],
    ['nombre', 'asc', true],
    ['nombre', 'desc', false],
  ])('ordena por %s %s', async (orden, direccion, ascending) => {
    const builder = crearQueryBuilder({ data: [], error: null, count: 0 })
    supabase.from.mockReturnValue(builder)

    await listarCatalogo({ orden, direccion })

    expect(builder.order).toHaveBeenNthCalledWith(1, orden, { ascending })
  })

  it('rechaza un orden o una dirección fuera de la whitelist sin consultar', async () => {
    await expect(listarCatalogo({ orden: 'costo' })).rejects.toMatchObject({ status: 400 })
    await expect(listarCatalogo({ direccion: 'asc;drop' })).rejects.toMatchObject({ status: 400 })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('calcula el rango de la página pedida y devuelve el total', async () => {
    const builder = crearQueryBuilder({ data: [fila()], error: null, count: 30 })
    supabase.from.mockReturnValue(builder)

    const resultado = await listarCatalogo({ pagina: 3 })

    expect(builder.range).toHaveBeenCalledWith(24, 35)
    expect(resultado.total).toBe(30)
  })

  it('trata una página inválida como la primera', async () => {
    const builder = crearQueryBuilder({ data: null, error: null, count: null })
    supabase.from.mockReturnValue(builder)

    const resultado = await listarCatalogo({ pagina: -2 })

    expect(builder.range).toHaveBeenCalledWith(0, 11)
    expect(resultado).toEqual({ items: [], total: 0 })
  })

  it('traduce un error de Supabase a status 500', async () => {
    supabase.from.mockReturnValue(crearQueryBuilder({ data: null, error: { code: 'XX000' }, count: null }))
    await expect(listarCatalogo()).rejects.toMatchObject({ status: 500, message: 'No pudimos cargar el catálogo' })
  })
})

describe('listarFiltrosCatalogo', () => {
  it('devuelve categorías y marcas únicas ordenadas por nombre', async () => {
    const builder = crearQueryBuilder({
      data: [
        fila({ categoria_id: 'c2', categoria_nombre: 'Pinturas', marca_id: 'm1', marca_nombre: 'Loma Negra' }),
        fila({ categoria_id: 'c1', categoria_nombre: 'Áridos', marca_id: 'm1', marca_nombre: 'Loma Negra' }),
        fila({ categoria_id: null, marca_id: 'm2', marca_nombre: null }),
      ],
      error: null,
    })
    supabase.from.mockReturnValue(builder)

    const resultado = await listarFiltrosCatalogo()

    expect(builder.gt).toHaveBeenCalledWith('precio', 0)
    expect(resultado.categorias).toEqual([{ id: 'c1', nombre: 'Áridos' }, { id: 'c2', nombre: 'Pinturas' }])
    expect(resultado.marcas).toEqual([{ id: 'm1', nombre: 'Loma Negra' }, { id: 'm2', nombre: 'Sin nombre' }])
  })

  it('propaga el error como 500', async () => {
    supabase.from.mockReturnValue(crearQueryBuilder({ data: null, error: { code: 'XX000' } }))
    await expect(listarFiltrosCatalogo()).rejects.toMatchObject({ status: 500 })
  })

  it('devuelve listas vacías si no hay datos', async () => {
    supabase.from.mockReturnValue(crearQueryBuilder({ data: null, error: null }))
    await expect(listarFiltrosCatalogo()).resolves.toEqual({ categorias: [], marcas: [] })
  })
})

describe('obtenerProducto', () => {
  it('devuelve el detalle con descripción y unidad de medida', async () => {
    const detalle = fila({ descripcion: 'Bolsa 50 kg', unidad_medida: 'Bolsa', unidad_abreviatura: 'bol', disponible: false })
    const builder = crearQueryBuilder({ data: detalle, error: null })
    supabase.from.mockReturnValue(builder)

    const producto = await obtenerProducto('p1')

    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('unidad_medida'))
    expect(builder.eq).toHaveBeenCalledWith('id', 'p1')
    expect(producto).toMatchObject({ descripcion: 'Bolsa 50 kg', unidad_medida: 'Bolsa', precio: 1500.5, disponible: false })
  })

  it('responde 404 si no está publicado o no tiene precio', async () => {
    supabase.from.mockReturnValueOnce(crearQueryBuilder({ data: null, error: null }))
    await expect(obtenerProducto('p1')).rejects.toMatchObject({ status: 404 })

    supabase.from.mockReturnValueOnce(crearQueryBuilder({ data: fila({ precio: null }), error: null }))
    await expect(obtenerProducto('p1')).rejects.toMatchObject({ status: 404 })
  })

  it('responde 404 sin id o con un id mal formado', async () => {
    await expect(obtenerProducto('')).rejects.toMatchObject({ status: 404 })
    supabase.from.mockReturnValue(crearQueryBuilder({ data: null, error: { code: '22P02' } }))
    await expect(obtenerProducto('no-uuid')).rejects.toMatchObject({ status: 404 })
  })

  it('traduce otros errores a 500', async () => {
    supabase.from.mockReturnValue(crearQueryBuilder({ data: null, error: { code: 'XX000' } }))
    await expect(obtenerProducto('p1')).rejects.toMatchObject({ status: 500 })
  })
})

describe('puedePublicar', () => {
  it('consulta el permiso ecommerce.publicar', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null })
    await expect(puedePublicar()).resolves.toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('usuario_tiene_permiso', { p_nombre: 'ecommerce.publicar' })
  })

  it('devuelve false si la respuesta no es true y propaga errores', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(puedePublicar()).resolves.toBe(false)
    const error = new Error('fallo')
    supabase.rpc.mockResolvedValueOnce({ data: null, error })
    await expect(puedePublicar()).rejects.toBe(error)
  })
})

describe('listarPublicacion', () => {
  it('lista productos paginados y marca cuáles están visibles en la tienda', async () => {
    const productos = crearQueryBuilder({
      data: [
        { id: 'p1', nombre: 'Arena', publicado_web: true, estado_producto: 'activo' },
        { id: 'p2', nombre: 'Cal', publicado_web: false, estado_producto: 'activo' },
      ],
      error: null,
      count: 14,
    })
    const vista = crearQueryBuilder({ data: [{ id: 'p1' }], error: null })
    supabase.from.mockReturnValueOnce(productos).mockReturnValueOnce(vista)

    const resultado = await listarPublicacion({ pagina: 2 })

    expect(supabase.from).toHaveBeenNthCalledWith(1, 'productos')
    expect(productos.range).toHaveBeenCalledWith(12, 23)
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'v_catalogo_web')
    expect(vista.in).toHaveBeenCalledWith('id', ['p1', 'p2'])
    expect(resultado.total).toBe(14)
    expect(resultado.items.map((item) => item.visibleEnTienda)).toEqual([true, false])
  })

  it('busca por nombre o SKU sin romper la sintaxis de or()', async () => {
    const productos = crearQueryBuilder({ data: [], error: null, count: 0 })
    supabase.from.mockReturnValueOnce(productos)

    const resultado = await listarPublicacion({ busqueda: 'arena, (fina)%' })

    expect(productos.or).toHaveBeenCalledWith('nombre.ilike.%arena   fina \\%%,sku.ilike.%arena   fina \\%%')
    expect(supabase.from).toHaveBeenCalledTimes(1)
    expect(resultado).toEqual({ items: [], total: 0 })
  })

  it('propaga errores de la tabla y de la vista como 500', async () => {
    supabase.from.mockReturnValueOnce(crearQueryBuilder({ data: null, error: { code: 'XX000' }, count: null }))
    await expect(listarPublicacion()).rejects.toMatchObject({ status: 500 })

    supabase.from
      .mockReturnValueOnce(crearQueryBuilder({ data: [{ id: 'p1' }], error: null, count: 1 }))
      .mockReturnValueOnce(crearQueryBuilder({ data: null, error: { code: 'XX000' } }))
    await expect(listarPublicacion()).rejects.toMatchObject({ status: 500 })
  })
})

describe('publicarProducto', () => {
  it.each([true, false])('guarda publicado_web = %s', async (publicado) => {
    const builder = crearQueryBuilder({ data: { id: 'p1', publicado_web: publicado }, error: null })
    supabase.from.mockReturnValue(builder)

    const resultado = await publicarProducto('p1', publicado)

    expect(supabase.from).toHaveBeenCalledWith('productos')
    expect(builder.update).toHaveBeenCalledWith({ publicado_web: publicado })
    expect(builder.eq).toHaveBeenCalledWith('id', 'p1')
    expect(resultado).toEqual({ id: 'p1', publicado_web: publicado })
  })

  it('valida los parámetros antes de consultar', async () => {
    await expect(publicarProducto('', true)).rejects.toMatchObject({ status: 404 })
    await expect(publicarProducto('p1', 'si')).rejects.toMatchObject({ status: 400 })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('traduce la falta de permiso a 403 y la fila oculta a 404', async () => {
    supabase.from.mockReturnValueOnce(crearQueryBuilder({ data: null, error: { code: '42501' } }))
    await expect(publicarProducto('p1', true)).rejects.toMatchObject({ status: 403 })

    supabase.from.mockReturnValueOnce(crearQueryBuilder({ data: null, error: { code: 'PGRST116' } }))
    await expect(publicarProducto('p1', true)).rejects.toMatchObject({ status: 404 })
  })
})

describe('validarImagen', () => {
  it('acepta JPG, PNG y WebP de hasta 2 MB', () => {
    expect(() => validarImagen({ type: 'image/png', size: TAMANO_MAXIMO_IMAGEN })).not.toThrow()
  })

  it('rechaza archivos faltantes, de otro tipo o demasiado grandes', () => {
    expect(() => validarImagen(null)).toThrow('Elegí una imagen')
    expect(() => validarImagen({ type: 'image/gif', size: 10 })).toThrow('JPG, PNG o WebP')
    expect(() => validarImagen({ type: 'image/jpeg', size: TAMANO_MAXIMO_IMAGEN + 1 })).toThrow('2 MB')
  })
})

describe('subirImagen', () => {
  const archivo = { type: 'image/webp', size: 1024 }

  it('sube al bucket productos y actualiza imagen_url con la URL pública', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    const bucket = crearStorage()
    const builder = crearQueryBuilder({ data: { id: 'p1', imagen_url: 'https://cdn.test/productos/p1/1700000000000.webp' }, error: null })
    supabase.from.mockReturnValue(builder)

    const resultado = await subirImagen('p1', archivo)

    expect(supabase.storage.from).toHaveBeenCalledWith('productos')
    expect(bucket.upload).toHaveBeenCalledWith('p1/1700000000000.webp', archivo, { contentType: 'image/webp', upsert: false })
    expect(builder.update).toHaveBeenCalledWith({ imagen_url: 'https://cdn.test/productos/p1/1700000000000.webp' })
    expect(builder.eq).toHaveBeenCalledWith('id', 'p1')
    expect(bucket.remove).not.toHaveBeenCalled()
    expect(resultado.imagen_url).toContain('p1/1700000000000.webp')
  })

  it('no sube archivos inválidos ni sin producto', async () => {
    const bucket = crearStorage()
    await expect(subirImagen('p1', { type: 'text/plain', size: 1 })).rejects.toMatchObject({ status: 400 })
    await expect(subirImagen('', archivo)).rejects.toMatchObject({ status: 404 })
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('traduce el rechazo del bucket a 403 y otros fallos a 500', async () => {
    crearStorage({ errorSubida: { statusCode: '403', message: 'row-level security' } })
    await expect(subirImagen('p1', archivo)).rejects.toMatchObject({ status: 403 })

    crearStorage({ errorSubida: { statusCode: '500', message: 'boom' } })
    await expect(subirImagen('p1', archivo)).rejects.toMatchObject({ status: 500 })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('borra el archivo subido si no se pudo actualizar el producto', async () => {
    const bucket = crearStorage()
    supabase.from.mockReturnValueOnce(crearQueryBuilder({ data: null, error: { code: '42501' } }))
    await expect(subirImagen('p1', archivo)).rejects.toMatchObject({ status: 403 })
    expect(bucket.remove).toHaveBeenCalledWith([expect.stringMatching(/^p1\/\d+\.webp$/)])

    supabase.from.mockReturnValueOnce(crearQueryBuilder({ data: null, error: { code: 'PGRST116' } }))
    await expect(subirImagen('p1', archivo)).rejects.toMatchObject({ status: 404 })
  })
})
