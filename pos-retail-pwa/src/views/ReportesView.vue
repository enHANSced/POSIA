<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSalesSummary } from '@/services/database'
import { supabase } from '@/services/supabase'
import { enviarMensajeIA } from '@/services/edge-functions'
import { useAuthStore } from '@/stores/auth'

const loading = ref(false)
const dateRange = ref<'today' | 'week' | 'month' | 'custom'>('today')
const authStore = useAuthStore()

// IA Insights
const iaInsight = ref<string | null>(null)
const iaAnalizando = ref(false)
const iaError = ref<string | null>(null)

// Estadísticas
const stats = ref({
  totalSales: 0,
  totalRevenue: 0,
  totalTax: 0,
  averageSale: 0
})

// Datos para gráficos
const salesByDay = ref<{ date: string; total: number }[]>([])
const topProducts = ref<{ name: string; units: number }[]>([])
const lowStockProducts = ref<any[]>([])

onMounted(async () => {
  await loadStats()
  await loadLowStock()
})

async function loadStats() {
  loading.value = true
  
  const now = new Date()
  let startDate: Date
  
  switch (dateRange.value) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0))
      break
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    default:
      startDate = new Date(now.setHours(0, 0, 0, 0))
  }

  try {
    const result = await getSalesSummary(
      startDate.toISOString(),
      new Date().toISOString()
    )
    
    stats.value = {
      totalSales: result.totalSales,
      totalRevenue: result.totalRevenue,
      totalTax: result.totalTax,
      averageSale: result.totalSales > 0 ? result.totalRevenue / result.totalSales : 0
    }

    // Agrupar ventas por día para gráfico
    const byDay: Record<string, number> = {}
    result.sales.forEach((sale: any) => {
      const date = new Date(sale.created_at).toLocaleDateString('es-MX')
      byDay[date] = (byDay[date] || 0) + sale.total
    })
    salesByDay.value = Object.entries(byDay).map(([date, total]) => ({ date, total }))

  } catch (err) {
    console.error('Error cargando estadísticas:', err)
  } finally {
    loading.value = false
  }
}

async function loadLowStock() {
  try {
    const { data } = await supabase
      .from('low_stock_products')
      .select('*')
      .limit(10)
    
    lowStockProducts.value = data || []
  } catch (err) {
    console.error('Error cargando stock bajo:', err)
  }
}

async function loadTopProducts() {
  try {
    const { data } = await supabase
      .from('top_selling_products')
      .select('*')
      .limit(10)
    
    topProducts.value = (data || []).map(p => ({
      name: p.name || 'Desconocido',
      units: p.units_sold || 0
    }))
  } catch (err) {
    console.error('Error cargando productos top:', err)
  }
}

const RANGO_LABELS: Record<string, string> = {
  today: 'hoy',
  week: 'los últimos 7 días',
  month: 'los últimos 30 días',
}

async function analizarConIA() {
  if (iaAnalizando.value) return
  iaAnalizando.value = true
  iaError.value = null
  iaInsight.value = null

  const rango = RANGO_LABELS[dateRange.value] || 'el período seleccionado'
  const prompt = `Analiza el desempeño del negocio para ${rango}:
- Ventas totales: ${stats.value.totalSales}
- Ingresos: L ${stats.value.totalRevenue.toFixed(2)}
- ISV recaudado: L ${stats.value.totalTax.toFixed(2)}
- Ticket promedio: L ${stats.value.averageSale.toFixed(2)}
${lowStockProducts.value.length > 0 ? `- Productos con stock bajo: ${lowStockProducts.value.map((p: any) => p.name).join(', ')}` : ''}

Proporciona 3 insights concretos y 2 recomendaciones de acción inmediata para mejorar las ventas. Sé breve y directo.`

  try {
    const response = await enviarMensajeIA({ mensaje: prompt })
    iaInsight.value = response.message
  } catch (err) {
    iaError.value = 'No se pudo obtener el análisis. Intentá de nuevo.'
    console.error(err)
  } finally {
    iaAnalizando.value = false
  }
}

