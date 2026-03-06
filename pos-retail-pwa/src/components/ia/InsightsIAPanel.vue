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
      <div class="d-flex align-center">
        <span class="ia-insights-icon mr-2">
          <span class="ia-insights-eye left"></span>
          <span class="ia-insights-eye right"></span>
        </span>
        <span class="text-caption font-weight-bold text-medium-emphasis">INSIGHTS DE POSIA</span>
      </div>
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
        <div class="d-flex align-center mb-2">
          <v-icon size="14" class="mr-1 text-primary">mdi-message-text-outline</v-icon>
          <span class="text-caption font-weight-bold text-primary">Mensajes contextuales</span>
        </div>
        <div v-if="insights.mensajesContextuales.length === 0" class="text-caption text-medium-emphasis">
          Sin mensajes por ahora.
        </div>
        <div v-for="(mensaje, idx) in insights.mensajesContextuales" :key="`m-${idx}`" class="d-flex align-start mb-2">
          <v-icon size="14" class="mr-2 mt-1 text-primary">mdi-circle-small</v-icon>
          <span class="text-body-2">{{ mensaje }}</span>
        </div>
      </div>

      <div class="neo-section-box pa-3 mb-1">
        <div class="d-flex align-center mb-2">
          <v-icon size="14" class="mr-1 text-success">mdi-lightbulb-on-outline</v-icon>
          <span class="text-caption font-weight-bold text-success">Recomendaciones rápidas</span>
        </div>
        <div v-if="insights.recomendacionesRapidas.length === 0" class="text-caption text-medium-emphasis">
          Sin recomendaciones por ahora.
        </div>
        <div v-for="(rec, idx) in insights.recomendacionesRapidas" :key="`r-${idx}`" class="d-flex align-start mb-2">
          <v-icon size="14" class="mr-2 mt-1 text-success">mdi-lightbulb-on-outline</v-icon>
          <span class="text-body-2">{{ rec }}</span>
        </div>
      </div>
    </div>

    <div v-else class="d-flex flex-column align-center justify-center py-8 text-center">
      <div class="ia-insights-sad mb-3">
        <span class="ia-insights-eye left"></span>
        <span class="ia-insights-eye right"></span>
        <span class="ia-insights-sad-mouth"></span>
      </div>
      <span class="text-caption text-medium-emphasis">No se pudieron cargar insights por ahora.</span>
    </div>
  </div>
</template>

<style scoped>
.neo-kpi-box {
  border-radius: 12px;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised-sm);
  transition: all 0.2s ease;
}

.neo-kpi-box:hover {
  box-shadow: var(--neo-raised);
  transform: translateY(-1px);
}

.neo-section-box {
  border-radius: 12px;
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed-sm);
}

/* ── Mini robot para insights ─────────────────────────────────────── */
.ia-insights-icon {
  width: 22px;
  height: 18px;
  border-radius: 8px 8px 6px 6px;
  background: linear-gradient(135deg, rgba(74, 123, 247, 0.15), rgba(74, 123, 247, 0.06));
  box-shadow: var(--neo-flat);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.ia-insights-eye {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  animation: insightsLook 4s ease-in-out infinite;
}

.ia-insights-eye.right {
  animation-delay: 0.1s;
}

@keyframes insightsLook {
  0%, 90%, 100% { transform: scaleY(1); }
  94% { transform: scaleY(0.15); }
}

/* Face triste para error state */
.ia-insights-sad {
  width: 40px;
  height: 32px;
  border-radius: 12px 12px 10px 10px;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  position: relative;
}

.ia-insights-sad .ia-insights-eye {
  width: 5px;
  height: 5px;
  animation: none;
}

.ia-insights-sad-mouth {
  position: absolute;
  bottom: 5px;
  left: 50%;
  transform: translateX(-50%);
  width: 10px;
  height: 5px;
  border: 1.5px solid rgb(var(--v-theme-primary));
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  opacity: 0.5;
}
</style>
