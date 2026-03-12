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
      combos: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          max_uses_per_sale: number
          min_quantity_per_product: number
          name: string
          product_ids: string[]
          required_all: boolean
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          max_uses_per_sale?: number
          min_quantity_per_product?: number
          name: string
          product_ids: string[]
          required_all?: boolean
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          max_uses_per_sale?: number
          min_quantity_per_product?: number
          name?: string
          product_ids?: string[]
          required_all?: boolean
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      discount_applications: {
        Row: {
          amount_saved: number
          combo_id: string | null
          created_at: string
          discount_id: string | null
          discount_type: string
          discount_value: number
          id: string
          reason: string | null
          sale_id: string
        }
        Insert: {
          amount_saved: number
          combo_id?: string | null
          created_at?: string
          discount_id?: string | null
          discount_type: string
          discount_value: number
          id?: string
          reason?: string | null
          sale_id: string
        }
        Update: {
          amount_saved?: number
          combo_id?: string | null
          created_at?: string
          discount_id?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          reason?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_applications_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_applications_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_applications_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          }
        ]
      }
      discounts: {
        Row: {
          active: boolean
          applicable_to: string
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          min_amount: number | null
          min_quantity: number | null
          name: string
          product_ids: string[]
          type: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          value: number
        }
        Insert: {
          active?: boolean
          applicable_to?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          min_amount?: number | null
          min_quantity?: number | null
          name: string
          product_ids?: string[]
          type: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          value: number
        }
        Update: {
          active?: boolean
          applicable_to?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          min_amount?: number | null
          min_quantity?: number | null
          name?: string
          product_ids?: string[]
          type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          value?: number
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
      daily_sales_summary: {
        Row: {
          avg_ticket: number | null
          fecha: string | null
          total_discount: number | null
          total_revenue: number | null
          total_sales: number | null
          total_tax: number | null
        }
        Relationships: []
      }
      discount_impact_daily: {
        Row: {
          discount_percent_of_revenue: number | null
          fecha: string | null
          sales_with_discount: number | null
          total_discount_amount: number | null
          total_revenue: number | null
          total_sales: number | null
        }
        Relationships: []
      }
      sales_by_hour: {
        Row: {
          hora: number | null
          revenue: number | null
          ventas: number | null
        }
        Relationships: []
      }
      seller_rankings: {
        Row: {
          avg_ticket: number | null
          last_sale_at: string | null
          seller_email: string | null
          seller_id: string | null
          seller_name: string | null
          total_revenue: number | null
          total_sales: number | null
        }
        Relationships: []
      }
      sales_by_payment_method: {
        Row: {
          payment_method: string | null
          total_revenue: number | null
          total_sales: number | null
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
      obtener_contexto_ia_completo: {
        Args: { p_include_samples?: boolean; p_row_limit?: number }
        Returns: Json
      }
      validate_discount_eligible: {
        Args: { p_discount_id: string; p_product_ids?: string[]; p_sale_total: number }
        Returns: Json
      }
      detectar_combos_disponibles: {
        Args: { p_product_ids: string[] }
        Returns: {
          combo_id: string
          combo_name: string
          discount_type: string
          discount_value: number
          is_fully_eligible: boolean
          matched_count: number
          required_count: number
        }[]
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

export interface Discount {
  id: string
  name: string
  description: string | null
  type: 'percentage' | 'fixed'
  value: number
  min_amount: number | null
  min_quantity: number | null
  applicable_to: 'all' | 'category' | 'product'
  category_id: string | null
  product_ids: string[]
  valid_from: string | null
  valid_until: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Combo {
  id: string
  name: string
  description: string | null
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  product_ids: string[]
  required_all: boolean
  min_quantity_per_product: number
  max_uses_per_sale: number
  valid_from: string | null
  valid_until: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface DiscountApplication {
  id: string
  sale_id: string
  discount_id: string | null
  combo_id: string | null
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  amount_saved: number
  reason: string | null
  created_at: string
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
