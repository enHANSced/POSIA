<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  getSalesSummary,
  fetchDailySalesSummary,
  fetchSalesByHour,
  fetchSellerRankings,
  fetchSalesByPaymentMethod,
  fetchDiscountImpactDaily,
  fetchTopSellingProducts,
  fetchLowStockProducts,
  fetchDiscountApplications,
  type DailySalesSummary,
  type SalesByHour,
  type SellerRanking,
  type SalesByPaymentMethod,
  type DiscountImpactDaily,
} from '@/services/database'
import { enviarMensajeIA } from '@/services/edge-functions'
import { useAuthStore } from '@/stores/auth'
import GraficaConIA from '@/components/reportes/GraficaConIA.vue'
import type { ChartConfiguration } from 'chart.js'

const authStore = useAuthStore()
const loading = ref(false)
const dateRange = ref<'today' | 'week' | 'month'>('week')
const activeTab = ref('general')

// ==================== DATOS ====================

const stats = ref({
  totalSales: 0,
  totalRevenue: 0,
  totalTax: 0,
  averageSale: 0,
})

const dailySales = ref<DailySalesSummary[]>([])
const salesByHour = ref<SalesByHour[]>([])
const sellerRankings = ref<SellerRanking[]>([])
const salesByPayment = ref<SalesByPaymentMethod[]>([])
const discountImpact = ref<DiscountImpactDaily[]>([])
const topProducts = ref<{ name: string; units_sold: number; price: number }[]>([])
const lowStockProducts = ref<any[]>([])
const discountApplications = ref<any[]>([])

// IA Report
const iaReporte = ref<string | null>(null)
const iaReporteGenerando = ref(false)
const iaReporteError = ref<string | null>(null)

// IA Custom chart
const iaCustomChart = ref<string | null>(null)
const iaCustomInput = ref('')
const iaCustomGenerando = ref(false)
const iaCustomError = ref<string | null>(null)

// ==================== LOAD ====================

onMounted(async () => {
  await loadAllData()
})

async function loadAllData() {
  loading.value = true
  try {
    await Promise.all([
      loadStats(),
      loadChartData(),
    ])
  } catch (err) {
    console.error('Error cargando datos de reportes:', err)
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  const now = new Date()
  let startDate: Date

  switch (dateRange.value) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
  }

  const result = await getSalesSummary(startDate.toISOString(), new Date().toISOString())
  stats.value = {
    totalSales: result.totalSales,
    totalRevenue: result.totalRevenue,
    totalTax: result.totalTax,
    averageSale: result.totalSales > 0 ? result.totalRevenue / result.totalSales : 0,
  }
}

async function loadChartData() {
  const [daily, hourly, sellers, payments, impact, products, lowStock, discApps] = await Promise.all([
    fetchDailySalesSummary(),
    fetchSalesByHour(),
    fetchSellerRankings(),
    fetchSalesByPaymentMethod(),
    fetchDiscountImpactDaily(),
    fetchTopSellingProducts(10),
    fetchLowStockProducts(),
    fetchDiscountApplications(),
  ])

  dailySales.value = daily
  salesByHour.value = hourly
  sellerRankings.value = sellers
  salesByPayment.value = payments
  discountImpact.value = impact
  topProducts.value = products
  lowStockProducts.value = lowStock
  discountApplications.value = discApps
}

async function changeRange(range: 'today' | 'week' | 'month') {
  dateRange.value = range
  loading.value = true
  try {
    await loadStats()
  } finally {
    loading.value = false
  }
}

// ==================== CHART CONFIGS ====================

const COLORS = {
  primary: '#4A7BF7',
  primaryLight: 'rgba(74,123,247,0.2)',
  success: '#66BB6A',
  successLight: 'rgba(102,187,106,0.2)',
  warning: '#FFA726',
  warningLight: 'rgba(255,167,38,0.2)',
  error: '#EF5350',
  errorLight: 'rgba(239,83,80,0.2)',
  info: '#42A5F5',
  infoLight: 'rgba(66,165,245,0.2)',
  purple: '#AB47BC',
  purpleLight: 'rgba(171,71,188,0.2)',
}

const chartDefaults = {
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(30,30,46,0.9)',
      titleFont: { size: 12 },
      bodyFont: { size: 11 },
      padding: 10,
      cornerRadius: 8,
    },
  },
}

const dailySalesConfig = computed<ChartConfiguration<'line'>>(() => {
  const data = dailySales.value
  return {
    type: 'line' as const,
    data: {
      labels: data.map(d => {
        const date = new Date(d.fecha + 'T12:00:00')
        return date.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })
      }),
      datasets: [{
        label: 'Ingresos (L)',
        data: data.map(d => d.total_revenue),
        borderColor: COLORS.primary,
        backgroundColor: COLORS.primaryLight,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
      }],
    },
    options: {
      ...chartDefaults,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v: string | number) => `L ${Number(v).toLocaleString()}` },
        },
      },
    },
  }
})

