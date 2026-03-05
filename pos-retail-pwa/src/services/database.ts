import { supabase } from './supabase'
import type {
  Product,
  Sale,
  Category,
  SaleItem,
  LowStockProduct,
  Json,
  UserProfile,
  Discount,
  Combo,
  DiscountApplication
} from '@/types/supabase'

const PRODUCT_IMAGES_BUCKET = import.meta.env.VITE_SUPABASE_PRODUCT_IMAGES_BUCKET || 'product-images'

export type SaleHistoryItem = Sale & {
  seller_name?: string | null
  seller_email?: string | null
}

export type DiscountApplicationHistoryItem = DiscountApplication & {
  sales?: {
    sale_number: string
    created_at: string | null
  } | null
  discounts?: {
    name: string
  } | null
  combos?: {
    name: string
  } | null
}

function isDateWithinWindow(validFrom: string | null, validUntil: string | null, targetDate: Date): boolean {
  const fromOk = !validFrom || targetDate >= new Date(validFrom)
  const untilOk = !validUntil || targetDate <= new Date(validUntil)
  return fromOk && untilOk
}

// ==================== PRODUCTOS ====================

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, color, icon)')
    .eq('active', true)
    .order('name')

  if (error) throw error
  return (data as unknown as Product[]) || []
}

export async function fetchProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, color, icon)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as Product | null
}

export async function searchProducts(query: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, color, icon)')
    .or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode.eq.${query}`)
    .eq('active', true)
    .limit(20)

  if (error) throw error
  return (data as unknown as Product[]) || []
}

export async function fetchProductByBarcode(barcode: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, color, icon)')
    .eq('barcode', barcode)
    .eq('active', true)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data as unknown as Product | null
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

export async function uploadProductImage(file: File, productId?: string): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'jpg'
  const folder = productId || 'temp'
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExtension}`
  const filePath = `${folder}/${fileName}`

  const { error: uploadError } = await supabase
    .storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(filePath, file, {
      upsert: false,
      contentType: file.type || 'image/jpeg'
    })

  if (uploadError) throw uploadError

  const { data } = supabase
    .storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(filePath)

  return data.publicUrl
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

export async function updateCategory(
  id: string,
  updates: Partial<Pick<Category, 'name' | 'description' | 'color' | 'icon'>>
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ==================== DESCUENTOS Y COMBOS ====================

export async function fetchDiscounts(includeInactive: boolean = true): Promise<Discount[]> {
  let query = supabase
    .from('discounts')
    .select('*')
    .order('updated_at', { ascending: false })

  if (!includeInactive) {
    query = query.eq('active', true)
  }

  const { data, error } = await query

  if (error) throw error
  return (data || []) as Discount[]
}

export async function fetchActiveDiscounts(referenceDate: Date = new Date()): Promise<Discount[]> {
  const discounts = await fetchDiscounts(false)
  return discounts.filter(discount => isDateWithinWindow(discount.valid_from, discount.valid_until, referenceDate))
}

export async function createDiscount(
  discount: Omit<Discount, 'id' | 'created_at' | 'updated_at'>
): Promise<Discount> {
  const { data, error } = await supabase
    .from('discounts')
    .insert([discount])
    .select()
    .single()

  if (error) throw error
  return data as Discount
}

export async function updateDiscount(
  id: string,
  updates: Partial<Omit<Discount, 'id' | 'created_at' | 'updated_at'>>
): Promise<Discount> {
  const { data, error } = await supabase
    .from('discounts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Discount
}

export async function deleteDiscount(id: string): Promise<void> {
  const { error } = await supabase
    .from('discounts')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function fetchCombos(includeInactive: boolean = true): Promise<Combo[]> {
  let query = supabase
    .from('combos')
    .select('*')
    .order('updated_at', { ascending: false })

  if (!includeInactive) {
    query = query.eq('active', true)
  }

  const { data, error } = await query

  if (error) throw error
  return (data || []) as Combo[]
}

export async function fetchActiveCombos(referenceDate: Date = new Date()): Promise<Combo[]> {
  const combos = await fetchCombos(false)
  return combos.filter(combo => isDateWithinWindow(combo.valid_from, combo.valid_until, referenceDate))
}

export async function createCombo(
  combo: Omit<Combo, 'id' | 'created_at' | 'updated_at'>
): Promise<Combo> {
  const { data, error } = await supabase
    .from('combos')
    .insert([combo])
    .select()
    .single()

  if (error) throw error
  return data as Combo
}

export async function updateCombo(
  id: string,
  updates: Partial<Omit<Combo, 'id' | 'created_at' | 'updated_at'>>
): Promise<Combo> {
  const { data, error } = await supabase
    .from('combos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Combo
}

export async function deleteCombo(id: string): Promise<void> {
  const { error } = await supabase
    .from('combos')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function fetchDiscountApplications(
  startDate?: string,
  endDate?: string,
  limit: number = 200
): Promise<DiscountApplicationHistoryItem[]> {
  let query = supabase
    .from('discount_applications')
    .select('*, sales(sale_number, created_at), discounts(name), combos(name)')
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
  return (data || []) as DiscountApplicationHistoryItem[]
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
): Promise<SaleHistoryItem[]> {
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

  const sales = (data || []) as Sale[]
  const sellerIds = Array.from(
    new Set(
      sales
        .map(sale => sale.seller_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  )

  if (sellerIds.length === 0) {
    return sales
  }

  const { data: sellerProfiles, error: sellerError } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', sellerIds)

  if (sellerError) {
    return sales
  }

  const sellerMap = new Map(
    (sellerProfiles || []).map(profile => [profile.id, profile])
  )

  return sales.map(sale => {
    const seller = sale.seller_id ? sellerMap.get(sale.seller_id) : null
    return {
      ...sale,
      seller_name: seller?.full_name || null,
      seller_email: seller?.email || null
    }
  })
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

  // Fallback a update directo si falla el RPC (función ausente, ambigua o error temporal)
  if (updateError) {
    const { data: product } = await supabase
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()

    if (product) {
      const { error: directUpdateError } = await supabase
        .from('products')
        .update({ 
          stock: (product.stock || 0) + quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', productId)

      if (!directUpdateError) {
        return
      }
    }

    throw updateError
  }
}

export async function fetchInventoryMovements(limit: number = 200) {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('id, product_id, type, quantity, reason, user_id, created_at, products(name, sku, barcode)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function adjustInventory(
  productId: string,
  quantityDelta: number,
  reason: string
): Promise<void> {
  const type = quantityDelta >= 0 ? 'entry' : 'adjustment'
  await updateProductStock(productId, quantityDelta, type, reason)
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

// ==================== EMPLEADOS ====================

export async function fetchEmployees(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function updateEmployeeProfile(
  id: string,
  updates: Partial<Pick<UserProfile, 'full_name' | 'phone' | 'role' | 'active'>>
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export function subscribeToEmployees(
  callback: (payload: { eventType: string; new: UserProfile; old: UserProfile }) => void
) {
  return supabase
    .channel('employees-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_profiles' },
      (payload) => callback(payload as any)
    )
    .subscribe()
}
