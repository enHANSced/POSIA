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
  <v-container fluid class="pa-4">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-history</v-icon>
        Historial de Ventas
        <v-spacer />
        <v-btn color="primary" variant="outlined" @click="loadSales">
          <v-icon start>mdi-refresh</v-icon>
          Actualizar
        </v-btn>
      </v-card-title>

      <v-card-text>
        <!-- Filtros -->
        <v-row class="mb-4">
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="dateFrom"
              label="Desde"
              type="date"
              variant="outlined"
              density="compact"
              @change="loadSales"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="dateTo"
              label="Hasta"
              type="date"
              variant="outlined"
              density="compact"
              @change="loadSales"
            />
          </v-col>
          <v-col cols="12" sm="4" class="d-flex align-center">
            <v-btn
              variant="text"
              @click="dateFrom = ''; dateTo = ''; loadSales()"
            >
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
          density="comfortable"
        >
          <template #item.created_at="{ item }">
            {{ formatDate(item.created_at) }}
          </template>

          <template #item.total="{ item }">
            <span class="font-weight-bold">${{ item.total.toFixed(2) }}</span>
          </template>

          <template #item.payment_method="{ item }">
            <v-icon :title="item.payment_method">
              {{ getPaymentIcon(item.payment_method) }}
            </v-icon>
          </template>

          <template #item.status="{ item }">
            <v-chip :color="getStatusColor(item.status)" size="small">
              {{ item.status }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <v-btn icon size="small" variant="text" @click="viewDetails(item)">
              <v-icon>mdi-eye</v-icon>
            </v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <!-- Diálogo de detalles -->
    <v-dialog v-model="showDetails" max-width="600">
      <v-card v-if="selectedSale">
        <v-card-title class="bg-primary pa-4">
          <v-icon start>mdi-receipt</v-icon>
          Venta {{ selectedSale.sale_number }}
        </v-card-title>

        <v-card-text class="pa-6">
          <v-row class="mb-4">
            <v-col cols="6">
              <strong>Fecha:</strong><br>
              {{ formatDate(selectedSale.created_at) }}
            </v-col>
            <v-col cols="6">
              <strong>Estado:</strong><br>
              <v-chip :color="getStatusColor(selectedSale.status)" size="small">
                {{ selectedSale.status }}
              </v-chip>
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <h4 class="mb-2">Productos</h4>
          <v-list density="compact">
            <v-list-item v-for="(item, i) in saleItems" :key="i">
              <v-list-item-title>{{ item.name }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ item.quantity }} x ${{ item.unit_price.toFixed(2) }}
              </v-list-item-subtitle>
              <template #append>
                <span class="font-weight-bold">${{ item.subtotal.toFixed(2) }}</span>
              </template>
            </v-list-item>
          </v-list>

          <v-divider class="my-4" />

          <v-row>
            <v-col cols="6"><strong>Subtotal:</strong></v-col>
            <v-col cols="6" class="text-end">${{ (selectedSale.subtotal || 0).toFixed(2) }}</v-col>
          </v-row>
          <v-row>
            <v-col cols="6"><strong>IVA:</strong></v-col>
            <v-col cols="6" class="text-end">${{ (selectedSale.tax_amount || 0).toFixed(2) }}</v-col>
          </v-row>
          <v-row v-if="selectedSale.discount">
            <v-col cols="6"><strong>Descuento:</strong></v-col>
            <v-col cols="6" class="text-end text-error">-${{ selectedSale.discount.toFixed(2) }}</v-col>
          </v-row>
          <v-row class="mt-2">
            <v-col cols="6"><strong class="text-h6">Total:</strong></v-col>
            <v-col cols="6" class="text-end text-primary text-h6">${{ selectedSale.total.toFixed(2) }}</v-col>
          </v-row>
        </v-card-text>

        <v-card-actions class="pa-4">
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
