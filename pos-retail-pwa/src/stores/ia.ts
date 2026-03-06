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
import { fetchDiscountApplications, fetchLowStockProducts, fetchTodaySales } from '@/services/database'

const DEFAULT_PROMPTS = [
  '¿Qué productos se han vendido más esta semana?',
  'Dame alertas de stock bajo y prioridad de reposición.',
  'Compara mis precios con el mercado local hondureño.',
  'Recomiéndame 3 acciones para aumentar ingresos mañana.'
]

export interface IAInsights {
  generatedAt: string
  kpis: {
    totalSalesToday: number
    revenueToday: number
    avgTicketToday: number
    lowStockCount: number
    savingsByPromotionsToday: number
  }
  mensajesContextuales: string[]
  recomendacionesRapidas: string[]
}

export const useIAStore = defineStore('ia', () => {
  // Estado
  const conversaciones = shallowRef<IAConversationSummary[]>([])
  const mensajes = shallowRef<IAMessage[]>([])
  const sugerencias = shallowRef<string[]>([...DEFAULT_PROMPTS])
  const conversacionActualId = ref<string | null>(null)
  const cargando = ref(false)
  const enviando = ref(false)
  const error = ref<string | null>(null)
  const insights = shallowRef<IAInsights | null>(null)
  const loadingInsights = ref(false)

  function round2(value: number): number {
    return Math.round(value * 100) / 100
  }

  async function cargarInsights() {
    loadingInsights.value = true

    try {
      const hoyInicio = new Date()
      hoyInicio.setHours(0, 0, 0, 0)

      const [salesToday, lowStock, applications] = await Promise.all([
        fetchTodaySales(),
        fetchLowStockProducts(),
        fetchDiscountApplications(hoyInicio.toISOString())
      ])

      const totalSalesToday = salesToday.length
      const revenueToday = round2(salesToday.reduce((acc, sale) => acc + (sale.total || 0), 0))
      const avgTicketToday = totalSalesToday > 0 ? round2(revenueToday / totalSalesToday) : 0
      const lowStockCount = lowStock.length
      const savingsByPromotionsToday = round2(applications.reduce((acc, item) => acc + (item.amount_saved || 0), 0))

      const mensajesContextuales: string[] = []
      if (totalSalesToday === 0) {
        mensajesContextuales.push('Aún no hay ventas registradas hoy. Enfócate en activar promociones tempranas.')
      } else {
        mensajesContextuales.push(`Llevas ${totalSalesToday} ventas hoy con un ticket promedio de L ${avgTicketToday.toFixed(2)}.`)
      }

      if (lowStockCount > 0) {
        mensajesContextuales.push(`Hay ${lowStockCount} productos en bajo stock que podrían afectar ventas del turno.`)
      }

      if (savingsByPromotionsToday > 0) {
        mensajesContextuales.push(`Las promociones han generado L ${savingsByPromotionsToday.toFixed(2)} en ahorro para clientes hoy.`)
      }

      const recomendacionesRapidas: string[] = []
      if (lowStockCount > 0) {
        recomendacionesRapidas.push('Prioriza reposición de productos críticos antes de la hora pico.')
      }
      if (avgTicketToday < 250) {
        recomendacionesRapidas.push('Activa combos de mayor valor para subir el ticket promedio del día.')
      }
      if (savingsByPromotionsToday <= 0) {
        recomendacionesRapidas.push('Aplica una promoción sugerida en caja para incrementar conversión y rotación.')
      }
      if (recomendacionesRapidas.length === 0) {
        recomendacionesRapidas.push('Mantén el ritmo: analiza productos top y ajusta precios en los de menor salida.')
      }

      insights.value = {
        generatedAt: new Date().toISOString(),
        kpis: {
          totalSalesToday,
          revenueToday,
          avgTicketToday,
          lowStockCount,
          savingsByPromotionsToday
        },
        mensajesContextuales,
        recomendacionesRapidas
      }
      triggerRef(insights)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Error al cargar insights de IA'
    } finally {
      loadingInsights.value = false
    }
  }

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
      actualizarSugerenciasDesdeMensajes()
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
    sugerencias.value = [...DEFAULT_PROMPTS]
    triggerRef(mensajes)
    triggerRef(sugerencias)
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

      // Agregar respuesta del asistente con fuentes web si las hay
      const assistantMessage: IAMessage = {
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        webSources: response.web_sources,
        searchQueries: response.search_queries,
        groundingSupports: response.grounding_supports,
        usedWebSearch: response.used_web_search,
      }
      mensajes.value = [...mensajes.value, assistantMessage]
      triggerRef(mensajes)

      actualizarSugerencias(
        texto,
        assistantMessage.content,
        response.follow_up_suggestions || []
      )

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
    sugerencias.value = [...DEFAULT_PROMPTS]
    conversacionActualId.value = null
    cargando.value = false
    enviando.value = false
    error.value = null
    insights.value = null
    loadingInsights.value = false
  }

  function actualizarSugerencias(
    userMessage: string,
    assistantMessage: string,
    suggestionsFromApi: string[] = []
  ) {
    if (suggestionsFromApi.length > 0) {
      sugerencias.value = suggestionsFromApi.slice(0, 4)
      triggerRef(sugerencias)
      return
    }

    sugerencias.value = construirSugerenciasHeuristicas(userMessage, assistantMessage)
    triggerRef(sugerencias)
  }

  function actualizarSugerenciasDesdeMensajes() {
    if (mensajes.value.length === 0) {
      sugerencias.value = [...DEFAULT_PROMPTS]
      triggerRef(sugerencias)
      return
    }

    const lastUser = [...mensajes.value].reverse().find((msg) => msg.role === 'user')
    const lastAssistant = [...mensajes.value].reverse().find((msg) => msg.role === 'assistant')

    sugerencias.value = construirSugerenciasHeuristicas(
      lastUser?.content || '',
      lastAssistant?.content || ''
    )
    triggerRef(sugerencias)
  }

  function construirSugerenciasHeuristicas(userMessage: string, assistantMessage: string): string[] {
    const source = `${userMessage} ${assistantMessage}`.toLowerCase()

    // Construir sugerencias combinando temas detectados para mayor variedad
    const matched: string[] = []

    if (/(vendedor|empleado|equipo|rendimiento|desempeñ|desempen)/.test(source)) {
      matched.push(
        'Compárame los 3 mejores vendedores por ingresos y ticket promedio.',
        '¿Qué vendedor necesita apoyo y en qué indicador específico?',
        'Dame un plan de mejora por vendedor para los próximos 7 días.',
        '¿Qué metas diarias recomiendas por vendedor para esta semana?'
      )
    }

    if (/(stock|inventario|reposici|quiebre|minimo|mínimo)/.test(source)) {
      matched.push(
        'Prioriza los productos con mayor riesgo de quiebre esta semana.',
        'Sugiéreme cantidades de reposición por producto crítico.',
        '¿Qué productos de bajo stock también son de alta rotación?',
        'Crea un plan de compras para los próximos 5 días.'
      )
    }

    if (/(venta|ingreso|ticket|margen|factur|recaud)/.test(source)) {
      matched.push(
        'Compárame hoy vs ayer en ingresos, ticket promedio y cantidad de ventas.',
        '¿Qué productos impulsan más ingresos y cuáles menos?',
        'Dame 3 acciones para subir ticket promedio mañana.',
        '¿Qué método de pago predomina y qué impacto tiene en ventas?'
      )
    }

    if (/(preci|mercado|competencia|compar|busca|investig)/.test(source)) {
      matched.push(
        'Compara mis precios de los 5 productos más vendidos con el mercado.',
        '¿Qué productos tienen margen bajo comparado con la competencia?',
        'Sugiéreme ajustes de precios basados en el mercado local.',
        'Investiga precios de mis productos en supermercados de Honduras.'
      )
    }

    if (/(producto|categor|catálogo|catalogo|activ|inactiv)/.test(source)) {
      matched.push(
        '¿Qué productos activos no se han vendido esta semana?',
        'Sugiéreme qué productos desactivar o promocionar.',
        '¿Qué categorías generan más ingresos y cuáles menos?',
        'Dame un análisis del catálogo por rentabilidad.'
      )
    }

    if (/(notificaci|push|alerta|configur)/.test(source)) {
      matched.push(
        '¿Cuántos usuarios tienen las notificaciones activadas?',
        '¿Qué alertas son más importantes configurar primero?',
        'Dame un resumen del estado de las notificaciones.',
        '¿Cómo puedo mejorar la cobertura de alertas push?'
      )
    }

    // Si detectamos temas, devolver mezcla de los 4 más relevantes
    if (matched.length > 0) {
      return matched.slice(0, 4)
    }

    return [...DEFAULT_PROMPTS]
  }

  return {
    // Estado
    conversaciones,
    mensajes,
    sugerencias,
    conversacionActualId,
    cargando,
    enviando,
    error,
    insights,
    loadingInsights,
    // Acciones
    cargarConversaciones,
    seleccionarConversacion,
    nuevaConversacion,
    borrarConversacion,
    enviarMensaje,
    cargarInsights,
    actualizarSugerenciasDesdeMensajes,
    $reset,
  }
})
