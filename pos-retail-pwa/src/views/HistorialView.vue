<script setup lang="ts">
import { ref, shallowRef, triggerRef, onMounted, computed } from 'vue'
import { fetchSalesHistory } from '@/services/database'
import type { SaleItem } from '@/types/supabase'
import type { SaleHistoryItem } from '@/services/database'
import FacturaRecibo from '@/components/pos/FacturaRecibo.vue'
import type { FacturaData } from '@/components/pos/FacturaRecibo.vue'

const sales = shallowRef<SaleHistoryItem[]>([])
const loading = ref(false)
const selectedSale = shallowRef<SaleHistoryItem | null>(null)
const showDetails = ref(false)

// Factura
const showFactura = ref(false)
const facturaData = ref<FacturaData | null>(null)

// Filtros
const dateFrom = ref('')
const dateTo = ref('')
const searchQuery = ref('')

onMounted(async () => {
  await loadSales()
})

async function loadSales() {
  loading.value = true
  try {
    sales.value = await fetchSalesHistory(
      dateFrom.value || undefined,
      dateTo.value || undefined,
      200
    )
    triggerRef(sales)
  } catch (err) {
    console.error('Error cargando ventas:', err)
  } finally {
    loading.value = false
  }
}

// Filtrar ventas por búsqueda
const filteredSales = computed((): SaleHistoryItem[] => {
  const all = sales.value
  if (!searchQuery.value.trim()) return all
  const q = searchQuery.value.toLowerCase()
  return all.filter(s =>
    s.sale_number.toLowerCase().includes(q) ||
    (s.seller_name && s.seller_name.toLowerCase().includes(q)) ||
    (s.seller_email && s.seller_email.toLowerCase().includes(q)) ||
    s.payment_method.toLowerCase().includes(q) ||
    s.total.toFixed(2).includes(q)
  )
})

// Estadísticas rápidas
const statsToday = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  const todaySales = sales.value.filter(s =>
    s.created_at && s.created_at.startsWith(today) && s.status === 'completed'
  )
  return {
    count: todaySales.length,
    total: todaySales.reduce((sum, s) => sum + s.total, 0),
  }
})

function viewDetails(sale: unknown) {
  const resolvedSale =
    sale && typeof sale === 'object' && 'raw' in sale
      ? (sale as { raw: SaleHistoryItem }).raw
      : (sale as SaleHistoryItem)

  selectedSale.value = resolvedSale
  showDetails.value = true
}

/** Parsear datos extra guardados en notes (JSON) */
function parseNotesExtra(notes: string | null): {
  customer_name?: string | null
  customer_rtn?: string | null
  monto_recibido?: number | null
  cambio?: number | null
} {
  if (!notes) return {}
  try {
    return JSON.parse(notes)
  } catch {
    return {}
  }
}

/** Reconstruir FacturaData desde un registro de venta del historial */
function buildFacturaData(sale: SaleHistoryItem): FacturaData {
  const items = Array.isArray(sale.items) ? (sale.items as unknown as SaleItem[]) : []
  const extra = parseNotesExtra(sale.notes)

  return {
    saleNumber: sale.sale_number,
    saleId: sale.id,
    fecha: new Date(sale.created_at || Date.now()),
    items,
    subtotal: sale.subtotal || 0,
    taxAmount: sale.tax_amount || 0,
    discount: sale.discount || 0,
    total: sale.total,
    paymentMethod: (sale.payment_method as 'efectivo' | 'tarjeta' | 'otro') || 'otro',
    montoRecibido: extra.monto_recibido ?? undefined,
    cambio: extra.cambio ?? undefined,
    sellerName: sale.seller_name || 'Vendedor',
    customerName: extra.customer_name ?? undefined,
    customerRtn: extra.customer_rtn ?? undefined,
  }
}

/** Abrir factura desde el diálogo de detalles */
function openFacturaFromDetails() {
  if (!selectedSale.value) return
  facturaData.value = buildFacturaData(selectedSale.value)
  showDetails.value = false
  showFactura.value = true
}

