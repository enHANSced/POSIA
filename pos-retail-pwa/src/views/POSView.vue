<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useDisplay } from 'vuetify'
import { useProductosStore } from '@/stores/productos'
import { useCarritoStore, productSellsByWeight } from '@/stores/carrito'
import { useAuthStore } from '@/stores/auth'
import { procesarVenta } from '@/services/edge-functions'
import type { ProcesarVentaResponse } from '@/services/edge-functions'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import FacturaRecibo from '@/components/pos/FacturaRecibo.vue'
import type { FacturaData } from '@/components/pos/FacturaRecibo.vue'
import { playSuccessBeep, playErrorBeep } from '@/composables/useScanSound'

const productosStore = useProductosStore()
const carritoStore = useCarritoStore()
const authStore = useAuthStore()
const { mobile } = useDisplay()

const searchQuery = ref('')
const showScanner = ref(false)
const showMobileCart = ref(false)
const lastAddedId = ref<string | null>(null)
const scannerManualCode = ref('')
const scannerStatus = ref('')
const scannerError = ref('')
const lastScannedCode = ref('')
const lastScanTime = ref(0)

// Snackbar de producto agregado por escaneo
const showScanSnackbar = ref(false)
const scanSnackbarText = ref('')
let snackbarTimer: ReturnType<typeof setTimeout> | null = null

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

// === CHECKOUT STATE ===
const showCheckout = ref(false)
const checkoutStep = ref<'payment' | 'cash' | 'card' | 'processing' | 'done'>('payment')
const processingPayment = ref(false)
const saleError = ref('')

// Efectivo
const montoRecibido = ref<number | null>(null)
const cambio = computed(() => {
  if (!montoRecibido.value) return 0
  return Math.max(0, montoRecibido.value - carritoStore.getTotal())
})
const cashValid = computed(() => {
  return montoRecibido.value !== null && montoRecibido.value >= carritoStore.getTotal()
})

// Montos rápidos para efectivo
const montosRapidos = computed(() => {
  const total = carritoStore.getTotal()
  const rounded = Math.ceil(total / 100) * 100
  const options = [rounded]
  if (rounded + 100 <= total * 3) options.push(rounded + 100)
  if (rounded + 200 <= total * 3) options.push(rounded + 200)
  // Siempre un monto exacto
  return [total, ...options.filter(v => v !== total)]
})

// Tarjeta — simulación
const cardStep = ref<'input' | 'processing' | 'approved'>('input')
const cardLast4 = ref('')
const cardHolderName = ref('')

// Datos opcionales cliente
const customerName = ref('')
const customerRtn = ref('')

// Factura
const showFactura = ref(false)
const facturaData = ref<FacturaData | null>(null)
const lastSaleResponse = ref<ProcesarVentaResponse | null>(null)

let barcodeScanner: Html5Qrcode | null = null
let unsubscribe: (() => void) | null = null

onMounted(async () => {
  await productosStore.fetchProducts()
  unsubscribe = productosStore.subscribeToChanges()
})

onUnmounted(() => {
  unsubscribe?.()
  clearScanner()
  if (snackbarTimer) clearTimeout(snackbarTimer)
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

// Reset checkout al abrir
watch(showCheckout, (open) => {
  if (open) {
    checkoutStep.value = 'payment'
    saleError.value = ''
    montoRecibido.value = null
    cardStep.value = 'input'
    cardLast4.value = ''
    cardHolderName.value = ''
    customerName.value = ''
    customerRtn.value = ''
  }
})

// Filtro por categoría
const selectedCategory = ref<string | null>(null)

// Edición manual de cantidad en carrito
const editingQtyIndex = ref<number | null>(null)
const editingQtyValue = ref<number>(1)

function startEditQty(index: number, currentQty: number) {
  editingQtyIndex.value = index
  editingQtyValue.value = currentQty
}

function confirmEditQty(index: number) {
  const val = editingQtyValue.value || 0.25
  const qty = Math.max(0.01, Math.round(val * 1000) / 1000)
  carritoStore.updateQuantity(index, qty)
  editingQtyIndex.value = null
}

function cancelEditQty() {
  editingQtyIndex.value = null
}

const categorias = computed(() => {
  const cats = new Map<string, number>()
  productosStore.products.forEach(p => {
    const catName = p.categories?.name
    if (catName) cats.set(catName, (cats.get(catName) || 0) + 1)
  })
  return Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]))
})

function toggleCategory(cat: string) {
  selectedCategory.value = selectedCategory.value === cat ? null : cat
}

// Productos filtrados
const productosFiltrados = computed(() => {
  let prods = productosStore.products
  if (selectedCategory.value) {
    prods = prods.filter(p => p.categories?.name === selectedCategory.value)
  }
  if (!searchQuery.value) return prods
  const query = searchQuery.value.toLowerCase()
  return prods.filter(p =>
    p.name.toLowerCase().includes(query) ||
    p.barcode?.includes(query) ||
    p.sku?.toLowerCase().includes(query)
  )
})

