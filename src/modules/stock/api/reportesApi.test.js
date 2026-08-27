import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  armarCsv,
  getReporteQuiebres,
  getReporteStockActual,
  getReporteValorizacion,
} from './reportesApi'
import { supabase } from '../../../lib/supabaseClient'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

function crearBuilder(resultado) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => resultado),
    then: (resolve) => resolve(resultado),
  }
  supabase.from.mockReturnValue(builder)
  return builder
}

const filaConStock = {
  id: 'fila-1',
  cantidad: 10,
  comprometido: 3,
  deposito: { id: 'dep-1', nombre: 'Central' },
  producto: {
    id: 'art-1',
    sku: 'ART-000001',
    nombre: 'Cemento',
    costo_medio_ponderado: 100,
    categoria: { id: 'cat-1', nombre: 'Construcción' },
  },
}

const filaSinQuiebre = {
  ...filaConStock,
  id: 'fila-2',
  cantidad: 5,
  comprometido: 0,
}

const filaConQuiebre = {
  ...filaConStock,
  id: 'fila-3',
  cantidad: 4,
  comprometido: 4,
}

describe('reportesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Stock actual ---

  it('obtiene el stock actual calculando el disponible', async () => {
    crearBuilder({ data: [filaConStock], error: null })

    const data = await getReporteStockActual()

    expect(supabase.from).toHaveBeenCalledWith('stock_x_deposito')
    expect(data).toEqual([{ ...filaConStock, disponible: 7 }])
  })

  it('filtra el stock actual por depósito y categoría', async () => {
    const builder = crearBuilder({ data: [], error: null })

    await getReporteStockActual({ deposito_id: 'dep-1', categoria_id: 'cat-1' })

    expect(builder.eq).toHaveBeenCalledWith('deposito_id', 'dep-1')
    expect(builder.eq).toHaveBeenCalledWith('producto.categoria_id', 'cat-1')
  })

  it('no aplica filtros de depósito ni categoría si no se pasan', async () => {
    const builder = crearBuilder({ data: [], error: null })

    await getReporteStockActual()

    expect(builder.eq).not.toHaveBeenCalled()
  })

  it('propaga el error si la consulta de stock falla', async () => {
    crearBuilder({ data: null, error: new Error('boom') })

    await expect(getReporteStockActual()).rejects.toThrow('boom')
  })

  // --- Quiebres de stock ---

  it('incluye solo los artículos con disponible = 0', async () => {
    crearBuilder({
      data: [filaSinQuiebre, filaConQuiebre],
      error: null,
    })

    const data = await getReporteQuiebres()

    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ id: 'fila-3', disponible: 0 })
  })

  it('no reporta quiebres cuando todo el stock tiene disponible', async () => {
    crearBuilder({ data: [filaSinQuiebre], error: null })

    const data = await getReporteQuiebres()

    expect(data).toEqual([])
  })

  // --- Valorización ---

  it('calcula el valor total por fila y el total general', async () => {
    crearBuilder({
      data: [filaConStock, { ...filaSinQuiebre, cantidad: 2 }],
      error: null,
    })

    const { filas, valorTotalGeneral } = await getReporteValorizacion()

    expect(filas[0]).toMatchObject({ valor_total: 1000 })
    expect(filas[1]).toMatchObject({ valor_total: 200 })
    expect(valorTotalGeneral).toBe(1200)
  })

  it('devuelve total 0 cuando no hay filas', async () => {
    crearBuilder({ data: [], error: null })

    const { filas, valorTotalGeneral } = await getReporteValorizacion()

    expect(filas).toEqual([])
    expect(valorTotalGeneral).toBe(0)
  })

  // --- CSV ---

  it('arma un CSV con encabezado y filas', () => {
    const columnas = [
      { titulo: 'SKU', valor: (fila) => fila.sku },
      { titulo: 'Cantidad', valor: (fila) => fila.cantidad },
    ]
    const filas = [
      { sku: 'ART-1', cantidad: 5 },
      { sku: 'ART-2', cantidad: 10 },
    ]

    expect(armarCsv(columnas, filas)).toBe(
      'SKU,Cantidad\nART-1,5\nART-2,10',
    )
  })

  it('escapa comas, comillas y saltos de línea en el CSV', () => {
    const columnas = [{ titulo: 'Observación', valor: (fila) => fila.obs }]
    const filas = [{ obs: 'Contiene, coma "y comillas"\ny salto' }]

    expect(armarCsv(columnas, filas)).toBe(
      'Observación\n"Contiene, coma ""y comillas""\ny salto"',
    )
  })

  it('representa valores nulos o indefinidos como celda vacía en el CSV', () => {
    const columnas = [{ titulo: 'Valor', valor: (fila) => fila.valor }]
    const filas = [{ valor: null }, { valor: undefined }]

    expect(armarCsv(columnas, filas)).toBe('Valor\n\n')
  })
})
