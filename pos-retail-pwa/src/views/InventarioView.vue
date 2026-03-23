<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useProductosStore } from '@/stores/productos'
import { adjustInventory, fetchInventoryMovements } from '@/services/database'
import type { Product } from '@/types/supabase'

import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { playSuccessBeep, playErrorBeep } from '@/composables/useScanSound'
import { useDisplay } from 'vuetify'

type ErrorWithMessage = {
  message?: string
}

const productosStore = useProductosStore()

const { mobile } = useDisplay()

const searchQuery = ref('')
const showScanner = ref(false)
const scannerStatus = ref('')
const scannerError = ref('')
let barcodeScanner: Html5Qrcode | null = null

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
]

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

onUnmounted(() => {
  clearScanner()
})

watch(showScanner, async (open) => {
  scannerStatus.value = ''
  scannerError.value = ''
  if (open) {
    await nextTick()
    await initScanner()
  } else {
    await clearScanner()
  }
})

async function initScanner() {
  if (barcodeScanner) return
  try {
    barcodeScanner = new Html5Qrcode('inventory-scanner-reader', {
      formatsToSupport: BARCODE_FORMATS,
      verbose: false,
      useBarCodeDetectorIfSupported: true,
    })

    const isMobile = mobile.value
    const qrboxSize = isMobile
      ? { width: Math.min(window.innerWidth - 48, 260), height: 120 }
      : { width: 300, height: 150 }

    await barcodeScanner.start(
      { facingMode: 'environment' },
      { fps: 15, qrbox: qrboxSize, aspectRatio: isMobile ? 1.333 : 1.777778 },
      async (decodedText) => { await handleBarcode(decodedText) },
      () => {}
    )
  } catch {
    scannerError.value = 'No se pudo iniciar la cámara de escaneo.'
  }
}

async function clearScanner() {
  if (!barcodeScanner) return
  try { await barcodeScanner.stop() } catch {} finally { barcodeScanner = null }
}

async function handleBarcode(code: string) {
  const barcode = code.trim()
  if (!barcode) return

  playSuccessBeep()
  searchQuery.value = barcode
  showScanner.value = false
}

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

// Colores por categoría para placeholder de productos sin imagen
const CATEGORY_COLORS: Record<string, string> = {
  bebida: 'linear-gradient(135deg,#42A5F5,#1976D2)',
  abarrot: 'linear-gradient(135deg,#66BB6A,#388E3C)',
  limpiez: 'linear-gradient(135deg,#26C6DA,#00838F)',
  snack: 'linear-gradient(135deg,#FFA726,#E65100)',
  lácteo: 'linear-gradient(135deg,#AB47BC,#6A1B9A)',
  electr: 'linear-gradient(135deg,#EF5350,#B71C1C)',
  planta: 'linear-gradient(135deg,#26A69A,#00695C)',
}

