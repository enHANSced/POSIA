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

export interface AgenteIAResponse {
  success: boolean
  message: string
  conversation_id: string
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
    throw new Error(error.message || 'Error al comunicarse con el agente IA')
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
    sku?: string
    barcode?: string
    price?: number
    cost?: number
    tax_rate?: number
  }
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
    throw new Error(error.message || 'Error al analizar imagen de producto')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as AnalizarProductoImagenResponse
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