function parsearInsight(texto: string): Array<{ tipo: 'bullet' | 'texto'; valor: string }> {
  const lineas = texto
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
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
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <!-- Selector de rango neomórfico -->
    <v-row class="mb-5">
      <v-col cols="12">
        <v-card class="neo-animate-in">
          <v-card-text class="d-flex align-center pa-5">
            <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #42A5F5, #64B5F6);">
              <v-icon color="white" size="20">mdi-chart-bar</v-icon>
            </div>
            <span class="text-h6 font-weight-bold mr-6">Reportes</span>
            <div class="neo-tab-group d-flex">
              <button
                :class="['neo-tab-btn', { 'neo-tab-btn-active': dateRange === 'today' }]"
                @click="dateRange = 'today'; loadStats()"
              >Hoy</button>
              <button
                :class="['neo-tab-btn', { 'neo-tab-btn-active': dateRange === 'week' }]"
                @click="dateRange = 'week'; loadStats()"
              >7 días</button>
              <button
                :class="['neo-tab-btn', { 'neo-tab-btn-active': dateRange === 'month' }]"
                @click="dateRange = 'month'; loadStats()"
              >30 días</button>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Cards de estadísticas neomórficas -->
    <v-row class="mb-5">
      <v-col cols="12" sm="6" md="3">
        <div class="neo-stat-card neo-animate-in">
          <div class="neo-stat-icon">
            <v-icon color="primary" size="24">mdi-cart</v-icon>
          </div>
          <h3 class="text-h4 font-weight-bold mt-2">{{ stats.totalSales }}</h3>
          <p class="text-body-2 text-medium-emphasis">Ventas</p>
          <div class="neo-stat-bar" style="--bar-color: #4A7BF7;"></div>
        </div>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <div class="neo-stat-card neo-animate-in">
          <div class="neo-stat-icon">
            <v-icon color="success" size="24">mdi-cash-multiple</v-icon>
          </div>
          <h3 class="text-h4 font-weight-bold mt-2">L {{ stats.totalRevenue.toFixed(2) }}</h3>
          <p class="text-body-2 text-medium-emphasis">Ingresos</p>
          <div class="neo-stat-bar" style="--bar-color: #66BB6A;"></div>
        </div>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <div class="neo-stat-card neo-animate-in">
          <div class="neo-stat-icon">
            <v-icon color="info" size="24">mdi-percent</v-icon>
          </div>
          <h3 class="text-h4 font-weight-bold mt-2">L {{ stats.totalTax.toFixed(2) }}</h3>
          <p class="text-body-2 text-medium-emphasis">ISV</p>
          <div class="neo-stat-bar" style="--bar-color: #42A5F5;"></div>
        </div>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <div class="neo-stat-card neo-animate-in">
          <div class="neo-stat-icon">
            <v-icon color="warning" size="24">mdi-trending-up</v-icon>
          </div>
          <h3 class="text-h4 font-weight-bold mt-2">L {{ stats.averageSale.toFixed(2) }}</h3>
          <p class="text-body-2 text-medium-emphasis">Ticket Promedio</p>
          <div class="neo-stat-bar" style="--bar-color: #FFA726;"></div>
        </div>
      </v-col>
    </v-row>

    <!-- IA Insights Section -->
    <v-row v-if="authStore.isAdmin" class="mb-5">
      <v-col cols="12">
        <v-card class="neo-animate-in">
          <v-card-text class="pa-5">
            <div class="d-flex align-center mb-4">
              <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
                <v-icon color="white" size="20">mdi-robot-happy-outline</v-icon>
              </div>
              <div>
                <h3 class="text-subtitle-1 font-weight-bold mb-0">Análisis con IA</h3>
                <p class="text-caption text-medium-emphasis mb-0">Insights automáticos del período seleccionado</p>
              </div>
              <v-spacer />
              <v-btn
                color="primary"
                variant="outlined"
                size="small"
                :loading="iaAnalizando"
                @click="analizarConIA"
              >
                <v-icon start>mdi-sparkles</v-icon>
                Analizar
              </v-btn>
            </div>

            <!-- Resultado del análisis -->
            <div v-if="iaInsight" class="neo-card-pressed pa-4">
              <div
                v-for="(linea, i) in parsearInsight(iaInsight)"
                :key="i"
                class="mb-1"
              >
                <div v-if="linea.tipo === 'bullet'" class="d-flex align-start">
                  <v-icon size="14" color="primary" class="mt-1 mr-2 flex-shrink-0">mdi-circle-small</v-icon>
                  <span class="text-body-2">{{ linea.valor }}</span>
                </div>
                <p v-else class="text-body-2 font-weight-medium mb-0">{{ linea.valor }}</p>
              </div>
            </div>

            <!-- Error -->
            <v-alert v-else-if="iaError" type="error" density="compact">
              {{ iaError }}
            </v-alert>

            <!-- Estado inicial -->
            <div v-else class="text-center py-5">
              <v-icon size="36" color="grey-lighten-1" class="mb-2">mdi-chart-areaspline</v-icon>
              <p class="text-body-2 text-medium-emphasis mb-0">
                Haz clic en <strong>Analizar</strong> para obtener insights y recomendaciones de acción del período.
              </p>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <!-- Tabla de ventas por día -->
      <v-col cols="12" md="8">
        <v-card class="neo-animate-in">
          <v-card-text class="pa-5">
            <div class="d-flex align-center mb-4">
              <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #66BB6A, #81C784);">
                <v-icon color="white" size="18">mdi-chart-line</v-icon>
              </div>
              <h3 class="text-subtitle-1 font-weight-bold">Ventas por Día</h3>
            </div>

            <v-table v-if="salesByDay.length > 0" class="neo-table">
              <thead>
                <tr>
                  <th class="text-left">Fecha</th>
                  <th class="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in salesByDay" :key="day.date">
                  <td class="text-body-2">{{ day.date }}</td>
                  <td class="text-end font-weight-bold text-primary">L {{ day.total.toFixed(2) }}</td>
                </tr>
              </tbody>
            </v-table>
            <v-alert v-else type="info" class="mt-2">
              No hay datos para mostrar en el período seleccionado
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Productos con stock bajo -->
      <v-col cols="12" md="4">
        <v-card class="neo-animate-in">
          <v-card-text class="pa-5">
            <div class="d-flex align-center mb-4">
              <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #FFA726, #FFB74D);">
                <v-icon color="white" size="18">mdi-alert</v-icon>
              </div>
              <h3 class="text-subtitle-1 font-weight-bold">Stock Bajo</h3>
            </div>

            <v-list v-if="lowStockProducts.length > 0" density="compact">
              <v-list-item
                v-for="product in lowStockProducts"
                :key="product.id"
                rounded="lg"
                class="mb-1"
              >
                <v-list-item-title class="text-body-2">{{ product.name }}</v-list-item-title>
                <template #append>
                  <v-chip color="warning" size="small" variant="tonal">
                    {{ product.stock }} / {{ product.min_stock }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
            <v-alert v-else type="success">
              Todos los productos tienen stock suficiente
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Loading -->
    <v-overlay :model-value="loading" class="align-center justify-center">
      <div class="neo-circle neo-pulse">
        <v-progress-circular indeterminate color="primary" size="32" width="3" />
      </div>
    </v-overlay>
  </v-container>
</template>

<style scoped>
.neo-tab-group {
  background-color: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed-sm);
  border-radius: var(--neo-radius-xs);
  padding: 3px;
  gap: 3px;
  display: flex;
}

.neo-tab-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: var(--neo-transition);
  color: inherit;
}

.neo-tab-btn:hover {
  color: rgb(var(--v-theme-primary));
}

.neo-tab-btn-active {
  box-shadow: var(--neo-raised-sm);
  background-color: var(--neo-bg) !important;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.neo-stat-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--bar-color);
  border-radius: 0 0 var(--neo-radius) var(--neo-radius);
}

.neo-table {
  background: transparent !important;
}
</style>
