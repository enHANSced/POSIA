<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProductosStore } from '@/stores/productos'
import { adjustInventory, fetchInventoryMovements } from '@/services/database'
import type { Product } from '@/types/supabase'

type ErrorWithMessage = {
  message?: string
}

const productosStore = useProductosStore()

const searchQuery = ref('')
const quickFilter = ref<'all' | 'low' | 'out'>('all')
const loadingMovements = ref(false)
const movimientos = ref<any[]>([])

const showAdjustDialog = ref(false)
const productoSeleccionado = ref<Product | null>(null)
const tipoAjuste = ref<'entry' | 'exit'>('entry')
const cantidadAjuste = ref(1)
const motivoAjuste = ref('Ajuste manual de inventario')
const guardandoAjuste = ref(false)
const ajusteError = ref('')
const ajusteExito = ref('')
const showAjusteExito = ref(false)

onMounted(async () => {
  await Promise.all([
    productosStore.fetchProducts(),
    cargarMovimientos(),
  ])
})

const headersInventario = [
  { title: 'Producto', key: 'name' },
  { title: 'SKU', key: 'sku' },
  { title: 'Código', key: 'barcode' },
  { title: 'Stock', key: 'stock', align: 'center' as const },
  { title: 'Mínimo', key: 'min_stock', align: 'center' as const },
  { title: 'Estado', key: 'estado', align: 'center' as const, sortable: false },
  { title: 'Acciones', key: 'acciones', align: 'center' as const, sortable: false }
]

const headersMovimientos = [
  { title: 'Fecha', key: 'created_at' },
  { title: 'Producto', key: 'products.name' },
  { title: 'Tipo', key: 'type', align: 'center' as const },
  { title: 'Cantidad', key: 'quantity', align: 'center' as const },
  { title: 'Motivo', key: 'reason' }
]

const totalProductos = computed(() => productosStore.products.length)

const sinStockCount = computed(() =>
  productosStore.products.filter((producto) => (producto.stock || 0) <= 0).length
)

const stockBajoCount = computed(() =>
  productosStore.products.filter((producto) => {
    const stock = producto.stock || 0
    const minimo = producto.min_stock || 5
    return stock > 0 && stock <= minimo
  }).length
)

const stockActualAjuste = computed(() => productoSeleccionado.value?.stock || 0)

const cantidadAjusteFirmada = computed(() =>
  tipoAjuste.value === 'entry' ? cantidadAjuste.value : -cantidadAjuste.value
)

const stockResultanteAjuste = computed(() => stockActualAjuste.value + cantidadAjusteFirmada.value)

const salidaExcedeStock = computed(() =>
  tipoAjuste.value === 'exit' && cantidadAjuste.value > stockActualAjuste.value
)

const ajusteValido = computed(() =>
  cantidadAjuste.value > 0
  && !salidaExcedeStock.value
  && !!motivoAjuste.value.trim()
)

const productosFiltrados = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  let lista = productosStore.products

  if (quickFilter.value === 'low') {
    lista = lista.filter((producto) => {
      const stock = producto.stock || 0
      const minimo = producto.min_stock || 5
      return stock > 0 && stock <= minimo
    })
  }

  if (quickFilter.value === 'out') {
    lista = lista.filter((producto) => (producto.stock || 0) <= 0)
  }

  if (!query) return lista

  return lista.filter((producto) =>
    producto.name.toLowerCase().includes(query)
    || producto.sku?.toLowerCase().includes(query)
    || producto.barcode?.includes(query)
  )
})

function abrirAjuste(producto: Product) {
  productoSeleccionado.value = producto
  tipoAjuste.value = 'entry'
  cantidadAjuste.value = 1
  motivoAjuste.value = 'Ingreso manual de inventario'
  ajusteError.value = ''
  showAdjustDialog.value = true
}

