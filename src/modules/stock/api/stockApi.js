import { supabase } from '../../../lib/supabaseClient'
import { errorDeApi } from './errores'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validarUuid(label, valor) {
  if (valor === undefined || valor === null || valor === '') return

  if (!UUID_REGEX.test(String(valor))) {
    throw errorDeApi(`${label} tiene un formato inválido`, 400)
  }
}

function escaparValorFiltro(valor) {
  const valorEscapado = String(valor)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')

  return `"${valorEscapado}"`
}

function normalizarStock(row) {
  const fisico = Number(row?.cantidad ?? 0)
  const comprometido = Number(row?.comprometido ?? 0)

  return {
    ...row,
    fisico,
    comprometido,
    disponible: fisico - comprometido,
  }
}

function normalizarRespuestaStock(row) {
  const stockNormalizado = normalizarStock(row)

  return {
    articulo_id: row?.producto?.id ?? null,
    articulo_nombre: row?.producto?.nombre ?? null,
    articulo_sku: row?.producto?.sku ?? null,
    deposito_id: row?.deposito?.id ?? row?.deposito_id ?? null,
    deposito_nombre: row?.deposito?.nombre ?? null,
    fisico: stockNormalizado.fisico,
    comprometido: stockNormalizado.comprometido,
    disponible: stockNormalizado.disponible,
    producto: row?.producto ?? null,
    deposito: row?.deposito ?? null,
  }
}

export async function getDepositos() {
  const { data, error } = await supabase.from('depositos').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function getStockByDeposito(depositoId) {
  if (!depositoId) {
    throw errorDeApi('El depósito es obligatorio', 400)
  }

  validarUuid('deposito_id', depositoId)

  const { data, error } = await supabase
    .from('stock_x_deposito')
    .select(
      'id, cantidad, comprometido, updated_at, producto:productos(id, sku, nombre, categoria:categorias(nombre), marca:marcas(nombre), unidad_medida:unidades_medida(abreviatura))',
    )
    .eq('deposito_id', depositoId)
    .order('updated_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => normalizarStock(row))
}

export async function getStockDisponibles({
  articulo_id = '',
  deposito_id = '',
  search = '',
  page = 1,
  pageSize = 20,
} = {}) {
  validarUuid('articulo_id', articulo_id)
  validarUuid('deposito_id', deposito_id)

  const pagina = Number(page) > 0 ? Number(page) : 1
  const tamanioPagina = Number(pageSize) > 0 ? Number(pageSize) : 20

  let consulta = supabase
    .from('stock_x_deposito')
    .select(
      'id, cantidad, comprometido, updated_at, deposito:depositos(id, nombre), producto:productos(id, sku, nombre, categoria:categorias(nombre), marca:marcas(nombre), unidad_medida:unidades_medida(abreviatura))',
      { count: 'exact' },
    )

  if (articulo_id) {
    consulta = consulta.eq('producto_id', articulo_id)
  }

  if (deposito_id) {
    consulta = consulta.eq('deposito_id', deposito_id)
  }

  if (search?.trim()) {
    // Buscar los productos que coincidan con el término y filtrar por sus IDs.
    const patron = escaparValorFiltro(`%${search.trim()}%`)
    const { data: productos, error: productosError } = await supabase
      .from('productos')
      .select('id')
      .or(`nombre.ilike.${patron},sku.ilike.${patron}`)
      .order('id')

    if (productosError) throw productosError

    const ids = (productos ?? []).map((p) => p.id)
    if (ids.length === 0) {
      return {
        items: [],
        total: 0,
        page: pagina,
        page_size: tamanioPagina,
        pageSize: tamanioPagina,
      }
    }

    consulta = consulta.in('producto_id', ids)
  }

  const desde = (pagina - 1) * tamanioPagina
  const { data, count, error } = await consulta
    .order('updated_at', { ascending: false })
    .range(desde, desde + tamanioPagina - 1)

  if (error) throw error

  const items = (data ?? []).map((row) => normalizarRespuestaStock(row))

  return {
    items,
    total: count ?? items.length,
    page: pagina,
    page_size: tamanioPagina,
    pageSize: tamanioPagina,
  }
}

export function subscribeToStockChanges({
  articulo_id = '',
  deposito_id = '',
  onChange = null,
} = {}) {
  const filtros = []

  if (articulo_id) filtros.push(`producto_id=eq.${articulo_id}`)
  if (deposito_id) filtros.push(`deposito_id=eq.${deposito_id}`)

  const nombreCanal = `stock-live-${[articulo_id || 'todos', deposito_id || 'todos']
    .join('-')}
  `
  const canal = supabase.channel(nombreCanal.trim())

  canal.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'stock_x_deposito',
      ...(filtros.length > 0 ? { filter: filtros.join(',') } : {}),
    },
    (payload) => {
      onChange?.(payload)
    },
  )

  canal.subscribe()

  return canal
}