function getStockPercent(producto: any): number {
  const stock = producto.stock ?? 0
  const max = Math.max(stock, producto.min_stock ?? 10, 20)
  return Math.min(100, (stock / max) * 100)
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

function isLowStock(producto: any): boolean {
  const stock = producto.stock ?? 0
  const min = producto.min_stock ?? 5
  return stock > 0 && stock <= min
}

// Diálogo para ingresar peso/cantidad de productos a granel
const showWeightDialog = ref(false)
const weightDialogProduct = ref<any>(null)
const weightDialogValue = ref<number>(1)

function agregarAlCarrito(producto: any) {
  if (productSellsByWeight(producto)) {
    // Producto por peso: abrir diálogo para ingresar cantidad
    weightDialogProduct.value = producto
    weightDialogValue.value = 1
    showWeightDialog.value = true
    return
  }
  carritoStore.addItem(producto)
  // Feedback visual: animar la tarjeta por 600ms
  lastAddedId.value = producto.id
  setTimeout(() => { lastAddedId.value = null }, 600)
}

function confirmWeightAdd() {
  if (!weightDialogProduct.value || weightDialogValue.value <= 0) return
  carritoStore.addItem(weightDialogProduct.value, weightDialogValue.value)
  lastAddedId.value = weightDialogProduct.value.id
  setTimeout(() => { lastAddedId.value = null }, 600)
  showWeightDialog.value = false
  weightDialogProduct.value = null
}

async function handleBarcode(code: string) {
  const barcode = code.trim()
  if (!barcode) return

  // Debounce: ignorar mismo código en 3 segundos
  const now = Date.now()
  if (barcode === lastScannedCode.value && now - lastScanTime.value < 3000) return
  lastScannedCode.value = barcode
  lastScanTime.value = now

  const product = await productosStore.getByBarcode(barcode)
  if (!product) {
    playErrorBeep()
    scannerError.value = 'No se encontró producto para ese código.'
    return
  }
  if ((product.stock || 0) <= 0) {
    playErrorBeep()
    scannerError.value = 'El producto está sin stock.'
    return
  }
  playSuccessBeep()
  scannerError.value = ''
  scannerStatus.value = `Producto agregado: ${product.name}`
  carritoStore.addItem(product)
  // Snackbar visible en cualquier parte de la pantalla
  if (snackbarTimer) clearTimeout(snackbarTimer)
  scanSnackbarText.value = product.name
  showScanSnackbar.value = true
  snackbarTimer = setTimeout(() => { showScanSnackbar.value = false }, 3000)
}

async function initScanner() {
  if (barcodeScanner) return
  try {
    barcodeScanner = new Html5Qrcode('pos-scanner-reader', {
      formatsToSupport: BARCODE_FORMATS,
      verbose: false,
      useBarCodeDetectorIfSupported: true,
    })

    await barcodeScanner.start(
      { facingMode: 'environment' },
      { fps: 15, qrbox: { width: 300, height: 150 }, aspectRatio: 1.777778 },
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

function buscarManual() {
  handleBarcode(scannerManualCode.value)
}

// Quick-add: navegación con flechas y confirmar con Enter
const quickAddQty = ref(1)
const highlightedIndex = ref(0)

watch(searchQuery, () => {
  quickAddQty.value = 1
  highlightedIndex.value = 0
})

function quickAddStep(producto: any): number {
  return productSellsByWeight(producto) ? 0.25 : 1
}

function navegarResultado(delta: number, event: KeyboardEvent) {
  if (!searchQuery.value?.trim()) return
  const resultados = productosFiltrados.value
  if (resultados.length === 0) return
  event.preventDefault()
  quickAddQty.value = 1
  const newIdx = highlightedIndex.value + delta
  highlightedIndex.value = Math.max(0, Math.min(newIdx, resultados.length - 1))
}

function ajustarQuickQty(delta: number, event: KeyboardEvent) {
  if (!searchQuery.value?.trim()) return
  const resultados = productosFiltrados.value
  if (resultados.length === 0) return
  const producto = resultados[highlightedIndex.value]
  if (!producto || (producto.stock ?? 0) <= 0) return
  event.preventDefault()
  const step = quickAddStep(producto)
  const newQty = Math.round((quickAddQty.value + delta * step) * 100) / 100
  const maxStock = producto.stock ?? 0
  quickAddQty.value = Math.max(step, Math.min(newQty, maxStock))
}

function seleccionarPrimerCoincidencia() {
  if (!searchQuery.value?.trim()) return
  const resultados = productosFiltrados.value
  if (resultados.length === 0) return
  const producto = resultados[highlightedIndex.value]
  if (!producto || (producto.stock ?? 0) <= 0) return
  if (productSellsByWeight(producto)) {
    weightDialogProduct.value = producto
    weightDialogValue.value = quickAddQty.value
    showWeightDialog.value = true
  } else {
    carritoStore.addItem(producto, quickAddQty.value)
    lastAddedId.value = producto.id
    setTimeout(() => { lastAddedId.value = null }, 600)
  }
  searchQuery.value = ''
  quickAddQty.value = 1
}

// === CHECKOUT FLOW ===
function selectPaymentMethod(method: 'efectivo' | 'tarjeta') {
  carritoStore.setPaymentMethod(method)
  if (method === 'efectivo') {
    checkoutStep.value = 'cash'
    montoRecibido.value = null
  } else {
    checkoutStep.value = 'card'
    cardStep.value = 'input'
  }
}

function setQuickAmount(amount: number) {
  montoRecibido.value = amount
}

async function simulateCardPayment() {
  if (!cardLast4.value || cardLast4.value.length < 4) return
  cardStep.value = 'processing'

  // Simular procesamiento de tarjeta (2-3 seg)
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000))
  cardStep.value = 'approved'

  // Auto proceed after a second
  await new Promise(resolve => setTimeout(resolve, 800))
  await finalizarVenta()
}

async function finalizarVenta() {
  if (carritoStore.items.length === 0) return

  processingPayment.value = true
  saleError.value = ''
  checkoutStep.value = 'processing'

  try {
    // Guardar datos extra de la transacción en notes (JSON) para reconstruir factura
    const extraData = JSON.stringify({
      customer_name: customerName.value || null,
      customer_rtn: customerRtn.value || null,
      monto_recibido: carritoStore.paymentMethod === 'efectivo' ? (montoRecibido.value || null) : null,
      cambio: carritoStore.paymentMethod === 'efectivo' ? cambio.value : null,
    })

    const response = await procesarVenta({
      items: carritoStore.getSaleItems(),
      total: carritoStore.getTotal(),
      subtotal: carritoStore.getSubtotal(),
      tax_amount: carritoStore.getTax(),
      discount: carritoStore.discount,
      payment_method: carritoStore.paymentMethod,
      customer_name: customerName.value || undefined,
      customer_rtn: customerRtn.value || undefined,
      notes: extraData,
    })

    lastSaleResponse.value = response
    checkoutStep.value = 'done'

    // Preparar datos de factura
    facturaData.value = {
      saleNumber: response.sale.sale_number,
      saleId: response.sale.sale_id,
      fecha: new Date(),
      items: carritoStore.getSaleItems(),
      subtotal: carritoStore.getSubtotal(),
      taxAmount: carritoStore.getTax(),
      discount: carritoStore.discount,
      total: carritoStore.getTotal(),
      paymentMethod: carritoStore.paymentMethod,
      montoRecibido: carritoStore.paymentMethod === 'efectivo' ? (montoRecibido.value || undefined) : undefined,
      cambio: carritoStore.paymentMethod === 'efectivo' ? cambio.value : undefined,
      sellerName: response.seller_name || authStore.userName,
      customerName: customerName.value || undefined,
      customerRtn: customerRtn.value || undefined,
    }

    // Limpiar carrito
    carritoStore.clearCart()
    await productosStore.fetchProducts()
  } catch (err) {
    saleError.value = err instanceof Error ? err.message : 'Error al procesar la venta'
    checkoutStep.value = 'payment'
  } finally {
    processingPayment.value = false
  }
}

function openFactura() {
  showCheckout.value = false
  showFactura.value = true
}

function closeCheckout() {
  showCheckout.value = false
  // Si ya se procesó la venta, abrir factura automáticamente
  if (checkoutStep.value === 'done' && facturaData.value) {
    showFactura.value = true
  }
}

function formatHNL(value: number): string {
  return `L ${value.toFixed(2)}`
}
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <v-row>
      <!-- Panel de productos (izquierda) -->
      <v-col cols="12" md="7" lg="8">
        <v-card class="neo-animate-in">
          <v-card-text class="pa-5">
            <!-- Header -->
            <div class="d-flex align-center mb-4">
              <div class="neo-circle-sm mr-3 d-none d-sm-flex" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
                <v-icon color="white" size="20">mdi-point-of-sale</v-icon>
              </div>
              <div>
                <h2 class="text-h6 font-weight-bold">Punto de Venta</h2>
                <span class="text-caption text-medium-emphasis">{{ productosFiltrados.length }} productos disponibles</span>
              </div>
              <v-spacer />
              <v-btn
                color="primary"
                variant="outlined"
                size="small"
                @click="showScanner = true"
              >
                <v-icon start>mdi-barcode-scan</v-icon>
                <span class="d-none d-sm-inline">Escanear</span>
              </v-btn>
            </div>

            <!-- Búsqueda -->
            <v-text-field
              v-model="searchQuery"
              label="Buscar producto (nombre, código, SKU)"
              prepend-inner-icon="mdi-magnify"
              clearable
              class="mb-3"
              @keydown.enter="seleccionarPrimerCoincidencia"
              @keydown.up="(e: KeyboardEvent) => ajustarQuickQty(1, e)"
              @keydown.down="(e: KeyboardEvent) => ajustarQuickQty(-1, e)"
              @keydown.left="(e: KeyboardEvent) => navegarResultado(-1, e)"
              @keydown.right="(e: KeyboardEvent) => navegarResultado(1, e)"
            />

            <!-- Filtro por categoría -->
            <div class="d-flex flex-wrap ga-2 pb-2 pt-2 mb-4 category-filter">
              <button
                class="cat-btn"
                :class="{ 'cat-btn--active': selectedCategory === null }"
                @click="selectedCategory = null"
              >
                <v-icon size="14" class="mr-1">mdi-view-grid</v-icon>
                Todos
              </button>
              <button
                v-for="[cat, count] in categorias"
                :key="cat"
                class="cat-btn"
                :class="{ 'cat-btn--active': selectedCategory === cat }"
                @click="toggleCategory(cat)"
              >
                {{ cat }}
                <span class="cat-count">{{ count }}</span>
              </button>
            </div>

            <!-- Grid de productos -->
            <v-row v-if="!productosStore.loading">
              <v-col
                v-for="producto in productosFiltrados"
                :key="producto.id"
                cols="6"
                sm="4"
                md="3"
              >
                <v-card
                  class="producto-card"
                  :class="{
                    'producto-card-low-stock': isLowStock(producto),
                    'producto-card-added': lastAddedId === producto.id,
                    'producto-card-sin-stock': (producto.stock || 0) <= 0,
                    'producto-card-enter-highlight': searchQuery?.trim() && productosFiltrados.indexOf(producto) === highlightedIndex && (producto.stock || 0) > 0
                  }"
                  :disabled="(producto.stock || 0) <= 0"
                  role="button"
                  tabindex="0"
                  :aria-label="`Agregar ${producto.name} al carrito, precio ${formatHNL(producto.price)}`"
                  @click="agregarAlCarrito(producto)"
                  @keydown.enter="agregarAlCarrito(producto)"
                  @keydown.space.prevent="agregarAlCarrito(producto)"
                >
                  <!-- Imagen del producto o placeholder -->
                  <div class="producto-img-container">
                    <v-img
                      v-if="producto.image_url"
                      :src="producto.image_url"
                      height="110"
                      cover
                    />
                    <div
                      v-else
                      class="producto-placeholder d-flex align-center justify-center"
                      :style="{ background: getCategoryGradient(producto) }"
                    >
                      <v-icon size="32" color="white" style="opacity: 0.85">mdi-package-variant</v-icon>
                    </div>
                    <!-- Category badge -->
                    <v-chip
                      v-if="producto.categories?.name"
                      class="producto-category-badge"
                      size="x-small"
                      variant="flat"
                    >
                      {{ producto.categories.name }}
                    </v-chip>
                    <!-- Add overlay on hover -->
                    <div class="producto-add-overlay">
                      <v-icon color="white" size="28">mdi-cart-plus</v-icon>
                    </div>
                    <!-- Enter badge on first search result -->
                    <div
                      v-if="searchQuery?.trim() && productosFiltrados.indexOf(producto) === highlightedIndex && (producto.stock || 0) > 0"
                      class="enter-badge"
                    >
                      <span v-if="quickAddQty > 1" class="enter-badge-qty">{{ productSellsByWeight(producto) ? quickAddQty.toFixed(2) : quickAddQty }}</span>
                      <v-icon size="14" color="white">mdi-keyboard-return</v-icon>
                    </div>
                    <!-- Quick navigation arrows hint -->
                    <div
                      v-if="searchQuery?.trim() && productosFiltrados.indexOf(producto) === highlightedIndex && (producto.stock || 0) > 0"
                      class="arrows-hint"
                    >
                      <v-icon size="11" color="white">mdi-arrow-left</v-icon>
                      <div class="arrows-hint-vertical">
                        <v-icon size="11" color="white">mdi-arrow-up</v-icon>
                        <v-icon size="11" color="white">mdi-arrow-down</v-icon>
                      </div>
                      <v-icon size="11" color="white">mdi-arrow-right</v-icon>
                    </div>
                  </div>

                  <v-card-text class="pa-3 pt-2">
                    <div class="text-subtitle-2 text-truncate font-weight-medium mb-1">
                      {{ producto.name }}
                    </div>
                    <div class="d-flex justify-space-between align-center">
                      <span class="text-body-1 text-primary font-weight-bold">
                        {{ formatHNL(producto.price) }}
                      </span>
                      <span
                        class="text-caption font-weight-medium"
                        :class="(producto.stock || 0) <= 0 ? 'text-error' : isLowStock(producto) ? 'text-warning' : 'text-medium-emphasis'"
                      >
                        {{ producto.stock ?? 0 }} {{ productSellsByWeight(producto) ? 'lb' : 'uds' }}
                      </span>
                    </div>
                    <!-- Stock bar -->
                    <div class="stock-bar mt-2">
                      <div
                        class="stock-bar-fill"
                        :style="{ width: getStockPercent(producto) + '%' }"
                        :class="{
                          'fill-error': (producto.stock || 0) <= 0,
                          'fill-warning': isLowStock(producto) && (producto.stock || 0) > 0,
                          'fill-success': !isLowStock(producto) && (producto.stock || 0) > 0
                        }"
                      />
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>

            <!-- Empty state -->
            <div v-else-if="productosFiltrados.length === 0 && !productosStore.loading" class="text-center py-12">
              <div class="neo-circle mx-auto mb-4">
                <v-icon size="28" color="grey">mdi-package-variant-closed-remove</v-icon>
              </div>
              <p class="text-body-2 text-medium-emphasis">No se encontraron productos</p>
            </div>

            <!-- Loading -->
            <div v-if="productosStore.loading" class="d-flex justify-center py-12">
              <div class="neo-circle neo-pulse">
                <v-progress-circular indeterminate color="primary" size="28" width="3" />
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Panel del carrito (derecha) -->
      <v-col cols="12" md="5" lg="4">
        <v-card class="carrito-card neo-animate-in" height="calc(100vh - 120px)">
          <!-- Header del carrito -->
          <div class="carrito-header pa-4 d-flex align-center">
            <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #66BB6A, #81C784);">
              <v-icon color="white" size="18">mdi-cart</v-icon>
            </div>
            <span class="text-subtitle-1 font-weight-bold">Carrito</span>
            <v-spacer />
            <v-chip color="primary" variant="tonal" size="small">
              {{ carritoStore.getItemCount() }} items
            </v-chip>
          </div>

          <!-- Lista de items -->
          <v-card-text class="pa-0" style="height: calc(100% - 280px); overflow-y: auto;">
            <div v-if="carritoStore.items.length > 0" class="pa-3">
              <div
                v-for="(item, index) in carritoStore.items"
                :key="index"
                class="cart-item mb-2 pa-3"
              >
                <div class="d-flex align-center">
                  <v-avatar size="42" rounded="lg" class="mr-3">
                    <v-img v-if="item.product.image_url" :src="item.product.image_url" cover />
                    <div v-else class="w-100 h-100 d-flex align-center justify-center" :style="{ background: getCategoryGradient(item.product) }">
                      <v-icon size="18" color="white">mdi-package-variant</v-icon>
                    </div>
                  </v-avatar>
                  <div class="flex-grow-1" style="min-width: 0;">
                    <div class="d-flex justify-space-between align-center">
                      <span class="text-body-2 font-weight-medium text-truncate">{{ item.product.name }}</span>
                      <v-btn icon size="x-small" variant="text" color="error" class="ml-1" @click.stop="carritoStore.removeItem(index)">
                        <v-icon size="14">mdi-close</v-icon>
                      </v-btn>
                    </div>
                    <div class="d-flex justify-space-between align-center mt-2">
                      <div class="qty-control">
                        <v-btn icon size="small" variant="text" @click.stop="carritoStore.decrementItem(index)">
                          <v-icon size="18">mdi-minus</v-icon>
                        </v-btn>
                        <template v-if="editingQtyIndex === index">
                          <input
                            type="number"
                            class="qty-input"
                            v-model.number="editingQtyValue"
                            :min="productSellsByWeight(item.product) ? 0.01 : 1"
                            :step="productSellsByWeight(item.product) ? 0.25 : 1"
                            :max="item.product.stock ?? 999"
                            @keyup.enter="confirmEditQty(index)"
                            @keyup.escape="cancelEditQty()"
                            @blur="confirmEditQty(index)"
                            autofocus
                            @click.stop
                          />
                        </template>
                        <template v-else>
                          <span
                            class="qty-value text-body-1 font-weight-bold"
                            @click.stop="startEditQty(index, item.quantity)"
                            title="Clic para editar cantidad"
                          >{{ productSellsByWeight(item.product) ? item.quantity.toFixed(2) : item.quantity }}</span>
                        </template>
                        <v-btn icon size="small" variant="text" @click.stop="carritoStore.incrementItem(index)">
                          <v-icon size="18">mdi-plus</v-icon>
                        </v-btn>
                      </div>
                      <span class="text-body-2 font-weight-bold text-primary">{{ formatHNL(item.subtotal + item.tax) }}</span>
                    </div>
                    <div class="text-caption text-medium-emphasis mt-1">
                      {{ formatHNL(item.product.price) }} × {{ item.quantity }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Carrito vacío -->
            <div v-else class="text-center py-12 px-4">
              <div class="neo-circle mx-auto mb-4" style="width: 72px; height: 72px;">
                <v-icon size="32" color="grey-lighten-1">mdi-cart-outline</v-icon>
              </div>
              <p class="text-subtitle-2 text-medium-emphasis mb-1">Carrito vacío</p>
              <p class="text-caption text-disabled">Toca un producto para agregarlo</p>
            </div>
          </v-card-text>

          <!-- Totales -->
          <div class="pa-4 pt-2">
            <div class="neo-totals-box pa-4">
              <div class="d-flex justify-space-between align-center mb-2">
                <div class="d-flex align-center">
                  <v-icon size="16" class="text-medium-emphasis mr-2">mdi-receipt-text-outline</v-icon>
                  <span class="text-body-2 text-medium-emphasis">Subtotal</span>
                </div>
                <span class="text-body-2">{{ formatHNL(carritoStore.getSubtotal()) }}</span>
              </div>
              <div class="d-flex justify-space-between align-center mb-3">
                <div class="d-flex align-center">
                  <v-icon size="16" class="text-medium-emphasis mr-2">mdi-percent-outline</v-icon>
                  <span class="text-body-2 text-medium-emphasis">ISV (15%)</span>
                </div>
                <span class="text-body-2">{{ formatHNL(carritoStore.getTax()) }}</span>
              </div>
              <v-divider class="mb-3" />
              <div class="d-flex justify-space-between align-center">
                <span class="text-subtitle-1 font-weight-bold">Total</span>
                <span class="text-h6 font-weight-bold text-primary">{{ formatHNL(carritoStore.getTotal()) }}</span>
              </div>
            </div>
          </div>

          <!-- Acciones -->
          <v-card-actions class="pa-4 pt-2">
            <v-btn
              color="error"
              variant="outlined"
              size="small"
              @click="carritoStore.clearCart()"
              :disabled="carritoStore.items.length === 0"
            >
              <v-icon start size="18">mdi-delete-sweep-outline</v-icon>
              Limpiar
            </v-btn>
            <v-spacer />
            <v-btn
              color="success"
              size="x-large"
              @click="showCheckout = true"
              :disabled="carritoStore.items.length === 0"
              class="px-10 cobrar-btn"
              elevation="4"
            >
              <v-icon start size="24">mdi-cash-register</v-icon>
              <span class="text-subtitle-1 font-weight-bold">Cobrar</span>
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Diálogo de Checkout Multi-Paso -->
    <v-dialog v-model="showCheckout" max-width="520" persistent>
      <v-card class="checkout-card">
        <!-- Step indicator -->
        <div class="checkout-steps pt-5 pb-2 d-flex justify-center">
          <div class="step-indicator">
            <div class="step-dot" :class="{ active: true }">
              <v-icon size="14" color="white">mdi-cart-check</v-icon>
            </div>
            <div class="step-line" :class="{ active: ['cash','card','processing','done'].includes(checkoutStep) }" />
            <div class="step-dot" :class="{ active: ['cash','card','processing','done'].includes(checkoutStep) }">
              <v-icon size="14" :color="['cash','card','processing','done'].includes(checkoutStep) ? 'white' : undefined">mdi-credit-card-outline</v-icon>
            </div>
            <div class="step-line" :class="{ active: ['processing','done'].includes(checkoutStep) }" />
            <div class="step-dot" :class="{ active: ['processing','done'].includes(checkoutStep) }">
              <v-icon size="14" :color="['processing','done'].includes(checkoutStep) ? 'white' : undefined">mdi-check</v-icon>
            </div>
          </div>
        </div>

        <!-- === PASO 1: Selección método de pago === -->
        <template v-if="checkoutStep === 'payment'">
          <div class="pa-6 pb-3 text-center">
            <h3 class="text-h6 mb-1">Finalizar Venta</h3>
            <p class="text-h4 font-weight-bold text-primary mt-2">
              {{ formatHNL(carritoStore.getTotal()) }}
            </p>
          </div>

          <v-card-text class="px-6 pb-4">
            <!-- Resumen -->
            <div class="neo-card-pressed pa-3 mb-4">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span>Productos:</span>
                <span>{{ carritoStore.getItemCount() }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span>Subtotal:</span>
                <span>{{ formatHNL(carritoStore.getSubtotal()) }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-2">
                <span>ISV:</span>
                <span>{{ formatHNL(carritoStore.getTax()) }}</span>
              </div>
            </div>

            <!-- Datos opcionales del cliente -->
            <v-expansion-panels variant="accordion" class="mb-4">
              <v-expansion-panel elevation="0">
                <v-expansion-panel-title class="text-body-2">
                  <v-icon start size="18" color="primary">mdi-account-outline</v-icon>
                  Datos del cliente (opcional)
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-text-field
                    v-model="customerName"
                    label="Nombre del cliente"
                    prepend-inner-icon="mdi-account"
                    density="compact"
                    class="mb-2"
                    hide-details
                  />
                  <v-text-field
                    v-model="customerRtn"
                    label="RTN del cliente"
                    prepend-inner-icon="mdi-card-account-details"
                    density="compact"
                    hide-details
                    placeholder="0801-XXXX-XXXXX"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <!-- Método de pago -->
            <p class="text-subtitle-2 font-weight-bold mb-3">Seleccioná el método de pago</p>
            <v-row dense>
              <v-col cols="6">
                <div
                  class="payment-method-card"
                  :class="{ 'payment-method-card--selected': false }"
                  @click="selectPaymentMethod('efectivo')"
                >
                  <div class="payment-method-icon" style="background: linear-gradient(135deg, #66BB6A, #81C784);">
                    <v-icon size="24" color="white">mdi-cash-multiple</v-icon>
                  </div>
                  <div class="text-body-2 font-weight-bold mt-2">Efectivo</div>
                </div>
              </v-col>
              <v-col cols="6">
                <div
                  class="payment-method-card"
                  :class="{ 'payment-method-card--selected': false }"
                  @click="selectPaymentMethod('tarjeta')"
                >
                  <div class="payment-method-icon" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
                    <v-icon size="24" color="white">mdi-credit-card-outline</v-icon>
                  </div>
                  <div class="text-body-2 font-weight-bold mt-2">Tarjeta</div>
                </div>
              </v-col>
            </v-row>

            <v-alert v-if="saleError" type="error" class="mt-4" closable @click:close="saleError = ''">
              {{ saleError }}
            </v-alert>
          </v-card-text>

          <v-card-actions class="pa-6 pt-0">
            <v-btn variant="text" @click="showCheckout = false">Cancelar</v-btn>
          </v-card-actions>
        </template>

        <!-- === PASO 2a: Pago en Efectivo === -->
        <template v-if="checkoutStep === 'cash'">
          <div class="pa-6 pb-3 text-center">
            <h3 class="text-h6 mb-1">Pago en Efectivo</h3>
            <div class="neo-total-badge mx-auto mt-3 mb-1">
              <span class="text-caption text-medium-emphasis d-block">Total a cobrar</span>
              <span class="text-h5 font-weight-bold text-primary">{{ formatHNL(carritoStore.getTotal()) }}</span>
            </div>
          </div>

          <v-card-text class="px-6 pb-4">
            <!-- Montos rápidos -->
            <p class="text-subtitle-2 font-weight-bold mb-3">Seleccionar monto</p>
            <v-row dense class="mb-4">
              <v-col
                v-for="monto in montosRapidos"
                :key="monto"
                cols="4"
              >
                <v-btn
                  block
                  :variant="montoRecibido === monto ? 'elevated' : 'outlined'"
                  :color="montoRecibido === monto ? 'success' : undefined"
                  class="quick-amount-btn"
                  @click="setQuickAmount(monto)"
                >
                  {{ formatHNL(monto) }}
                </v-btn>
              </v-col>
            </v-row>

            <!-- Monto manual -->
            <v-text-field
              v-model.number="montoRecibido"
              label="Monto recibido"
              type="number"
              prefix="L"
              prepend-inner-icon="mdi-cash"
              :min="0"
              :rules="[
                (v: number) => v !== null || 'Ingresá el monto recibido',
                (v: number) => v >= carritoStore.getTotal() || 'El monto debe cubrir el total'
              ]"
              class="mb-3"
            />

            <!-- Cambio -->
            <div v-if="montoRecibido !== null" class="cambio-box text-center mb-4" :class="cashValid ? 'cambio-box--valid' : 'cambio-box--invalid'">
              <p class="text-caption text-medium-emphasis mb-1">CAMBIO A DEVOLVER</p>
              <p class="text-h4 font-weight-bold" :class="cashValid ? 'text-success' : 'text-error'">
                {{ formatHNL(cambio) }}
              </p>
              <v-icon v-if="cashValid" color="success" size="20" class="mt-1">mdi-check-circle</v-icon>
            </div>

            <v-alert v-if="saleError" type="error" class="mb-3" closable @click:close="saleError = ''">
              {{ saleError }}
            </v-alert>
          </v-card-text>

          <v-card-actions class="pa-6 pt-0">
            <v-btn variant="text" @click="checkoutStep = 'payment'">
              <v-icon start>mdi-arrow-left</v-icon>
              Atrás
            </v-btn>
            <v-spacer />
            <v-btn
              color="success"
              size="x-large"
              :disabled="!cashValid"
              :loading="processingPayment"
              @click="finalizarVenta"
              class="px-8 confirmar-btn"
              elevation="4"
            >
              <v-icon start size="22">mdi-check-circle</v-icon>
              <span class="font-weight-bold">Confirmar Cobro</span>
            </v-btn>
          </v-card-actions>
        </template>

        <!-- === PASO 2b: Pago con Tarjeta (Simulación) === -->
        <template v-if="checkoutStep === 'card'">
          <div class="pa-6 text-center">
            <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
              <v-icon color="white" size="28">mdi-credit-card-outline</v-icon>
            </div>
            <h3 class="text-h6 mb-1">Pago con Tarjeta</h3>
            <p class="text-body-2 text-medium-emphasis">
              Cobro: <strong class="text-primary">{{ formatHNL(carritoStore.getTotal()) }}</strong>
            </p>
          </div>

          <v-card-text class="px-6 pb-4">
            <template v-if="cardStep === 'input'">
              <v-text-field
                v-model="cardHolderName"
                label="Nombre del titular"
                prepend-inner-icon="mdi-account"
                class="mb-3"
              />
              <v-text-field
                v-model="cardLast4"
                label="Últimos 4 dígitos de la tarjeta"
                prepend-inner-icon="mdi-credit-card"
                maxlength="4"
                :rules="[(v: string) => v.length === 4 || 'Ingresá los 4 dígitos']"
                hint="Solo para referencia en el recibo"
                persistent-hint
                class="mb-3"
              />
              <v-alert type="info" variant="tonal" density="compact" class="mb-3">
                <div class="text-caption">
                  <v-icon start size="14">mdi-information</v-icon>
                  Simulación: en producción se integraría con un proveedor de pagos (Tigo Money, BAC, etc.)
                </div>
              </v-alert>
            </template>

            <template v-if="cardStep === 'processing'">
              <div class="text-center py-8">
                <v-progress-circular indeterminate color="primary" size="64" width="4" class="mb-4" />
                <p class="text-body-1 font-weight-medium">Procesando pago...</p>
                <p class="text-caption text-medium-emphasis">Comunicando con terminal de pago</p>
              </div>
            </template>

            <template v-if="cardStep === 'approved'">
              <div class="text-center py-6">
                <v-icon size="64" color="success">mdi-check-circle</v-icon>
                <p class="text-h6 text-success mt-3 font-weight-bold">Pago Aprobado</p>
                <p class="text-caption text-medium-emphasis">Tarjeta ****{{ cardLast4 }}</p>
              </div>
            </template>

            <v-alert v-if="saleError" type="error" class="mt-3" closable @click:close="saleError = ''">
              {{ saleError }}
            </v-alert>
          </v-card-text>

          <v-card-actions class="pa-6 pt-0">
            <v-btn variant="text" @click="checkoutStep = 'payment'" :disabled="cardStep !== 'input'">
              <v-icon start>mdi-arrow-left</v-icon>
              Atrás
            </v-btn>
            <v-spacer />
            <v-btn
              v-if="cardStep === 'input'"
              color="primary"
              size="large"
              :disabled="cardLast4.length < 4"
              @click="simulateCardPayment"
            >
              <v-icon start>mdi-contactless-payment</v-icon>
              Procesar Pago
            </v-btn>
          </v-card-actions>
        </template>

        <!-- === PASO 3: Procesando === -->
        <template v-if="checkoutStep === 'processing'">
          <div class="pa-12 text-center">
            <v-progress-circular indeterminate color="success" size="64" width="4" class="mb-4" />
            <p class="text-h6 font-weight-medium">Registrando venta...</p>
            <p class="text-caption text-medium-emphasis">Actualizando inventario y generando factura</p>
          </div>
        </template>

        <!-- === PASO 4: Venta Exitosa === -->
        <template v-if="checkoutStep === 'done'">
          <div class="pa-6 text-center">
            <div class="success-icon-wrapper mb-3">
              <v-icon size="72" color="success" class="success-icon-animate">mdi-check-circle</v-icon>
            </div>
            <h3 class="text-h5 text-success font-weight-bold mb-2">¡Venta Exitosa!</h3>
            <p class="text-body-2 text-medium-emphasis mb-1">
              {{ lastSaleResponse?.message }}
            </p>
            <div v-if="carritoStore.paymentMethod === 'efectivo' && montoRecibido" class="cambio-resultado neo-card-pressed pa-3 mt-3 d-inline-block">
              <span class="text-caption text-medium-emphasis d-block">Cambio</span>
              <span class="text-h5 text-success font-weight-bold">{{ formatHNL(cambio) }}</span>
            </div>
          </div>

          <v-card-actions class="pa-6 pt-0 d-flex flex-column ga-2">
            <v-btn
              color="primary"
              size="large"
              block
              prepend-icon="mdi-receipt-text"
              @click="openFactura"
            >
              Ver Factura
            </v-btn>
            <v-btn
              variant="text"
              block
              @click="showCheckout = false"
            >
              Cerrar
            </v-btn>
          </v-card-actions>
        </template>
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

    <v-dialog v-model="showScanner" max-width="540">
      <v-card>
        <div class="pa-6 d-flex align-center">
          <div class="neo-circle-sm mr-3">
            <v-icon color="primary">mdi-barcode-scan</v-icon>
          </div>
          <h3 class="text-h6 font-weight-bold">Escanear producto</h3>
        </div>

        <v-card-text class="px-6 pb-2">
          <div id="pos-scanner-reader" class="neo-flat pa-2 mb-3" style="min-height: 250px;" />

          <v-text-field
            v-model="scannerManualCode"
            label="Código de barras manual"
            prepend-inner-icon="mdi-keyboard"
            @keyup.enter="buscarManual"
          />

          <v-alert v-if="scannerStatus" type="success" density="compact" class="mb-2">
            {{ scannerStatus }}
          </v-alert>
          <v-alert v-if="scannerError" type="error" density="compact">
            {{ scannerError }}
          </v-alert>
        </v-card-text>

        <v-card-actions class="pa-6 pt-2">
          <v-btn variant="text" @click="showScanner = false">Cerrar</v-btn>
          <v-spacer />
          <v-btn color="primary" @click="buscarManual">
            <v-icon start>mdi-magnify</v-icon>
            Buscar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- === Diálogo para ingresar peso/cantidad a granel === -->
    <v-dialog v-model="showWeightDialog" max-width="400" persistent>
      <v-card class="neo-elevated rounded-xl">
        <v-card-title class="d-flex align-center pa-5 pb-3">
          <v-icon color="primary" class="mr-2">mdi-scale</v-icon>
          Cantidad a Granel
        </v-card-title>

        <v-card-text class="px-5 pb-4">
          <p class="text-body-2 text-medium-emphasis mb-3">
            Ingrese la cantidad en libras para
            <strong>{{ weightDialogProduct?.name }}</strong>
          </p>

          <v-text-field
            v-model.number="weightDialogValue"
            label="Cantidad (lb)"
            type="number"
            :min="0.25"
            :step="0.25"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-weight-pound"
            hint="Mínimo 0.25 lb — use incrementos de 0.25"
            persistent-hint
            autofocus
          />
        </v-card-text>

        <v-card-actions class="pa-5 pt-0">
          <v-btn variant="text" @click="showWeightDialog = false">Cancelar</v-btn>
          <v-spacer />
          <v-btn
            color="primary"
            variant="elevated"
            :disabled="!weightDialogValue || weightDialogValue < 0.25"
            @click="confirmWeightAdd"
          >
            <v-icon start>mdi-cart-plus</v-icon>
            Agregar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- === FAB móvil: muestra el carrito como bottom sheet === -->
    <div v-if="mobile && carritoStore.items.length > 0" class="mobile-cart-fab d-flex d-md-none">
      <v-btn
        color="success"
        size="large"
        rounded="pill"
        class="px-6 mobile-fab-btn"
        elevation="4"
        @click="showMobileCart = true"
      >
        <v-badge :content="carritoStore.getItemCount()" color="primary" inline class="mr-2">
          <v-icon>mdi-cart</v-icon>
        </v-badge>
        <span class="text-body-1 font-weight-bold ml-1">
          {{ formatHNL(carritoStore.getTotal()) }}
        </span>
        <v-icon end>mdi-chevron-up</v-icon>
      </v-btn>
    </div>

    <!-- Bottom sheet del carrito para móvil -->
    <v-bottom-sheet v-model="showMobileCart" max-height="92dvh">
      <v-card class="d-flex flex-column" style="border-radius: 20px 20px 0 0 !important; max-height: 92dvh;">
        <!-- Handle bar -->
        <div class="d-flex justify-center pt-3 pb-1">
          <div style="width: 44px; height: 5px; background: rgba(0,0,0,0.18); border-radius: 4px;" />
        </div>

        <!-- Header -->
        <div class="px-4 pb-2 d-flex align-center">
          <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg,#66BB6A,#81C784);">
            <v-icon color="white" size="18">mdi-cart</v-icon>
          </div>
          <span class="text-subtitle-1 font-weight-bold">Carrito</span>
          <v-chip color="primary" variant="tonal" size="small" class="ml-2 font-weight-bold">
            {{ carritoStore.getItemCount() }} {{ carritoStore.getItemCount() === 1 ? 'item' : 'items' }}
          </v-chip>
          <v-spacer />
          <v-btn icon size="small" variant="text" @click="showMobileCart = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>

        <v-divider />

        <!-- Lista de items (scroll) -->
        <div style="overflow-y: auto; flex: 1; min-height: 0;">
          <v-list density="comfortable" class="pa-2">
            <v-list-item
              v-for="(item, index) in carritoStore.items"
              :key="index"
              class="mb-2 neo-flat"
              rounded="lg"
              :style="{ padding: '10px 12px' }"
            >
              <template #prepend>
                <div class="mr-3">
                  <v-avatar size="44" rounded="lg" color="surface-variant">
                    <v-img v-if="item.product.image_url" :src="item.product.image_url" cover />
                    <v-icon v-else size="22" color="medium-emphasis">mdi-package-variant</v-icon>
                  </v-avatar>
                </div>
              </template>

              <v-list-item-title class="text-body-2 font-weight-bold mb-0">{{ item.product.name }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ formatHNL(item.product.price) }} c/u &bull;
                <span class="font-weight-bold text-primary">{{ formatHNL(item.product.price * item.quantity) }}</span>
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex align-center" style="gap: 2px;">
                  <v-btn
                    icon
                    size="small"
                    variant="tonal"
                    color="primary"
                    @click.stop="carritoStore.decrementItem(index)"
                  >
                    <v-icon size="18">mdi-minus</v-icon>
                  </v-btn>
                  <span class="mx-2 text-body-1 font-weight-bold" style="min-width: 24px; text-align: center;">{{ productSellsByWeight(item.product) ? item.quantity.toFixed(2) : item.quantity }}</span>
                  <v-btn
                    icon
                    size="small"
                    variant="tonal"
                    color="primary"
                    @click.stop="carritoStore.incrementItem(index)"
                  >
                    <v-icon size="18">mdi-plus</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    size="small"
                    color="error"
                    variant="text"
                    class="ml-1"
                    @click.stop="carritoStore.removeItem(index)"
                  >
                    <v-icon size="18">mdi-delete-outline</v-icon>
                  </v-btn>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </div>

        <v-divider />

        <!-- Totales y acciones fijos en la parte inferior -->
        <div class="pa-4 pb-safe" style="flex-shrink: 0;">
          <div class="neo-flat rounded-xl pa-3 mb-3">
            <div class="d-flex justify-space-between text-body-2 mb-1">
              <span class="text-medium-emphasis">Subtotal</span>
              <span>{{ formatHNL(carritoStore.getSubtotal()) }}</span>
            </div>
            <div class="d-flex justify-space-between text-body-2 mb-2">
              <span class="text-medium-emphasis">ISV (15%)</span>
              <span>{{ formatHNL(carritoStore.getTax()) }}</span>
            </div>
            <v-divider class="my-2" />
            <div class="d-flex justify-space-between text-h6 font-weight-bold">
              <span>Total</span>
              <span class="text-success">{{ formatHNL(carritoStore.getTotal()) }}</span>
            </div>
          </div>

          <div class="d-flex" style="gap: 10px;">
            <v-btn
              color="error"
              variant="outlined"
              size="large"
              @click="carritoStore.clearCart(); showMobileCart = false"
            >
              <v-icon>mdi-delete-outline</v-icon>
            </v-btn>
            <v-btn
              color="success"
              size="large"
              style="flex: 1;"
              @click="showMobileCart = false; showCheckout = true"
            >
              <v-icon start>mdi-cash-register</v-icon>
              Cobrar
            </v-btn>
          </div>
        </div>
      </v-card>
    </v-bottom-sheet>

    <!-- Snackbar: producto agregado por escaneo -->
    <v-snackbar
      v-model="showScanSnackbar"
      location="top"
      color="success"
      rounded="pill"
      :timeout="3000"
      class="scan-snackbar"
      elevation="4"
    >
      <div class="d-flex align-center">
        <v-icon class="mr-2">mdi-check-circle</v-icon>
        <div>
          <div class="text-caption font-weight-medium" style="opacity: 0.85;">Agregado al carrito</div>
          <div class="text-body-2 font-weight-bold">{{ scanSnackbarText }}</div>
        </div>
      </div>
      <template #actions>
        <v-btn icon size="small" variant="text" @click="showScanSnackbar = false">
          <v-icon size="18">mdi-close</v-icon>
        </v-btn>
      </template>
    </v-snackbar>

  </v-container>
</template>

<style scoped>
/* ===== Product Cards ===== */
.producto-card {
  cursor: pointer;
  transition: var(--neo-transition);
  box-shadow: var(--neo-raised) !important;
  user-select: none;
  overflow: hidden;
}

.producto-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--neo-raised-lg) !important;
}

