import { supabase } from './supabase'
import type { SaleItem } from '@/types/supabase'

// ==================== PROCESAR VENTA (Edge Function) ====================

export interface ProcesarVentaRequest {
  items: SaleItem[]
  total: number
  subtotal: number
  tax_amount: number
  discount?: number
  payment_method: 'efectivo' | 'tarjeta' | 'otro'
  notes?: string
  customer_name?: string
  customer_rtn?: string
  promotion?: {
    id?: string
    source: 'discount' | 'combo' | 'manual'
    type: 'percentage' | 'fixed'
    value: number
    amount: number
    name?: string
  }
}

export interface ProcesarVentaResponse {
  success: boolean
  sale: {
    sale_id: string
    sale_number: string
    total: number
    items_count: number
  }
  seller_name: string | null
  customer_name: string | null
  customer_rtn: string | null
  message: string
}

/**
 * Procesa una venta completa via Edge Function.
 * Ejecuta una transacción ACID: crea la venta, actualiza stock y registra movimientos.
 */
export async function procesarVenta(request: ProcesarVentaRequest): Promise<ProcesarVentaResponse> {
  const { data, error } = await supabase.functions.invoke('procesar-venta', {
    body: {
      items: request.items,
      total: request.total,
      subtotal: request.subtotal,
      tax_amount: request.tax_amount,
      discount: request.discount ?? 0,
      payment_method: request.payment_method,
      notes: request.notes ?? null,
      customer_name: request.customer_name ?? null,
      customer_rtn: request.customer_rtn ?? null,
      promotion: request.promotion ?? null,
    },
  })

  if (error) {
    // Intentar extraer mensaje del body si existe
    const msg = data?.error || error.message || 'Error al procesar la venta'
    throw new Error(msg)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as ProcesarVentaResponse
}

// ==================== AGENTE IA (Edge Function) ====================

export interface AgenteIARequest {
  mensaje: string
  conversation_id?: string
}

export interface WebSource {
  url: string
  title: string
}

export interface GroundingSupport {
  text: string
  sourceIndices: number[]
}

export interface AgenteIAResponse {
  success: boolean
  message: string
  conversation_id: string
  follow_up_suggestions?: string[]
  web_sources?: WebSource[]
  search_queries?: string[]
  grounding_supports?: GroundingSupport[]
  used_web_search?: boolean
}

/**
 * Envía un mensaje al agente IA via Edge Function.
 * El agente usa Gemini 2.5 Flash con contexto de negocio en tiempo real.
 */
export async function enviarMensajeIA(request: AgenteIARequest): Promise<AgenteIAResponse> {
  const { data, error } = await supabase.functions.invoke('agente-ia', {
    body: {
      mensaje: request.mensaje,
      conversation_id: request.conversation_id ?? null,
    },
  })

  if (error) {
    const msg = data?.error || error.message || 'Error al comunicarse con el agente IA'
    throw new Error(msg)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as AgenteIAResponse
}

// ==================== CONVERSACIONES IA ====================

export interface IAMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  webSources?: WebSource[]
  searchQueries?: string[]
  groundingSupports?: GroundingSupport[]
  usedWebSearch?: boolean
}

function esIAMessage(value: unknown): value is IAMessage {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.content === 'string' &&
    typeof item.timestamp === 'string'
  )
}

export interface IAConversationSummary {
  id: string
  title: string | null
  updated_at: string | null
  created_at: string | null
}

/**
 * Obtiene las conversaciones del usuario actual
 */
