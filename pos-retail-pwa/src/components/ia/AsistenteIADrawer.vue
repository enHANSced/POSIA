<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useIAStore } from '@/stores/ia'

const model = defineModel<boolean>({ default: false })
const iaStore = useIAStore()

const mensaje = ref('')
const panelMensajes = ref<HTMLElement | null>(null)
const mostrarHistorial = ref(false)

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

function parsearRespuestaIA(texto: string): Array<{ tipo: 'titulo' | 'bullet' | 'numbered' | 'texto'; valor: string; prefix?: string; indent: number }> {
  const limpio = limpiarMarkdownBasico(texto)
  const lineasRaw = limpio.split('\n').filter(linea => linea.trim().length > 0)

  return lineasRaw.map((lineaRaw) => {
    // Calcular indentación basada en espacios iniciales (2 espacios = 1 nivel)
    const espacios = lineaRaw.match(/^\s*/)?.[0].length || 0
    const indent = Math.floor(espacios / 2)
    
    const linea = lineaRaw.trim()

    // Detect numbered lists: "1. ", "1) "
    const numberedMatch = linea.match(/^(\d+[.)])\s+(.*)/);
    if (numberedMatch) {
      return { tipo: 'numbered' as const, valor: numberedMatch[2] ?? '', prefix: numberedMatch[1] ?? '', indent }
    }

    // Detect bullet lists: "- ", "* ", "• "
    if (/^[-•*]\s+/.test(linea)) {
      return { tipo: 'bullet' as const, valor: linea.replace(/^[-•*]\s+/, ''), indent }
    }

    // Detect headers: "### Title", "Title:"
    if (linea.startsWith('### ')) {
      return { tipo: 'titulo' as const, valor: linea.replace(/^###\s+/, ''), indent }
    }
    if (linea.endsWith(':') || linea.endsWith(':</strong>')) {
      return { tipo: 'titulo' as const, valor: linea, indent }
    }

    return { tipo: 'texto' as const, valor: linea, indent }
  })
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
  await iaStore.cargarConversaciones()
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
    await nextTick()
    if (!panelMensajes.value) return

    // Si el último mensaje es del asistente, scrollear al inicio de ese mensaje
    const lastMsg = iaStore.mensajes[iaStore.mensajes.length - 1]
    if (lastMsg?.role === 'assistant' && newLen > (oldLen ?? 0)) {
      const bubbles = panelMensajes.value.querySelectorAll('.mb-3.d-flex')
      // El penúltimo es el user, el último es el assistant
      const userBubble = bubbles[bubbles.length - 2] as HTMLElement | undefined
      if (userBubble) {
        userBubble.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }

    // Fallback: scroll al final (ej. cuando el usuario envía un mensaje)
    panelMensajes.value.scrollTop = panelMensajes.value.scrollHeight
  }
)
</script>

<template>
  <v-navigation-drawer
    v-model="model"
    location="right"
    temporary
    width="420"
    class="d-flex flex-column"
  >
    <div class="d-flex flex-column h-100 overflow-hidden">
      <!-- Header -->
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
          v-if="conversaciones.length > 0"
          title="Ver historial"
        >
          <v-icon>mdi-history</v-icon>
        </v-btn>

        <v-btn icon size="small" variant="text" @click="iaStore.nuevaConversacion()" title="Nueva conversación">
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <v-divider class="flex-shrink-0" />

      <!-- Conversations History (Collapsible/Scrollable region) -->
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

      <!-- Main Chat Area (Flex Grow) -->
      <div class="d-flex flex-column flex-grow-1 overflow-hidden px-3 pb-3 pt-0">
        <div ref="panelMensajes" class="mensajes-panel neo-flat pa-3 mb-3 flex-grow-1 d-flex flex-column" style="min-height: 0;">
          <div v-if="mensajes.length === 0" class="text-caption text-medium-emphasis text-center py-6 my-auto">
            <v-icon size="48" color="primary" class="mb-2 opacity-50">mdi-robot-outline</v-icon>
            <br>
            Escribí una pregunta sobre ventas, productos o recomendaciones.
          </div>

          <div class="d-flex flex-column justify-end" :class="{ 'flex-grow-1': mensajes.length > 0 }">
            <div
              v-for="(msg, index) in mensajes"
              :key="index"
              class="mb-3 d-flex"
              :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <div v-if="msg.role === 'assistant'" class="mr-2 mt-1 flex-shrink-0">
                <v-avatar size="28" color="primary" variant="tonal">
                  <v-icon size="16">mdi-robot-happy</v-icon>
                </v-avatar>
              </div>
              
              <div class="mensaje-bubble" :class="msg.role === 'user' ? 'mensaje-user bg-primary text-white' : 'mensaje-ia bg-surface'">
                <template v-if="msg.role === 'assistant'">
                  <div
                    v-for="(linea, idx) in parsearRespuestaIA(msg.content)"
                    :key="`${index}-${idx}`"
                    class="mb-1"
                  >
                    <div v-if="linea.tipo === 'titulo'" class="text-body-2 font-weight-bold text-primary mt-3 mb-1" v-html="linea.valor">
                    </div>
                    <div v-else-if="linea.tipo === 'bullet'" class="d-flex align-start pl-2 mb-1">
                      <v-icon size="14" class="mr-2 mt-1 text-primary opacity-70">mdi-circle-small</v-icon>
                      <span v-html="linea.valor" class="flex-grow-1"></span>
                    </div>
                    <div v-else-if="linea.tipo === 'numbered'" class="d-flex align-start pl-2 mb-1">
                      <span class="mr-2 font-weight-bold text-primary opacity-70 text-caption mt-1" style="min-width: 14px;">{{ linea.prefix }}</span>
                      <span v-html="linea.valor" class="flex-grow-1"></span>
                    </div>
                    <div v-else v-html="linea.valor" class="mt-1">
                    </div>
                  </div>
                  
                  <!-- Fuentes web consultadas -->
                  <div v-if="msg.webSources && msg.webSources.length > 0" class="web-sources-section mt-3 pt-2">
                    <div class="d-flex align-center mb-1">
                      <v-icon size="12" color="success" class="mr-1">mdi-web</v-icon>
                      <span class="text-caption font-weight-medium text-success" style="font-size: 0.7rem !important;">
                        Fuentes web consultadas
                      </span>
                    </div>
                    <div class="d-flex flex-wrap ga-1">
                      <a
                        v-for="(source, sIdx) in msg.webSources.slice(0, 5)"
                        :key="`src-${index}-${sIdx}`"
                        :href="source.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="web-source-chip text-caption d-inline-flex align-center px-2 py-1 rounded-pill"
                      >
                        <v-icon size="10" class="mr-1">mdi-open-in-new</v-icon>
                        {{ source.title }}
                      </a>
                    </div>
                  </div>

                  <!-- Badge de búsqueda web usada (sin fuentes específicas) -->
                  <div v-else-if="msg.usedWebSearch" class="mt-2">
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

            <!-- Indicador de escribiendo -->
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

        <div class="mb-3 flex-shrink-0" v-if="mensajes.length === 0 || promptSugeridos.length > 0">
          <div class="text-caption text-medium-emphasis mb-2">Sugerencias rápidas</div>
          <div class="d-flex flex-wrap ga-2">
            <div
              v-for="sugerencia in promptSugeridos"
              :key="sugerencia"
              class="neo-suggestion-btn text-caption text-primary cursor-pointer px-3 py-2"
              @click="enviarSugerencia(sugerencia)"
            >
              {{ sugerencia }}
            </div>
          </div>
        </div>

        <v-alert v-if="iaStore.error" type="error" density="compact" class="mb-2 flex-shrink-0" variant="tonal">
          {{ iaStore.error }}
        </v-alert>

        <div class="flex-shrink-0 neo-card-pressed pa-2 rounded-lg">
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
            class="px-2"
          >
            <template #append-inner>
              <v-btn 
                icon="mdi-send" 
                variant="text" 
                color="primary" 
                size="small"
                :loading="iaStore.enviando" 
                :disabled="!mensaje.trim() || iaStore.enviando"
                @click="enviar"
                class="mt-n1"
              />
            </template>
          </v-textarea>
        </div>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<style scoped>
.mensajes-panel {
  overflow-y: auto;
  border-radius: var(--neo-radius);
  scroll-behavior: smooth;
}

.mensaje-bubble {
  display: inline-block;
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 0.9rem;
  line-height: 1.4;
  text-align: left;
  word-break: break-word;
}

.mensaje-user {
  border-bottom-right-radius: 4px;
  box-shadow: 0 4px 12px rgba(74, 123, 247, 0.2);
}

.mensaje-ia {
  border-bottom-left-radius: 4px;
  box-shadow: var(--neo-raised-sm);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

/* Web sources section */
.web-sources-section {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.web-source-chip {
  background-color: rgba(76, 175, 80, 0.08);
  color: #2e7d32;
  font-size: 0.65rem !important;
  text-decoration: none;
  transition: all 0.2s ease;
  border: 1px solid rgba(76, 175, 80, 0.15);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.web-source-chip:hover {
  background-color: rgba(76, 175, 80, 0.16);
  border-color: rgba(76, 175, 80, 0.3);
  transform: translateY(-1px);
}

.neo-suggestion-btn {
  background-color: var(--neo-bg);
  border-radius: 12px;
  box-shadow: var(--neo-raised-sm);
  transition: all 0.2s ease;
  user-select: none;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.neo-suggestion-btn:hover {
  box-shadow: var(--neo-raised);
  transform: translateY(-1px);
  color: rgb(var(--v-theme-primary)) !important;
}

.neo-suggestion-btn:active {
  box-shadow: var(--neo-pressed-sm);
  transform: translateY(1px);
}

/* Typing indicator animation */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 14px;
}

.typing-indicator span {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: rgba(74, 123, 247, 0.6);
  animation: typing 1.4s infinite ease-in-out both;
}

.typing-indicator span:nth-child(1) {
  animation-delay: -0.32s;
}

.typing-indicator span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes typing {
  0%, 80%, 100% { 
    transform: scale(0);
  } 40% { 
    transform: scale(1);
  }
}
</style>