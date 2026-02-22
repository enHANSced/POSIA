// Tipos generados automáticamente por Supabase
// Regenerar con: npx supabase gen types typescript --project-id tbsbfnubbdiqstjzxtzl

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ia_conversations: {
        Row: {
          created_at: string | null
          id: string
          messages: Json | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          messages?: Json | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          messages?: Json | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          reason: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean | null
          barcode: string | null
          category_id: string | null
          cost: number | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          metadata: Json | null
          min_stock: number | null
          name: string
          price: number
          sku: string | null
          stock: number | null
          tax_rate: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          barcode?: string | null
          category_id?: string | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json | null
          min_stock?: number | null
          name: string
          price: number
          sku?: string | null
          stock?: number | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          barcode?: string | null
          category_id?: string | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json | null
          min_stock?: number | null
          name?: string
          price?: number
          sku?: string | null
          stock?: number | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string | null
          created_at: string | null
          endpoint: string
          id: string
          p256dh_key: string | null
          user_id: string
        }
        Insert: {
          auth_key?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh_key?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh_key?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          user_id: string
          sales_push: boolean
          low_stock_push: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          sales_push?: boolean
          low_stock_push?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          sales_push?: boolean
          low_stock_push?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          created_at: string | null
          discount: number | null
          id: string
          items: Json
          notes: string | null
          payment_method: string
          sale_number: string
          seller_id: string | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          total: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          discount?: number | null
          id?: string
          items: Json
          notes?: string | null
          payment_method: string
          sale_number: string
          seller_id?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          discount?: number | null
          id?: string
          items?: Json
          notes?: string | null
          payment_method?: string
          sale_number?: string
          seller_id?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          active: boolean | null
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      low_stock_products: {
        Row: {
          active: boolean | null
          barcode: string | null
          category_color: string | null
          category_id: string | null
          category_name: string | null
          cost: number | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          metadata: Json | null
          min_stock: number | null
          name: string | null
          price: number | null
          sku: string | null
          stock: number | null
          tax_rate: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      sales_summary_today: {
        Row: {
          average_sale: number | null
          fecha: string | null
          total_discount: number | null
          total_revenue: number | null
          total_sales: number | null
          total_tax: number | null
        }
        Relationships: []
      }
      top_selling_products: {
        Row: {
          id: string | null
          name: string | null
          price: number | null
          stock: number | null
          units_sold: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      decrement_stock: {
        Args: { amount: number; product_id: string }
        Returns: undefined
      }
      get_sales_stats: {
        Args: { end_date?: string; start_date?: string }
        Returns: {
          average_sale: number
          period_end: string
          period_start: string
          total_revenue: number
          total_sales: number
          total_tax: number
        }[]
      }
      update_product_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      procesar_venta_completa: {
        Args: {
          p_items: Json
          p_total: number
          p_subtotal: number
          p_tax_amount: number
          p_discount?: number
          p_payment_method?: string
          p_notes?: string | null
          p_seller_id?: string
        }
        Returns: Json
      }
      obtener_contexto_ia: {
        Args: Record<string, never>
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Tipos de entidades principales
export interface Category {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  created_at: string | null
  updated_at: string | null
}

export interface Product {
  id: string
  name: string
  description: string | null
  sku: string | null
  barcode: string | null
  price: number
  cost: number | null
  stock: number | null
  min_stock: number | null
  category_id: string | null
  image_url: string | null
  active: boolean | null
  tax_rate: number | null
  metadata: Json | null
  created_at: string | null
  updated_at: string | null
  // Relación con categoría (opcional, se incluye con select)
  categories?: {
    name: string
    color: string | null
    icon: string | null
  } | null
}

export interface Sale {
  id: string
  sale_number: string
  items: Json
  subtotal: number | null
  tax_amount: number | null
  discount: number | null
  total: number
  payment_method: string
  seller_id: string | null
  status: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export interface InventoryMovement {
  id: string
  product_id: string
  type: string
  quantity: number
  reason: string | null
  user_id: string | null
  created_at: string | null
}

export interface IAConversation {
  id: string
  user_id: string
  messages: Json | null
  title: string | null
  created_at: string | null
  updated_at: string | null
}

export interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh_key: string | null
  auth_key: string | null
  created_at: string | null
}

export interface NotificationPreferences {
  user_id: string
  sales_push: boolean
  low_stock_push: boolean
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
  phone: string | null
  active: boolean | null
  created_at: string | null
  updated_at: string | null
}

export interface LowStockProduct {
  id: string | null
  name: string | null
  description: string | null
  sku: string | null
  barcode: string | null
  price: number | null
  cost: number | null
  stock: number | null
  min_stock: number | null
  category_id: string | null
  category_name: string | null
  category_color: string | null
  image_url: string | null
  active: boolean | null
  tax_rate: number | null
  metadata: Json | null
  created_at: string | null
  updated_at: string | null
}

// Tipos para carrito
export interface CartItem {
  product: Product
  quantity: number
  subtotal: number
  tax: number
}

// Tipos para items de venta (se guardan en la columna items JSON)
export interface SaleItem {
  product_id: string
  name: string
  quantity: number
  unit_price: number
  subtotal: number
  tax: number
}
