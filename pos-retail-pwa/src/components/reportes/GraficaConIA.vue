<script setup lang="ts">
import { ref } from 'vue'
import { enviarMensajeIA } from '@/services/edge-functions'
import NeoChart from './NeoChart.vue'
import type { ChartConfiguration, ChartType } from 'chart.js'

const props = defineProps<{
  titulo: string
  icono: string
  iconColor: string
  config: ChartConfiguration<ChartType>
  /** Datos crudos en texto para enviar a la IA */
  datosResumen: string
}>()

const interpretacion = ref<string | null>(null)
const interpretando = ref(false)
const errorIA = ref<string | null>(null)
const mostrarInterpretacion = ref(false)

async function interpretarConIA() {
  if (interpretando.value) return
  interpretando.value = true
  errorIA.value = null
  interpretacion.value = null
  mostrarInterpretacion.value = true

  const prompt = `Eres un analista de negocios que explica datos a personas sin experiencia en estadística. Explica de forma clara, simple y en español los siguientes datos de la gráfica "${props.titulo}" de un punto de venta en Honduras (moneda: Lempiras HNL, prefijo L).

Datos:
${props.datosResumen}

Instrucciones:
1. Primero di en una oración qué muestra esta gráfica (sin tecnicismos).
2. Señala 2-3 hallazgos clave (usa emojis para hacerlo visual: 📈📉⚠️💡).
3. Da 1-2 recomendaciones prácticas basadas en los datos.
4. Si hay algo preocupante, destácalo de forma amigable.

Sé breve (máx 6-8 líneas). No uses términos como "desviación estándar", "correlación", etc. Habla como si le explicaras a un dueño de pulpería.`

  try {
    const response = await enviarMensajeIA({ mensaje: prompt })
    interpretacion.value = response.message
  } catch {
    errorIA.value = 'No se pudo obtener la interpretación. Intentá de nuevo.'
  } finally {
    interpretando.value = false
  }
}

function parsearLineas(texto: string): Array<{ tipo: 'bullet' | 'texto'; valor: string }> {
  const lineas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  return lineas.map(linea => {
    if (/^[-*•–]\s+/.test(linea) || /^\d+[.)-]\s+/.test(linea)) {
      return { tipo: 'bullet' as const, valor: linea.replace(/^[-*•–\d.)-]\s*/, '') }
    }
    return { tipo: 'texto' as const, valor: linea }
  })
}

function renderBold(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
}
</script>

<template>
  <v-card class="neo-animate-in">
    <v-card-text class="pa-5">
      <!-- Header -->
      <div class="d-flex align-center mb-4">
        <div class="neo-circle-sm mr-3" :style="`background: linear-gradient(135deg, ${iconColor}, ${iconColor}88);`">
          <v-icon color="white" size="18">{{ icono }}</v-icon>
        </div>
        <h3 class="text-subtitle-1 font-weight-bold flex-grow-1">{{ titulo }}</h3>
        <v-btn
          variant="elevated"
          size="small"
          color="surface"
          class="text-primary"
          :loading="interpretando"
          @click="interpretarConIA"
        >
          <v-icon start size="16">mdi-robot-happy-outline</v-icon>
          Explicar
        </v-btn>
      </div>

      <!-- Chart -->
      <NeoChart :config="config" />

      <!-- IA Interpretation panel -->
      <v-expand-transition>
        <div v-if="mostrarInterpretacion" class="mt-4">
          <div class="neo-card-pressed pa-4">
            <div class="d-flex align-center mb-2">
              <v-icon size="16" color="primary" class="mr-2">mdi-robot-happy-outline</v-icon>
              <span class="text-caption font-weight-bold text-primary">Interpretación IA</span>
              <v-spacer />
              <v-btn icon size="x-small" variant="text" @click="mostrarInterpretacion = false">
                <v-icon size="14">mdi-close</v-icon>
              </v-btn>
            </div>

            <!-- Loading -->
            <div v-if="interpretando" class="text-center py-3">
              <v-progress-circular indeterminate size="24" width="2" color="primary" />
              <p class="text-caption text-medium-emphasis mt-2 mb-0">Analizando datos...</p>
            </div>

            <!-- Result -->
            <div v-else-if="interpretacion">
              <div
                v-for="(linea, i) in parsearLineas(interpretacion)"
                :key="i"
                class="mb-1"
              >
                <div v-if="linea.tipo === 'bullet'" class="d-flex align-start">
                  <v-icon size="14" color="primary" class="mt-1 mr-2 flex-shrink-0">mdi-circle-small</v-icon>
                  <span class="text-body-2" v-html="renderBold(linea.valor)" />
                </div>
                <p v-else class="text-body-2 mb-0" v-html="renderBold(linea.valor)" />
              </div>
            </div>

            <!-- Error -->
            <v-alert v-else-if="errorIA" type="error" density="compact" class="mb-0">
              {{ errorIA }}
            </v-alert>
          </div>
        </div>
      </v-expand-transition>
    </v-card-text>
  </v-card>
</template>
