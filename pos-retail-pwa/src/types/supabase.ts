// Tipos generados automáticamente por Supabase
// Regenerar con: npx supabase gen types typescript --project-id tbsbfnubbdiqstjzxtzl

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "top_selling_products"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types
type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  TableName extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
> = (DefaultSchema["Tables"] & DefaultSchema["Views"])[TableName] extends {
  Row: infer R
}
  ? R
  : never

export type TablesInsert<
  TableName extends keyof DefaultSchema["Tables"]
> = DefaultSchema["Tables"][TableName] extends {
  Insert: infer I
}
  ? I
  : never

export type TablesUpdate<
  TableName extends keyof DefaultSchema["Tables"]
> = DefaultSchema["Tables"][TableName] extends {
  Update: infer U
}
  ? U
  : never

// Tipos de dominio para uso más cómodo
export type Category = Tables<"categories">
export type Product = Tables<"products">
export type Sale = Tables<"sales">
export type InventoryMovement = Tables<"inventory_movements">
export type IAConversation = Tables<"ia_conversations">
export type PushSubscription = Tables<"push_subscriptions">

// Tipos para vistas
export type LowStockProduct = Tables<"low_stock_products">
export type SalesSummaryToday = Tables<"sales_summary_today">
export type TopSellingProduct = Tables<"top_selling_products">

// Tipos para inserciones
export type CategoryInsert = TablesInsert<"categories">
export type ProductInsert = TablesInsert<"products">
export type SaleInsert = TablesInsert<"sales">
export type InventoryMovementInsert = TablesInsert<"inventory_movements">

// Tipos auxiliares para el carrito
export interface SaleItem {
  product_id: string
  name: string
  quantity: number
  unit_price: number
  subtotal: number
  tax: number
}

export interface CartItem {
  product: Product
  quantity: number
  subtotal: number
  tax: number
}

// Tipos para mensajes IA
export interface IAMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}
