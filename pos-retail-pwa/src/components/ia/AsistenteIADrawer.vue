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

  if (/^[-*•]\s+/.test(linea)) {
    return { tipo: 'bullet', valor: linea.replace(/^[-*•]\s+/, '') }
  }

  if (linea.startsWith('### ')) {
    return { tipo: 'titulo', valor: linea.replace(/^###\s+/, '') }
  }

  if (linea.endsWith(':') || linea.endsWith(':</strong>')) {
    return { tipo: 'titulo', valor: linea }
  }

  return { tipo: 'texto', valor: linea }
}

function parsearRespuestaIA(texto: string): ParsedBlock[] {
  const limpio = limpiarMarkdownBasico(texto)
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

        <div class="d-flex flex-column">
          <h3 class="text-subtitle-2 font-weight-bold">Asistente IA</h3>
          <p class="text-caption text-medium-emphasis" style="font-size: 0.7rem !important; line-height: 1;">
            {{ iaStore.conversacionActualId ? 'Conversación activa' : 'Nueva consulta' }}
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

      <v-divider class="flex-shrink-0" />

      <v-tabs v-model="tabActiva" density="compact" class="px-2 pt-1 flex-shrink-0">
        <v-tab value="chat" size="small">Chat</v-tab>
        <v-tab value="insights" size="small">Insights</v-tab>
      </v-tabs>

      <v-divider class="flex-shrink-0" />

      <v-window v-model="tabActiva" class="flex-grow-1 overflow-hidden">
        <v-window-item value="chat" class="h-100">
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

          <div class="d-flex flex-column flex-grow-1 overflow-hidden px-3 pb-3 pt-2" style="height: calc(100vh - 145px);">
            <div ref="panelMensajes" class="mensajes-panel neo-flat pa-3 mb-3 flex-grow-1 d-flex flex-column" style="min-height: 0;">
              <div v-if="mensajes.length === 0" class="ia-empty-state my-auto">
                <div class="ia-empty-icon-wrap mb-3">
                  <v-icon size="36" color="primary">mdi-robot-happy-outline</v-icon>
                </div>
                <p class="text-body-2 font-weight-medium mb-1">¿En qué puedo ayudarte?</p>
                <p class="text-caption text-medium-emphasis">Hacé preguntas sobre ventas, inventario, precios o cualquier tema de tu negocio.</p>
              </div>

              <div class="d-flex flex-column justify-end" :class="{ 'flex-grow-1': mensajes.length > 0 }">
                <div
                  v-for="(msg, index) in mensajes"
                  :key="index"
                  class="mb-3 d-flex msg-fade-in"
                  :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                  <div v-if="msg.role === 'assistant'" class="mr-2 mt-1 flex-shrink-0">
                    <div class="ia-avatar">
                      <v-icon size="15" color="primary">mdi-robot-happy</v-icon>
                    </div>
                  </div>

                  <div class="mensaje-bubble" :class="msg.role === 'user' ? 'mensaje-user bg-primary text-white' : 'mensaje-ia bg-surface'" :style="msg.role === 'assistant' ? 'flex: 1; min-width: 0;' : ''">
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
                        <div class="d-flex align-center mb-1">
                          <v-icon size="12" color="success" class="mr-1">mdi-web</v-icon>
                          <span class="text-caption font-weight-medium text-success" style="font-size: 0.7rem !important;">
                            Fuentes consultadas
                          </span>
                        </div>

                        <div class="d-flex flex-column ga-1">
                          <a
                            v-for="(source, sIdx) in visibleSources(msg, index)"
                            :key="`src-${index}-${sIdx}`"
                            :href="source.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="web-source-row text-caption d-inline-flex align-center px-2 py-1 rounded"
                          >
                            <img v-if="getFaviconUrl(source)" :src="getFaviconUrl(source)" alt="favicon" class="web-favicon mr-2" />
                            <span class="text-truncate">{{ getSourceTitle(source) }}</span>
                            <v-icon size="12" class="ml-1">mdi-open-in-new</v-icon>
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
                          {{ expandedSources[sourceKey(index)] ? 'Ver menos' : `Ver más (${(msg.webSources?.length || 0) - 3})` }}
                        </v-btn>

                        <div v-if="msg.searchQueries && msg.searchQueries.length > 0" class="mt-2 d-flex flex-wrap ga-1">
                          <v-chip
                            v-for="(query, qIdx) in msg.searchQueries"
                            :key="`q-${index}-${qIdx}`"
                            size="x-small"
                            variant="outlined"
                            color="info"
                            class="text-caption"
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
                    <v-avatar size="28" color="primary" variant="tonal">
                      <v-icon size="16">mdi-robot-happy</v-icon>
                    </v-avatar>
                  </div>
                  <div class="mensaje-bubble mensaje-ia bg-surface px-4 py-3">
                    <div class="typing-indicator">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mb-3 flex-shrink-0" v-if="(mensajes.length === 0 || promptSugeridos.length > 0) && streamingMsgIdx === null">
              <div class="text-caption text-medium-emphasis mb-2 px-1">Sugerencias rápidas</div>
              <div class="d-flex flex-wrap ga-2">
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

        <v-window-item value="insights" class="h-100">
          <div class="pa-3" style="height: calc(100vh - 145px); overflow: hidden;">
            <InsightsIAPanel />
          </div>
        </v-window-item>
      </v-window>
    </div>
  </v-navigation-drawer>
</template>

<style scoped>
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
  /* Full width for IA responses (they can contain tables, long text) */
  display: block;
  max-width: 100%;
  width: 100%;
  overflow: hidden;
}

/* ── Avatar IA pequeño ────────────────────────────────────────────── */
.ia-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(74, 123, 247, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--neo-raised-sm);
}

/* ── Estado vacío ─────────────────────────────────────────────────── */
.ia-empty-state {
  text-align: center;
  padding: 24px 16px;
}

.ia-empty-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(74, 123, 247, 0.1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--neo-raised);
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

.web-source-row {
  background-color: rgba(76, 175, 80, 0.08);
  color: #2e7d32;
  font-size: 0.68rem !important;
  text-decoration: none;
  transition: all 0.18s ease;
  border: 1px solid rgba(76, 175, 80, 0.15);
}

.web-source-row:hover {
  background-color: rgba(76, 175, 80, 0.16);
  border-color: rgba(76, 175, 80, 0.3);
  transform: translateY(-1px);
}

.web-favicon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
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

/* ── Typing indicator ─────────────────────────────────────────────── */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 14px;
}

.typing-indicator span {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: rgba(74, 123, 247, 0.55);
  animation: typing 1.4s infinite ease-in-out both;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
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
