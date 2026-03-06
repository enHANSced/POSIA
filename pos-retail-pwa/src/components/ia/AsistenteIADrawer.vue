<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useIAStore } from '@/stores/ia'
import InsightsIAPanel from '@/components/ia/InsightsIAPanel.vue'
import type { IAMessage, WebSource } from '@/services/edge-functions'

const model = defineModel<boolean>({ default: false })
const iaStore = useIAStore()

// ── Resize del panel ──────────────────────────────────────────────────────
const drawerWidth = ref(420)
const DRAWER_MIN = 300
const DRAWER_MAX = 820

let _resizing = false
let _resizeStartX = 0
let _resizeStartWidth = 0

function onResizeMove(e: MouseEvent | TouchEvent) {
  if (!_resizing) return
  const clientX = 'touches' in e ? e.touches[0]!.clientX : (e as MouseEvent).clientX
  const delta = _resizeStartX - clientX // left drag = panel grows
  drawerWidth.value = Math.min(DRAWER_MAX, Math.max(DRAWER_MIN, _resizeStartWidth + delta))
}

function onResizeEnd() {
  if (!_resizing) return
  _resizing = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.removeEventListener('touchmove', onResizeMove)
  document.removeEventListener('touchend', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function onResizeStart(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  _resizing = true
  _resizeStartX = 'touches' in e ? e.touches[0]!.clientX : (e as MouseEvent).clientX
  _resizeStartWidth = drawerWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.addEventListener('touchmove', onResizeMove, { passive: false })
  document.addEventListener('touchend', onResizeEnd)
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
}

onUnmounted(onResizeEnd)
// ──────────────────────────────────────────────────────────────────────────

const mensaje = ref('')
const panelMensajes = ref<HTMLElement | null>(null)
const mostrarHistorial = ref(false)
const tabActiva = ref<'chat' | 'insights'>('chat')
const expandedSources = ref<Record<string, boolean>>({})
const mostrarSugerencias = ref(true)
const highlightedSourceKey = ref<string | null>(null)

function onCiteBadgeClick(event: MouseEvent, msg: IAMessage, messageIndex: number) {
  const target = event.target as HTMLElement
  if (!target.classList.contains('ia-cite-badge')) return
  const idx = parseInt(target.dataset.idx || '', 10)
  if (isNaN(idx)) return

  // Expandir fuentes si están colapsadas
  const key = sourceKey(messageIndex)
  if (!expandedSources.value[key] && (msg.webSources?.length || 0) > 3) {
    expandedSources.value[key] = true
  }

  // Resaltar la fuente correspondiente (idx es 1-based)
  const sourceHighlightKey = `${messageIndex}-${idx - 1}`
  highlightedSourceKey.value = sourceHighlightKey
  setTimeout(() => {
    if (highlightedSourceKey.value === sourceHighlightKey) highlightedSourceKey.value = null
  }, 2000)

  // Scroll al elemento de fuente
  nextTick(() => {
    const el = document.getElementById(`source-${messageIndex}-${idx - 1}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

// ── Typewriter effect ──────────────────────────────────────────────────────
const streamingMsgIdx = ref<number | null>(null)
const streamingContent = ref('')
let streamingTimer: ReturnType<typeof setInterval> | null = null

function stopStreaming() {
  if (streamingTimer) { clearInterval(streamingTimer); streamingTimer = null }
  streamingMsgIdx.value = null
  streamingContent.value = ''
}

function scrollToMsgStart(msgIdx: number) {
  nextTick(() => {
    if (!panelMensajes.value) return
    const bubbles = panelMensajes.value.querySelectorAll<HTMLElement>('.mb-3.d-flex')
    const target = bubbles[msgIdx] as HTMLElement | undefined
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
}

function startStreaming(msgIdx: number, fullContent: string) {
  stopStreaming()
  streamingMsgIdx.value = msgIdx
  streamingContent.value = ''

  // Scroll to show the TOP of the new message, not the bottom
  scrollToMsgStart(msgIdx)

  const words = fullContent.split(' ')
  let wordIdx = 0
  // aim ≈ 40 words/s → 25 ms per word, but cap at max 3 words per tick for long responses
  const msPerTick = 25
  const batchSize = Math.max(1, Math.min(3, Math.ceil(words.length / 60)))

  streamingTimer = setInterval(() => {
    wordIdx = Math.min(wordIdx + batchSize, words.length)
    streamingContent.value = words.slice(0, wordIdx).join(' ')
    if (wordIdx >= words.length) {
      clearInterval(streamingTimer!); streamingTimer = null
      setTimeout(() => { if (streamingMsgIdx.value === msgIdx) streamingMsgIdx.value = null }, 600)
    }
  }, msPerTick)
}

watch(() => iaStore.enviando, (val, oldVal) => {
  if (oldVal && !val) {
    const msgs = iaStore.mensajes
    const lastIdx = msgs.length - 1
    if (lastIdx >= 0 && msgs[lastIdx]?.role === 'assistant') {
      nextTick(() => startStreaming(lastIdx, msgs[lastIdx]!.content))
    }
  }
})
// ──────────────────────────────────────────────────────────────────────────

type ParsedLine = {
  tipo: 'titulo' | 'bullet' | 'numbered' | 'texto'
  valor: string
  prefix?: string
}

type ParsedBlock =
  | { tipo: 'linea'; linea: ParsedLine }
  | { tipo: 'tabla'; headers: string[]; rows: string[][] }

const conversaciones = computed(() => iaStore.conversaciones)
const mensajes = computed(() => iaStore.mensajes)
const promptSugeridos = computed(() => iaStore.sugerencias)

function formatearFecha(fecha: string | null): string {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleString('es-HN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function vistaPrevia(texto: string): string {
  if (texto.length <= 44) return texto
  return `${texto.slice(0, 44)}...`
}

function limpiarMarkdownBasico(texto: string): string {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-grey-lighten-3 px-1 rounded text-caption">$1</code>')
    // Citas inline [n] → badges superíndice clicables
    .replace(/\[(\d+)\]/g, '<sup class="ia-cite-badge" data-idx="$1">$1</sup>')
}

/** Normaliza saltos de línea: convierte secuencias literales \\n en saltos reales */
function normalizarSaltos(texto: string): string {
  return texto.replace(/\\n/g, '\n')
}

function esSeparadorTabla(linea: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(linea)
}

function separarCeldasTabla(linea: string): string[] {
  return linea
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

function parsearLinea(lineaRaw: string): ParsedLine {
  const linea = lineaRaw.trim()

  const numberedMatch = linea.match(/^(\d+[.)])\s+(.*)/)
  if (numberedMatch) {
    return { tipo: 'numbered', valor: numberedMatch[2] ?? '', prefix: numberedMatch[1] ?? '' }
  }

  if (/^[-*•●]\s+/.test(linea)) {
    return { tipo: 'bullet', valor: linea.replace(/^[-*•●]\s+/, '') }
  }

  if (/^#{1,4}\s+/.test(linea)) {
    return { tipo: 'titulo', valor: linea.replace(/^#{1,4}\s+/, '') }
  }

  // Emoji-prefixed lines that look like section headers (e.g. "💡 Recomendaciones")
  if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s+\S/u.test(linea) && linea.length < 80) {
    return { tipo: 'titulo', valor: linea }
  }

  if (linea.endsWith(':') || linea.endsWith(':</strong>')) {
    return { tipo: 'titulo', valor: linea }
  }

  return { tipo: 'texto', valor: linea }
}

function parsearRespuestaIA(texto: string): ParsedBlock[] {
  const normalizado = normalizarSaltos(texto)
  const limpio = limpiarMarkdownBasico(normalizado)
  const lineas = limpio.split('\n')
  const blocks: ParsedBlock[] = []

  let i = 0
  while (i < lineas.length) {
    const actual = lineas[i]?.trim() ?? ''

    if (!actual) {
      i += 1
      continue
    }

    const siguiente = lineas[i + 1]?.trim() ?? ''
    const pareceHeaderTabla = actual.includes('|') && siguiente.length > 0 && esSeparadorTabla(siguiente)

    if (pareceHeaderTabla) {
      const headers = separarCeldasTabla(actual)
      const rows: string[][] = []
      i += 2

      while (i < lineas.length) {
        const raw = lineas[i] ?? ''
        const trimmed = raw.trim()
        if (!trimmed || !trimmed.includes('|')) break
        if (esSeparadorTabla(trimmed)) {
          i += 1
          continue
        }

        rows.push(separarCeldasTabla(trimmed))
        i += 1
      }

      blocks.push({ tipo: 'tabla', headers, rows })
      continue
    }

    blocks.push({ tipo: 'linea', linea: parsearLinea(actual) })
    i += 1
  }

  return blocks
}

function getSourceTitle(source: WebSource): string {
  if (source.title && source.title.trim().length > 0) return source.title.trim()
  try {
    return new URL(source.url).hostname.replace(/^www\./, '')
  } catch {
    return source.url
  }
}

function getSourceHostname(source: WebSource): string {
  try {
    return new URL(source.url).hostname
  } catch {
    return ''
  }
}

function getFaviconUrl(source: WebSource): string {
  const host = getSourceHostname(source)
  if (!host) return ''
  return `https://www.google.com/s2/favicons?domain=${host}&sz=32`
}

function shouldShowSourcesToggle(msg: IAMessage): boolean {
  return (msg.webSources?.length || 0) > 3
}

function sourceKey(messageIndex: number): string {
  return `sources-${messageIndex}`
}

function toggleSources(messageIndex: number) {
  const key = sourceKey(messageIndex)
  expandedSources.value[key] = !expandedSources.value[key]
}

function visibleSources(msg: IAMessage, messageIndex: number): WebSource[] {
  const sources = msg.webSources || []
  if (sources.length <= 3) return sources
  const key = sourceKey(messageIndex)
  return expandedSources.value[key] ? sources : sources.slice(0, 3)
}

function getSourceSnippet(msg: IAMessage, sourceIdx: number): string {
  const supports = msg.groundingSupports || []
  const snippets: string[] = []
  for (const s of supports) {
    if (s.sourceIndices.includes(sourceIdx) && s.text) {
      snippets.push(s.text)
    }
  }
  if (snippets.length === 0) return ''
  // Return the first relevant snippet, truncated
  const combined = snippets[0] ?? ''
  return combined.length > 120 ? combined.slice(0, 120) + '…' : combined
}

async function enviar() {
  const texto = mensaje.value.trim()
  if (!texto) return
  mensaje.value = ''
  await iaStore.enviarMensaje(texto)
}

async function enviarSugerencia(sugerencia: string) {
  mensaje.value = sugerencia
  await enviar()
}

function manejarTecladoEnvio(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  if (event.shiftKey) return
  event.preventDefault()
  void enviar()
}

async function cargarAlAbrir() {
  if (!model.value) return
  await Promise.all([
    iaStore.cargarConversaciones(),
    iaStore.cargarInsights()
  ])
  await nextTick()
  if (panelMensajes.value) {
    panelMensajes.value.scrollTop = panelMensajes.value.scrollHeight
  }
}

watch(model, async () => {
  await cargarAlAbrir()
  if (model.value) {
    iaStore.actualizarSugerenciasDesdeMensajes()
  }
})

watch(
  () => iaStore.mensajes.length,
  async (newLen, oldLen) => {
    if (tabActiva.value !== 'chat') return
    await nextTick()
    if (!panelMensajes.value) return

    const lastMsg = iaStore.mensajes[iaStore.mensajes.length - 1]
    if (lastMsg?.role === 'user' && newLen > (oldLen ?? 0)) {
      // User sent a message → scroll to show it at the top so response appears below
      const bubbles = panelMensajes.value.querySelectorAll<HTMLElement>('.mb-3.d-flex')
      const userBubble = bubbles[bubbles.length - 1]
      if (userBubble) {
        userBubble.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    // Don't auto-scroll for assistant messages — startStreaming handles it
  }
)
</script>

<template>
  <v-navigation-drawer
    v-model="model"
    location="right"
    temporary
    :width="drawerWidth"
    class="d-flex flex-column"
  >
    <!-- Handle de redimensionado (borde izquierdo) -->
    <div
      class="ia-resize-handle"
      @mousedown.prevent="onResizeStart"
      @touchstart.prevent="onResizeStart"
      title="Arrastrar para redimensionar"
    >
      <div class="ia-resize-grip" />
    </div>

    <div class="d-flex flex-column h-100 overflow-hidden">
      <div class="pa-3 d-flex align-center flex-shrink-0">
        <v-btn icon size="small" variant="text" @click="model = false" class="mr-2">
          <v-icon>mdi-chevron-right</v-icon>
        </v-btn>

        <div class="ia-header-avatar mr-2">
          <span class="ia-header-face">
            <span class="ia-header-eye left"></span>
            <span class="ia-header-eye right"></span>
          </span>
        </div>
        <div class="d-flex flex-column">
          <h3 class="text-subtitle-2 font-weight-bold">POSIA</h3>
          <p class="text-caption" style="font-size: 0.68rem !important; line-height: 1;">
            <span v-if="iaStore.enviando" class="ia-status-dot thinking"></span>
            <span v-else class="ia-status-dot online"></span>
            {{ iaStore.enviando ? 'Pensando...' : iaStore.conversacionActualId ? 'Listo para ayudarte' : '¡Preguntame lo que sea!' }}
          </p>
        </div>

        <v-spacer />

        <v-btn
          icon
          size="small"
          variant="text"
          :color="mostrarHistorial ? 'primary' : undefined"
          @click="mostrarHistorial = !mostrarHistorial"
          v-if="conversaciones.length > 0 && tabActiva === 'chat'"
          title="Ver historial"
        >
          <v-icon>mdi-history</v-icon>
        </v-btn>

        <v-btn icon size="small" variant="text" @click="iaStore.nuevaConversacion()" title="Nueva conversación" v-if="tabActiva === 'chat'">
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <div class="ia-tab-bar flex-shrink-0 mx-3 my-2">
        <button
          class="ia-tab-btn"
          :class="{ active: tabActiva === 'chat' }"
          @click="tabActiva = 'chat'"
        >
          <v-icon size="14" class="mr-1">mdi-chat-processing-outline</v-icon>
          Chat
        </button>
        <button
          class="ia-tab-btn"
          :class="{ active: tabActiva === 'insights' }"
          @click="tabActiva = 'insights'"
        >
          <v-icon size="14" class="mr-1">mdi-chart-box-outline</v-icon>
          Insights
        </button>
      </div>

      <v-window v-model="tabActiva" class="flex-grow-1 overflow-hidden ia-window">
        <v-window-item value="chat" class="ia-window-item">
          <v-expand-transition>
            <div v-if="mostrarHistorial && conversaciones.length > 0" class="flex-shrink-0 px-3 pt-3 pb-1 bg-surface-lighten-1">
              <div class="d-flex align-center justify-space-between mb-2 px-1">
                <span class="text-caption font-weight-bold text-medium-emphasis">HISTORIAL RECIENTE</span>
                <v-chip size="x-small" variant="tonal" density="compact">{{ conversaciones.length }}</v-chip>
              </div>

              <v-list density="compact" class="neo-card-pressed pa-1 mb-2 bg-transparent" max-height="160" style="overflow-y: auto;">
                <v-list-item
                  v-for="conversacion in conversaciones"
                  :key="conversacion.id"
                  rounded="lg"
                  class="mb-1"
                  density="compact"
                  :class="{ 'bg-primary-lighten-5': iaStore.conversacionActualId === conversacion.id }"
                  @click="iaStore.seleccionarConversacion(conversacion.id); mostrarHistorial = false"
                >
                  <template #prepend>
                    <v-icon size="16" :color="iaStore.conversacionActualId === conversacion.id ? 'primary' : undefined">mdi-forum-outline</v-icon>
                  </template>

                  <v-list-item-title class="text-caption font-weight-medium" :class="{ 'text-primary': iaStore.conversacionActualId === conversacion.id }">
                    {{ vistaPrevia(conversacion.title || 'Conversación sin título') }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="text-caption" style="font-size: 0.65rem !important;">
                    {{ formatearFecha(conversacion.updated_at) }}
                  </v-list-item-subtitle>

                  <template #append>
                    <v-btn icon size="x-small" density="compact" variant="text" @click.stop="iaStore.borrarConversacion(conversacion.id)">
                      <v-icon size="14">mdi-close</v-icon>
                    </v-btn>
                  </template>
                </v-list-item>
              </v-list>
            </div>
          </v-expand-transition>

          <div class="ia-chat-content d-flex flex-column flex-grow-1 overflow-hidden px-3 pb-3 pt-2">
            <div ref="panelMensajes" class="mensajes-panel neo-flat pa-3 mb-2 flex-grow-1 d-flex flex-column" style="min-height: 0;">
              <div v-if="mensajes.length === 0" class="ia-empty-state my-auto">
                <div class="ia-robot-container mb-4">
                  <div class="ia-robot-body">
                    <div class="ia-robot-antenna">
                      <div class="ia-robot-antenna-ball"></div>
                    </div>
                    <div class="ia-robot-head">
                      <div class="ia-robot-eye left"></div>
                      <div class="ia-robot-eye right"></div>
                      <div class="ia-robot-mouth"></div>
                    </div>
                    <div class="ia-robot-torso">
                      <div class="ia-robot-chest-light"></div>
                    </div>
                  </div>
                  <div class="ia-robot-shadow"></div>
                </div>
                <p class="text-body-1 font-weight-bold mb-1" style="color: rgb(var(--v-theme-primary));">¡Hola! Soy POSIA</p>
                <p class="text-body-2 text-medium-emphasis mb-2">Tu asistente inteligente de negocio</p>
                <p class="text-caption text-medium-emphasis" style="max-width: 280px; margin: 0 auto;">Preguntame sobre ventas, inventario, precios o cualquier tema de tu negocio. ¡Estoy aquí para ayudarte!</p>
              </div>

              <div class="d-flex flex-column justify-end" :class="{ 'flex-grow-1': mensajes.length > 0 }">
                <div
                  v-for="(msg, index) in mensajes"
                  :key="index"
                  class="mb-3 d-flex msg-fade-in"
                  :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                  <div v-if="msg.role === 'assistant'" class="mr-2 mt-1 flex-shrink-0">
                    <div class="ia-avatar" :class="{ 'ia-avatar-new': streamingMsgIdx === index }">
                      <span class="ia-mini-face">
                        <span class="ia-mini-eye left" :class="{ blink: streamingMsgIdx === index }"></span>
                        <span class="ia-mini-eye right" :class="{ blink: streamingMsgIdx === index }"></span>
                      </span>
                    </div>
                  </div>

                  <div class="mensaje-bubble" :class="msg.role === 'user' ? 'mensaje-user bg-primary text-white' : 'mensaje-ia bg-surface'" :style="msg.role === 'assistant' ? 'flex: 1; min-width: 0;' : ''" @click="msg.role === 'assistant' ? onCiteBadgeClick($event, msg, index) : undefined">
                    <template v-if="msg.role === 'assistant'">
                      <div
                        v-for="(block, bIdx) in parsearRespuestaIA(streamingMsgIdx === index ? streamingContent : msg.content)"
                        :key="`${index}-block-${bIdx}`"
                        class="mb-1"
                      >
                        <template v-if="block.tipo === 'tabla'">
                          <div class="ia-table-wrapper my-2">
                            <table class="ia-table">
                              <thead>
                                <tr>
                                  <th v-for="(header, hIdx) in block.headers" :key="`h-${hIdx}`" v-html="header" />
                                </tr>
                              </thead>
                              <tbody>
                                <tr v-for="(row, rIdx) in block.rows" :key="`r-${rIdx}`">
                                  <td v-for="(cell, cIdx) in row" :key="`c-${rIdx}-${cIdx}`" v-html="cell" />
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </template>

                        <template v-else>
                          <div v-if="block.linea.tipo === 'titulo'" class="ia-block-title mt-2 mb-1" v-html="block.linea.valor" />
                          <div v-else-if="block.linea.tipo === 'bullet'" class="d-flex align-start pl-1 mb-1">
                            <span class="ia-bullet-dot mr-2 mt-1 flex-shrink-0">●</span>
                            <span v-html="block.linea.valor" class="flex-grow-1" />
                          </div>
                          <div v-else-if="block.linea.tipo === 'numbered'" class="d-flex align-start pl-1 mb-1">
                            <span class="ia-numbered-prefix mr-2 mt-1 flex-shrink-0">{{ block.linea.prefix }}</span>
                            <span v-html="block.linea.valor" class="flex-grow-1" />
                          </div>
                          <div v-else v-html="block.linea.valor" class="mt-1" />
                        </template>
                      </div>

                      <span v-if="streamingMsgIdx === index" class="ia-cursor">▌</span>

                      <div v-if="msg.webSources && msg.webSources.length > 0 && streamingMsgIdx !== index" class="web-sources-section mt-3 pt-2">
                        <div class="d-flex align-center mb-2">
                          <v-icon size="14" color="success" class="mr-1">mdi-web</v-icon>
                          <span class="text-caption font-weight-medium text-success" style="font-size: 0.72rem !important;">
                            Fuentes consultadas
                          </span>
                          <span class="text-caption ml-1" style="opacity: 0.5; font-size: 0.65rem !important;">
                            ({{ msg.webSources.length }})
                          </span>
                        </div>

                        <div class="d-flex flex-column ga-1">
                          <a
                            v-for="(source, sIdx) in visibleSources(msg, index)"
                            :id="`source-${index}-${sIdx}`"
                            :key="`src-${index}-${sIdx}`"
                            :href="source.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="web-source-card"
                            :class="{ 'web-source-highlighted': highlightedSourceKey === `${index}-${sIdx}` }"
                          >
                            <span class="web-source-idx">{{ sIdx + 1 }}</span>
                            <div class="web-source-info">
                              <div class="d-flex align-center">
                                <img v-if="getFaviconUrl(source)" :src="getFaviconUrl(source)" alt="" class="web-favicon mr-1" />
                                <span class="web-source-title text-truncate">{{ getSourceTitle(source) }}</span>
                                <v-icon size="11" class="ml-auto flex-shrink-0" style="opacity: 0.4">mdi-open-in-new</v-icon>
                              </div>
                              <span class="web-source-host">{{ getSourceHostname(source) }}</span>
                              <span v-if="getSourceSnippet(msg, sIdx)" class="web-source-snippet">
                                « {{ getSourceSnippet(msg, sIdx) }} »
                              </span>
                            </div>
                          </a>
                        </div>

                        <v-btn
                          v-if="shouldShowSourcesToggle(msg)"
                          size="x-small"
                          variant="text"
                          color="primary"
                          class="mt-1"
                          @click="toggleSources(index)"
                        >
                          {{ expandedSources[sourceKey(index)] ? 'Ver menos' : `+${(msg.webSources?.length || 0) - 3} fuentes más` }}
                        </v-btn>

                        <div v-if="msg.searchQueries && msg.searchQueries.length > 0" class="mt-2 d-flex flex-wrap ga-1">
                          <v-chip
                            v-for="(query, qIdx) in msg.searchQueries"
                            :key="`q-${index}-${qIdx}`"
                            size="x-small"
                            variant="outlined"
                            color="info"
                            class="text-caption ia-search-chip"
                            prepend-icon="mdi-magnify"
                          >
                            {{ query }}
                          </v-chip>
                        </div>
                      </div>

                      <div v-else-if="msg.usedWebSearch && streamingMsgIdx !== index" class="mt-2">
                        <v-chip size="x-small" variant="tonal" color="success" prepend-icon="mdi-magnify" density="compact">
                          Respuesta mejorada con búsqueda web
                        </v-chip>
                      </div>
                    </template>
                    <template v-else>
                      {{ msg.content }}
                    </template>
                  </div>
                </div>

                <div v-if="iaStore.enviando" class="mb-3 d-flex justify-start align-center">
                  <div class="mr-2 flex-shrink-0">
                    <div class="ia-avatar ia-avatar-thinking">
                      <span class="ia-mini-face">
                        <span class="ia-mini-eye left thinking"></span>
                        <span class="ia-mini-eye right thinking"></span>
                      </span>
                    </div>
                  </div>
                  <div class="mensaje-bubble mensaje-ia bg-surface px-4 py-3">
                    <div class="typing-indicator">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex-shrink-0" v-if="(mensajes.length === 0 || promptSugeridos.length > 0) && streamingMsgIdx === null">
              <div
                class="ia-suggestions-toggle text-caption d-flex align-center w-100 px-2 py-1 mb-1"
                role="button"
                tabindex="0"
                @click.stop="mostrarSugerencias = !mostrarSugerencias"
                @keydown.enter.stop="mostrarSugerencias = !mostrarSugerencias"
              >
                <span class="ia-sparkle mr-1">✦</span>
                <span class="text-medium-emphasis">Sugerencias rápidas</span>
                <span class="flex-grow-1"></span>
                <v-icon size="14" class="text-medium-emphasis ia-chevron" :class="{ open: mostrarSugerencias }">
                  mdi-chevron-down
                </v-icon>
              </div>
              <v-expand-transition>
                <div v-if="mostrarSugerencias">
                  <div class="d-flex flex-wrap ga-2 pb-2">
                    <button
                      v-for="sugerencia in promptSugeridos"
                      :key="sugerencia"
                      class="neo-suggestion-btn text-caption text-primary cursor-pointer px-3 py-2"
                      :disabled="iaStore.enviando"
                      @click="enviarSugerencia(sugerencia)"
                    >
                      {{ sugerencia }}
                    </button>
                  </div>
                </div>
              </v-expand-transition>
            </div>

            <v-alert v-if="iaStore.error" type="error" density="compact" class="mb-2 flex-shrink-0" variant="tonal">
              {{ iaStore.error }}
            </v-alert>

            <div class="flex-shrink-0 ia-input-box neo-card-pressed">
              <v-textarea
                v-model="mensaje"
                rows="1"
                max-rows="4"
                auto-grow
                hide-details
                variant="plain"
                density="compact"
                placeholder="Preguntá algo al asistente..."
                :disabled="iaStore.enviando"
                @keydown="manejarTecladoEnvio"
                class="ia-textarea px-2"
              >
                <template #append-inner>
                  <v-btn
                    :icon="iaStore.enviando ? 'mdi-stop-circle-outline' : 'mdi-send'"
                    variant="flat"
                    color="primary"
                    size="small"
                    :loading="false"
                    :disabled="(!mensaje.trim() && !iaStore.enviando) || (iaStore.enviando && false)"
                    @click="enviar"
                    class="ia-send-btn"
                    rounded="lg"
                  />
                </template>
              </v-textarea>
              <div class="ia-input-hint text-caption text-medium-emphasis px-2 pb-1">
                Enter para enviar · Shift+Enter para nueva línea
              </div>
            </div>
          </div>
        </v-window-item>

        <v-window-item value="insights" class="ia-window-item">
          <div class="ia-insights-content pa-3">
            <InsightsIAPanel />
          </div>
        </v-window-item>
      </v-window>
    </div>
  </v-navigation-drawer>
</template>

<style scoped>
/* ══════════════════════════════════════════════════════════════════
   POSIA – Robot Carismático · Estilo Neomórfico
   ══════════════════════════════════════════════════════════════════ */

/* ── Tab bar neomórfica ───────────────────────────────────────────── */
.ia-tab-bar {
  display: flex;
  gap: 6px;
  border-radius: var(--neo-radius-sm);
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed-sm);
  padding: 4px;
}

.ia-tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px 12px;
  border: none;
  border-radius: var(--neo-radius-xs);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.78rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: var(--neo-transition);
  user-select: none;
}

.ia-tab-btn.active {
  background: var(--neo-bg);
  box-shadow: var(--neo-raised-sm);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.ia-tab-btn:not(.active):hover {
  color: rgba(var(--v-theme-on-surface), 0.8);
  background: rgba(var(--v-theme-primary), 0.04);
}

/* ── Layout del chat (flex correcto sin alturas fijas) ─────────────── */
.ia-chat-content {
  height: 0;
  min-height: 0;
}

/* ── Layout del insights ──────────────────────────────────────────── */
.ia-insights-content {
  height: 0;
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

/* ── v-window flex layout (ocupar toda la altura disponible) ──────── */
.ia-window {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ia-window :deep(.v-window__container) {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ia-window-item {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header avatar (mini robot) ───────────────────────────────────── */
.ia-header-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(74, 123, 247, 0.15), rgba(74, 123, 247, 0.06));
  box-shadow: var(--neo-raised-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.ia-header-face {
  display: flex;
  align-items: center;
  gap: 5px;
  position: relative;
}

.ia-header-eye {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  animation: headerBlink 3.5s infinite;
}

.ia-header-eye.right { animation-delay: 0.1s; }

@keyframes headerBlink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.1); }
}

.ia-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

.ia-status-dot.online {
  background: #4caf50;
  box-shadow: 0 0 4px rgba(76, 175, 80, 0.5);
}

.ia-status-dot.thinking {
  background: rgb(var(--v-theme-primary));
  animation: statusPulse 1.2s ease-in-out infinite;
}

@keyframes statusPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

/* ── Panel de mensajes ────────────────────────────────────────────── */
.mensajes-panel {
  overflow-y: auto;
  border-radius: var(--neo-radius);
  scroll-behavior: smooth;
}

/* ── Burbujas ─────────────────────────────────────────────────────── */
.mensaje-bubble {
  display: inline-block;
  max-width: 86%;
  padding: 10px 14px;
  border-radius: 18px;
  font-size: 0.875rem;
  line-height: 1.55;
  text-align: left;
  word-break: break-word;
}

.mensaje-user {
  border-bottom-right-radius: 5px;
  box-shadow: 0 3px 10px rgba(74, 123, 247, 0.25);
}

.mensaje-ia {
  border-bottom-left-radius: 5px;
  box-shadow: var(--neo-raised-sm);
  border: 1px solid rgba(255, 255, 255, 0.55);
  display: block;
  max-width: 100%;
  width: 100%;
  overflow: hidden;
}

/* ── Avatar IA pequeño (con ojitos) ───────────────────────────────── */
.ia-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(74, 123, 247, 0.15), rgba(74, 123, 247, 0.06));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--neo-raised-sm);
  transition: all 0.3s ease;
}

.ia-avatar-new {
  animation: avatarPop 0.4s ease-out;
}

.ia-avatar-thinking {
  animation: avatarThink 1.5s ease-in-out infinite;
}

@keyframes avatarPop {
  0% { transform: scale(0.7); }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

@keyframes avatarThink {
  0%, 100% { transform: scale(1) rotate(0deg); }
  25% { transform: scale(1.05) rotate(-3deg); }
  75% { transform: scale(1.05) rotate(3deg); }
}

.ia-mini-face {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ia-mini-eye {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  transition: all 0.2s ease;
}

.ia-mini-eye.blink {
  animation: miniBlink 0.8s ease-in-out infinite;
}

.ia-mini-eye.thinking {
  animation: thinkEyes 1.5s ease-in-out infinite;
}

@keyframes miniBlink {
  0%, 70%, 100% { transform: scaleY(1); }
  80% { transform: scaleY(0.1); }
}

@keyframes thinkEyes {
  0%, 100% { transform: translateX(0); }
  30% { transform: translateX(1px) scaleY(1.2); }
  70% { transform: translateX(-1px) scaleY(1.2); }
}

/* ── Estado vacío – Robot CSS carismático ──────────────────────────── */
.ia-empty-state {
  text-align: center;
  padding: 24px 16px;
}

.ia-robot-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: robotFloat 3s ease-in-out infinite;
}

@keyframes robotFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.ia-robot-body {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Antena */
.ia-robot-antenna {
  width: 2px;
  height: 14px;
  background: rgb(var(--v-theme-primary));
  opacity: 0.6;
  border-radius: 2px;
  position: relative;
}

.ia-robot-antenna-ball {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  position: absolute;
  top: -5px;
  left: 50%;
  transform: translateX(-50%);
  animation: antennaPulse 2s ease-in-out infinite;
  box-shadow: 0 0 8px rgba(74, 123, 247, 0.4);
}

@keyframes antennaPulse {
  0%, 100% { box-shadow: 0 0 4px rgba(74, 123, 247, 0.3); transform: translateX(-50%) scale(1); }
  50% { box-shadow: 0 0 12px rgba(74, 123, 247, 0.6); transform: translateX(-50%) scale(1.2); }
}

/* Cabeza */
.ia-robot-head {
  width: 64px;
  height: 48px;
  border-radius: 18px 18px 14px 14px;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  position: relative;
  margin-top: -1px;
}

/* Ojos del robot */
.ia-robot-eye {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  position: relative;
  animation: robotBlink 4s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(74, 123, 247, 0.3);
}

.ia-robot-eye.right {
  animation-delay: 0.15s;
}

.ia-robot-eye::after {
  content: '';
  position: absolute;
  top: 2px;
  right: 2px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
}

@keyframes robotBlink {
  0%, 42%, 48%, 100% { transform: scaleY(1); }
  45% { transform: scaleY(0.1); }
}

/* Boca (sonrisa) */
.ia-robot-mouth {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 8px;
  border: 2px solid rgb(var(--v-theme-primary));
  border-top: none;
  border-radius: 0 0 10px 10px;
  opacity: 0.5;
  animation: robotSmile 4s ease-in-out infinite;
}

@keyframes robotSmile {
  0%, 100% { width: 16px; opacity: 0.5; }
  50% { width: 20px; opacity: 0.7; }
}

/* Torso */
.ia-robot-torso {
  width: 48px;
  height: 28px;
  border-radius: 6px 6px 12px 12px;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised-sm);
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ia-robot-chest-light {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(74, 123, 247, 0.4);
  box-shadow: var(--neo-pressed-sm), 0 0 6px rgba(74, 123, 247, 0.3);
  animation: chestGlow 2.5s ease-in-out infinite;
}

@keyframes chestGlow {
  0%, 100% { background: rgba(74, 123, 247, 0.3); box-shadow: var(--neo-pressed-sm), 0 0 4px rgba(74, 123, 247, 0.2); }
  50% { background: rgba(74, 123, 247, 0.6); box-shadow: var(--neo-pressed-sm), 0 0 10px rgba(74, 123, 247, 0.5); }
}

/* Sombra del robot */
.ia-robot-shadow {
  width: 40px;
  height: 6px;
  border-radius: 50%;
  background: var(--neo-shadow-dark);
  opacity: 0.25;
  margin-top: 8px;
  animation: robotShadow 3s ease-in-out infinite;
}

@keyframes robotShadow {
  0%, 100% { transform: scaleX(1); opacity: 0.25; }
  50% { transform: scaleX(0.8); opacity: 0.15; }
}

/* ── Bloques de contenido IA ──────────────────────────────────────── */
.ia-block-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  letter-spacing: 0.01em;
}

.ia-bullet-dot {
  font-size: 0.5rem;
  color: rgb(var(--v-theme-primary));
  opacity: 0.7;
  line-height: 1.8;
}

.ia-numbered-prefix {
  font-size: 0.75rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  opacity: 0.75;
  min-width: 16px;
  line-height: 1.8;
}

/* ── Cursor typewriter ────────────────────────────────────────────── */
.ia-cursor {
  display: inline-block;
  color: rgb(var(--v-theme-primary));
  font-weight: 400;
  animation: blink-cursor 0.9s step-end infinite;
  margin-left: 1px;
  line-height: 1;
}

@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* ── Tabla personalizada ──────────────────────────────────────────── */
.ia-table-wrapper {
  overflow-x: auto;
  border-radius: 10px;
  box-shadow: var(--neo-pressed-sm);
  background: var(--neo-bg-alt, #f0f2f5);
  max-width: 100%;
}

.ia-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
  line-height: 1.4;
}

.ia-table thead tr {
  background: rgba(74, 123, 247, 0.1);
}

.ia-table th {
  padding: 7px 11px;
  text-align: left;
  font-weight: 700;
  font-size: 0.73rem;
  color: rgb(var(--v-theme-primary));
  border-bottom: 2px solid rgba(74, 123, 247, 0.18);
  white-space: nowrap;
  letter-spacing: 0.01em;
}

.ia-table td {
  padding: 6px 11px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  vertical-align: top;
  min-width: 70px;
}

.ia-table tbody tr:nth-child(even) {
  background: rgba(0, 0, 0, 0.02);
}

.ia-table tbody tr:last-child td {
  border-bottom: none;
}

.ia-table tbody tr:hover {
  background: rgba(74, 123, 247, 0.04);
}

/* ── Fuentes web ──────────────────────────────────────────────────── */
.web-sources-section {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

/* Tarjeta de fuente individual */
.web-source-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--neo-radius-xs, 8px);
  background: rgba(76, 175, 80, 0.05);
  border: 1px solid rgba(76, 175, 80, 0.12);
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
  cursor: pointer;
}

.web-source-card:hover {
  background: rgba(76, 175, 80, 0.12);
  border-color: rgba(76, 175, 80, 0.28);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.12);
}

.web-source-card.web-source-highlighted {
  background: rgba(76, 175, 80, 0.18);
  border-color: rgba(76, 175, 80, 0.45);
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
  animation: source-pulse 0.6s ease;
}

@keyframes source-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2); }
  50% { box-shadow: 0 0 0 4px rgba(76, 175, 80, 0.3); }
}

.web-source-idx {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(76, 175, 80, 0.18);
  color: #2e7d32;
  font-size: 0.65rem;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

.web-source-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.web-source-title {
  font-size: 0.72rem;
  font-weight: 600;
  color: #2e7d32;
  line-height: 1.3;
}

.web-source-host {
  font-size: 0.62rem;
  color: rgba(0, 0, 0, 0.4);
  letter-spacing: 0.01em;
}

.web-source-snippet {
  font-size: 0.64rem;
  color: rgba(0, 0, 0, 0.5);
  font-style: italic;
  line-height: 1.35;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.web-favicon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
}

/* Badge de cita inline [n] */
.ia-cite-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  margin: 0 1px;
  border-radius: 8px;
  background: rgba(76, 175, 80, 0.18);
  color: #2e7d32;
  font-size: 0.6rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  vertical-align: super;
  line-height: 1;
  text-decoration: none;
}

.ia-cite-badge:hover {
  background: rgba(76, 175, 80, 0.35);
  transform: scale(1.15);
}

/* Chip de búsqueda */
.ia-search-chip {
  font-size: 0.65rem !important;
}

/* ── Toggle y sparkle en sugerencias ───────────────────────────────── */
.ia-suggestions-toggle {
  background: none;
  border: none;
  cursor: pointer;
  border-radius: var(--neo-radius-xs);
  transition: background 0.15s ease;
  font-family: inherit;
}

.ia-suggestions-toggle:hover {
  background: rgba(var(--v-theme-primary), 0.04);
}

.ia-chevron {
  transition: transform 0.25s ease;
}

.ia-chevron.open {
  transform: rotate(180deg);
}

.ia-sparkle {
  color: rgb(var(--v-theme-primary));
  font-size: 0.7rem;
  animation: sparkleRotate 3s linear infinite;
}

@keyframes sparkleRotate {
  0% { transform: rotate(0deg) scale(1); opacity: 0.7; }
  50% { transform: rotate(180deg) scale(1.2); opacity: 1; }
  100% { transform: rotate(360deg) scale(1); opacity: 0.7; }
}

/* ── Sugerencias ──────────────────────────────────────────────────── */
.neo-suggestion-btn {
  background: none;
  border: none;
  background-color: var(--neo-bg);
  border-radius: 12px;
  box-shadow: var(--neo-raised-sm);
  transition: all 0.18s ease;
  user-select: none;
  border: 1px solid rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-family: inherit;
  line-height: 1.4;
}

.neo-suggestion-btn:hover:not(:disabled) {
  box-shadow: var(--neo-raised);
  transform: translateY(-1px);
}

.neo-suggestion-btn:active:not(:disabled) {
  box-shadow: var(--neo-pressed-sm);
  transform: translateY(1px);
}

.neo-suggestion-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

/* ── Input area ───────────────────────────────────────────────────── */
.ia-input-box {
  border-radius: 14px;
  padding: 4px 4px 0 4px;
}

.ia-textarea :deep(.v-field__input) {
  font-size: 0.875rem;
  min-height: 36px;
}

.ia-send-btn {
  margin-top: -2px;
  min-width: 34px !important;
  width: 34px !important;
  height: 34px !important;
}

.ia-input-hint {
  font-size: 0.63rem !important;
  opacity: 0.55;
}

/* ── Typing indicator mejorado ────────────────────────────────────── */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 16px;
}

.typing-indicator span {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  animation: typingBounce 1.4s infinite ease-in-out both;
}

.typing-indicator span:nth-child(1) { animation-delay: 0s; }
.typing-indicator span:nth-child(2) { animation-delay: 0.15s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.3s; }

@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0) scale(0.8); opacity: 0.4; }
  30% { transform: translateY(-5px) scale(1); opacity: 1; }
}

/* ── Fade-in para nuevos mensajes ─────────────────────────────────── */
.msg-fade-in {
  animation: msgFadeIn 0.25s ease-out both;
}

@keyframes msgFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Handle de resize ─────────────────────────────────────────────── */
.ia-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s ease;
}

.ia-resize-handle:hover,
.ia-resize-handle:active {
  background: rgba(74, 123, 247, 0.12);
}

.ia-resize-grip {
  width: 3px;
  height: 36px;
  border-radius: 3px;
  background: rgba(74, 123, 247, 0.25);
  transition: background 0.18s ease, height 0.18s ease;
}

.ia-resize-handle:hover .ia-resize-grip,
.ia-resize-handle:active .ia-resize-grip {
  background: rgba(74, 123, 247, 0.6);
  height: 52px;
}
</style>