/** Abrir factura directamente desde la tabla */
function openFacturaFromTable(sale: unknown) {
  const resolvedSale =
    sale && typeof sale === 'object' && 'raw' in sale
      ? (sale as { raw: SaleHistoryItem }).raw
      : (sale as SaleHistoryItem)

  facturaData.value = buildFacturaData(resolvedSale)
  showFactura.value = true
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('es-HN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function getStatusColor(status: string | null): string {
  switch (status) {
    case 'completed': return 'success'
    case 'pending': return 'warning'
    case 'refunded': return 'error'
    default: return 'grey'
  }
}

function getStatusLabel(status: string | null): string {
  switch (status) {
    case 'completed': return 'Completado'
    case 'pending': return 'Pendiente'
    case 'refunded': return 'Reembolsado'
    case 'cancelled': return 'Cancelado'
    default: return status || 'Desconocido'
  }
}

function getPaymentIcon(method: string): string {
  switch (method) {
    case 'efectivo': return 'mdi-cash'
    case 'tarjeta': return 'mdi-credit-card'
    default: return 'mdi-help-circle'
  }
}

function getPaymentLabel(method: string): string {
  switch (method) {
    case 'efectivo': return 'Efectivo'
    case 'tarjeta': return 'Tarjeta'
    default: return method || 'Otro'
  }
}

const saleItems = computed(() => {
  const items = selectedSale.value?.items
  return Array.isArray(items) ? (items as unknown as SaleItem[]) : []
})
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <!-- Estadísticas rápidas -->
    <v-row class="mb-4">
      <v-col cols="12" sm="6" md="3">
        <v-card class="neo-card pa-4">
          <div class="d-flex align-center">
            <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #66BB6A, #A5D6A7);">
              <v-icon color="white" size="20">mdi-cash-register</v-icon>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis">Ventas Hoy</div>
              <div class="text-h6 font-weight-bold">{{ statsToday.count }}</div>
            </div>
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="neo-card pa-4">
          <div class="d-flex align-center">
            <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #42A5F5, #90CAF9);">
              <v-icon color="white" size="20">mdi-currency-usd</v-icon>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis">Total Hoy</div>
              <div class="text-h6 font-weight-bold text-primary">L {{ statsToday.total.toFixed(2) }}</div>
            </div>
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="neo-card pa-4">
          <div class="d-flex align-center">
        <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #FFA726, #FFB74D);">
          <v-icon color="white" size="20">mdi-cash-multiple</v-icon>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Ticket Promedio Hoy</div>
          <div class="text-h6 font-weight-bold text-warning">L {{ (statsToday.count > 0 ? statsToday.total / statsToday.count : 0).toFixed(2) }}</div>
        </div>
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="neo-card pa-4">
          <div class="d-flex align-center">
            <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #AB47BC, #CE93D8);">
              <v-icon color="white" size="20">mdi-receipt-text-outline</v-icon>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis">Total Ventas</div>
              <div class="text-h6 font-weight-bold">{{ sales.length }}</div>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="neo-animate-in">
      <v-card-text class="pa-5">
        <!-- Header -->
        <div class="d-flex align-center mb-5">
          <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #AB47BC, #CE93D8);">
            <v-icon color="white" size="20">mdi-history</v-icon>
          </div>
          <h2 class="text-h6 font-weight-bold">Historial de Ventas</h2>
          <v-spacer />
          <v-btn color="primary" variant="outlined" @click="loadSales">
            <v-icon start>mdi-refresh</v-icon>
            Actualizar
          </v-btn>
        </div>

        <!-- Filtros -->
        <v-row class="mb-4">
          <v-col cols="12" sm="3">
            <v-text-field
              v-model="searchQuery"
              label="Buscar venta..."
              prepend-inner-icon="mdi-magnify"
              clearable
              hide-details
              density="compact"
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field
              v-model="dateFrom"
              label="Desde"
              type="date"
              hide-details
              density="compact"
              @change="loadSales"
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field
              v-model="dateTo"
              label="Hasta"
              type="date"
              hide-details
              density="compact"
              @change="loadSales"
            />
          </v-col>
          <v-col cols="12" sm="3" class="d-flex align-center">
            <v-btn
              variant="text"
              color="secondary"
              size="small"
              @click="dateFrom = ''; dateTo = ''; searchQuery = ''; loadSales()"
            >
              <v-icon start>mdi-filter-remove</v-icon>
              Limpiar
            </v-btn>
          </v-col>
        </v-row>

        <!-- Tabla de ventas -->
        <v-data-table
          :headers="[
            { title: 'No. Venta', key: 'sale_number' },
            { title: 'Fecha', key: 'created_at' },
            { title: 'Vendedor', key: 'seller_name' },
            { title: 'Total', key: 'total', align: 'end' },
            { title: 'Método', key: 'payment_method', align: 'center' },
            { title: 'Estado', key: 'status', align: 'center' },
            { title: 'Acciones', key: 'actions', align: 'center', sortable: false }
          ]"
          :items="filteredSales"
          :loading="loading"
          item-value="id"
          items-per-page="15"
          hover
        >
          <template #item.sale_number="{ item }">
            <span class="text-body-2 font-weight-medium">{{ item.sale_number }}</span>
          </template>

          <template #item.created_at="{ item }">
            <span class="text-body-2">{{ formatDate(item.created_at) }}</span>
          </template>

          <template #item.seller_name="{ item }">
            <div>
              <span class="text-body-2">{{ item.seller_name || 'Sin nombre' }}</span>
              <br>
              <span class="text-caption text-medium-emphasis">{{ item.seller_email || '' }}</span>
            </div>
          </template>

          <template #item.total="{ item }">
            <span class="font-weight-bold text-primary">L {{ item.total.toFixed(2) }}</span>
          </template>

          <template #item.payment_method="{ item }">
            <v-chip variant="tonal" size="small">
              <v-icon start size="16">{{ getPaymentIcon(item.payment_method) }}</v-icon>
              {{ getPaymentLabel(item.payment_method) }}
            </v-chip>
          </template>

          <template #item.status="{ item }">
            <v-chip :color="getStatusColor(item.status)" size="small" variant="tonal">
              {{ getStatusLabel(item.status) }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex justify-center ga-1">
              <v-tooltip text="Ver detalles" location="top">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon size="small" variant="text" @click="viewDetails(item)">
                    <v-icon size="18">mdi-eye-outline</v-icon>
                  </v-btn>
                </template>
              </v-tooltip>
              <v-tooltip text="Ver factura" location="top">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon size="small" variant="text" color="primary" @click="openFacturaFromTable(item)">
                    <v-icon size="18">mdi-receipt-text</v-icon>
                  </v-btn>
                </template>
              </v-tooltip>
            </div>
          </template>

          <template #no-data>
            <div class="text-center pa-8">
              <v-icon size="64" color="grey-lighten-1">mdi-receipt-text-clock-outline</v-icon>
              <p class="text-body-1 text-medium-emphasis mt-4">No se encontraron ventas</p>
              <p class="text-caption text-medium-emphasis">Ajusta los filtros o realiza una nueva venta</p>
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <!-- Diálogo de detalles -->
    <v-dialog v-model="showDetails" max-width="600">
      <v-card v-if="selectedSale">
        <div class="pa-6 text-center">
          <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #AB47BC, #CE93D8);">
            <v-icon color="white" size="28">mdi-receipt-text</v-icon>
          </div>
          <h3 class="text-h6 font-weight-bold">{{ selectedSale.sale_number }}</h3>
          <p class="text-caption text-medium-emphasis">{{ formatDate(selectedSale.created_at) }}</p>
        </div>

        <v-card-text class="px-6 pb-2">
          <div class="d-flex justify-space-between mb-3">
            <v-chip :color="getStatusColor(selectedSale.status)" size="small" variant="tonal">
              {{ getStatusLabel(selectedSale.status) }}
            </v-chip>
            <v-chip variant="tonal" size="small">
              <v-icon start size="16">{{ getPaymentIcon(selectedSale.payment_method) }}</v-icon>
              {{ getPaymentLabel(selectedSale.payment_method) }}
            </v-chip>
          </div>

          <!-- Info vendedor -->
          <div v-if="selectedSale.seller_name" class="d-flex align-center mb-3">
            <v-icon size="16" class="mr-2" color="grey">mdi-account</v-icon>
            <span class="text-body-2">{{ selectedSale.seller_name }}</span>
            <span v-if="selectedSale.seller_email" class="text-caption text-medium-emphasis ml-2">({{ selectedSale.seller_email }})</span>
          </div>

          <div class="neo-divider" />

          <h4 class="text-subtitle-2 font-weight-bold mb-3">Productos</h4>
          <div class="neo-card-pressed pa-3 mb-4">
            <div v-for="(item, i) in saleItems" :key="i" class="d-flex justify-space-between py-1">
              <div>
                <span class="text-body-2">{{ item.name }}</span>
                <br>
                <span class="text-caption text-medium-emphasis">
                  {{ item.quantity }} x L {{ item.unit_price.toFixed(2) }}
                </span>
              </div>
              <span class="text-body-2 font-weight-bold">L {{ item.subtotal.toFixed(2) }}</span>
            </div>
            <div v-if="saleItems.length === 0" class="text-center text-caption text-medium-emphasis pa-2">
              Sin detalle de productos disponible
            </div>
          </div>

          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span class="text-medium-emphasis">Subtotal:</span>
            <span>L {{ (selectedSale.subtotal || 0).toFixed(2) }}</span>
          </div>
          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span class="text-medium-emphasis">ISV (15%):</span>
            <span>L {{ (selectedSale.tax_amount || 0).toFixed(2) }}</span>
          </div>
          <div v-if="selectedSale.discount" class="d-flex justify-space-between text-body-2 mb-1">
            <span class="text-medium-emphasis">Descuento:</span>
            <span class="text-error">-L {{ selectedSale.discount.toFixed(2) }}</span>
          </div>
          <div class="neo-divider" />
          <div class="d-flex justify-space-between text-h6 font-weight-bold">
            <span>Total:</span>
            <span class="text-primary">L {{ selectedSale.total.toFixed(2) }}</span>
          </div>
        </v-card-text>

        <v-card-actions class="pa-6 pt-3">
          <v-btn variant="text" @click="showDetails = false">Cerrar</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" prepend-icon="mdi-receipt-text" @click="openFacturaFromDetails">
            Ver Factura
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Factura/Recibo -->
    <FacturaRecibo
      v-if="facturaData"
      :data="facturaData"
      :show="showFactura"
      @update:show="showFactura = $event"
      @close="facturaData = null"
    />
  </v-container>
</template>