export async function fetchConversaciones(): Promise<IAConversationSummary[]> {
  const { data, error } = await supabase
    .from('ia_conversations')
    .select('id, title, updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return data || []
}

/**
 * Obtiene los mensajes de una conversación específica
 */
export async function fetchMensajesConversacion(conversationId: string): Promise<IAMessage[]> {
  const { data, error } = await supabase
    .from('ia_conversations')
    .select('messages')
    .eq('id', conversationId)
    .single()

  if (error) throw error
  const messages = data?.messages

  if (!Array.isArray(messages)) return []
  return (messages as unknown[]).filter(esIAMessage)
}

/**
 * Elimina una conversación
 */
export async function eliminarConversacion(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('ia_conversations')
    .delete()
    .eq('id', conversationId)

  if (error) throw error
}

// ==================== IA PARA PRODUCTOS (MULTIMODAL) ====================

export interface AnalizarProductoImagenRequest {
  imageBase64: string
  mimeType: string
  barcode?: string
  categories?: string[]
}

export interface AnalizarProductoImagenResponse {
  success: boolean
  suggestion: {
    name?: string
    description?: string
    category_name?: string
    sell_by?: 'unit' | 'weight'
    sku?: string
    barcode?: string
    price?: number
    cost?: number
    tax_rate?: number
    min_stock?: number
  }
  price_sources?: WebSource[]
  search_queries?: string[]
  price_researched?: boolean
}

export async function analizarProductoImagen(
  request: AnalizarProductoImagenRequest
): Promise<AnalizarProductoImagenResponse> {
  const { data, error } = await supabase.functions.invoke('analizar-producto', {
    body: {
      imageBase64: request.imageBase64,
      mimeType: request.mimeType,
      barcode: request.barcode ?? null,
      categories: request.categories ?? [],
    },
  })

  if (error) {
    const msg = data?.error || error.message || 'Error al analizar imagen de producto'
    throw new Error(msg)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as AnalizarProductoImagenResponse
}

// ==================== RECONOCIMIENTO IA DE PRODUCTOS ====================

export interface MatchedProduct {
  product_id: string
  label: string
  confidence: 'high' | 'medium' | 'low'
  match_reason: string
  product: {
    id: string
    name: string
    sku: string
    barcode: string
    price: number
    stock: number
    image_url: string | null
    category_id: string | null
    categories: { name: string } | null
  }
}

export interface ReconocerProductosRequest {
  imageBase64: string
  mimeType: string
}

export interface ReconocerProductosResponse {
  success: boolean
  mode: 'recognition'
  matched_products: MatchedProduct[]
  catalog_size: number
}

export async function reconocerProductosImagen(
  request: ReconocerProductosRequest,
): Promise<ReconocerProductosResponse> {
  const { data, error } = await supabase.functions.invoke('analizar-producto', {
    body: {
      imageBase64: request.imageBase64,
      mimeType: request.mimeType,
      mode: 'recognition',
    },
  })

  if (error) {
    const msg = data?.error || error.message || 'Error al reconocer productos en imagen'
    throw new Error(msg)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as ReconocerProductosResponse
}

// ==================== GESTIÓN DE EMPLEADOS (Edge Function) ====================

export interface CrearEmpleadoRequest {
  email: string
  password: string
  full_name: string
  role: 'admin' | 'seller' | 'viewer'
  phone?: string
}

export interface CrearEmpleadoResponse {
  success: boolean
  user_id: string
  message: string
}

/**
 * Crea un nuevo empleado via Edge Function.
 * Usa la API de admin de Supabase para crear usuarios sin afectar la sesión actual.
 */
export async function crearEmpleado(request: CrearEmpleadoRequest): Promise<CrearEmpleadoResponse> {
  const { data, error } = await supabase.functions.invoke('gestionar-empleados', {
    body: {
      action: 'create',
      email: request.email,
      password: request.password,
      full_name: request.full_name,
      role: request.role,
      phone: request.phone ?? null,
    },
  })

  if (error) {
    throw new Error(error.message || 'Error al crear empleado')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as CrearEmpleadoResponse
}

export interface SincronizarEmpleadosResponse {
  success: boolean
  synced: number
  message: string
}

/**
 * Sincroniza usuarios huérfanos de auth.users → user_profiles.
 * Útil si se crearon usuarios en el panel de Supabase sin que se
 * generara el perfil correspondiente en user_profiles.
 */
export async function sincronizarEmpleados(): Promise<SincronizarEmpleadosResponse> {
  const { data, error } = await supabase.functions.invoke('gestionar-empleados', {
    body: { action: 'sync' },
  })

  if (error) {
    throw new Error(error.message || 'Error al sincronizar empleados')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as SincronizarEmpleadosResponse
}

// ==================== SUGERENCIAS IA PARA DESCUENTOS ====================

export interface IASuggestionItem {
  type: 'discount' | 'combo'
  name: string
  description: string
  reason: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  applicable_to: 'all' | 'category' | 'product'
  category_id: string | null
  category_name: string | null
  product_ids: string[]
  product_names: string[]
  priority: 'alta' | 'media' | 'baja'
  estimated_impact: string
}

export interface SugerirDescuentosResponse {
  success: boolean
  suggestions: IASuggestionItem[]
  analysis_summary: {
    total_sales: number
    avg_basket: number
    top_products_count: number
    copurchase_pairs: number
    products_without_promos: number
  }
}

/**
 * Solicita sugerencias de descuentos y combos al agente IA
 * basado en el análisis de patrones de compra.
 */
export async function sugerirDescuentosIA(): Promise<SugerirDescuentosResponse> {
  const { data, error } = await supabase.functions.invoke('sugerir-descuentos', {
    body: {},
  })

  if (error) {
    const msg = data?.error || error.message || 'Error al obtener sugerencias de IA'
    throw new Error(msg)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as SugerirDescuentosResponse
}