.producto-card:active,
.producto-card.producto-card-added {
  box-shadow: var(--neo-pressed) !important;
  transform: scale(0.97);
}

.producto-card-low-stock {
  border-left: 3px solid rgb(var(--v-theme-warning)) !important;
}

.producto-card-sin-stock {
  opacity: 0.55;
  filter: grayscale(0.4);
}

/* Enter highlight on first search result */
.producto-card-enter-highlight {
  border: 2px solid rgb(var(--v-theme-primary)) !important;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.18), var(--neo-raised) !important;
  transform: translateY(-2px);
}

.enter-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgb(var(--v-theme-primary));
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  z-index: 2;
  animation: enter-badge-pulse 1.5s ease-in-out infinite;
}

.enter-badge-qty {
  background: rgba(255, 255, 255, 0.25);
  padding: 0 5px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
}

.arrows-hint {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  padding: 2px 4px;
  z-index: 2;
  backdrop-filter: blur(4px);
  opacity: 0.5;
}

.arrows-hint-vertical {
  display: flex;
  flex-direction: column;
  gap: 0;
}

@keyframes enter-badge-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Image container & overlays */
.producto-img-container {
  position: relative;
  overflow: hidden;
}

.producto-category-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 10px !important;
  backdrop-filter: blur(6px);
  background: rgba(255, 255, 255, 0.85) !important;
  color: rgba(0, 0, 0, 0.7) !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important;
}

