// Tipos generados para la base de datos Supabase
// NOTA: Estos tipos se pueden generar automáticamente con: 
// npx supabase gen types typescript --project-id tbsbfnubbdiqstjzxtzl > src/types/database.types.ts

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: Category
        Insert: Omit<Category, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Category, 'id'>>
      }
      products: {
        Row: Product
        Insert: Omit<Product, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Product, 'id'>>
      }
      sales: {
        Row: Sale
        Insert: Omit<Sale, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Sale, 'id'>>
      }
      inventory_movements: {
        Row: InventoryMovement
        Insert: Omit<InventoryMovement, 'id' | 'created_at'>
        Update: Partial<Omit<InventoryMovement, 'id'>>
      }
      ia_conversations: {
        Row: IAConversation
        Insert: Omit<IAConversation, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<IAConversation, 'id'>>
      }
      push_subscriptions: {
        Row: PushSubscription
        Insert: Omit<PushSubscription, 'id' | 'created_at'>
        Update: Partial<Omit<PushSubscription, 'id'>>
      }
      notification_preferences: {
        Row: NotificationPreference
        Insert: Omit<NotificationPreference, 'created_at' | 'updated_at'>
        Update: Partial<Omit<NotificationPreference, 'user_id'>>
      }
    }
  }
}

// Interfaces de dominio
export interface Category {
  id: string
  name: string
  description: string | null
  color: string
  icon: string
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  description: string | null
  category_id: string | null
  price: number
  cost: number | null
  stock: number
  min_stock: number
  image_url: string | null
  tax_rate: number
  active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SaleItem {
  product_id: string
  name: string
  quantity: number
  unit_price: number
  subtotal: number
  tax: number
}

export interface Sale {
  id: string
  sale_number: string
  seller_id: string
  items: SaleItem[]
  subtotal: number
  tax_amount: number
  discount: number
  total: number
  payment_method: 'efectivo' | 'tarjeta' | 'otro'
  status: 'completed' | 'refunded' | 'pending'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InventoryMovement {
  id: string
  product_id: string
  type: 'sale' | 'entry' | 'adjustment'
  quantity: number
  reason: string | null
  user_id: string | null
  created_at: string
}

export interface IAMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface IAConversation {
  id: string
  user_id: string
  title: string | null
  messages: IAMessage[]
  created_at: string
  updated_at: string
}

export interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  auth_key: string | null
  p256dh_key: string | null
  created_at: string
}

export interface NotificationPreference {
  user_id: string
  sales_push: boolean
  low_stock_push: boolean
  created_at: string
  updated_at: string
}

// Tipos para el carrito
export interface CartItem {
  product: Product
  quantity: number
  subtotal: number
  tax: number
}