async function guardarAjuste() {
  ajusteError.value = ''

  if (!productoSeleccionado.value) {
    ajusteError.value = 'No se encontró el producto a ajustar.'
    return
  }

  if (!ajusteValido.value) {
    if (salidaExcedeStock.value) {
      ajusteError.value = 'La salida supera el stock actual. Ajustá la cantidad.'
      return
    }

    ajusteError.value = 'Completá una cantidad válida y un motivo para guardar el ajuste.'
    return
  }

  guardandoAjuste.value = true

  try {
    await adjustInventory(
      productoSeleccionado.value.id,
      cantidadAjusteFirmada.value,
      motivoAjuste.value.trim()
    )

    await Promise.all([
      productosStore.fetchProducts(),
      cargarMovimientos(),
    ])

    ajusteExito.value = `Ajuste aplicado correctamente a ${productoSeleccionado.value.name}.`
    showAjusteExito.value = true
    showAdjustDialog.value = false
  } catch (error) {
    const detalle = error instanceof Error
      ? error.message
      : (error as ErrorWithMessage)?.message

    ajusteError.value = detalle
      ? `No se pudo guardar el ajuste: ${detalle}`
      : 'No se pudo guardar el ajuste. Intentá nuevamente.'
    console.error('Error ajustando inventario', error)
  } finally {
    guardandoAjuste.value = false
  }
}

function seleccionarTipoAjuste(tipo: 'entry' | 'exit') {
  tipoAjuste.value = tipo
  if (!motivoAjuste.value.trim() || motivoAjuste.value.includes('manual de inventario')) {
    motivoAjuste.value = tipo === 'entry'
      ? 'Ingreso manual de inventario'
      : 'Salida manual de inventario'
  }
}

function cambiarCantidad(delta: number) {
  const siguienteCantidad = cantidadAjuste.value + delta
  cantidadAjuste.value = Math.max(1, siguienteCantidad)
}

function aplicarCantidadRapida(cantidad: number) {
  cantidadAjuste.value = Math.max(1, cantidad)
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
    hour12: true,
  })
}

function colorStock(producto: Product): string {
  const stock = producto.stock || 0
  const minimo = producto.min_stock || 5
  if (stock <= 0) return 'error'
  if (stock <= minimo) return 'warning'
  return 'success'
}

function textoEstadoStock(producto: Product): string {
  const stock = producto.stock || 0
  const minimo = producto.min_stock || 5
  if (stock <= 0) return 'Sin stock'
  if (stock <= minimo) return 'Stock bajo'
  return 'Disponible'
}

function textoTipo(tipo: string): string {
  if (tipo === 'entry') return 'Entrada'
  if (tipo === 'sale') return 'Venta'
  return 'Ajuste'
}