.producto-add-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.25s ease;
  backdrop-filter: blur(2px);
}

.producto-card:hover .producto-add-overlay {
  opacity: 1;
}

.producto-placeholder {
  height: 110px;
}

/* Stock bar */
.stock-bar {
  height: 3px;
  background: var(--neo-bg-alt);
  border-radius: 2px;
  overflow: hidden;
  box-shadow: var(--neo-pressed-sm);
}

.stock-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}

.fill-error { background-color: rgb(var(--v-theme-error)); }
.fill-warning { background-color: rgb(var(--v-theme-warning)); }
.fill-success { background-color: rgb(var(--v-theme-success)); }

/* ===== Category Filter ===== */
.category-filter {
  scrollbar-width: none;
  overflow-x: auto;
}

.category-filter::-webkit-scrollbar {
  display: none;
}

.cat-btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: var(--neo-radius-xs);
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised-sm);
  color: inherit;
  transition: var(--neo-transition);
}

.cat-btn:hover {
  box-shadow: var(--neo-raised);
  transform: translateY(-1px);
}

.cat-btn:active {
  box-shadow: var(--neo-pressed-sm);
  transform: scale(0.97);
}

.cat-btn--active {
  box-shadow: var(--neo-pressed-sm);
  background: var(--neo-bg-alt);
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

.cat-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed-sm);
}

