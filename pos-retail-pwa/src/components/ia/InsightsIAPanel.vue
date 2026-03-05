<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useIAStore } from '@/stores/ia'

const iaStore = useIAStore()

const insights = computed(() => iaStore.insights)

function formatHNL(value: number): string {
  return `L ${value.toFixed(2)}`
}

function formatFecha(value: string): string {
  return new Date(value).toLocaleString('es-HN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short'
  })
}

onMounted(async () => {
  if (!iaStore.insights) {
    await iaStore.cargarInsights()
  }
})
</script>

<template>
  <div class="h-100 d-flex flex-column overflow-hidden">
    <div class="d-flex align-center justify-space-between mb-3 px-1">
      <span class="text-caption font-weight-bold text-medium-emphasis">INSIGHTS IA</span>
      <v-btn size="small" variant="text" color="primary" :loading="iaStore.loadingInsights" @click="iaStore.cargarInsights()">
        Actualizar
      </v-btn>
    </div>

    <div v-if="iaStore.loadingInsights" class="d-flex justify-center align-center py-8">
      <v-progress-circular indeterminate color="primary" size="26" width="3" />
    </div>

    <div v-else-if="insights" class="flex-grow-1 overflow-y-auto pr-1">
      <div class="text-caption text-medium-emphasis mb-3" v-if="insights.generatedAt">
        Actualizado: {{ formatFecha(insights.generatedAt) }}
      </div>

      <v-row dense class="mb-2">
        <v-col cols="6">
          <div class="neo-kpi-box pa-3">
            <div class="text-caption text-medium-emphasis">Ventas hoy</div>
            <div class="text-subtitle-1 font-weight-bold">{{ insights.kpis.totalSalesToday }}</div>
          </div>
        </v-col>
        <v-col cols="6">
          <div class="neo-kpi-box pa-3">
            <div class="text-caption text-medium-emphasis">Ingresos hoy</div>
            <div class="text-subtitle-1 font-weight-bold">{{ formatHNL(insights.kpis.revenueToday) }}</div>
          </div>
        </v-col>
        <v-col cols="6">
          <div class="neo-kpi-box pa-3">
            <div class="text-caption text-medium-emphasis">Ticket promedio</div>
            <div class="text-subtitle-1 font-weight-bold">{{ formatHNL(insights.kpis.avgTicketToday) }}</div>
          </div>
        </v-col>
        <v-col cols="6">
          <div class="neo-kpi-box pa-3">
            <div class="text-caption text-medium-emphasis">Ahorro promos</div>
            <div class="text-subtitle-1 font-weight-bold">{{ formatHNL(insights.kpis.savingsByPromotionsToday) }}</div>
          </div>
        </v-col>
      </v-row>

      <div class="neo-section-box pa-3 mb-3">
        <div class="text-caption font-weight-bold text-primary mb-2">Mensajes contextuales</div>
        <div v-if="insights.mensajesContextuales.length === 0" class="text-caption text-medium-emphasis">
          Sin mensajes por ahora.
        </div>
        <div v-for="(mensaje, idx) in insights.mensajesContextuales" :key="`m-${idx}`" class="d-flex align-start mb-2">
          <v-icon size="14" class="mr-2 mt-1 text-primary">mdi-circle-small</v-icon>
          <span class="text-body-2">{{ mensaje }}</span>
        </div>
      </div>

      <div class="neo-section-box pa-3 mb-1">
        <div class="text-caption font-weight-bold text-success mb-2">Recomendaciones rápidas</div>
        <div v-if="insights.recomendacionesRapidas.length === 0" class="text-caption text-medium-emphasis">
          Sin recomendaciones por ahora.
        </div>
        <div v-for="(rec, idx) in insights.recomendacionesRapidas" :key="`r-${idx}`" class="d-flex align-start mb-2">
          <v-icon size="14" class="mr-2 mt-1 text-success">mdi-lightbulb-on-outline</v-icon>
          <span class="text-body-2">{{ rec }}</span>
        </div>
      </div>
    </div>

    <div v-else class="text-caption text-medium-emphasis py-6 text-center">
      No se pudieron cargar insights por ahora.
    </div>
  </div>
</template>

<style scoped>
.neo-kpi-box {
  border-radius: 12px;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised-sm);
}

.neo-section-box {
  border-radius: 12px;
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed-sm);
}
</style>
