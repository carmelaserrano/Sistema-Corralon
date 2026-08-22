import { supabase } from '../../../lib/supabaseClient'

export async function getCategorias() {
  const { data, error } = await supabase.from('categorias').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function getProductosDestacados(depositoId, limite = 3) {
  const { data, error } = await supabase
    .from('stock_x_deposito')
    .select(
      'id, cantidad, updated_at, producto:productos(id, sku, nombre, categoria:categorias(nombre), marca:marcas(nombre), unidad_medida:unidades_medida(abreviatura))',
    )
    .eq('deposito_id', depositoId)
    .gt('cantidad', 0)
    .order('updated_at', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data
}