.cat-btn--active .cat-count {
  background: rgb(var(--v-theme-primary));
  color: white;
  box-shadow: none;
}

/* ===== Cart ===== */
.carrito-card {
  position: sticky;
  top: 80px;
  display: flex;
  flex-direction: column;
}

.carrito-header {
  background-color: var(--neo-bg-alt);
  border-radius: var(--neo-radius) var(--neo-radius) 0 0;
}

.cart-item {
  border-radius: var(--neo-radius-xs);
  box-shadow: var(--neo-flat) !important;
  transition: var(--neo-transition);
  background: var(--neo-bg);
}

.cart-item:hover {
  box-shadow: var(--neo-raised-sm) !important;
}

/* Quantity control pill */
.qty-control {
  display: inline-flex;
  align-items: center;
  border-radius: 24px;
  padding: 2px 4px;
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed-sm);
  gap: 2px;
}

.qty-value {
  min-width: 34px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s ease;
}

.qty-value:hover {
  background: rgba(var(--v-theme-primary), 0.1);
}

.qty-input {
  width: 48px;
  height: 30px;
  text-align: center;
  border: 2px solid rgb(var(--v-theme-primary));
  border-radius: 6px;
  background: var(--neo-bg);
  font-size: 14px;
  font-weight: 700;
  outline: none;
  color: inherit;
}