function colorTipoMovimiento(tipo: string): string {
  if (tipo === 'entry') return 'success'
  if (tipo === 'sale') return 'error'
  return 'info'
}
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <v-card class="mb-4 neo-animate-in">
      <v-card-text class="pa-5">
        <div class="d-flex align-center flex-wrap ga-3 mb-4">
          <div class="neo-circle-sm">
            <v-icon color="primary" size="20">mdi-warehouse</v-icon>
          </div>
          <div>
            <h2 class="text-h6 font-weight-bold">Inventario</h2>
            <p class="text-caption text-medium-emphasis">Visualizá estado de stock y aplicá ajustes rápidos.</p>
          </div>
          <v-spacer />
          <v-btn variant="outlined" color="primary" @click="cargarMovimientos">
            <v-icon start>mdi-refresh</v-icon>
            Actualizar movimientos
          </v-btn>
        </div>

        <v-row class="mb-1">
          <v-col cols="12" sm="4">
            <div class="inventory-stat-card">
              <p class="text-caption text-medium-emphasis mb-1">Productos</p>
              <p class="text-h5 font-weight-bold">{{ totalProductos }}</p>
            </div>
          </v-col>
          <v-col cols="12" sm="4">
            <div class="inventory-stat-card">
              <p class="text-caption text-medium-emphasis mb-1">Stock bajo</p>
              <p class="text-h5 font-weight-bold text-warning">{{ stockBajoCount }}</p>
            </div>
          </v-col>
          <v-col cols="12" sm="4">
            <div class="inventory-stat-card">
              <p class="text-caption text-medium-emphasis mb-1">Sin stock</p>
              <p class="text-h5 font-weight-bold text-error">{{ sinStockCount }}</p>
            </div>
          </v-col>
        </v-row>

        <v-row class="mb-2" align="center">
          <v-col cols="12" md="7">
            <v-text-field
              v-model="searchQuery"
              label="Buscar por nombre, SKU o código"
              prepend-inner-icon="mdi-magnify"
              clearable
              density="comfortable"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="5">
            <div class="d-flex flex-wrap ga-2 justify-md-end">
              <v-btn
                size="small"
                :variant="quickFilter === 'all' ? 'flat' : 'outlined'"
                @click="quickFilter = 'all'"
              >
                Todos
              </v-btn>
              <v-btn
                size="small"
                color="warning"
                :variant="quickFilter === 'low' ? 'flat' : 'outlined'"
                @click="quickFilter = 'low'"
              >
                Stock bajo
              </v-btn>
              <v-btn
                size="small"
                color="error"
                :variant="quickFilter === 'out' ? 'flat' : 'outlined'"
                @click="quickFilter = 'out'"
              >
                Sin stock
              </v-btn>
            </div>
          </v-col>
        </v-row>

        <v-data-table
          :items="productosFiltrados"
          :loading="productosStore.loading"
          :headers="headersInventario"
          item-value="id"
        >
          <template #item.stock="{ item }">
            <v-chip :color="colorStock(item)" size="small" variant="tonal">
              {{ item.stock || 0 }}
            </v-chip>
          </template>

          <template #item.min_stock="{ item }">
            {{ item.min_stock || 5 }}
          </template>

          <template #item.estado="{ item }">
            <v-chip :color="colorStock(item)" size="x-small" variant="tonal">
              {{ textoEstadoStock(item) }}
            </v-chip>
          </template>

          <template #item.acciones="{ item }">
            <v-btn size="small" variant="text" color="primary" @click="abrirAjuste(item)">
              <v-icon start size="16">mdi-tune</v-icon>
              Ajustar
            </v-btn>
          </template>

          <template #no-data>
            <div class="py-8 text-center text-medium-emphasis">
              No hay productos que coincidan con los filtros aplicados.
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-card class="neo-animate-in">
      <v-card-text class="pa-5">
        <div class="d-flex align-center mb-3">
          <h3 class="text-subtitle-1 font-weight-bold">Movimientos recientes</h3>
          <v-spacer />
          <span class="text-caption text-medium-emphasis">Últimos {{ movimientos.length }} registros</span>
        </div>

        <v-data-table
          :items="movimientos"
          :loading="loadingMovements"
          :headers="headersMovimientos"
          item-value="id"
          density="compact"
        >
          <template #item.created_at="{ item }">
            {{ formatoFecha(item.created_at) }}
          </template>

          <template #item.type="{ item }">
            <v-chip size="x-small" variant="tonal" :color="colorTipoMovimiento(item.type)">
              {{ textoTipo(item.type) }}
            </v-chip>
          </template>

          <template #item.quantity="{ item }">
            <span :class="item.quantity >= 0 ? 'text-success font-weight-medium' : 'text-error font-weight-medium'">
              {{ item.quantity > 0 ? `+${item.quantity}` : item.quantity }}
            </span>
          </template>

          <template #item.reason="{ item }">
            {{ item.reason || 'Sin detalle' }}
          </template>

          <template #no-data>
            <div class="py-8 text-center text-medium-emphasis">
              Aún no hay movimientos registrados.
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="showAdjustDialog" max-width="460">
      <v-card>
        <div class="pa-6 d-flex align-center">
          <div class="neo-circle-sm mr-3">
            <v-icon color="primary">mdi-tune</v-icon>
          </div>
          <div>
            <h3 class="text-h6 font-weight-bold">Ajustar inventario</h3>
            <p class="text-caption text-medium-emphasis">{{ productoSeleccionado?.name || '' }}</p>
          </div>
        </div>

        <v-card-text class="px-6 pb-2">
          <v-alert
            v-if="ajusteError"
            type="error"
            variant="tonal"
            density="comfortable"
            class="mb-3"
          >
            {{ ajusteError }}
          </v-alert>

          <div class="stock-preview-card mb-4">
            <div>
              <p class="text-caption text-medium-emphasis mb-1">Stock actual</p>
              <p class="text-h6 font-weight-bold mb-0">{{ stockActualAjuste }}</p>
            </div>
            <v-icon class="mx-2" size="18" color="medium-emphasis">mdi-arrow-right</v-icon>
            <div>
              <p class="text-caption text-medium-emphasis mb-1">Stock final</p>
              <p class="text-h6 font-weight-bold mb-0" :class="stockResultanteAjuste < 0 ? 'text-error' : 'text-primary'">
                {{ stockResultanteAjuste }}
              </p>
            </div>
          </div>

          <div class="mb-4">
            <p class="text-caption text-medium-emphasis mb-2">Tipo de ajuste</p>
            <div class="d-flex ga-2">
              <button
                type="button"
                class="adjust-type-btn"
                :class="{ 'adjust-type-btn-active adjust-type-btn-entry': tipoAjuste === 'entry' }"
                @click="seleccionarTipoAjuste('entry')"
              >
                <v-icon size="16" class="mr-1">mdi-plus</v-icon>
                Entrada
              </button>
              <button
                type="button"
                class="adjust-type-btn"
                :class="{ 'adjust-type-btn-active adjust-type-btn-exit': tipoAjuste === 'exit' }"
                @click="seleccionarTipoAjuste('exit')"
              >
                <v-icon size="16" class="mr-1">mdi-minus</v-icon>
                Salida
              </button>
            </div>
          </div>

          <div class="mb-3">
            <p class="text-caption text-medium-emphasis mb-2">Cantidad</p>
            <div class="adjust-qty-row">
              <v-btn icon variant="outlined" size="small" @click="cambiarCantidad(-1)">
                <v-icon>mdi-minus</v-icon>
              </v-btn>

              <v-text-field
                v-model.number="cantidadAjuste"
                type="number"
                min="1"
                hide-details
                density="comfortable"
                class="adjust-qty-input"
              />

              <v-btn icon variant="outlined" size="small" @click="cambiarCantidad(1)">
                <v-icon>mdi-plus</v-icon>
              </v-btn>
            </div>

            <div class="d-flex ga-2 mt-2 flex-wrap">
              <v-btn size="x-small" variant="outlined" @click="aplicarCantidadRapida(1)">1</v-btn>
              <v-btn size="x-small" variant="outlined" @click="aplicarCantidadRapida(5)">5</v-btn>
              <v-btn size="x-small" variant="outlined" @click="aplicarCantidadRapida(10)">10</v-btn>
              <v-btn size="x-small" variant="outlined" @click="aplicarCantidadRapida(25)">25</v-btn>
            </div>
          </div>

          <v-alert
            v-if="salidaExcedeStock"
            type="warning"
            variant="tonal"
            density="comfortable"
            class="mb-3"
          >
            La salida supera el stock actual. Ajustá la cantidad para continuar.
          </v-alert>

          <v-chip
            size="small"
            :color="tipoAjuste === 'entry' ? 'success' : 'error'"
            variant="tonal"
            class="mb-3"
          >
            Ajuste a registrar: {{ cantidadAjusteFirmada > 0 ? `+${cantidadAjusteFirmada}` : cantidadAjusteFirmada }}
          </v-chip>

          <v-textarea
            v-model="motivoAjuste"
            label="Motivo"
            rows="2"
            auto-grow
          />
        </v-card-text>

        <v-card-actions class="pa-6 pt-2">
          <v-btn variant="text" @click="showAdjustDialog = false">Cancelar</v-btn>
          <v-spacer />
          <v-btn
            color="primary"
            :loading="guardandoAjuste"
            :disabled="!ajusteValido"
            @click="guardarAjuste"
          >
            <v-icon start>mdi-content-save</v-icon>
            Guardar ajuste
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar
      v-model="showAjusteExito"
      color="success"
      timeout="2600"
      location="bottom right"
    >
      {{ ajusteExito }}
    </v-snackbar>
  </v-container>
</template>

<style scoped>
.inventory-stat-card {
  border-radius: var(--neo-radius-sm);
  box-shadow: var(--neo-inset);
  background-color: var(--neo-bg-alt);
  padding: 14px;
}

.stock-preview-card {
  border-radius: var(--neo-radius-sm);
  box-shadow: var(--neo-inset);
  background-color: var(--neo-bg-alt);
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.adjust-type-btn {
  border: none;
  border-radius: var(--neo-radius-sm);
  box-shadow: var(--neo-raised-sm);
  background-color: var(--neo-bg);
  color: inherit;
  padding: 8px 14px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: var(--neo-transition);
}

.adjust-type-btn-active {
  box-shadow: var(--neo-pressed-sm);
}

.adjust-type-btn-entry {
  color: rgb(var(--v-theme-success));
}

.adjust-type-btn-exit {
  color: rgb(var(--v-theme-error));
}

.adjust-qty-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.adjust-qty-input {
  max-width: 120px;
}
</style>
