<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProductosStore } from '@/stores/productos'
import { adjustInventory, fetchInventoryMovements } from '@/services/database'
import type { Product } from '@/types/supabase'

const productosStore = useProductosStore()

const searchQuery = ref('')
const loadingMovements = ref(false)
const movimientos = ref<any[]>([])

const showAdjustDialog = ref(false)
const productoSeleccionado = ref<Product | null>(null)
const cantidadAjuste = ref(0)
const motivoAjuste = ref('Ajuste manual de inventario')
const guardandoAjuste = ref(false)

onMounted(async () => {
  await Promise.all([
    productosStore.fetchProducts(),
    cargarMovimientos(),
  ])
})

const productosFiltrados = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return productosStore.products

  return productosStore.products.filter((producto) =>
    producto.name.toLowerCase().includes(query)
    || producto.sku?.toLowerCase().includes(query)
    || producto.barcode?.includes(query)
  )
})

function abrirAjuste(producto: Product) {
  productoSeleccionado.value = producto
  cantidadAjuste.value = 0
  motivoAjuste.value = 'Ajuste manual de inventario'
  showAdjustDialog.value = true
}

async function guardarAjuste() {
  if (!productoSeleccionado.value || !cantidadAjuste.value || !motivoAjuste.value.trim()) return

  guardandoAjuste.value = true

  try {
    await adjustInventory(
      productoSeleccionado.value.id,
      cantidadAjuste.value,
      motivoAjuste.value.trim()
    )

    await Promise.all([
      productosStore.fetchProducts(),
      cargarMovimientos(),
    ])

    showAdjustDialog.value = false
  } catch (error) {
    console.error('Error ajustando inventario', error)
  } finally {
    guardandoAjuste.value = false
  }
}

async function cargarMovimientos() {
  loadingMovements.value = true
  try {
    movimientos.value = await fetchInventoryMovements(80)
  } catch (error) {
    console.error('Error cargando movimientos', error)
  } finally {
    loadingMovements.value = false
  }
}

function formatoFecha(valor: string | null): string {
  if (!valor) return '-'
  return new Date(valor).toLocaleString('es-HN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function colorStock(producto: Product): string {
  return (producto.stock || 0) <= (producto.min_stock || 5) ? 'warning' : 'success'
}

function textoTipo(tipo: string): string {
  if (tipo === 'entry') return 'Entrada'
  if (tipo === 'sale') return 'Venta'
  return 'Ajuste'
}
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <v-card class="mb-4 neo-animate-in">
      <v-card-text class="pa-5">
        <div class="d-flex align-center mb-4">
          <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #26A69A, #4DB6AC);">
            <v-icon color="white" size="20">mdi-warehouse</v-icon>
          </div>
          <h2 class="text-h6 font-weight-bold">Manejo de Inventario</h2>
          <v-spacer />
          <v-btn variant="outlined" color="primary" @click="cargarMovimientos">
            <v-icon start>mdi-refresh</v-icon>
            Actualizar
          </v-btn>
        </div>

        <v-text-field
          v-model="searchQuery"
          label="Buscar por nombre, SKU o código"
          prepend-inner-icon="mdi-magnify"
          clearable
          class="mb-4"
        />

        <v-data-table
          :items="productosFiltrados"
          :loading="productosStore.loading"
          item-value="id"
          :headers="[
            { title: 'Producto', key: 'name' },
            { title: 'SKU', key: 'sku' },
            { title: 'Código', key: 'barcode' },
            { title: 'Stock', key: 'stock', align: 'center' },
            { title: 'Mínimo', key: 'min_stock', align: 'center' },
            { title: 'Acciones', key: 'acciones', align: 'center', sortable: false }
          ]"
        >
          <template #item.stock="{ item }">
            <v-chip :color="colorStock(item)" size="small" variant="tonal">
              {{ item.stock || 0 }}
            </v-chip>
          </template>

          <template #item.acciones="{ item }">
            <v-btn size="small" variant="text" color="primary" @click="abrirAjuste(item)">
              <v-icon start size="16">mdi-tune</v-icon>
              Ajustar
            </v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-card class="neo-animate-in">
      <v-card-text class="pa-5">
        <h3 class="text-subtitle-1 font-weight-bold mb-3">Movimientos recientes</h3>

        <v-data-table
          :items="movimientos"
          :loading="loadingMovements"
          item-value="id"
          density="compact"
          :headers="[
            { title: 'Fecha', key: 'created_at' },
            { title: 'Producto', key: 'products.name' },
            { title: 'Tipo', key: 'type', align: 'center' },
            { title: 'Cantidad', key: 'quantity', align: 'center' },
            { title: 'Motivo', key: 'reason' }
          ]"
        >
          <template #item.created_at="{ item }">
            {{ formatoFecha(item.created_at) }}
          </template>

          <template #item.type="{ item }">
            <v-chip size="x-small" variant="tonal">
              {{ textoTipo(item.type) }}
            </v-chip>
          </template>

          <template #item.quantity="{ item }">
            <span :class="item.quantity >= 0 ? 'text-success' : 'text-error'">
              {{ item.quantity > 0 ? `+${item.quantity}` : item.quantity }}
            </span>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="showAdjustDialog" max-width="460">
      <v-card>
        <div class="pa-6 d-flex align-center">
          <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #26A69A, #4DB6AC);">
            <v-icon color="white">mdi-tune</v-icon>
          </div>
          <div>
            <h3 class="text-h6 font-weight-bold">Ajustar inventario</h3>
            <p class="text-caption text-medium-emphasis">{{ productoSeleccionado?.name || '' }}</p>
          </div>
        </div>

        <v-card-text class="px-6 pb-2">
          <v-text-field
            v-model.number="cantidadAjuste"
            type="number"
            label="Cantidad (+ entrada / - salida)"
          />

          <v-textarea
            v-model="motivoAjuste"
            label="Motivo"
            rows="2"
          />
        </v-card-text>

        <v-card-actions class="pa-6 pt-2">
          <v-btn variant="text" @click="showAdjustDialog = false">Cancelar</v-btn>
          <v-spacer />
          <v-btn
            color="primary"
            :loading="guardandoAjuste"
            :disabled="cantidadAjuste === 0"
            @click="guardarAjuste"
          >
            <v-icon start>mdi-content-save</v-icon>
            Guardar ajuste
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