.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* Totals box */
.neo-totals-box {
  background: var(--neo-bg-alt);
  border-radius: var(--neo-radius-sm);
  box-shadow: var(--neo-pressed-sm);
}

/* Cobrar button */
.cobrar-btn {
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(76, 175, 80, 0.4) !important;
  letter-spacing: 0.5px !important;
}

.cobrar-btn:hover {
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.5) !important;
  transform: translateY(-1px);
}

/* Confirmar button in checkout */
.confirmar-btn {
  box-shadow: 0 4px 14px rgba(76, 175, 80, 0.4) !important;
}

.confirmar-btn:hover {
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.5) !important;
}

/* Payment method cards */
.payment-method-card {
  padding: 20px 16px;
  text-align: center;
  cursor: pointer;
  border-radius: var(--neo-radius-sm);
  background: var(--neo-bg);
  box-shadow: var(--neo-raised);
  transition: var(--neo-transition);
}

.payment-method-card:hover {
  box-shadow: var(--neo-raised-lg);
  transform: translateY(-2px);
}

.payment-method-card:active {
  box-shadow: var(--neo-pressed);
  transform: scale(0.97);
}

.payment-method-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 8px rgba(0,0,0,0.15);
}

/* ===== Checkout Dialog ===== */
.checkout-card {
  overflow: hidden;
}

