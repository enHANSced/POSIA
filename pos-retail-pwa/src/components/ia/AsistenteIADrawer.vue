<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useIAStore } from '@/stores/ia'

const model = defineModel<boolean>({ default: false })
const iaStore = useIAStore()

const mensaje = ref('')
const panelMensajes = ref<HTMLElement | null>(null)

const promptSugeridos = [
  '¿Qué productos se han vendido más esta semana?',
  'Dame alertas de stock bajo y prioridad de reposición.',
  '¿Cómo van las ventas de hoy frente a la semana?',
  'Recomiéndame 3 acciones para aumentar ingresos mañana.'
]

const conversaciones = computed(() => iaStore.conversaciones)
const mensajes = computed(() => iaStore.mensajes)

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
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
}

function parsearRespuestaIA(texto: string): Array<{ tipo: 'titulo' | 'bullet' | 'texto'; valor: string }> {
  const limpio = limpiarMarkdownBasico(texto)
  const lineas = limpio
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean)

  return lineas.map((linea) => {
    if (/^\d+[.)]\s+/.test(linea)) {
      return { tipo: 'bullet' as const, valor: linea.replace(/^\d+[.)]\s+/, '') }
    }

    if (/^[-•]\s+/.test(linea)) {
      return { tipo: 'bullet' as const, valor: linea.replace(/^[-•]\s+/, '') }
    }

    if (linea.endsWith(':')) {
      return { tipo: 'titulo' as const, valor: linea.slice(0, -1) }
    }

    return { tipo: 'texto' as const, valor: linea }
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
})

watch(
  () => iaStore.mensajes.length,
  async () => {
    await nextTick()
    if (panelMensajes.value) {
      panelMensajes.value.scrollTop = panelMensajes.value.scrollHeight
    }
  }
)
</script>

<template>
  <v-navigation-drawer
    v-model="model"
    location="right"
    temporary
    width="420"
  >
    <div class="pa-4 d-flex align-center">
      <div class="neo-circle-sm mr-3">
        <v-icon color="primary">mdi-robot-happy-outline</v-icon>
      </div>
      <div>
        <h3 class="text-subtitle-1 font-weight-bold">Asistente IA</h3>
        <p class="text-caption text-medium-emphasis">Consultas de ventas y stock</p>
      </div>
      <v-spacer />
      <v-btn icon variant="text" @click="iaStore.nuevaConversacion()">
        <v-icon>mdi-plus</v-icon>
      </v-btn>
    </div>

    <v-divider />

    <div class="pa-3">
      <v-list density="compact" class="neo-card-pressed pa-2 mb-3" max-height="160">
        <v-list-item
          v-for="conversacion in conversaciones"
          :key="conversacion.id"
          rounded="lg"
          class="mb-1"
          @click="iaStore.seleccionarConversacion(conversacion.id)"
        >
          <template #prepend>
            <v-icon size="16">mdi-forum-outline</v-icon>
          </template>

          <v-list-item-title class="text-caption font-weight-medium">
            {{ vistaPrevia(conversacion.title || 'Conversación sin título') }}
          </v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ formatearFecha(conversacion.updated_at) }}
          </v-list-item-subtitle>

          <template #append>
            <v-btn icon size="x-small" variant="text" @click.stop="iaStore.borrarConversacion(conversacion.id)">
              <v-icon size="14">mdi-close</v-icon>
            </v-btn>
          </template>
        </v-list-item>
      </v-list>

      <div ref="panelMensajes" class="mensajes-panel neo-flat pa-3 mb-3">
        <div v-if="mensajes.length === 0" class="text-caption text-medium-emphasis text-center py-6">
          Escribí una pregunta sobre ventas, productos o recomendaciones.
        </div>

        <div
          v-for="(msg, index) in mensajes"
          :key="index"
          class="mb-2"
          :class="msg.role === 'user' ? 'text-right' : 'text-left'"
        >
          <div class="mensaje-bubble" :class="msg.role === 'user' ? 'mensaje-user' : 'mensaje-ia'">
            <template v-if="msg.role === 'assistant'">
              <div
                v-for="(linea, idx) in parsearRespuestaIA(msg.content)"
                :key="`${index}-${idx}`"
                class="mb-1"
              >
                <div v-if="linea.tipo === 'titulo'" class="text-body-2 font-weight-bold">
                  {{ linea.valor }}
                </div>
                <div v-else-if="linea.tipo === 'bullet'" class="d-flex align-start">
                  <v-icon size="14" class="mr-1 mt-1">mdi-circle-small</v-icon>
                  <span>{{ linea.valor }}</span>
                </div>
                <div v-else>
                  {{ linea.valor }}
                </div>
              </div>
            </template>
            <template v-else>
              {{ msg.content }}
            </template>
          </div>
        </div>
      </div>

      <div class="mb-3">
        <div class="text-caption text-medium-emphasis mb-2">Sugerencias rápidas</div>
        <div class="d-flex flex-wrap ga-2">
          <v-chip
            v-for="sugerencia in promptSugeridos"
            :key="sugerencia"
            size="small"
            variant="tonal"
            class="cursor-pointer"
            @click="enviarSugerencia(sugerencia)"
          >
            {{ sugerencia }}
          </v-chip>
        </div>
      </div>

      <v-alert v-if="iaStore.error" type="error" density="compact" class="mb-2">
        {{ iaStore.error }}
      </v-alert>

      <v-textarea
        v-model="mensaje"
        rows="2"
        auto-grow
        hide-details
        placeholder="Preguntá algo al asistente..."
        :disabled="iaStore.enviando"
        @keydown="manejarTecladoEnvio"
      />

      <div class="d-flex justify-end mt-2">
        <v-btn color="primary" :loading="iaStore.enviando" @click="enviar">
          <v-icon start>mdi-send</v-icon>
          Enviar
        </v-btn>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<style scoped>
.mensajes-panel {
  height: 340px;
  overflow-y: auto;
  border-radius: var(--neo-radius);
}

.mensaje-bubble {
  display: inline-block;
  max-width: 90%;
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 0.85rem;
  line-height: 1.35;
  text-align: left;
}

.mensaje-user {
  box-shadow: var(--neo-pressed-sm);
}

.mensaje-ia {
  box-shadow: var(--neo-raised-sm);
}
</style>