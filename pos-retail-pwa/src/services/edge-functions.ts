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
}

export interface ProcesarVentaResponse {
  success: boolean
  sale: {
    sale_id: string
    sale_number: string
    total: number
    items_count: number
  }
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
    },
  })

  if (error) {
    throw new Error(error.message || 'Error al procesar la venta')
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
  return (data?.messages as IAMessage[]) || []
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
