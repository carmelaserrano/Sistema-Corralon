import { supabase } from '../../../lib/supabaseClient'

export async function getBranches() {
  const { data, error } = await supabase.from('branches').select('*').order('name')
  if (error) throw error
  return data
}

export async function getStockByBranch(branchId) {
  const { data, error } = await supabase
    .from('stock')
    .select('id, quantity, updated_at, product:products(id, sku, name, unit, category)')
    .eq('branch_id', branchId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}
