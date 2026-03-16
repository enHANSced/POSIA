<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useDisplay } from 'vuetify'
import { useProductosStore } from '@/stores/productos'
import { useCarritoStore, productSellsByWeight } from '@/stores/carrito'
import { useDescuentosStore, type ApplicablePromotion } from '@/stores/descuentos'
import { useAuthStore } from '@/stores/auth'
import { procesarVenta } from '@/services/edge-functions'
import { reconocerProductosImagen } from '@/services/edge-functions'
import type { ProcesarVentaResponse, MatchedProduct } from '@/services/edge-functions'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import FacturaRecibo from '@/components/pos/FacturaRecibo.vue'
import type { FacturaData } from '@/components/pos/FacturaRecibo.vue'
import { playSuccessBeep, playErrorBeep } from '@/composables/useScanSound'

const productosStore = useProductosStore()
const carritoStore = useCarritoStore()
const descuentosStore = useDescuentosStore()
const authStore = useAuthStore()
const { mobile } = useDisplay()

const searchQuery = ref('')
const showScanner = ref(false)
const showMobileCart = ref(false)
const lastAddedId = ref<string | null>(null)
const scannerCartPulse = ref(false)
const scannerManualCode = ref('')
const scannerStatus = ref('')
const scannerError = ref('')
const lastScannedCode = ref('')
const lastScanTime = ref(0)

// Snackbar de producto agregado por escaneo
const showScanSnackbar = ref(false)
const scanSnackbarText = ref('')
let snackbarTimer: ReturnType<typeof setTimeout> | null = null
let scannerCartPulseTimer: ReturnType<typeof setTimeout> | null = null

// Animación al actualizar total del carrito
const totalUpdated = ref(false)
let totalUpdateTimer: ReturnType<typeof setTimeout> | null = null

// Scanner UI state
const showManualEntry = ref(false)
const torchOn = ref(false)
const scanFlash = ref(false)
let scanFlashTimer: ReturnType<typeof setTimeout> | null = null

// === IA RECOGNITION STATE (integrado en escáner) ===
const iaRecognitionLoading = ref(false)
const iaRecognitionError = ref('')
const iaMatchedProducts = ref<MatchedProduct[]>([])

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
  await Promise.all([
    productosStore.fetchProducts(),
    descuentosStore.cargarPromocionesActivas()
  ])
  unsubscribe = productosStore.subscribeToChanges()
})

onUnmounted(() => {
  unsubscribe?.()
  clearScanner()
  if (snackbarTimer) clearTimeout(snackbarTimer)
  if (scanFlashTimer) clearTimeout(scanFlashTimer)
  if (scannerCartPulseTimer) clearTimeout(scannerCartPulseTimer)
  if (totalUpdateTimer) clearTimeout(totalUpdateTimer)
})

watch(showScanner, async (open) => {
  scannerStatus.value = ''
  scannerError.value = ''
  iaRecognitionError.value = ''
  iaMatchedProducts.value = []
  iaRecognitionLoading.value = false
  showManualEntry.value = false
  torchOn.value = false
  if (open) {
    await nextTick()
    await initScanner()
  } else {
    await clearScanner()
  }
})