.checkout-steps {
  background: var(--neo-bg-alt);
  border-radius: var(--neo-radius) var(--neo-radius) 0 0;
}

.step-indicator {
  display: flex;
  align-items: center;
}

.step-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised-sm);
  color: rgba(0, 0, 0, 0.3);
  transition: var(--neo-transition);
}

.step-dot.active {
  background: linear-gradient(135deg, #4A7BF7, #6B93FF);
  color: white;
  box-shadow: 0 2px 10px rgba(74, 123, 247, 0.4);
}

.step-line {
  width: 36px;
  height: 3px;
  background: var(--neo-bg);
  box-shadow: var(--neo-pressed-sm);
  border-radius: 2px;
  margin: 0 4px;
  transition: var(--neo-transition);
}

.step-line.active {
  background: linear-gradient(90deg, #4A7BF7, #6B93FF);
  box-shadow: 0 1px 4px rgba(74, 123, 247, 0.3);
}

/* Total badge in cash step */
.neo-total-badge {
  display: inline-block;
  padding: 12px 24px;
  border-radius: var(--neo-radius-sm);
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed);
}

/* Quick amount buttons */
.quick-amount-btn {
  font-weight: 600 !important;
  letter-spacing: 0 !important;
}

/* Change box */
.cambio-box {
  padding: 20px;
  border-radius: var(--neo-radius-sm);
  transition: var(--neo-transition);
}

.cambio-box--valid {
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed);
  border: 2px solid rgb(var(--v-theme-success));
}

.cambio-box--invalid {
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed);
  border: 2px solid rgb(var(--v-theme-error));
}

/* Success animation */
.success-icon-wrapper {
  display: inline-block;
}

@keyframes success-bounce {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); opacity: 1; }
}

.success-icon-animate {
  animation: success-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.cambio-resultado {
  border-radius: var(--neo-radius-sm);
}

/* ===== Mobile ===== */
.mobile-cart-fab {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
}

.mobile-fab-btn {
  box-shadow: 0 4px 14px rgba(102, 187, 106, 0.45) !important;
  min-width: 200px;
}

.gap-3 {
  gap: 12px;
}

.pb-safe {
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
</style>
