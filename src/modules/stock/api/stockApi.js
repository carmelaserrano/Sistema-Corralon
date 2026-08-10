import { supabase } from '../../../lib/supabaseClient'

export async function getDepositos() {
  const { data, error } = await supabase.from('depositos').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function getStockByDeposito(depositoId) {
  const { data, error } = await supabase
    .from('stock_x_deposito')
    .select(
      'id, cantidad, updated_at, producto:productos(id, sku, nombre, categoria:categorias(nombre), marca:marcas(nombre), unidad_medida:unidades_medida(abreviatura))',
    )
    .eq('deposito_id', depositoId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}
