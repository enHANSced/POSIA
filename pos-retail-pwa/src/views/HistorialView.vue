<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { fetchSalesHistory } from '@/services/database'
import type { Sale, SaleItem } from '@/types/supabase'

const sales = ref<Sale[]>([])
const loading = ref(false)
const selectedSale = ref<Sale | null>(null)
const showDetails = ref(false)

// Filtros
const dateFrom = ref('')
const dateTo = ref('')

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
  } catch (err) {
    console.error('Error cargando ventas:', err)
  } finally {
    loading.value = false
  }
}

function viewDetails(sale: Sale) {
  selectedSale.value = sale
  showDetails.value = true
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
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

function getPaymentIcon(method: string): string {
  switch (method) {
    case 'efectivo': return 'mdi-cash'
    case 'tarjeta': return 'mdi-credit-card'
    default: return 'mdi-help-circle'
  }
}

const saleItems = computed(() => {
  if (!selectedSale.value) return []
  return (selectedSale.value.items as unknown as SaleItem[]) || []
})
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
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
        <v-row class="mb-5">
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="dateFrom"
              label="Desde"
              type="date"
              @change="loadSales"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="dateTo"
              label="Hasta"
              type="date"
              @change="loadSales"
            />
          </v-col>
          <v-col cols="12" sm="4" class="d-flex align-center">
            <v-btn
              variant="text"
              color="secondary"
              @click="dateFrom = ''; dateTo = ''; loadSales()"
            >
              <v-icon start>mdi-filter-remove</v-icon>
              Limpiar filtros
            </v-btn>
          </v-col>
        </v-row>

        <!-- Tabla de ventas -->
        <v-data-table
          :headers="[
            { title: 'No. Venta', key: 'sale_number' },
            { title: 'Fecha', key: 'created_at' },
            { title: 'Total', key: 'total', align: 'end' },
            { title: 'Método', key: 'payment_method', align: 'center' },
            { title: 'Estado', key: 'status', align: 'center' },
            { title: 'Acciones', key: 'actions', align: 'center', sortable: false }
          ]"
          :items="sales"
          :loading="loading"
          item-value="id"
        >
          <template #item.created_at="{ item }">
            <span class="text-body-2">{{ formatDate(item.created_at) }}</span>
          </template>

          <template #item.total="{ item }">
            <span class="font-weight-bold text-primary">L {{ item.total.toFixed(2) }}</span>
          </template>

          <template #item.payment_method="{ item }">
            <v-chip variant="tonal" size="small">
              <v-icon start size="16">{{ getPaymentIcon(item.payment_method) }}</v-icon>
              {{ item.payment_method }}
            </v-chip>
          </template>

          <template #item.status="{ item }">
            <v-chip :color="getStatusColor(item.status)" size="small" variant="tonal">
              {{ item.status }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <v-btn icon size="small" variant="text" @click="viewDetails(item)">
              <v-icon size="18">mdi-eye-outline</v-icon>
            </v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <!-- Diálogo de detalles neomórfico -->
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
              {{ selectedSale.status }}
            </v-chip>
            <v-chip variant="tonal" size="small">
              <v-icon start size="16">{{ getPaymentIcon(selectedSale.payment_method) }}</v-icon>
              {{ selectedSale.payment_method }}
            </v-chip>
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
          </div>

          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span class="text-medium-emphasis">Subtotal:</span>
            <span>L {{ (selectedSale.subtotal || 0).toFixed(2) }}</span>
          </div>
          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span class="text-medium-emphasis">ISV:</span>
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
          <v-spacer />
          <v-btn variant="text" @click="showDetails = false">Cerrar</v-btn>
          <v-btn color="primary" variant="outlined">
            <v-icon start>mdi-printer</v-icon>
            Imprimir
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
