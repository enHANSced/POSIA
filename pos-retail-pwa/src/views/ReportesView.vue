<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSalesSummary } from '@/services/database'
import { supabase } from '@/services/supabase'

const loading = ref(false)
const dateRange = ref<'today' | 'week' | 'month' | 'custom'>('today')

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
</script>

<template>
  <v-container fluid class="pa-4">
    <!-- Selector de rango -->
    <v-row class="mb-4">
      <v-col cols="12">
        <v-card>
          <v-card-text class="d-flex align-center">
            <v-icon start>mdi-chart-bar</v-icon>
            <span class="text-h6 mr-4">Reportes</span>
            <v-btn-toggle v-model="dateRange" mandatory @update:model-value="loadStats">
              <v-btn value="today">Hoy</v-btn>
              <v-btn value="week">7 días</v-btn>
              <v-btn value="month">30 días</v-btn>
            </v-btn-toggle>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Cards de estadísticas -->
    <v-row>
      <v-col cols="12" sm="6" md="3">
        <v-card color="primary" variant="elevated">
          <v-card-text class="text-center">
            <v-icon size="48">mdi-cart</v-icon>
            <h3 class="text-h4 mt-2">{{ stats.totalSales }}</h3>
            <p class="text-subtitle-1">Ventas</p>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card color="success" variant="elevated">
          <v-card-text class="text-center">
            <v-icon size="48">mdi-cash</v-icon>
            <h3 class="text-h4 mt-2">${{ stats.totalRevenue.toFixed(2) }}</h3>
            <p class="text-subtitle-1">Ingresos</p>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card color="info" variant="elevated">
          <v-card-text class="text-center">
            <v-icon size="48">mdi-percent</v-icon>
            <h3 class="text-h4 mt-2">${{ stats.totalTax.toFixed(2) }}</h3>
            <p class="text-subtitle-1">IVA</p>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card color="warning" variant="elevated">
          <v-card-text class="text-center">
            <v-icon size="48">mdi-trending-up</v-icon>
            <h3 class="text-h4 mt-2">${{ stats.averageSale.toFixed(2) }}</h3>
            <p class="text-subtitle-1">Ticket Promedio</p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mt-4">
      <!-- Gráfico de ventas -->
      <v-col cols="12" md="8">
        <v-card>
          <v-card-title>
            <v-icon start>mdi-chart-line</v-icon>
            Ventas por Día
          </v-card-title>
          <v-card-text>
            <v-table v-if="salesByDay.length > 0">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th class="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in salesByDay" :key="day.date">
                  <td>{{ day.date }}</td>
                  <td class="text-end font-weight-bold">${{ day.total.toFixed(2) }}</td>
                </tr>
              </tbody>
            </v-table>
            <v-alert v-else type="info" variant="tonal">
              No hay datos para mostrar en el período seleccionado
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Productos con stock bajo -->
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title class="text-warning">
            <v-icon start color="warning">mdi-alert</v-icon>
            Stock Bajo
          </v-card-title>
          <v-card-text>
            <v-list v-if="lowStockProducts.length > 0" density="compact">
              <v-list-item
                v-for="product in lowStockProducts"
                :key="product.id"
              >
                <v-list-item-title>{{ product.name }}</v-list-item-title>
                <template #append>
                  <v-chip color="warning" size="small">
                    {{ product.stock }} / {{ product.min_stock }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
            <v-alert v-else type="success" variant="tonal">
              Todos los productos tienen stock suficiente
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Loading -->
    <v-overlay :model-value="loading" class="align-center justify-center">
      <v-progress-circular indeterminate color="primary" size="64" />
    </v-overlay>
  </v-container>
</template>