// Animar total cuando el carrito cambia
watch(() => carritoStore.getTotal(), () => {
  if (totalUpdateTimer) clearTimeout(totalUpdateTimer)
  totalUpdated.value = true
  totalUpdateTimer = setTimeout(() => { totalUpdated.value = false }, 500)
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

const promocionesElegibles = computed(() => {
  return descuentosStore.getApplicableDiscounts(carritoStore.items)
})

const promocionAplicadaId = computed(() => {
  if (!carritoStore.appliedPromotion) return null
  if (carritoStore.appliedPromotion.source === 'manual') return 'manual'
  return `${carritoStore.appliedPromotion.source}:${carritoStore.appliedPromotion.id}`
})

function aplicarPromocion(promocion: ApplicablePromotion) {
  carritoStore.applyPromotion({
    id: promocion.id,
    source: promocion.source,
    type: promocion.type,
    value: promocion.value,
    amount: promocion.amount,
    name: promocion.name
  })
}

watch(promocionesElegibles, (actuales) => {
  if (actuales.length === 0) {
    // Sin promos elegibles, limpiar si había una aplicada automáticamente
    const aplicada = carritoStore.appliedPromotion
    if (aplicada && aplicada.source !== 'manual') {
      carritoStore.clearPromotion()
    }
    return
  }

  // Auto-aplicar la mejor promoción (ya viene ordenado por mayor ahorro)
  const mejor = actuales[0]!
  const aplicada = carritoStore.appliedPromotion

  // Si no hay promo aplicada, o la aplicada ya no es elegible, o hay una mejor → aplicar la mejor
  const aplicadaElegible = aplicada && aplicada.source !== 'manual'
    ? actuales.some(p => p.id === aplicada.id && p.source === aplicada.source)
    : false

  if (!aplicada || aplicada.source === 'manual' || !aplicadaElegible || mejor.amount > (aplicada?.amount ?? 0)) {
    aplicarPromocion(mejor)
  }
}, { deep: true })

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

// Edición manual de cantidad para carrito móvil
const showMobileQtyDialog = ref(false)
const mobileQtyIndex = ref<number | null>(null)
const mobileQtyValue = ref<number>(1)
const mobileQtyProductName = ref('')
const mobileQtySellsByWeight = ref(false)
const mobileQtyMax = ref<number>(999)

function triggerCartPulse() {
  if (scannerCartPulseTimer) clearTimeout(scannerCartPulseTimer)
  scannerCartPulse.value = true
  scannerCartPulseTimer = setTimeout(() => { scannerCartPulse.value = false }, 450)
}

function setLastAdded(productId: string) {
  lastAddedId.value = productId
  triggerCartPulse()
  setTimeout(() => { lastAddedId.value = null }, 600)
}

function agregarAlCarrito(producto: any) {
  if (productSellsByWeight(producto)) {
    // Producto por peso: abrir diálogo para ingresar cantidad
    weightDialogProduct.value = producto
    weightDialogValue.value = 1
    showWeightDialog.value = true
    return
  }
  carritoStore.addItem(producto)
  // Feedback visual en producto y acceso rápido al carrito
  setLastAdded(producto.id)
}

function confirmWeightAdd() {
  if (!weightDialogProduct.value || weightDialogValue.value <= 0) return
  carritoStore.addItem(weightDialogProduct.value, weightDialogValue.value)
  setLastAdded(weightDialogProduct.value.id)
  showWeightDialog.value = false
  weightDialogProduct.value = null
}

function openMobileQtyDialog(index: number, item: any) {
  mobileQtyIndex.value = index
  mobileQtyValue.value = item.quantity
  mobileQtyProductName.value = item.product.name
  mobileQtySellsByWeight.value = productSellsByWeight(item.product)
  mobileQtyMax.value = item.product.stock ?? 999
  showMobileQtyDialog.value = true
}

function confirmMobileQty() {
  if (mobileQtyIndex.value === null) return
  if (mobileQtyMax.value <= 0) {
    carritoStore.removeItem(mobileQtyIndex.value)
    showMobileQtyDialog.value = false
    return
  }
  const minQty = mobileQtySellsByWeight.value ? 0.25 : 1
  const sanitized = Math.max(minQty, Math.min(mobileQtyValue.value || minQty, mobileQtyMax.value))
  const qty = mobileQtySellsByWeight.value
    ? Math.round(sanitized * 1000) / 1000
    : Math.round(sanitized)
  carritoStore.updateQuantity(mobileQtyIndex.value, qty)
  showMobileQtyDialog.value = false
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
  setLastAdded(product.id)
  // Flash de éxito en el viewfinder
  if (scanFlashTimer) clearTimeout(scanFlashTimer)
  scanFlash.value = true
  scanFlashTimer = setTimeout(() => { scanFlash.value = false }, 700)
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

async function toggleTorch() {
  try {
    const video = document.querySelector('#pos-scanner-reader video') as HTMLVideoElement | null
    if (!video?.srcObject) return
    const track = (video.srcObject as MediaStream).getVideoTracks()[0]
    if (!track) return
    const caps = track.getCapabilities?.() as any
    if (!caps?.torch) return
    await track.applyConstraints?.({ advanced: [{ torch: !torchOn.value } as any] })
    torchOn.value = !torchOn.value
  } catch {
    // Linterna no soportada en este dispositivo
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
    setLastAdded(producto.id)
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
      promotion: carritoStore.appliedPromotion
        ? {
          id: carritoStore.appliedPromotion.id,
          source: carritoStore.appliedPromotion.source,
          type: carritoStore.appliedPromotion.type,
          value: carritoStore.appliedPromotion.value,
          amount: carritoStore.appliedPromotion.amount,
          name: carritoStore.appliedPromotion.name
        }
        : undefined,
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

// === IA RECOGNITION FUNCTIONS (integrado en escáner) ===
async function captureAndRecognize() {
  const video = document.querySelector('#pos-scanner-reader video') as HTMLVideoElement | null
  if (!video || !video.videoWidth) {
    iaRecognitionError.value = 'La cámara no está activa. Espera a que inicie.'
    return
  }

  // Reset state
  iaRecognitionError.value = ''
  iaMatchedProducts.value = []
  iaRecognitionLoading.value = true

  // Capturar frame del video en vivo
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  const base64 = dataUrl.split(',')[1] ?? ''

  try {
    const response = await reconocerProductosImagen({
      imageBase64: base64,
      mimeType: 'image/jpeg',
    })

    if (response.matched_products.length === 0) {
      iaRecognitionError.value = 'No se encontraron coincidencias en el inventario. Enfoca mejor el producto e intenta de nuevo.'
      return
    }

    iaMatchedProducts.value = response.matched_products
  } catch (err) {
    iaRecognitionError.value = err instanceof Error ? err.message : 'Error al reconocer productos'
  } finally {
    iaRecognitionLoading.value = false
  }
}

function iaAddToCart(product: any) {
  if (!product || (product.stock ?? 0) <= 0) return
  carritoStore.addItem(product)
  setLastAdded(product.id)

  // Limpiar resultados IA
  iaMatchedProducts.value = []
  iaRecognitionError.value = ''

  // Snackbar
  if (snackbarTimer) clearTimeout(snackbarTimer)
  scanSnackbarText.value = product.name
  showScanSnackbar.value = true
  snackbarTimer = setTimeout(() => { showScanSnackbar.value = false }, 3000)
}

function iaGetConfidenceColor(confidence?: string): string {
  switch (confidence) {
    case 'high': return 'success'
    case 'medium': return 'warning'
    case 'low': return 'error'
    default: return 'grey'
  }
}

function iaGetConfidenceLabel(confidence?: string): string {
  switch (confidence) {
    case 'high': return 'Alta'
    case 'medium': return 'Media'
    case 'low': return 'Baja'
    default: return 'N/A'
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
          <div class="carrito-header pa-4 d-flex align-center" :class="{ 'carrito-header--pulse': scannerCartPulse }">
            <div class="neo-circle-sm mr-3 carrito-header-icon" style="background: linear-gradient(135deg, #66BB6A, #81C784);">
              <v-icon color="white" size="18">mdi-cart</v-icon>
            </div>
            <span class="text-subtitle-1 font-weight-bold">Carrito</span>
            <v-spacer />
            <v-chip color="primary" variant="tonal" size="small" class="font-weight-bold">
              {{ carritoStore.getItemCount() }} items
            </v-chip>
          </div>

          <!-- Lista de items -->
          <v-card-text class="pa-0" style="height: calc(100% - 280px); overflow-y: auto;">
            <TransitionGroup v-if="carritoStore.items.length > 0" name="cart-item" tag="div" class="pa-3" style="position: relative;">
              <div
                v-for="(item, index) in carritoStore.items"
                :key="item.product.id"
                class="cart-item mb-2 pa-3"
                :class="{ 'cart-item--just-added': lastAddedId === item.product.id }"
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
                      <button class="cart-item-delete ml-2" @click.stop="carritoStore.removeItem(index)" aria-label="Eliminar del carrito">
                        <v-icon size="14">mdi-close</v-icon>
                      </button>
                    </div>
                    <div class="d-flex justify-space-between align-center mt-2">
                      <div class="qty-control">
                        <button class="qty-btn qty-btn--minus" @click.stop="carritoStore.decrementItem(index)" aria-label="Decrementar cantidad">
                          <v-icon size="16">mdi-minus</v-icon>
                        </button>
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
                        <button class="qty-btn qty-btn--plus" @click.stop="carritoStore.incrementItem(index)" aria-label="Incrementar cantidad">
                          <v-icon size="16">mdi-plus</v-icon>
                        </button>
                      </div>
                      <span class="cart-item-price">{{ formatHNL(item.subtotal + item.tax) }}</span>
                    </div>
                    <div class="text-caption text-medium-emphasis mt-1">
                      {{ formatHNL(item.product.price) }} × {{ item.quantity }}
                    </div>
                  </div>
                </div>
              </div>
            </TransitionGroup>

            <!-- Carrito vacío -->
            <div v-else class="text-center py-10 px-4">
              <div class="cart-empty-icon mx-auto mb-4">
                <v-icon size="34" color="grey-lighten-1">mdi-cart-outline</v-icon>
              </div>
              <p class="text-subtitle-2 text-medium-emphasis mb-1">Carrito vacío</p>
              <p class="text-caption text-disabled">Toca un producto para agregarlo</p>
            </div>
          </v-card-text>

          <!-- Totales -->
          <div class="pa-4 pt-2">
            <div class="neo-totals-box pa-4">
              <div v-if="promocionesElegibles.length > 0" class="mb-3">
                <div class="d-flex align-center mb-2">
                  <v-icon size="16" color="success" class="mr-2">mdi-check-decagram</v-icon>
                  <span class="text-body-2 font-weight-medium">Promociones aplicadas</span>
                </div>

                <div class="d-flex flex-wrap ga-2">
                  <v-chip
                    v-for="promo in promocionesElegibles"
                    :key="`${promo.source}:${promo.id}`"
                    size="small"
                    variant="tonal"
                    :color="promocionAplicadaId === `${promo.source}:${promo.id}` ? 'success' : 'primary'"
                  >
                    <v-icon v-if="promocionAplicadaId === `${promo.source}:${promo.id}`" start size="14">mdi-check-circle</v-icon>
                    {{ promo.name }} · -{{ formatHNL(promo.amount) }}
                    <v-tooltip activator="parent" location="top" max-width="280">
                      <div class="text-caption">
                        <strong>{{ promo.name }}</strong><br>
                        <span v-if="promo.description">{{ promo.description }}<br></span>
                        Tipo: {{ promo.source === 'combo' ? 'Combo' : 'Descuento' }} · {{ promo.type === 'percentage' ? promo.value + '%' : 'L ' + promo.value.toFixed(2) }}<br>
                        Ahorro: {{ formatHNL(promo.amount) }}
                      </div>
                    </v-tooltip>
                  </v-chip>
                </div>
              </div>

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
              <div v-if="carritoStore.discount > 0" class="d-flex justify-space-between align-center mb-3">
                <div class="d-flex align-center">
                  <v-icon size="16" class="text-success mr-2">mdi-sale</v-icon>
                  <span class="text-body-2 text-success">Descuento</span>
                </div>
                <span class="text-body-2 text-success">-{{ formatHNL(carritoStore.discount) }}</span>
              </div>
              <v-divider class="mb-3" />
              <div class="d-flex justify-space-between align-center">
                <span class="text-subtitle-1 font-weight-bold">Total</span>
                <span class="text-h6 font-weight-bold text-primary" :class="{ 'total-updated': totalUpdated }">{{ formatHNL(carritoStore.getTotal()) }}</span>
              </div>
            </div>
          </div>

          <!-- Acciones -->
          <v-card-actions class="pa-4 pt-2">
            <v-btn
              color="rgba(244, 67, 54, 0.1)"
              class="text-error"
              size="small"
              variant="elevated"
              @click="carritoStore.clearCart()"
              :disabled="carritoStore.items.length === 0"
            >
              <v-icon start size="18">mdi-delete-sweep-outline</v-icon>
              Limpiar
            </v-btn>
            <v-spacer />
            <v-btn
              size="x-large"
              variant="elevated"
              @click="showCheckout = true"
              :disabled="carritoStore.items.length === 0"
              class="px-8 cobrar-btn"
              :class="{ 'cobrar-btn--active': carritoStore.items.length > 0 }"
            >
              <v-icon start size="22">mdi-cash-register</v-icon>
              <span class="font-weight-bold">Cobrar</span>
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Diálogo de Checkout Multi-Paso -->
    <v-dialog v-model="showCheckout" max-width="520" persistent scrollable transition="dialog-bottom-transition">
      <v-card class="checkout-card border-0" rounded="xl" elevation="0">
        <!-- Step indicator -->
        <div class="checkout-steps pt-6 pb-2 d-flex justify-center flex-shrink-0">
          <div class="step-indicator px-4 py-2 neo-flat rounded-pill">
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

        <div class="checkout-content-wrapper flex-grow-1" style="overflow-y: auto;">
          <transition name="checkout-slide" mode="out-in">
            
            <!-- === PASO 1: Selección método de pago === -->
            <div v-if="checkoutStep === 'payment'" key="payment" class="checkout-step-container">
              <div class="pa-6 pb-3 text-center">
                <h3 class="text-h5 font-weight-bold mb-1">Finalizar Venta</h3>
                <div class="neo-total-badge mx-auto mt-3 mb-1">
                  <span class="text-caption text-medium-emphasis d-block mb-1">Total a cobrar</span>
                  <span class="text-h4 font-weight-black text-primary">{{ formatHNL(carritoStore.getTotal()) }}</span>
                </div>
              </div>

              <v-card-text class="px-6 pb-4">
                <!-- Resumen neumórfico -->
                <div class="neo-card-pressed rounded-xl pa-4 mb-5">
                  <div class="d-flex justify-space-between text-body-2 mb-2">
                    <span class="text-medium-emphasis">Productos:</span>
                    <span class="font-weight-bold">{{ carritoStore.getItemCount() }}</span>
                  </div>
                  <div class="d-flex justify-space-between text-body-2 mb-2">
                    <span class="text-medium-emphasis">Subtotal:</span>
                    <span class="font-weight-bold">{{ formatHNL(carritoStore.getSubtotal()) }}</span>
                  </div>
                  <div class="d-flex justify-space-between text-body-2">
                    <span class="text-medium-emphasis">ISV (15%):</span>
                    <span class="font-weight-bold">{{ formatHNL(carritoStore.getTax()) }}</span>
                  </div>
                </div>

                <!-- Datos opcionales del cliente -->
                <v-expansion-panels variant="accordion" class="mb-5 neo-expansion">
                  <v-expansion-panel elevation="0" class="bg-transparent">
                    <v-expansion-panel-title class="text-body-2 px-2 font-weight-medium">
                      <v-icon start size="20" color="primary">mdi-account-outline</v-icon>
                      Añadir datos del cliente (opcional)
                    </v-expansion-panel-title>
                    <v-expansion-panel-text class="px-0 pt-2">
                      <v-text-field
                        v-model="customerName"
                        label="Nombre del cliente"
                        prepend-inner-icon="mdi-account"
                        variant="outlined"
                        density="comfortable"
                        class="mb-3 neo-input"
                        hide-details
                      />
                      <v-text-field
                        v-model="customerRtn"
                        label="RTN del cliente"
                        prepend-inner-icon="mdi-card-account-details"
                        variant="outlined"
                        density="comfortable"
                        class="neo-input"
                        hide-details
                        placeholder="0801-XXXX-XXXXX"
                      />
                    </v-expansion-panel-text>
                  </v-expansion-panel>
                </v-expansion-panels>

                <!-- Método de pago -->
                <p class="text-subtitle-2 font-weight-bold mb-3 d-flex align-center px-1">
                  <v-icon size="18" class="mr-2 text-primary">mdi-wallet-outline</v-icon>
                  Método de pago
                </p>
                <v-row dense>
                  <v-col cols="6">
                    <div class="payment-method-card" @click="selectPaymentMethod('efectivo')">
                      <div class="payment-method-icon" style="background: linear-gradient(135deg, #66BB6A, #81C784);">
                        <v-icon size="24" color="white">mdi-cash-multiple</v-icon>
                      </div>
                      <div class="text-body-2 font-weight-bold mt-3">Efectivo</div>
                    </div>
                  </v-col>
                  <v-col cols="6">
                    <div class="payment-method-card" @click="selectPaymentMethod('tarjeta')">
                      <div class="payment-method-icon" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
                        <v-icon size="24" color="white">mdi-credit-card-outline</v-icon>
                      </div>
                      <div class="text-body-2 font-weight-bold mt-3">Tarjeta</div>
                    </div>
                  </v-col>
                </v-row>

                <v-alert v-if="saleError" type="error" class="mt-4 neo-alert" closable @click:close="saleError = ''">
                  {{ saleError }}
                </v-alert>
              </v-card-text>

              <v-card-actions class="pa-6 pt-0">
                <v-btn class="neo-btn px-6" rounded="xl" size="large" variant="text" @click="showCheckout = false">Cancelar</v-btn>
              </v-card-actions>
            </div>

            <!-- === PASO 2a: Pago en Efectivo === -->
            <div v-else-if="checkoutStep === 'cash'" key="cash" class="checkout-step-container">
              <div class="pa-6 pb-2 text-center">
                <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #66BB6A, #81C784);">
                  <v-icon color="white" size="28">mdi-cash-multiple</v-icon>
                </div>
                <h3 class="text-h5 font-weight-bold mb-1">Pago en Efectivo</h3>
                <div class="neo-total-badge mx-auto mt-3 mb-1">
                  <span class="text-caption text-medium-emphasis d-block mb-1">Total a cobrar</span>
                  <span class="text-h4 font-weight-black text-primary">{{ formatHNL(carritoStore.getTotal()) }}</span>
                </div>
              </div>

              <v-card-text class="px-6 pb-4">
                <p class="text-subtitle-2 font-weight-bold mb-3 mt-2 px-1">Monto rápido</p>
                <v-row dense class="mb-5">
                  <v-col v-for="monto in montosRapidos" :key="monto" cols="4">
                    <v-btn
                      block
                      variant="text"
                      rounded="xl"
                      class="quick-amount-btn"
                      :class="montoRecibido === monto ? 'quick-amount-btn--active' : 'neo-flat'"
                      @click="setQuickAmount(monto)"
                    >
                      <span :class="montoRecibido === monto ? 'text-white' : 'text-primary'">{{ formatHNL(monto) }}</span>
                    </v-btn>
                  </v-col>
                </v-row>

                <v-text-field
                  v-model.number="montoRecibido"
                  label="Monto recibido (Personalizado)"
                  type="number"
                  prefix="L"
                  prepend-inner-icon="mdi-cash-edit"
                  variant="outlined"
                  density="comfortable"
                  class="neo-input mb-4"
                  :min="0"
                  :rules="[
                    (v: number) => v !== null || 'Ingresá el monto recibido',
                    (v: number) => v >= carritoStore.getTotal() || 'El monto debe cubrir el total'
                  ]"
                />

                <transition name="fade">
                  <div v-if="montoRecibido !== null" class="cambio-box text-center" :class="cashValid ? 'cambio-box--valid' : 'cambio-box--invalid'">
                    <p class="text-caption font-weight-bold mb-1" :class="cashValid ? 'text-medium-emphasis' : 'text-error'">CAMBIO A DEVOLVER</p>
                    <p class="text-h4 font-weight-black" :class="cashValid ? 'text-success' : 'text-error'">
                      {{ formatHNL(cambio) }}
                    </p>
                    <div class="mt-2" v-if="cashValid">
                      <v-icon color="success" size="24" class="success-icon-animate">mdi-check-decagram</v-icon>
                    </div>
                  </div>
                </transition>

                <v-alert v-if="saleError" type="error" class="mt-4 neo-alert" closable @click:close="saleError = ''">
                  {{ saleError }}
                </v-alert>
              </v-card-text>

              <v-card-actions class="pa-6 pt-0 d-flex align-center">
                <v-btn class="neo-btn" rounded="xl" size="large" variant="text" @click="checkoutStep = 'payment'">
                  <v-icon start>mdi-arrow-left</v-icon> Atrás
                </v-btn>
                <v-spacer />
                <v-btn
                  color="success"
                  size="x-large"
                  rounded="xl"
                  :disabled="!cashValid"
                  :loading="processingPayment"
                  @click="finalizarVenta"
                  class="confirmar-btn px-8"
                  elevation="4"
                >
                  <v-icon start size="22">mdi-check-circle</v-icon>
                  <span class="font-weight-bold">Confirmar Cobro</span>
                </v-btn>
              </v-card-actions>
            </div>

            <!-- === PASO 2b: Pago con Tarjeta (Simulación) === -->
            <div v-else-if="checkoutStep === 'card'" key="card" class="checkout-step-container">
              <div class="pa-6 text-center">
                <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
                  <v-icon color="white" size="28">mdi-credit-card-outline</v-icon>
                </div>
                <h3 class="text-h5 font-weight-bold mb-1">Pago con Tarjeta</h3>
                <div class="neo-total-badge mx-auto mt-3 mb-4">
                  <span class="text-caption text-medium-emphasis d-block mb-1">Cobro total</span>
                  <span class="text-h4 font-weight-black text-primary">{{ formatHNL(carritoStore.getTotal()) }}</span>
                </div>
              </div>

              <v-card-text class="px-6 pb-4">
                <transition name="checkout-slide" mode="out-in">
                  <div v-if="cardStep === 'input'" key="input">
                    <v-text-field
                      v-model="cardHolderName"
                      label="Nombre del titular"
                      prepend-inner-icon="mdi-account"
                      variant="outlined"
                      density="comfortable"
                      class="neo-input mb-4"
                    />
                    <v-text-field
                      v-model="cardLast4"
                      label="Últimos 4 dígitos de la tarjeta"
                      prepend-inner-icon="mdi-credit-card"
                      maxlength="4"
                      variant="outlined"
                      density="comfortable"
                      class="neo-input mb-4"
                      :rules="[(v: string) => v.length === 4 || 'Ingresá los 4 dígitos']"
                      hint="Solo para referencia en el recibo"
                      persistent-hint
                    />
                    <v-alert type="info" variant="tonal" density="compact" rounded="xl" class="mb-2 neo-alert">
                      <div class="text-caption">
                        <v-icon start size="16">mdi-information</v-icon>
                        Simulación: en producción se integraría con un proveedor de pagos.
                      </div>
                    </v-alert>
                  </div>

                  <div v-else-if="cardStep === 'processing'" key="processing" class="text-center py-10">
                    <div class="ia-pulse-wrapper mb-6 mx-auto">
                      <v-progress-circular indeterminate color="primary" size="64" width="4" />
                      <div class="ia-pulse-ring" style="border-color: rgb(var(--v-theme-primary));"></div>
                    </div>
                    <p class="text-h6 font-weight-bold mb-1">Procesando pago...</p>
                    <p class="text-body-2 text-medium-emphasis">Comunicando con terminal de pago y banco emisor</p>
                  </div>

                  <div v-else-if="cardStep === 'approved'" key="approved" class="text-center py-10">
                    <v-icon size="80" color="success" class="success-icon-animate mb-4">mdi-check-decagram</v-icon>
                    <p class="text-h5 text-success font-weight-bold mb-1">Pago Aprobado</p>
                    <p class="text-body-1 text-medium-emphasis">Transacción exitosa para tarjeta ****{{ cardLast4 }}</p>
                  </div>
                </transition>

                <v-alert v-if="saleError" type="error" class="mt-4 neo-alert" closable @click:close="saleError = ''">
                  {{ saleError }}
                </v-alert>
              </v-card-text>

              <v-card-actions class="pa-6 pt-0 d-flex align-center">
                <v-btn class="neo-btn" rounded="xl" size="large" variant="text" @click="checkoutStep = 'payment'" :disabled="cardStep !== 'input'">
                  <v-icon start>mdi-arrow-left</v-icon> Atrás
                </v-btn>
                <v-spacer />
                <v-btn
                  v-if="cardStep === 'input'"
                  color="primary"
                  size="x-large"
                  rounded="xl"
                  class="px-8 cobrar-btn select-payment-btn"
                  :disabled="cardLast4.length < 4"
                  @click="simulateCardPayment"
                >
                  <v-icon start size="22">mdi-contactless-payment</v-icon>
                  <span class="font-weight-bold">Procesar Pago</span>
                </v-btn>
              </v-card-actions>
            </div>

            <!-- === PASO 3: Procesando === -->
            <div v-else-if="checkoutStep === 'processing'" key="processing" class="checkout-step-container">
              <div class="pa-12 text-center my-8">
                <div class="ia-pulse-wrapper mb-8 mx-auto">
                  <v-progress-circular indeterminate color="success" size="72" width="5" />
                  <div class="ia-pulse-ring" style="border-color: rgb(var(--v-theme-success));"></div>
                </div>
                <h3 class="text-h5 font-weight-bold mb-2">Registrando Venta</h3>
                <p class="text-body-1 text-medium-emphasis">Actualizando inventario y generando factura digital...</p>
              </div>
            </div>

            <!-- === PASO 4: Venta Exitosa === -->
            <div v-else-if="checkoutStep === 'done'" key="done" class="checkout-step-container">
              <div class="pa-8 text-center pt-10 pb-6">
                <div class="success-icon-wrapper mb-5">
                  <div class="neo-circle mx-auto" style="width: 100px; height: 100px; background: rgba(76, 175, 80, 0.1);">
                    <v-icon size="64" color="success" class="success-icon-animate">mdi-check-bold</v-icon>
                  </div>
                </div>
                <h2 class="text-h4 text-success font-weight-black mb-3 text-uppercase" style="letter-spacing: 1px;">¡Venta Exitosa!</h2>
                <p class="text-body-1 text-medium-emphasis mb-6">
                  {{ lastSaleResponse?.message || 'La venta ha sido registrada correctamente en el sistema.' }}
                </p>
                <div v-if="facturaData?.paymentMethod === 'efectivo' && facturaData?.montoRecibido" class="cambio-resultado neo-card-pressed rounded-xl pa-5 d-inline-block w-100">
                  <span class="text-button text-medium-emphasis d-block mb-1">Tu Cambio:</span>
                  <span class="text-h3 text-success font-weight-black">{{ formatHNL(facturaData.cambio || 0) }}</span>
                </div>
              </div>

              <v-card-actions class="pa-6 pt-2 pb-6 d-flex flex-column" style="gap: 16px;">
                <v-btn
                  color="primary"
                  variant="elevated"
                  size="x-large"
                  rounded="pill"
                  block
                  class="print-btn font-weight-bold text-body-1"
                  prepend-icon="mdi-receipt-text"
                  @click="openFactura"
                >
                  Ver Factura Completa
                </v-btn>
                <v-btn
                  variant="tonal"
                  color="medium-emphasis"
                  rounded="pill"
                  size="large"
                  block
                  class="font-weight-bold"
                  @click="showCheckout = false"
                >
                  Nueva Venta
                </v-btn>
              </v-card-actions>
            </div>
          </transition>
        </div>
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

    <!-- ===== Diálogo Escáner Mejorado ===== -->
    <v-dialog
      v-model="showScanner"
      :fullscreen="mobile"
      max-width="580"
      scrollable
      transition="dialog-bottom-transition"
    >
      <v-card
        class="scanner-card d-flex flex-column"
        :style="mobile ? 'height: 100dvh; border-radius: 0 !important;' : ''"
      >
        <!-- ── Toolbar ── -->
        <div class="scanner-toolbar d-flex align-center px-4" :class="mobile ? 'scanner-toolbar--mobile' : 'pa-4'">
          <v-btn icon variant="text" size="small" class="mr-2" @click="showScanner = false" aria-label="Cerrar escáner">
            <v-icon>{{ mobile ? 'mdi-arrow-left' : 'mdi-close' }}</v-icon>
          </v-btn>
          <div class="neo-circle-sm mr-3" v-if="!mobile" style="background: linear-gradient(135deg,#4A7BF7,#6B93FF);">
            <v-icon color="white" size="18">mdi-barcode-scan</v-icon>
          </div>
          <div>
            <p class="text-subtitle-1 font-weight-bold mb-0">Escanear producto</p>
            <p v-if="mobile" class="text-caption text-medium-emphasis mb-0 mt-n1">Apunta al código de barras</p>
          </div>
          <v-spacer />
          <!-- Linterna (solo móvil) -->
          <v-btn
            v-if="mobile"
            icon
            variant="elevated"
            color="surface"
            :class="['ml-1', torchOn ? 'text-warning' : 'text-medium-emphasis']"
            size="small"
            @click="toggleTorch"
            aria-label="Activar/desactivar linterna"
          >
            <v-icon>{{ torchOn ? 'mdi-flashlight-off' : 'mdi-flashlight' }}</v-icon>
          </v-btn>
        </div>

        <v-divider />

        <!-- ── Contenido scrollable ── -->
        <v-card-text class="pa-0 flex-grow-1" style="overflow-y: auto;">

          <!-- Viewfinder wrapper -->
          <div
            class="scanner-viewfinder-wrapper"
            :class="{ 'scanner-viewfinder-wrapper--mobile': mobile, 'scanner-flash': scanFlash }"
          >
            <!-- La librería monta el <video> aquí -->
            <div id="pos-scanner-reader" class="scanner-reader" />

            <!-- Marco decorativo con esquinas -->
            <div class="scanner-frame" aria-hidden="true">
              <span class="sc-corner sc-tl" />
              <span class="sc-corner sc-tr" />
              <span class="sc-corner sc-bl" />
              <span class="sc-corner sc-br" />
              <!-- Línea láser animada -->
              <div class="scanner-laser" />
            </div>

            <!-- Overlay de éxito al escanear -->
            <transition name="scan-success">
              <div v-if="scanFlash" class="scanner-success-overlay" aria-live="polite">
                <div class="scanner-success-badge">
                  <v-icon color="white" size="32">mdi-check-circle</v-icon>
                  <span class="text-body-2 font-weight-bold text-white ml-2">Agregado</span>
                </div>
              </div>
            </transition>

            <!-- Hint de qué apuntar -->
            <div v-if="!scannerStatus && !scannerError && !scanFlash" class="scanner-hint" aria-hidden="true">
              <v-icon size="14" class="mr-1" style="opacity:.7">mdi-barcode</v-icon>
              Centra el código dentro del recuadro
            </div>

          </div>

          <!-- ── Zona de resultados y acciones ── -->
          <div class="pa-4 pb-2" :class="mobile ? '' : 'px-6'">

            <!-- Feedback de escaneo -->
            <v-slide-y-transition>
              <div v-if="scannerStatus || scannerError" class="mb-3">
                <v-alert
                  v-if="scannerStatus"
                  type="success"
                  density="compact"
                  variant="tonal"
                  rounded="xl"
                  class="scanner-status-alert"
                >
                  <template #prepend>
                    <v-icon size="18">mdi-check-circle-outline</v-icon>
                  </template>
                  {{ scannerStatus }}
                </v-alert>
                <v-alert
                  v-if="scannerError"
                  type="error"
                  density="compact"
                  variant="tonal"
                  rounded="xl"
                  class="scanner-status-alert"
                >
                  <template #prepend>
                    <v-icon size="18">mdi-alert-circle-outline</v-icon>
                  </template>
                  {{ scannerError }}
                </v-alert>
              </div>
            </v-slide-y-transition>

            <!-- ── Sección IA ── -->
            <div class="scanner-ia-card mb-3">
              <div class="d-flex align-center mb-2">
                <div class="ia-icon-circle mr-3">
                  <v-icon size="18" color="white">mdi-creation</v-icon>
                </div>
                <div class="flex-grow-1">
                  <p class="text-body-2 font-weight-bold mb-0">Identificar con IA</p>
                  <p class="text-caption text-medium-emphasis mb-0">Sin código de barras</p>
                </div>
                <v-btn
                  color="secondary"
                  variant="elevated"
                  :size="mobile ? 'default' : 'small'"
                  rounded="pill"
                  :loading="iaRecognitionLoading"
                  @click="captureAndRecognize"
                  class="scanner-ia-btn"
                >
                  <v-icon start size="16">mdi-image-search</v-icon>
                  Identificar
                </v-btn>
              </div>

              <!-- IA Loading -->
              <div v-if="iaRecognitionLoading" class="text-center py-3">
                <div class="ia-pulse-wrapper mb-2">
                  <v-progress-circular indeterminate color="secondary" size="40" width="3" />
                  <div class="ia-pulse-ring" />
                </div>
                <p class="text-body-2 font-weight-medium mt-2">Analizando imagen...</p>
                <p class="text-caption text-medium-emphasis">Buscando en inventario</p>
              </div>

              <!-- IA Error -->
              <v-alert v-if="iaRecognitionError" type="warning" variant="tonal" density="compact" rounded="lg" class="mt-2">
                {{ iaRecognitionError }}
              </v-alert>

              <!-- IA Productos encontrados -->
              <div v-if="!iaRecognitionLoading && iaMatchedProducts.length > 0" class="mt-2">
                <p class="text-caption font-weight-bold text-success mb-2">
                  <v-icon size="14" class="mr-1">mdi-check-circle</v-icon>
                  {{ iaMatchedProducts.length }} coincidencia{{ iaMatchedProducts.length > 1 ? 's' : '' }} en inventario
                </p>
                <div class="d-flex flex-column" style="gap:8px;">
                  <v-card
                    v-for="(mp, idx) in iaMatchedProducts"
                    :key="idx"
                    class="neo-flat rounded-xl"
                    variant="flat"
                  >
                    <v-card-text class="pa-3">
                      <div class="ia-match-row">
                        <v-avatar size="40" rounded="lg" color="surface-variant" class="flex-shrink-0">
                          <v-img v-if="mp.product.image_url" :src="mp.product.image_url" cover />
                          <v-icon v-else size="20" color="medium-emphasis">mdi-package-variant</v-icon>
                        </v-avatar>
                        <div class="flex-grow-1 ml-2 min-width-0">
                          <p class="text-body-2 font-weight-bold text-truncate mb-0">{{ mp.product.name }}</p>
                          <p class="text-caption text-medium-emphasis mb-0">
                            L {{ mp.product.price?.toFixed(2) }} · {{ mp.product.stock ?? 0 }} en stock
                          </p>
                          <p class="text-caption text-medium-emphasis mb-0 font-italic">
                            {{ mp.match_reason }}
                          </p>
                        </div>
                        <div class="d-flex flex-column align-center ml-2 flex-shrink-0" style="gap:4px;">
                          <v-chip :color="iaGetConfidenceColor(mp.confidence)" size="x-small" variant="tonal">
                            {{ iaGetConfidenceLabel(mp.confidence) }}
                          </v-chip>
                          <v-btn
                            color="success"
                            size="small"
                            variant="elevated"
                            rounded="pill"
                            :disabled="(mp.product.stock ?? 0) <= 0"
                            @click="iaAddToCart(mp.product)"
                          >
                            <v-icon start size="14">mdi-cart-plus</v-icon>
                            Agregar
                          </v-btn>
                        </div>
                      </div>
                    </v-card-text>
                  </v-card>
                </div>
              </div>
            </div>

            <!-- ── Entrada manual (colapsable) ── -->
            <div class="scanner-manual-section">
              <button
                class="scanner-manual-toggle"
                @click="showManualEntry = !showManualEntry"
                :aria-expanded="showManualEntry"
              >
                <v-icon size="16" class="mr-2">mdi-keyboard-outline</v-icon>
                <span class="text-body-2">Ingresar código manualmente</span>
                <v-spacer />
                <v-icon size="16" :style="showManualEntry ? 'transform:rotate(180deg); transition:.2s' : 'transition:.2s'">
                  mdi-chevron-down
                </v-icon>
              </button>

              <v-expand-transition>
                <div v-if="showManualEntry" class="pt-3 pb-1">
                  <v-text-field
                    v-model="scannerManualCode"
                    label="Código de barras o SKU"
                    prepend-inner-icon="mdi-barcode"
                    variant="outlined"
                    density="comfortable"
                    rounded="lg"
                    @keyup.enter="buscarManual"
                    class="mb-2"
                    autofocus
                  />
                  <v-btn
                    color="primary"
                    block
                    variant="elevated"
                    prepend-icon="mdi-magnify"
                    rounded="lg"
                    @click="buscarManual"
                  >
                    Buscar producto
                  </v-btn>
                </div>
              </v-expand-transition>
            </div>

          </div>
        </v-card-text>

        <!-- Acceso al carrito en móvil, en la misma posición del FAB principal -->
        <div
          v-if="mobile && carritoStore.items.length > 0"
          class="scanner-mobile-cart-overlay"
        >
          <v-btn
            color="success"
            size="large"
            rounded="pill"
            class="px-6 mobile-fab-btn scanner-floating-cart-btn"
            :class="{ 'scanner-floating-cart-btn--pulse': scannerCartPulse }"
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

        <!-- Botón cerrar (solo desktop) -->
        <v-card-actions v-if="!mobile" class="pa-4 pt-2">
          <v-btn variant="text" @click="showScanner = false">Cerrar</v-btn>
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
    <div v-if="mobile && carritoStore.items.length > 0 && !showScanner" class="mobile-cart-fab d-flex d-md-none">
      <v-btn
        color="success"
        size="large"
        rounded="pill"
        class="px-6 mobile-fab-btn"
        :class="{ 'scanner-floating-cart-btn--pulse': scannerCartPulse }"
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
                  <button
                    class="mobile-qty-chip mx-2 text-body-1 font-weight-bold"
                    style="min-width: 40px; text-align: center;"
                    @click.stop="openMobileQtyDialog(index, item)"
                    :aria-label="`Editar cantidad de ${item.product.name}`"
                  >
                    {{ productSellsByWeight(item.product) ? item.quantity.toFixed(2) : item.quantity }}
                  </button>
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
            <!-- Promociones aplicadas en móvil -->
            <div v-if="promocionesElegibles.length > 0" class="mb-2">
              <div class="d-flex align-center mb-1">
                <v-icon size="14" color="success" class="mr-1">mdi-check-decagram</v-icon>
                <span class="text-caption font-weight-medium">Promociones aplicadas</span>
              </div>
              <div class="d-flex flex-wrap ga-1">
                <v-chip
                  v-for="promo in promocionesElegibles"
                  :key="`mob-${promo.source}:${promo.id}`"
                  size="x-small"
                  variant="tonal"
                  :color="promocionAplicadaId === `${promo.source}:${promo.id}` ? 'success' : 'primary'"
                >
                  <v-icon v-if="promocionAplicadaId === `${promo.source}:${promo.id}`" start size="12">mdi-check-circle</v-icon>
                  {{ promo.name }} · -{{ formatHNL(promo.amount) }}
                </v-chip>
              </div>
              <v-divider class="my-2" />
            </div>
            <div class="d-flex justify-space-between text-body-2 mb-1">
              <span class="text-medium-emphasis">Subtotal</span>
              <span>{{ formatHNL(carritoStore.getSubtotal()) }}</span>
            </div>
            <div class="d-flex justify-space-between text-body-2 mb-2">
              <span class="text-medium-emphasis">ISV (15%)</span>
              <span>{{ formatHNL(carritoStore.getTax()) }}</span>
            </div>
            <div v-if="carritoStore.discount > 0" class="d-flex justify-space-between text-body-2 mb-2">
              <span class="text-success">Descuento</span>
              <span class="text-success">-{{ formatHNL(carritoStore.discount) }}</span>
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

    <!-- Diálogo de edición de cantidad (móvil) -->
    <v-dialog v-model="showMobileQtyDialog" max-width="380">
      <v-card class="neo-elevated rounded-xl">
        <v-card-title class="d-flex align-center pa-5 pb-3">
          <v-icon color="primary" class="mr-2">mdi-numeric</v-icon>
          Editar cantidad
        </v-card-title>

        <v-card-text class="px-5 pb-3">
          <p class="text-body-2 text-medium-emphasis mb-3">
            {{ mobileQtyProductName }}
          </p>

          <v-text-field
            v-model.number="mobileQtyValue"
            :label="mobileQtySellsByWeight ? 'Cantidad (lb)' : 'Cantidad (uds)'"
            type="number"
            :min="mobileQtySellsByWeight ? 0.25 : 1"
            :step="mobileQtySellsByWeight ? 0.25 : 1"
            :max="mobileQtyMax"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-counter"
            @keyup.enter="confirmMobileQty"
          />
        </v-card-text>

        <v-card-actions class="pa-5 pt-0">
          <v-btn variant="text" @click="showMobileQtyDialog = false">Cancelar</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" @click="confirmMobileQty">
            Guardar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
  background-color: var(--neo-bg) !important;
  border-radius: var(--neo-radius) !important;
  transition: box-shadow 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: var(--neo-raised) !important;
  user-select: none;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.v-theme--dark .producto-card {
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.producto-card:hover {
  transform: translateY(-4px) scale(1.015);
  box-shadow: var(--neo-raised-lg) !important;
}

.producto-card:active,
.producto-card.producto-card-added {
  box-shadow: var(--neo-pressed) !important;
  background-color: var(--neo-bg-alt) !important;
  transform: translateY(3px) scale(0.95);
  border-color: transparent;
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
  margin: 10px 10px 0 10px;
  border-radius: var(--neo-radius-sm);
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
  transition: background-color 0.35s ease;
}

.carrito-header--pulse {
  background-color: rgba(var(--v-theme-success), 0.12);
}

.carrito-header-icon {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.carrito-header--pulse .carrito-header-icon {
  animation: header-icon-pulse 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes header-icon-pulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.3) rotate(-8deg); }
  100% { transform: scale(1) rotate(0deg); }
}

.cart-item {
  border-radius: var(--neo-radius-xs);
  box-shadow: var(--neo-flat) !important;
  transition: box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--neo-bg);
  position: relative;
  overflow: hidden;
}

.cart-item:hover {
  box-shadow: var(--neo-raised-sm) !important;
}

/* ===== Cart item TransitionGroup animations ===== */
.cart-item-enter-active {
  transition: opacity 0.36s cubic-bezier(0.34, 1.56, 0.64, 1),
              transform 0.36s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.cart-item-enter-from {
  opacity: 0;
  transform: translateX(28px) scale(0.93);
}

.cart-item-enter-to {
  opacity: 1;
  transform: translateX(0) scale(1);
}

.cart-item-leave-active {
  transition: opacity 0.26s ease-in,
              transform 0.26s ease-in,
              max-height 0.3s ease,
              margin-bottom 0.3s ease,
              padding-top 0.3s ease,
              padding-bottom 0.3s ease;
  max-height: 200px;
  overflow: hidden;
}

.cart-item-leave-from {
  opacity: 1;
  transform: translateX(0) scale(1);
  max-height: 200px;
}

.cart-item-leave-to {
  opacity: 0;
  transform: translateX(-24px) scale(0.92);
  max-height: 0;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.cart-item-move {
  transition: transform 0.34s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Glow bounce al agregar item */
.cart-item--just-added {
  animation: cart-item-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes cart-item-pop {
  0%   { box-shadow: var(--neo-flat) !important; }
  40%  { box-shadow: 0 0 0 3px rgba(var(--v-theme-success), 0.55), var(--neo-raised-sm) !important; }
  100% { box-shadow: var(--neo-flat) !important; }
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
  letter-spacing: 0.5px !important;
  transition: box-shadow 0.25s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.cobrar-btn:hover {
  transform: translateY(-1px);
}

/* Cobrar activo: gradiente verde + shimmer */
.cobrar-btn--active {
  background: linear-gradient(135deg, #43A047 0%, #66BB6A 60%, #81C784 100%) !important;
  color: white !important;
  box-shadow: 0 4px 16px rgba(76, 175, 80, 0.45) !important;
}

.cobrar-btn--active:hover {
  box-shadow: 0 6px 22px rgba(76, 175, 80, 0.58) !important;
  transform: translateY(-2px);
}

.cobrar-btn--active:active {
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.35) !important;
  transform: translateY(1px) scale(0.98);
}

@keyframes cobrar-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.cobrar-btn--active::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba(255, 255, 255, 0.22) 45%,
    rgba(255, 255, 255, 0.05) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: cobrar-shimmer 2.8s linear infinite;
  border-radius: inherit;
  pointer-events: none;
}

/* Confirmar button in checkout */
.confirmar-btn {
  box-shadow: 0 4px 14px rgba(76, 175, 80, 0.4) !important;
}

.confirmar-btn:hover {
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.5) !important;
}

.select-payment-btn {
  box-shadow: 0 4px 14px rgba(74, 123, 247, 0.4) !important;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease !important;
}
.select-payment-btn:hover {
  box-shadow: 0 6px 20px rgba(74, 123, 247, 0.5) !important;
  transform: translateY(-2px);
}

.print-btn {
  background: linear-gradient(135deg, #4A7BF7 0%, #6B93FF 100%) !important;
  color: white !important;
  box-shadow: 0 6px 16px rgba(74, 123, 247, 0.35) !important;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease !important;
  letter-spacing: 0.5px !important;
}

.print-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(74, 123, 247, 0.45) !important;
}

/* Payment method cards */
.payment-method-card {
  padding: 20px 16px;
  text-align: center;
  cursor: pointer;
  border-radius: var(--neo-radius);
  background: var(--neo-bg);
  box-shadow: var(--neo-raised);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.v-theme--dark .payment-method-card {
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.payment-method-card:hover {
  box-shadow: var(--neo-raised-lg);
  transform: translateY(-3px);
}

.payment-method-card:active {
  box-shadow: var(--neo-pressed);
  transform: scale(0.97);
  background: var(--neo-bg-alt);
}

.payment-method-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.payment-method-card:hover .payment-method-icon {
  transform: scale(1.1) rotate(5deg);
}

/* ===== Checkout Dialog ===== */
.checkout-card {
  overflow: hidden !important;
  border-radius: 24px !important;
  background-color: var(--neo-bg) !important;
  box-shadow: var(--neo-raised-lg) !important;
}

.checkout-steps {
  background: var(--neo-bg-alt);
  position: relative;
  z-index: 2;
  box-shadow: 0 4px 10px rgba(0,0,0,0.05);
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
}

.checkout-content-wrapper {
  position: relative;
  overflow: hidden;
  min-height: 250px; /* Minimum height to prevent bouncy reflows if possible */
}

/* Transition animations for checkout pages */
.checkout-slide-enter-active,
.checkout-slide-leave-active {
  transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.checkout-slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.checkout-slide-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.step-indicator {
  display: flex;
  align-items: center;
}

.step-dot {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised-sm);
  color: rgba(0, 0, 0, 0.3);
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.step-dot.active {
  background: linear-gradient(135deg, #4A7BF7, #6B93FF);
  color: white;
  box-shadow: 0 4px 12px rgba(74, 123, 247, 0.45);
  transform: scale(1.1);
}

.step-line {
  width: 40px;
  height: 4px;
  background: var(--neo-bg);
  box-shadow: var(--neo-pressed-sm);
  border-radius: 2px;
  margin: 0 6px;
  transition: var(--neo-transition);
}

.step-line.active {
  background: linear-gradient(90deg, #4A7BF7, #6B93FF);
  box-shadow: 0 2px 6px rgba(74, 123, 247, 0.35);
}

/* Total badge in cash step */
.neo-total-badge {
  display: inline-block;
  padding: 16px 28px;
  border-radius: var(--neo-radius);
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Quick amount buttons */
.quick-amount-btn {
  font-weight: 700 !important;
  letter-spacing: 0.5px !important;
  transition: all 0.25s ease !important;
}

.quick-amount-btn--active {
  background: linear-gradient(135deg, #43A047, #66BB6A) !important;
  color: white !important;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4) !important;
  transform: scale(1.05);
}

/* Change box */
.cambio-box {
  padding: 24px;
  border-radius: var(--neo-radius);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  margin-bottom: 20px;
}

.cambio-box--valid {
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed);
  border: 2px solid rgba(var(--v-theme-success), 0.5);
  transform: scale(1.02);
}

.cambio-box--invalid {
  background: var(--neo-bg);
  box-shadow: var(--neo-pressed-sm);
  border: 2px solid rgba(var(--v-theme-error), 0.3);
}

/* Success animation */
.success-icon-wrapper {
  display: inline-block;
}

@keyframes success-bounce {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.25); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); opacity: 1; }
}

.success-icon-animate {
  animation: success-bounce 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.cambio-resultado {
  border-radius: var(--neo-radius);
  transition: transform 0.3s ease;
}
.cambio-resultado:hover {
  transform: translateY(-2px);
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

.scanner-mobile-cart-overlay {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2600;
}

.scanner-floating-cart-btn {
  backdrop-filter: blur(6px);
}

@keyframes scanner-cart-pulse {
  0% { transform: scale(1); }
  35% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

.scanner-floating-cart-btn--pulse {
  animation: scanner-cart-pulse 0.45s ease;
}

.mobile-qty-chip {
  border: none;
  cursor: pointer;
  border-radius: 14px;
  padding: 4px 8px;
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed-sm);
  color: inherit;
}

.mobile-qty-chip:hover {
  background: rgba(var(--v-theme-primary), 0.12);
}

.gap-3 {
  gap: 12px;
}



.pb-safe {
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

/* ===== Scanner Mejorado ===== */

/* Toolbar */
.scanner-toolbar {
  min-height: 56px;
  background: var(--neo-bg-alt);
  flex-shrink: 0;
}

.scanner-toolbar--mobile {
  min-height: 64px;
  padding-top: max(12px, env(safe-area-inset-top)) !important;
}

/* Viewfinder wrapper */
.scanner-viewfinder-wrapper {
  position: relative;
  background: #000;
  overflow: hidden;
  flex-shrink: 0;
}

.scanner-viewfinder-wrapper--mobile {
  /* ~ 50% de la pantalla en móvil */
  aspect-ratio: 4 / 3;
  max-height: 52vh;
}

/* El div donde html5-qrcode monta el video */
.scanner-reader {
  width: 100% !important;
  height: 100% !important;
}

.scanner-reader :deep(video) {
  object-fit: cover !important;
  width: 100% !important;
  height: 100% !important;
}

.scanner-reader :deep(canvas) {
  display: none !important;
}

/* Ocultar UI nativa de html5-qrcode */
.scanner-reader :deep(#qr-shaded-region) {
  border: none !important;
}

/* Marco con esquinas decorativas */
.scanner-frame {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}

.sc-corner {
  position: absolute;
  width: 22px;
  height: 22px;
  border-color: rgba(255, 255, 255, 0.9);
  border-style: solid;
}

.sc-tl { top: 20%; left: 12%; border-width: 3px 0 0 3px; border-radius: 4px 0 0 0; }
.sc-tr { top: 20%; right: 12%; border-width: 3px 3px 0 0; border-radius: 0 4px 0 0; }
.sc-bl { bottom: 20%; left: 12%; border-width: 0 0 3px 3px; border-radius: 0 0 0 4px; }
.sc-br { bottom: 20%; right: 12%; border-width: 0 3px 3px 0; border-radius: 0 0 4px 0; }

/* Línea láser animada */
@keyframes laser-scan {
  0%   { top: 22%; opacity: 1; }
  48%  { opacity: 1; }
  50%  { top: 77%; opacity: 0.8; }
  52%  { opacity: 1; }
  100% { top: 22%; opacity: 1; }
}

.scanner-laser {
  position: absolute;
  left: 13%;
  right: 13%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #ff3b3b, #ff6b6b, #ff3b3b, transparent);
  border-radius: 2px;
  box-shadow: 0 0 8px 2px rgba(255, 59, 59, 0.55);
  animation: laser-scan 2.4s ease-in-out infinite;
  top: 22%;
  z-index: 3;
}

/* Hint de centrado */
.scanner-hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
  background: rgba(0, 0, 0, 0.45);
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
  z-index: 4;
  backdrop-filter: blur(4px);
}

/* Flash verde de éxito */
@keyframes scanner-flash-in {
  0%   { opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}

.scanner-success-overlay {
  position: absolute;
  inset: 0;
  background: rgba(76, 175, 80, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  animation: scanner-flash-in 0.7s ease forwards;
}

.scanner-success-badge {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 10px 20px;
  border-radius: 40px;
  backdrop-filter: blur(6px);
}

/* Flash border */
.scanner-flash .scanner-viewfinder-wrapper {
  outline: 3px solid rgb(var(--v-theme-success));
}

/* Transition del overlay */
.scan-success-enter-active,
.scan-success-leave-active {
  transition: opacity 0.3s ease;
}
.scan-success-enter-from,
.scan-success-leave-to {
  opacity: 0;
}

/* Status alert */
.scanner-status-alert {
  font-size: 13px !important;
}

/* IA Card */
.scanner-ia-card {
  background: var(--neo-bg-alt);
  border-radius: var(--neo-radius-sm);
  box-shadow: var(--neo-flat);
  padding: 14px 16px;
}

.ia-icon-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgb(var(--v-theme-secondary)), rgba(var(--v-theme-secondary), 0.7));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(var(--v-theme-secondary), 0.35);
}

.scanner-ia-btn {
  letter-spacing: 0 !important;
  min-width: 100px;
}

/* IA Loading pulse */
.ia-pulse-wrapper {
  position: relative;
  display: inline-block;
}

@keyframes ia-pulse {
  0% { transform: scale(1); opacity: 0.5; }
  100% { transform: scale(1.8); opacity: 0; }
}

.ia-pulse-ring {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 2px solid rgb(var(--v-theme-secondary));
  animation: ia-pulse 1.4s ease-out infinite;
}

/* IA match row */
.ia-match-row {
  display: flex;
  align-items: center;
  background: rgba(var(--v-theme-success), 0.07);
  border: 1px solid rgba(var(--v-theme-success), 0.3);
  border-radius: 12px;
  padding: 8px 10px;
}

/* Manual entry collapsible */
.scanner-manual-section {
  border-radius: var(--neo-radius-sm);
  background: var(--neo-bg);
  box-shadow: var(--neo-flat);
  padding: 10px 14px;
}

.scanner-manual-toggle {
  display: flex;
  align-items: center;
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  padding: 2px 0;
  text-align: left;
  gap: 0;
}

.scanner-manual-toggle:hover {
  opacity: 0.8;
}

.min-width-0 {
  min-width: 0;
}

/* ===== Nuevos estilos neumórficos del carrito ===== */

/* Estado vacío flotante */
.cart-empty-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: cart-empty-float 3.2s ease-in-out infinite;
}

@keyframes cart-empty-float {
  0%, 100% {
    transform: translateY(0);
    box-shadow: var(--neo-raised);
  }
  50% {
    transform: translateY(-9px);
    box-shadow: var(--neo-raised-lg);
  }
}

/* Botones de cantidad neumórficos nativos */
.qty-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  flex-shrink: 0;
  transition: box-shadow 0.15s ease, transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.qty-btn:hover {
  box-shadow: var(--neo-raised);
}

.qty-btn:active {
  box-shadow: var(--neo-pressed-sm) !important;
  transform: scale(0.85);
}

.qty-btn--plus {
  color: rgb(var(--v-theme-primary));
}

.qty-btn--minus {
  opacity: 0.75;
}

.qty-btn--minus:hover {
  opacity: 1;
}

/* Botón eliminar del carrito */
.cart-item-delete {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: var(--neo-bg);
  box-shadow: var(--neo-raised-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgb(var(--v-theme-error));
  opacity: 0.6;
  flex-shrink: 0;
  transition: opacity 0.2s ease, box-shadow 0.2s ease, transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.cart-item-delete:hover {
  opacity: 1;
  box-shadow: var(--neo-raised);
}

.cart-item-delete:active {
  box-shadow: var(--neo-pressed-sm) !important;
  transform: scale(0.85);
}

/* Badge de precio por item */
.cart-item-price {
  font-weight: 700;
  font-size: 0.88rem;
  color: rgb(var(--v-theme-primary));
  background: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed-sm);
  border-radius: 10px;
  padding: 3px 10px;
  white-space: nowrap;
  display: inline-block;
}

/* Bounce del total al cambiar */
.total-updated {
  animation: total-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: inline-block;
}

@keyframes total-bounce {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.12); }
  100% { transform: scale(1); }
}
</style>