function getCategoryGradient(producto: any): string {
  const cat = (producto.categories?.name || producto.name || '').toLowerCase()
  for (const [key, val] of Object.entries(CATEGORY_COLORS)) {
    if (cat.includes(key)) return val
  }
  // fallback: hash del nombre
  let hash = 0
  for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash)
  const palette = [
    'linear-gradient(135deg,#4A7BF7,#3A63CC)',
    'linear-gradient(135deg,#66BB6A,#43A047)',
    'linear-gradient(135deg,#FFA726,#FB8C00)',
    'linear-gradient(135deg,#AB47BC,#8E24AA)',
    'linear-gradient(135deg,#42A5F5,#1E88E5)',
  ]
  return palette[Math.abs(hash) % palette.length] as string
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
    <v-card class="mb-4 neo-animate-in rounded-xl border-0" elevation="0" style="background-color: var(--neo-bg); box-shadow: var(--neo-raised-sm);">
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

        <v-row class="mb-4">
          <v-col cols="12" sm="4">
            <div class="inventory-stat-card">
              <div class="d-flex align-center w-100 mb-2">
                <v-icon color="primary" class="mr-2">mdi-package-variant-closed</v-icon>
                <p class="text-caption text-medium-emphasis font-weight-medium mb-0">Total Productos</p>
              </div>
              <p class="text-h4 font-weight-bold mt-auto">{{ totalProductos }}</p>
            </div>
          </v-col>
          <v-col cols="12" sm="4">
            <div class="inventory-stat-card">
              <div class="d-flex align-center w-100 mb-2">
                <v-icon color="warning" class="mr-2">mdi-alert-circle-outline</v-icon>
                <p class="text-caption text-medium-emphasis font-weight-medium mb-0">Stock Bajo</p>
              </div>
              <p class="text-h4 font-weight-bold text-warning mt-auto">{{ stockBajoCount }}</p>
            </div>
          </v-col>
          <v-col cols="12" sm="4">
            <div class="inventory-stat-card">
              <div class="d-flex align-center w-100 mb-2">
                <v-icon color="error" class="mr-2">mdi-close-circle-outline</v-icon>
                <p class="text-caption text-medium-emphasis font-weight-medium mb-0">Sin Stock</p>
              </div>
              <p class="text-h4 font-weight-bold text-error mt-auto">{{ sinStockCount }}</p>
            </div>
          </v-col>
        </v-row>

        <v-row class="mb-4" align="center">
          <v-col cols="12" md="7">
            <v-text-field
              v-model="searchQuery"
              label="Buscar por nombre, SKU o código"
              prepend-inner-icon="mdi-magnify"
              placeholder="Ej. Refresco, 1001..."
              clearable
              variant="outlined"
              density="comfortable"
              hide-details
            >
              <template #append-inner>
                <v-btn
                  icon="mdi-barcode-scan"
                  variant="text"
                  density="comfortable"
                  color="primary"
                  @click="showScanner = true"
                ></v-btn>
              </template>
            </v-text-field>
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
          class="neo-table"
        >
          <template #item.name="{ item }">
            <div class="d-flex align-center py-2">
              <v-avatar size="44" rounded="lg" class="mr-3 flex-shrink-0" color="surface-variant">
                <v-img v-if="item.image_url" :src="item.image_url" cover />
                <div v-else class="w-100 h-100 d-flex align-center justify-center" :style="{ background: getCategoryGradient(item) }">
                  <v-icon size="20" color="white" style="opacity: 0.85">mdi-package-variant</v-icon>
                </div>
              </v-avatar>
              <div>
                <div class="font-weight-bold text-body-2">{{ item.name }}</div>
                <div v-if="item.categories?.name" class="text-caption text-medium-emphasis">
                  {{ item.categories.name }}
                </div>
              </div>
            </div>
          </template>

          <template #item.stock="{ item }">
            <div class="d-flex flex-column align-center justify-center">
              <span class="text-body-1 font-weight-bold" :class="colorStock(item) === 'error' ? 'text-error' : colorStock(item) === 'warning' ? 'text-warning' : 'text-primary'">
                {{ item.stock || 0 }}
              </span>
            </div>
          </template>

          <template #item.min_stock="{ item }">
            <span class="text-medium-emphasis">{{ item.min_stock || 5 }}</span>
          </template>

          <template #item.estado="{ item }">
            <v-chip :color="colorStock(item)" size="small" variant="tonal" class="font-weight-medium">
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

    <v-card class="neo-animate-in rounded-xl border-0" elevation="0" style="background-color: var(--neo-bg); box-shadow: var(--neo-raised-sm);">
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
          density="comfortable"
          class="neo-table"
        >
          <template #item.created_at="{ item }">
            <span class="text-caption text-medium-emphasis">
              {{ formatoFecha(item.created_at) }}
            </span>
          </template>

          <template #item.products.name="{ item }">
            <span class="font-weight-medium text-body-2">{{ item.products?.name || 'Producto desconocido' }}</span>
          </template>

          <template #item.type="{ item }">
            <v-chip size="small" variant="flat" :color="colorTipoMovimiento(item.type)" class="font-weight-bold" style="opacity: 0.9;">
              {{ textoTipo(item.type) }}
            </v-chip>
          </template>

          <template #item.quantity="{ item }">
            <span class="text-body-1" :class="item.quantity >= 0 ? 'text-success font-weight-black' : 'text-error font-weight-black'">
              {{ item.quantity > 0 ? `+${item.quantity}` : item.quantity }}
            </span>
          </template>

          <template #item.reason="{ item }">
            <span class="text-caption text-medium-emphasis">
              {{ item.reason || 'Sin detalle' }}
            </span>
          </template>

          <template #no-data>
            <div class="py-8 text-center text-medium-emphasis">
              Aún no hay movimientos registrados.
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="showScanner" max-width="500">
      <v-card class="scanner-card border-0" rounded="xl" elevation="0">
        <v-card-text class="pa-4 text-center">
          <div class="d-flex justify-space-between align-center mb-4">
            <h3 class="text-h6 font-weight-bold">Escanear Producto</h3>
            <v-btn icon="mdi-close" variant="text" size="small" @click="showScanner = false" />
          </div>
          
          <div id="inventory-scanner-reader" class="scanner-reader rounded-lg overflow-hidden"></div>
          
          <div class="mt-4">
            <p v-if="scannerError" class="text-error text-caption">{{ scannerError }}</p>
            <p v-else class="text-medium-emphasis text-caption">
              Apunta la cámara al código de barras del producto para buscarlo en el inventario.
            </p>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showAdjustDialog" max-width="460">
      <v-card class="border-0 rounded-xl" elevation="0" style="background-color: var(--neo-bg);">
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
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-raised);
  background-color: var(--neo-bg);
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border: 1px solid rgba(255, 255, 255, 0.4);
}
.v-theme--dark .inventory-stat-card {
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.inventory-stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--neo-raised-lg);
}

.scanner-reader {
  width: 100%;
  border-radius: var(--neo-radius);
  overflow: hidden;
  box-shadow: var(--neo-inset);
  background-color: #000;
}
.scanner-card {
  background-color: var(--neo-bg) !important;
  box-shadow: var(--neo-raised-lg) !important;
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
