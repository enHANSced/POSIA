import { supabase } from './supabase'
import type { Product, Sale, Category, SaleItem, LowStockProduct, Json } from '@/types/supabase'

// ==================== PRODUCTOS ====================

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, color, icon)')
    .eq('active', true)
    .order('name')

  if (error) throw error
  return data || []
}

export async function fetchProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, color, icon)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function searchProducts(query: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, color, icon)')
    .or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode.eq.${query}`)
    .eq('active', true)
    .limit(20)

  if (error) throw error
  return data || []
}

export async function fetchProductByBarcode(barcode: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, color, icon)')
    .eq('barcode', barcode)
    .eq('active', true)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data
}

export async function createProduct(
  product: Omit<Product, 'id' | 'created_at' | 'updated_at'>
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert([product])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateProduct(
  id: string,
  updates: Partial<Product>
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function fetchLowStockProducts(): Promise<LowStockProduct[]> {
  const { data: products, error } = await supabase
    .from('low_stock_products')
    .select('*')

  if (error) throw error
  return products || []
}

// ==================== CATEGORÍAS ====================

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  if (error) throw error
  return data || []
}

export async function createCategory(
  category: Omit<Category, 'id' | 'created_at' | 'updated_at'>
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert([category])
    .select()
    .single()

  if (error) throw error
  return data
}

// ==================== VENTAS ====================

export async function createSale(
  items: SaleItem[],
  total: number,
  paymentMethod: 'efectivo' | 'tarjeta' | 'otro',
  discount: number = 0,
  notes?: string
): Promise<Sale> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Usuario no autenticado')
  }

  const saleNumber = `VTA-${Date.now()}`
  const subtotal = items.reduce((acc, item) => acc + item.subtotal, 0)
  const taxAmount = items.reduce((acc, item) => acc + item.tax, 0)

  const { data, error } = await supabase
    .from('sales')
    .insert([{
      sale_number: saleNumber,
      seller_id: user.id,
      items: items as unknown as Json,
      subtotal,
      tax_amount: taxAmount,
      discount,
      total,
      payment_method: paymentMethod,
      status: 'completed',
      notes
    }])
    .select()
    .single()

  if (error) throw error

  // Actualizar stock de productos
  for (const item of items) {
    await updateProductStock(item.product_id, -item.quantity, 'sale', saleNumber)
  }

  return data
}

export async function fetchSalesHistory(
  startDate?: string,
  endDate?: string,
  limit: number = 100
): Promise<Sale[]> {
  let query = supabase
    .from('sales')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (startDate) {
    query = query.gte('created_at', startDate)
  }

  if (endDate) {
    query = query.lte('created_at', endDate)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function fetchTodaySales(): Promise<Sale[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getSalesSummary(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('sales')
    .select('total, tax_amount, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .eq('status', 'completed')

  if (error) throw error

  const totalSales = data?.length || 0
  const totalRevenue = data?.reduce((acc, sale) => acc + sale.total, 0) || 0
  const totalTax = data?.reduce((acc, sale) => acc + (sale.tax_amount || 0), 0) || 0

  return {
    totalSales,
    totalRevenue,
    totalTax,
    sales: data || []
  }
}

// ==================== INVENTARIO ====================

export async function updateProductStock(
  productId: string,
  quantity: number,
  type: 'sale' | 'entry' | 'adjustment',
  reason?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()

  // Registrar movimiento de inventario
  const { error: movementError } = await supabase
    .from('inventory_movements')
    .insert([{
      product_id: productId,
      type,
      quantity,
      reason,
      user_id: user?.id
    }])

  if (movementError) throw movementError

  // Actualizar stock del producto
  const { error: updateError } = await supabase.rpc('update_product_stock', {
    p_product_id: productId,
    p_quantity: quantity
  })

  // Si no existe la función RPC, usar update directo
  if (updateError && updateError.code === 'PGRST202') {
    const { data: product } = await supabase
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()

    if (product) {
      await supabase
        .from('products')
        .update({ 
          stock: (product.stock || 0) + quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', productId)
    }
  } else if (updateError) {
    throw updateError
  }
}

// ==================== REALTIME ====================

export function subscribeToProducts(
  callback: (payload: { eventType: string; new: Product; old: Product }) => void
) {
  return supabase
    .channel('products-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      (payload) => callback(payload as any)
    )
    .subscribe()
}

export function subscribeToSales(
  callback: (payload: { eventType: string; new: Sale; old: Sale }) => void
) {
  return supabase
    .channel('sales-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sales' },
      (payload) => callback(payload as any)
    )
    .subscribe()
}