const dailySalesResumen = computed(() => {
  return dailySales.value.map(d =>
    `${d.fecha}: ${d.total_sales} ventas, L ${d.total_revenue.toFixed(2)} ingresos, ticket promedio L ${d.avg_ticket.toFixed(2)}`
  ).join('\n')
})

const hourlyConfig = computed<ChartConfiguration<'bar'>>(() => {
  const data = salesByHour.value
  return {
    type: 'bar' as const,
    data: {
      labels: data.map(d => {
        const h = d.hora
        const ampm = h >= 12 ? 'PM' : 'AM'
        const display = h === 0 ? 12 : h > 12 ? h - 12 : h
        return `${display} ${ampm}`
      }),
      datasets: [{
        label: 'Ventas',
        data: data.map(d => d.ventas),
        backgroundColor: data.map(d =>
          d.ventas >= 4 ? COLORS.success : d.ventas >= 2 ? COLORS.warning : COLORS.errorLight
        ),
        borderRadius: 6,
      }],
    },
    options: {
      ...chartDefaults,
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
      },
    },
  }
})

const hourlyResumen = computed(() => {
  return salesByHour.value.map(d => {
    const h = d.hora
    const ampm = h >= 12 ? 'PM' : 'AM'
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${display} ${ampm}: ${d.ventas} ventas, L ${d.revenue.toFixed(2)}`
  }).join('\n')
})

const paymentConfig = computed<ChartConfiguration<'doughnut'>>(() => {
  const labels: Record<string, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    otro: 'Otro',
  }
  const colors = [COLORS.success, COLORS.primary, COLORS.warning]
  return {
    type: 'doughnut' as const,
    data: {
      labels: salesByPayment.value.map(d => labels[d.payment_method] || d.payment_method),
      datasets: [{
        data: salesByPayment.value.map(d => d.total_revenue),
        backgroundColor: colors.slice(0, salesByPayment.value.length),
        borderWidth: 0,
      }],
    },
    options: {
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: true, position: 'bottom' as const },
      },
      cutout: '65%',
    },
  }
})

const paymentResumen = computed(() => {
  const labels: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', otro: 'Otro' }
  return salesByPayment.value.map(d =>
    `${labels[d.payment_method] || d.payment_method}: ${d.total_sales} ventas, L ${d.total_revenue.toFixed(2)}`
  ).join('\n')
})

const topProductsConfig = computed<ChartConfiguration<'bar'>>(() => {
  return {
    type: 'bar' as const,
    data: {
      labels: topProducts.value.map(p => p.name.length > 18 ? p.name.substring(0, 18) + '\u2026' : p.name),
      datasets: [{
        label: 'Unidades vendidas',
        data: topProducts.value.map(p => p.units_sold),
        backgroundColor: COLORS.primary,
        borderRadius: 6,
      }],
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y' as const,
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
      },
    },
  }
})

const topProductsResumen = computed(() => {
  return topProducts.value.map((p, i) =>
    `${i + 1}. ${p.name}: ${p.units_sold} uds vendidas, precio L ${p.price.toFixed(2)}`
  ).join('\n')
})

const discountImpactConfig = computed<ChartConfiguration<'bar'>>(() => {
  const data = discountImpact.value
  return {
    type: 'bar' as const,
    data: {
      labels: data.map(d => {
        const date = new Date(d.fecha + 'T12:00:00')
        return date.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })
      }),
      datasets: [
        {
          label: 'Ventas con descuento',
          data: data.map(d => d.sales_with_discount),
          backgroundColor: COLORS.purple,
          borderRadius: 6,
        },
        {
          label: 'Ventas sin descuento',
          data: data.map(d => d.total_sales - d.sales_with_discount),
          backgroundColor: COLORS.infoLight,
          borderRadius: 6,
        },
      ],
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: true, position: 'bottom' as const },
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } },
      },
    },
  }
})

const discountResumen = computed(() => {
  const totalSaved = discountImpact.value.reduce((acc, d) => acc + d.total_discount_amount, 0)
  const totalWithDiscount = discountImpact.value.reduce((acc, d) => acc + d.sales_with_discount, 0)
  const totalSalesAll = discountImpact.value.reduce((acc, d) => acc + d.total_sales, 0)
  return `Total ahorrado por clientes: L ${totalSaved.toFixed(2)}\nVentas con descuento: ${totalWithDiscount} de ${totalSalesAll} totales\n` +
    discountImpact.value.map(d =>
      `${d.fecha}: ${d.sales_with_discount}/${d.total_sales} con descuento, ahorro L ${d.total_discount_amount.toFixed(2)}, ${d.discount_percent_of_revenue.toFixed(1)}% de ingresos`
    ).join('\n')
})

const sellerConfig = computed<ChartConfiguration<'bar'>>(() => {
  return {
    type: 'bar' as const,
    data: {
      labels: sellerRankings.value.map(s => s.seller_name.split(' ').slice(0, 2).join(' ')),
      datasets: [
        {
          label: 'Ingresos (L)',
          data: sellerRankings.value.map(s => s.total_revenue),
          backgroundColor: COLORS.primary,
          borderRadius: 6,
        },
      ],
    },
    options: {
      ...chartDefaults,
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v: string | number) => `L ${Number(v).toLocaleString()}` } },
      },
    },
  }
})

const sellerResumen = computed(() => {
  return sellerRankings.value.map((s, i) =>
    `${i + 1}. ${s.seller_name}: ${s.total_sales} ventas, L ${s.total_revenue.toFixed(2)} total, ticket promedio L ${s.avg_ticket.toFixed(2)}`
  ).join('\n')
})

// ==================== IA REPORT ====================

const RANGO_LABELS: Record<string, string> = {
  today: 'hoy',
  week: 'los \u00faltimos 7 d\u00edas',
  month: 'los \u00faltimos 30 d\u00edas',
}

async function generarReporteIA() {
  if (iaReporteGenerando.value) return
  iaReporteGenerando.value = true
  iaReporteError.value = null
  iaReporte.value = null

  const rango = RANGO_LABELS[dateRange.value]
  const prompt = `Genera un reporte ejecutivo completo del negocio para ${rango}. Usa un tono profesional pero accesible (que lo entienda alguien sin experiencia en estad\u00edstica). Moneda: Lempiras hondure\u00f1os (L).

DATOS DEL PER\u00cdODO:
- Ventas totales: ${stats.value.totalSales}
- Ingresos: L ${stats.value.totalRevenue.toFixed(2)}
- ISV recaudado: L ${stats.value.totalTax.toFixed(2)}
- Ticket promedio: L ${stats.value.averageSale.toFixed(2)}

VENTAS POR D\u00cdA:
${dailySalesResumen.value}

HORAS PICO:
${hourlyResumen.value}

M\u00c9TODOS DE PAGO:
${paymentResumen.value}

PRODUCTOS M\u00c1S VENDIDOS:
${topProductsResumen.value}

RANKING VENDEDORES:
${sellerResumen.value}

IMPACTO DESCUENTOS:
${discountResumen.value}

PRODUCTOS CON STOCK BAJO: ${lowStockProducts.value.length > 0 ? lowStockProducts.value.map((p: any) => `${p.name} (${p.stock}/${p.min_stock})`).join(', ') : 'Ninguno'}

FORMATO DEL REPORTE:
1. **Resumen Ejecutivo** (3-4 l\u00edneas)
2. **Tendencias Clave** (usa emojis para hacerlo visual)
3. **Rendimiento de Vendedores** (comparativa breve)
4. **Efectividad de Promociones**
5. **Alertas y Riesgos** (stock bajo, ca\u00eddas de ventas, etc.)
6. **Recomendaciones de Acci\u00f3n** (3-5 acciones concretas con prioridad)

S\u00e9 directo y pr\u00e1ctico. Cada secci\u00f3n m\u00e1ximo 4-5 l\u00edneas.`

  try {
    const response = await enviarMensajeIA({ mensaje: prompt })
    iaReporte.value = response.message
  } catch {
    iaReporteError.value = 'No se pudo generar el reporte. Intent\u00e1 de nuevo.'
  } finally {
    iaReporteGenerando.value = false
  }
}

// ==================== IA CUSTOM ANALYSIS ====================

async function generarGraficaIA() {
  if (iaCustomGenerando.value || !iaCustomInput.value.trim()) return
  iaCustomGenerando.value = true
  iaCustomError.value = null
  iaCustomChart.value = null

  const prompt = `El usuario quiere un an\u00e1lisis personalizado de su punto de venta: "${iaCustomInput.value}"

CONTEXTO DEL NEGOCIO (moneda: Lempiras HNL):
- Ventas del per\u00edodo: ${stats.value.totalSales}, Ingresos: L ${stats.value.totalRevenue.toFixed(2)}, Ticket promedio: L ${stats.value.averageSale.toFixed(2)}

VENTAS DIARIAS:
${dailySalesResumen.value}

HORAS PICO:
${hourlyResumen.value}

PRODUCTOS M\u00c1S VENDIDOS:
${topProductsResumen.value}

RANKING VENDEDORES:
${sellerResumen.value}

DESCUENTOS:
${discountResumen.value}

Responde de forma clara y simple. Si el usuario pide una tabla, formatea con Markdown. Si pide un an\u00e1lisis, explica sin tecnicismos como si hablaras con un due\u00f1o de pulper\u00eda. Usa emojis para hacerlo visual. S\u00e9 conciso (m\u00e1x 10-12 l\u00edneas).`

  try {
    const response = await enviarMensajeIA({ mensaje: prompt })
    iaCustomChart.value = response.message
  } catch {
    iaCustomError.value = 'No se pudo procesar la solicitud. Intent\u00e1 de nuevo.'
  } finally {
    iaCustomGenerando.value = false
  }
}

// ==================== HELPERS ====================

function renderBold(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
}

function parsearTextoIA(texto: string): Array<{ tipo: 'bullet' | 'heading' | 'texto'; valor: string }> {
  const lineas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  return lineas.map(linea => {
    const headingMatch = linea.match(/^#{1,3}\s+(.+)$/) || linea.match(/^\*\*(.+?)\*\*$/)
    if (headingMatch) {
      return { tipo: 'heading' as const, valor: headingMatch[1] }
    }
    if (/^[-*\u2022\u2013]\s+/.test(linea) || /^\d+[.)-]\s+/.test(linea)) {
      const clean = linea.replace(/^[-*\u2022\u2013\d.)-]\s*/, '')
      return { tipo: 'bullet' as const, valor: clean }
    }
    return { tipo: 'texto' as const, valor: linea }
  })
}
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <!-- Header con rango y tabs -->
    <v-row class="mb-5">
      <v-col cols="12">
        <v-card class="neo-animate-in">
          <v-card-text class="pa-5">
            <div class="d-flex align-center flex-wrap" style="gap: 12px;">
              <div class="neo-circle-sm mr-2" style="background: linear-gradient(135deg, #42A5F5, #64B5F6);">
                <v-icon color="white" size="20">mdi-chart-bar</v-icon>
              </div>
              <span class="text-h6 font-weight-bold mr-4">Reportes</span>

              <!-- Rango -->
              <div class="neo-tab-group d-flex">
                <button
                  :class="['neo-tab-btn', { 'neo-tab-btn-active': dateRange === 'today' }]"
                  @click="changeRange('today')"
                >Hoy</button>
                <button
                  :class="['neo-tab-btn', { 'neo-tab-btn-active': dateRange === 'week' }]"
                  @click="changeRange('week')"
                >7 d&iacute;as</button>
                <button
                  :class="['neo-tab-btn', { 'neo-tab-btn-active': dateRange === 'month' }]"
                  @click="changeRange('month')"
                >30 d&iacute;as</button>
              </div>

              <v-spacer />

              <!-- Tabs de secci&oacute;n -->
              <div class="neo-tab-group d-flex">
                <button
                  :class="['neo-tab-btn', { 'neo-tab-btn-active': activeTab === 'general' }]"
                  @click="activeTab = 'general'"
                >
                  <v-icon start size="14">mdi-chart-line</v-icon> General
                </button>
                <button
                  :class="['neo-tab-btn', { 'neo-tab-btn-active': activeTab === 'vendedores' }]"
                  @click="activeTab = 'vendedores'"
                >
                  <v-icon start size="14">mdi-account-group</v-icon> Vendedores
                </button>
                <button
                  :class="['neo-tab-btn', { 'neo-tab-btn-active': activeTab === 'promociones' }]"
                  @click="activeTab = 'promociones'"
                >
                  <v-icon start size="14">mdi-tag-multiple</v-icon> Promociones
                </button>
                <button
                  :class="['neo-tab-btn', { 'neo-tab-btn-active': activeTab === 'ia' }]"
                  @click="activeTab = 'ia'"
                >
                  <v-icon start size="14">mdi-robot</v-icon> IA
                </button>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- KPI Cards -->
    <v-row class="mb-5">
      <v-col cols="6" sm="6" md="3">
        <div class="neo-stat-card neo-animate-in">
          <div class="neo-stat-icon">
            <v-icon color="primary" size="24">mdi-cart</v-icon>
          </div>
          <h3 class="text-h4 font-weight-bold mt-2">{{ stats.totalSales }}</h3>
          <p class="text-body-2 text-medium-emphasis">Ventas</p>
          <div class="neo-stat-bar" style="--bar-color: #4A7BF7;"></div>
        </div>
      </v-col>
      <v-col cols="6" sm="6" md="3">
        <div class="neo-stat-card neo-animate-in">
          <div class="neo-stat-icon">
            <v-icon color="success" size="24">mdi-cash-multiple</v-icon>
          </div>
          <h3 class="text-h4 font-weight-bold mt-2">L {{ stats.totalRevenue.toFixed(2) }}</h3>
          <p class="text-body-2 text-medium-emphasis">Ingresos</p>
          <div class="neo-stat-bar" style="--bar-color: #66BB6A;"></div>
        </div>
      </v-col>
      <v-col cols="6" sm="6" md="3">
        <div class="neo-stat-card neo-animate-in">
          <div class="neo-stat-icon">
            <v-icon color="info" size="24">mdi-percent</v-icon>
          </div>
          <h3 class="text-h4 font-weight-bold mt-2">L {{ stats.totalTax.toFixed(2) }}</h3>
          <p class="text-body-2 text-medium-emphasis">ISV</p>
          <div class="neo-stat-bar" style="--bar-color: #42A5F5;"></div>
        </div>
      </v-col>
      <v-col cols="6" sm="6" md="3">
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

    <!-- ===================== TAB: GENERAL ===================== -->
    <template v-if="activeTab === 'general'">
      <v-row class="mb-5">
        <!-- Ventas diarias (l&iacute;nea) -->
        <v-col cols="12" md="8">
          <GraficaConIA
            titulo="Tendencia de Ventas"
            icono="mdi-chart-line"
            :icon-color="COLORS.primary"
            :config="(dailySalesConfig as any)"
            :datos-resumen="dailySalesResumen"
          />
        </v-col>
        <!-- M&eacute;todos de pago (dona) -->
        <v-col cols="12" md="4">
          <GraficaConIA
            titulo="M&eacute;todos de Pago"
            icono="mdi-credit-card-outline"
            :icon-color="COLORS.success"
            :config="(paymentConfig as any)"
            :datos-resumen="paymentResumen"
          />
        </v-col>
      </v-row>

      <v-row class="mb-5">
        <!-- Horas pico (barras) -->
        <v-col cols="12" md="6">
          <GraficaConIA
            titulo="Ventas por Hora"
            icono="mdi-clock-outline"
            :icon-color="COLORS.warning"
            :config="(hourlyConfig as any)"
            :datos-resumen="hourlyResumen"
          />
        </v-col>
        <!-- Top productos (barras horizontales) -->
        <v-col cols="12" md="6">
          <GraficaConIA
            titulo="Productos M&aacute;s Vendidos"
            icono="mdi-trophy"
            :icon-color="COLORS.success"
            :config="(topProductsConfig as any)"
            :datos-resumen="topProductsResumen"
          />
        </v-col>
      </v-row>

      <!-- Stock bajo y tabla diaria -->
      <v-row class="mb-5">
        <v-col cols="12" md="4">
          <v-card class="neo-animate-in">
            <v-card-text class="pa-5">
              <div class="d-flex align-center mb-4">
                <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #FFA726, #FFB74D);">
                  <v-icon color="white" size="18">mdi-alert</v-icon>
                </div>
                <h3 class="text-subtitle-1 font-weight-bold">Stock Bajo</h3>
                <v-spacer />
                <v-chip size="small" :color="lowStockProducts.length > 0 ? 'warning' : 'success'" variant="tonal">
                  {{ lowStockProducts.length }}
                </v-chip>
              </div>

              <v-list v-if="lowStockProducts.length > 0" density="compact" class="bg-transparent">
                <v-list-item
                  v-for="product in lowStockProducts.slice(0, 8)"
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
              <div v-else class="text-center py-4">
                <v-icon size="32" color="success">mdi-check-circle</v-icon>
                <p class="text-body-2 text-medium-emphasis mt-2 mb-0">Todos con stock suficiente</p>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="8">
          <v-card class="neo-animate-in">
            <v-card-text class="pa-5">
              <div class="d-flex align-center mb-4">
                <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #66BB6A, #81C784);">
                  <v-icon color="white" size="18">mdi-table</v-icon>
                </div>
                <h3 class="text-subtitle-1 font-weight-bold">Detalle Diario</h3>
              </div>

              <v-table v-if="dailySales.length > 0" class="neo-table" density="compact">
                <thead>
                  <tr>
                    <th class="text-left">Fecha</th>
                    <th class="text-center">Ventas</th>
                    <th class="text-end">Ingresos</th>
                    <th class="text-end">Ticket Prom.</th>
                    <th class="text-end">ISV</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="day in dailySales.slice().reverse().slice(0, 14)" :key="day.fecha">
                    <td class="text-body-2">
                      {{ new Date(day.fecha + 'T12:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', weekday: 'short' }) }}
                    </td>
                    <td class="text-center">{{ day.total_sales }}</td>
                    <td class="text-end font-weight-bold text-primary">L {{ day.total_revenue.toFixed(2) }}</td>
                    <td class="text-end">L {{ day.avg_ticket.toFixed(2) }}</td>
                    <td class="text-end text-medium-emphasis">L {{ day.total_tax.toFixed(2) }}</td>
                  </tr>
                </tbody>
              </v-table>
              <v-alert v-else type="info" density="compact">No hay datos para el per&iacute;odo</v-alert>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- ===================== TAB: VENDEDORES ===================== -->
    <template v-if="activeTab === 'vendedores'">
      <v-row class="mb-5">
        <v-col cols="12" md="7">
          <GraficaConIA
            titulo="Ingresos por Vendedor"
            icono="mdi-account-cash"
            :icon-color="COLORS.primary"
            :config="(sellerConfig as any)"
            :datos-resumen="sellerResumen"
          />
        </v-col>
        <v-col cols="12" md="5">
          <v-card class="neo-animate-in">
            <v-card-text class="pa-5">
              <div class="d-flex align-center mb-4">
                <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #AB47BC, #CE93D8);">
                  <v-icon color="white" size="18">mdi-podium</v-icon>
                </div>
                <h3 class="text-subtitle-1 font-weight-bold">Ranking Vendedores</h3>
              </div>

              <v-list v-if="sellerRankings.length > 0" density="compact" class="bg-transparent">
                <v-list-item
                  v-for="(seller, idx) in sellerRankings"
                  :key="seller.seller_id"
                  rounded="lg"
                  class="mb-2"
                >
                  <template #prepend>
                    <v-avatar
                      size="32"
                      :color="idx === 0 ? 'amber' : idx === 1 ? 'grey-lighten-1' : idx === 2 ? 'brown-lighten-2' : 'primary'"
                      class="mr-3"
                    >
                      <span class="text-white font-weight-bold text-caption">{{ idx + 1 }}</span>
                    </v-avatar>
                  </template>
                  <v-list-item-title class="text-body-2 font-weight-medium">
                    {{ seller.seller_name }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="text-caption">
                    {{ seller.total_sales }} ventas &middot; Ticket L {{ seller.avg_ticket.toFixed(2) }}
                  </v-list-item-subtitle>
                  <template #append>
                    <span class="text-body-2 font-weight-bold text-primary">
                      L {{ seller.total_revenue.toFixed(2) }}
                    </span>
                  </template>
                </v-list-item>
              </v-list>
              <div v-else class="text-center py-6">
                <v-icon size="36" color="grey-lighten-1">mdi-account-off</v-icon>
                <p class="text-body-2 text-medium-emphasis mt-2 mb-0">Sin datos de vendedores</p>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Tabla comparativa vendedores -->
      <v-row class="mb-5" v-if="sellerRankings.length > 0">
        <v-col cols="12">
          <v-card class="neo-animate-in">
            <v-card-text class="pa-5">
              <div class="d-flex align-center mb-4">
                <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #42A5F5, #64B5F6);">
                  <v-icon color="white" size="18">mdi-table-account</v-icon>
                </div>
                <h3 class="text-subtitle-1 font-weight-bold">Comparativa Detallada</h3>
              </div>

              <v-table class="neo-table" density="compact">
                <thead>
                  <tr>
                    <th class="text-left">#</th>
                    <th class="text-left">Vendedor</th>
                    <th class="text-center">Ventas</th>
                    <th class="text-end">Ingresos</th>
                    <th class="text-end">Ticket Promedio</th>
                    <th class="text-end">&Uacute;ltima Venta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(seller, idx) in sellerRankings" :key="seller.seller_id">
                    <td>
                      <v-chip
                        size="x-small"
                        :color="idx === 0 ? 'amber' : idx === 1 ? 'grey' : idx === 2 ? 'brown' : 'default'"
                        variant="tonal"
                      >{{ idx + 1 }}</v-chip>
                    </td>
                    <td class="font-weight-medium">{{ seller.seller_name }}</td>
                    <td class="text-center">{{ seller.total_sales }}</td>
                    <td class="text-end font-weight-bold text-primary">L {{ seller.total_revenue.toFixed(2) }}</td>
                    <td class="text-end">L {{ seller.avg_ticket.toFixed(2) }}</td>
                    <td class="text-end text-caption text-medium-emphasis">
                      {{ seller.last_sale_at ? new Date(seller.last_sale_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '\u2014' }}
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- ===================== TAB: PROMOCIONES ===================== -->
    <template v-if="activeTab === 'promociones'">
      <v-row class="mb-5">
        <v-col cols="12" md="8">
          <GraficaConIA
            titulo="Impacto de Descuentos por D&iacute;a"
            icono="mdi-tag-multiple"
            :icon-color="COLORS.purple"
            :config="(discountImpactConfig as any)"
            :datos-resumen="discountResumen"
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-card class="neo-animate-in">
            <v-card-text class="pa-5">
              <div class="d-flex align-center mb-4">
                <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #EF5350, #EF9A9A);">
                  <v-icon color="white" size="18">mdi-sale</v-icon>
                </div>
                <h3 class="text-subtitle-1 font-weight-bold">Resumen Promociones</h3>
              </div>

              <div class="mb-4">
                <div class="d-flex justify-space-between mb-1">
                  <span class="text-body-2 text-medium-emphasis">Total ahorrado</span>
                  <span class="text-body-2 font-weight-bold text-primary">
                    L {{ discountImpact.reduce((acc, d) => acc + d.total_discount_amount, 0).toFixed(2) }}
                  </span>
                </div>
                <div class="d-flex justify-space-between mb-1">
                  <span class="text-body-2 text-medium-emphasis">Ventas con descuento</span>
                  <span class="text-body-2 font-weight-bold">
                    {{ discountImpact.reduce((acc, d) => acc + d.sales_with_discount, 0) }}
                  </span>
                </div>
                <div class="d-flex justify-space-between mb-1">
                  <span class="text-body-2 text-medium-emphasis">% Ingresos en descuento</span>
                  <span class="text-body-2 font-weight-bold">
                    {{
                      (() => {
                        const totalRev = discountImpact.reduce((a, d) => a + d.total_revenue, 0)
                        const totalDisc = discountImpact.reduce((a, d) => a + d.total_discount_amount, 0)
                        return totalRev > 0 ? ((totalDisc / totalRev) * 100).toFixed(1) : '0.0'
                      })()
                    }}%
                  </span>
                </div>
              </div>

              <!-- &Uacute;ltimas aplicaciones -->
              <h4 class="text-caption font-weight-bold text-medium-emphasis mb-2">&Uacute;ltimas Aplicaciones</h4>
              <v-list v-if="discountApplications.length > 0" density="compact" class="bg-transparent">
                <v-list-item
                  v-for="app in discountApplications.slice(0, 5)"
                  :key="app.id"
                  rounded="lg"
                  class="mb-1"
                >
                  <v-list-item-title class="text-caption">
                    {{ app.discounts?.name || app.combos?.name || 'Descuento manual' }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="text-caption">
                    {{ app.sales?.sale_number }} &middot; {{ app.sales?.created_at ? new Date(app.sales.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '' }}
                  </v-list-item-subtitle>
                  <template #append>
                    <v-chip size="x-small" color="success" variant="tonal">
                      -L {{ app.amount_saved?.toFixed(2) }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
              <p v-else class="text-caption text-medium-emphasis text-center py-3 mb-0">
                Sin aplicaciones de descuento registradas
              </p>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- ===================== TAB: IA ===================== -->
    <template v-if="activeTab === 'ia'">
      <v-row class="mb-5">
        <!-- Reporte IA completo -->
        <v-col cols="12">
          <v-card class="neo-animate-in">
            <v-card-text class="pa-5">
              <div class="d-flex align-center mb-4">
                <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
                  <v-icon color="white" size="20">mdi-file-document-edit</v-icon>
                </div>
                <div>
                  <h3 class="text-subtitle-1 font-weight-bold mb-0">Reporte Ejecutivo IA</h3>
                  <p class="text-caption text-medium-emphasis mb-0">An&aacute;lisis completo generado por inteligencia artificial</p>
                </div>
                <v-spacer />
                <v-btn
                  color="primary"
                  variant="elevated"
                  :loading="iaReporteGenerando"
                  @click="generarReporteIA"
                >
                  <v-icon start>mdi-sparkles</v-icon>
                  Generar Reporte
                </v-btn>
              </div>

              <!-- Resultado -->
              <div v-if="iaReporte" class="neo-card-pressed pa-5">
                <div
                  v-for="(linea, i) in parsearTextoIA(iaReporte)"
                  :key="i"
                  :class="{ 'mb-1': linea.tipo !== 'heading', 'mt-4 mb-2': linea.tipo === 'heading' }"
                >
                  <h4 v-if="linea.tipo === 'heading'" class="text-subtitle-2 font-weight-bold text-primary" v-html="renderBold(linea.valor)" />
                  <div v-else-if="linea.tipo === 'bullet'" class="d-flex align-start">
                    <v-icon size="14" color="primary" class="mt-1 mr-2 flex-shrink-0">mdi-circle-small</v-icon>
                    <span class="text-body-2" v-html="renderBold(linea.valor)" />
                  </div>
                  <p v-else class="text-body-2 mb-0" v-html="renderBold(linea.valor)" />
                </div>
              </div>

              <v-alert v-else-if="iaReporteError" type="error" density="compact">
                {{ iaReporteError }}
              </v-alert>

              <div v-else class="text-center py-8">
                <v-icon size="48" color="grey-lighten-1" class="mb-3">mdi-chart-areaspline</v-icon>
                <p class="text-body-1 text-medium-emphasis mb-1">Genera un reporte ejecutivo completo</p>
                <p class="text-caption text-medium-emphasis mb-0">
                  La IA analizar&aacute; todas las m&eacute;tricas del per&iacute;odo y generar&aacute; un informe con
                  tendencias, comparativas de vendedores, efectividad de promociones y recomendaciones.
                </p>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- An&aacute;lisis personalizado -->
      <v-row class="mb-5">
        <v-col cols="12">
          <v-card class="neo-animate-in">
            <v-card-text class="pa-5">
              <div class="d-flex align-center mb-4">
                <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #66BB6A, #81C784);">
                  <v-icon color="white" size="20">mdi-chat-question</v-icon>
                </div>
                <div>
                  <h3 class="text-subtitle-1 font-weight-bold mb-0">An&aacute;lisis Personalizado</h3>
                  <p class="text-caption text-medium-emphasis mb-0">Pregunt&aacute; lo que quieras sobre tus datos de ventas</p>
                </div>
              </div>

              <div class="d-flex align-center mb-4" style="gap: 8px;">
                <v-text-field
                  v-model="iaCustomInput"
                  placeholder="Ej: &iquest;Cu&aacute;l es mi mejor d&iacute;a de la semana? &iquest;Deber&iacute;a contratar m&aacute;s personal?"
                  variant="solo"
                  density="compact"
                  rounded="lg"
                  hide-details
                  class="neo-input-field"
                  @keyup.enter="generarGraficaIA"
                />
                <v-btn
                  color="primary"
                  :loading="iaCustomGenerando"
                  :disabled="!iaCustomInput.trim()"
                  @click="generarGraficaIA"
                  icon
                >
                  <v-icon>mdi-send</v-icon>
                </v-btn>
              </div>

              <!-- Sugerencias r&aacute;pidas -->
              <div class="d-flex flex-wrap mb-4" style="gap: 6px;">
                <v-chip
                  v-for="sugerencia in [
                    '\u00bfCu\u00e1l es mi mejor hora para vender?',
                    '\u00bfDeber\u00eda hacer m\u00e1s promociones?',
                    'Compara el rendimiento de mis vendedores',
                    '\u00bfQu\u00e9 producto debo reponer primero?',
                    '\u00bfC\u00f3mo puedo subir mi ticket promedio?'
                  ]"
                  :key="sugerencia"
                  size="small"
                  variant="outlined"
                  color="primary"
                  class="cursor-pointer"
                  @click="iaCustomInput = sugerencia; generarGraficaIA()"
                >
                  {{ sugerencia }}
                </v-chip>
              </div>

              <!-- Resultado -->
              <div v-if="iaCustomChart" class="neo-card-pressed pa-4">
                <div
                  v-for="(linea, i) in parsearTextoIA(iaCustomChart)"
                  :key="i"
                  :class="{ 'mb-1': linea.tipo !== 'heading', 'mt-3 mb-2': linea.tipo === 'heading' }"
                >
                  <h4 v-if="linea.tipo === 'heading'" class="text-subtitle-2 font-weight-bold text-primary" v-html="renderBold(linea.valor)" />
                  <div v-else-if="linea.tipo === 'bullet'" class="d-flex align-start">
                    <v-icon size="14" color="primary" class="mt-1 mr-2 flex-shrink-0">mdi-circle-small</v-icon>
                    <span class="text-body-2" v-html="renderBold(linea.valor)" />
                  </div>
                  <p v-else class="text-body-2 mb-0" v-html="renderBold(linea.valor)" />
                </div>
              </div>

              <v-alert v-else-if="iaCustomError" type="error" density="compact">
                {{ iaCustomError }}
              </v-alert>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Loading overlay -->
    <v-overlay :model-value="loading" class="align-center justify-center" persistent>
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
  flex-wrap: wrap;
}

.neo-tab-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: var(--neo-transition);
  color: inherit;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
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

.neo-input-field :deep(.v-field) {
  box-shadow: var(--neo-pressed-sm);
  background-color: var(--neo-bg) !important;
}

.cursor-pointer {
  cursor: pointer;
}
</style>
