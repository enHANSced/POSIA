import { defineStore } from 'pinia'
import { shallowRef, ref, triggerRef } from 'vue'
import {
  enviarMensajeIA,
  fetchConversaciones,
  fetchMensajesConversacion,
  eliminarConversacion,
  type IAMessage,
  type IAConversationSummary,
} from '@/services/edge-functions'

export const useIAStore = defineStore('ia', () => {
  // Estado
  const conversaciones = shallowRef<IAConversationSummary[]>([])
  const mensajes = shallowRef<IAMessage[]>([])
  const conversacionActualId = ref<string | null>(null)
  const cargando = ref(false)
  const enviando = ref(false)
  const error = ref<string | null>(null)

  // ==================== CONVERSACIONES ====================

  async function cargarConversaciones() {
    cargando.value = true
    error.value = null
    try {
      conversaciones.value = await fetchConversaciones()
      triggerRef(conversaciones)
    } catch (err) {
      error.value = 'Error al cargar conversaciones'
      console.error(err)
    } finally {
      cargando.value = false
    }
  }

  async function seleccionarConversacion(id: string) {
    cargando.value = true
    error.value = null
    try {
      conversacionActualId.value = id
      mensajes.value = await fetchMensajesConversacion(id)
      triggerRef(mensajes)
    } catch (err) {
      error.value = 'Error al cargar mensajes'
      console.error(err)
    } finally {
      cargando.value = false
    }
  }

  function nuevaConversacion() {
    conversacionActualId.value = null
    mensajes.value = []
    triggerRef(mensajes)
  }

  async function borrarConversacion(id: string) {
    try {
      await eliminarConversacion(id)
      conversaciones.value = conversaciones.value.filter(c => c.id !== id)
      triggerRef(conversaciones)

      if (conversacionActualId.value === id) {
        nuevaConversacion()
      }
    } catch (err) {
      error.value = 'Error al eliminar conversación'
      console.error(err)
    }
  }

  // ==================== MENSAJES ====================

  async function enviarMensaje(texto: string) {
    if (!texto.trim() || enviando.value) return

    enviando.value = true
    error.value = null

    // Agregar mensaje del usuario inmediatamente (optimistic UI)
    const userMessage: IAMessage = {
      role: 'user',
      content: texto,
      timestamp: new Date().toISOString(),
    }
    mensajes.value = [...mensajes.value, userMessage]
    triggerRef(mensajes)

    try {
      const response = await enviarMensajeIA({
        mensaje: texto,
        conversation_id: conversacionActualId.value ?? undefined,
      })

      // Si era una conversación nueva, guardar el ID
      if (!conversacionActualId.value) {
        conversacionActualId.value = response.conversation_id
      }

      // Agregar respuesta del asistente
      const assistantMessage: IAMessage = {
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
      }
      mensajes.value = [...mensajes.value, assistantMessage]
      triggerRef(mensajes)

      // Recargar lista de conversaciones
      await cargarConversaciones()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Error al enviar mensaje'
      // Remover el mensaje optimista si falló
      mensajes.value = mensajes.value.filter(m => m !== userMessage)
      triggerRef(mensajes)
      console.error(err)
    } finally {
      enviando.value = false
    }
  }

  // ==================== RESET ====================

  function $reset() {
    conversaciones.value = []
    mensajes.value = []
    conversacionActualId.value = null
    cargando.value = false
    enviando.value = false
    error.value = null
  }

  return {
    // Estado
    conversaciones,
    mensajes,
    conversacionActualId,
    cargando,
    enviando,
    error,
    // Acciones
    cargarConversaciones,
    seleccionarConversacion,
    nuevaConversacion,
    borrarConversacion,
    enviarMensaje,
    $reset,
  }
})
