<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useDisplay } from 'vuetify'
import { useProductosStore } from '@/stores/productos'
import { useCarritoStore } from '@/stores/carrito'
import { useAuthStore } from '@/stores/auth'
import { procesarVenta } from '@/services/edge-functions'
import type { ProcesarVentaResponse } from '@/services/edge-functions'
import { Html5QrcodeScanner } from 'html5-qrcode'
import FacturaRecibo from '@/components/pos/FacturaRecibo.vue'
import type { FacturaData } from '@/components/pos/FacturaRecibo.vue'

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

let barcodeScanner: Html5QrcodeScanner | null = null
let unsubscribe: (() => void) | null = null

onMounted(async () => {
  await productosStore.fetchProducts()
  unsubscribe = productosStore.subscribeToChanges()
})

onUnmounted(() => {
  unsubscribe?.()
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

// Productos filtrados
const productosFiltrados = computed(() => {
  if (!searchQuery.value) return productosStore.products
  const query = searchQuery.value.toLowerCase()
  return productosStore.products.filter(p =>
    p.name.toLowerCase().includes(query) ||
    p.barcode?.includes(query) ||
    p.sku?.toLowerCase().includes(query)
  )
})

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
  return palette[Math.abs(hash) % palette.length]
}

function isLowStock(producto: any): boolean {
  const stock = producto.stock ?? 0
  const min = producto.min_stock ?? 5
  return stock > 0 && stock <= min
}

function agregarAlCarrito(producto: any) {
  carritoStore.addItem(producto)
  // Feedback visual: animar la tarjeta por 600ms
  lastAddedId.value = producto.id
  setTimeout(() => { lastAddedId.value = null }, 600)
}

async function handleBarcode(code: string) {
  const barcode = code.trim()
  if (!barcode) return

  const product = await productosStore.getByBarcode(barcode)
  if (!product) {
    scannerError.value = 'No se encontró producto para ese código.'
    return
  }
  if ((product.stock || 0) <= 0) {
    scannerError.value = 'El producto está sin stock.'
    return
  }
  scannerError.value = ''
  scannerStatus.value = `Producto agregado: ${product.name}`
  carritoStore.addItem(product)
}

async function initScanner() {
  if (barcodeScanner) return
  try {
    barcodeScanner = new Html5QrcodeScanner(
      'pos-scanner-reader',
      { fps: 10, qrbox: { width: 260, height: 120 } },
      false
    )
    barcodeScanner.render(
      async (decodedText) => { await handleBarcode(decodedText) },
      () => {}
    )
  } catch {
    scannerError.value = 'No se pudo iniciar la cámara de escaneo.'
  }
}

async function clearScanner() {
  if (!barcodeScanner) return
  try { await barcodeScanner.clear() } catch {} finally { barcodeScanner = null }
}

function buscarManual() {
  handleBarcode(scannerManualCode.value)
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
    const response = await procesarVenta({
      items: carritoStore.getSaleItems(),
      total: carritoStore.getTotal(),
      subtotal: carritoStore.getSubtotal(),
      tax_amount: carritoStore.getTax(),
      discount: carritoStore.discount,
      payment_method: carritoStore.paymentMethod,
      customer_name: customerName.value || undefined,
      customer_rtn: customerRtn.value || undefined,
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
            <div class="d-flex align-center mb-5">
              <div class="neo-circle-sm mr-3 d-none d-sm-flex" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
                <v-icon color="white" size="20">mdi-point-of-sale</v-icon>
              </div>
              <h2 class="text-h6 font-weight-bold">Punto de Venta</h2>
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
              class="mb-5"
            />

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
                    'producto-card-added': lastAddedId === producto.id
                  }"
                  :disabled="(producto.stock || 0) <= 0"
                  role="button"
                  tabindex="0"
                  :aria-label="`Agregar ${producto.name} al carrito, precio ${formatHNL(producto.price)}`"
                  @click="agregarAlCarrito(producto)"
                  @keydown.enter="agregarAlCarrito(producto)"
                  @keydown.space.prevent="agregarAlCarrito(producto)"
                >
                  <!-- Imagen del producto o placeholder por categoría -->
                  <v-img
                    v-if="producto.image_url"
                    :src="producto.image_url"
                    height="100"
                    cover
                    class="neo-rounded-sm"
                  />
                  <div
                    v-else
                    class="producto-placeholder d-flex align-center justify-center"
                    :style="{ background: getCategoryGradient(producto) }"
                  >
                    <span class="text-h5 font-weight-bold" style="color: rgba(255,255,255,0.9)">
                      {{ producto.name.charAt(0).toUpperCase() }}
                    </span>
                  </div>

                  <v-card-text class="pa-3">
                    <div class="text-subtitle-2 text-truncate font-weight-medium">
                      {{ producto.name }}
                    </div>
                    <div class="d-flex justify-space-between align-center mt-2">
                      <span class="text-body-1 text-primary font-weight-bold">
                        {{ formatHNL(producto.price) }}
                      </span>
                      <v-chip
                        :color="(producto.stock || 0) <= 0 ? 'error' : isLowStock(producto) ? 'warning' : 'success'"
                        size="x-small"
                        variant="tonal"
                      >
                        {{ producto.stock }}
                      </v-chip>
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
          <v-card-text class="pa-0" style="height: calc(100% - 250px); overflow-y: auto;">
            <v-list v-if="carritoStore.items.length > 0" density="compact" class="pa-2">
              <v-list-item
                v-for="(item, index) in carritoStore.items"
                :key="index"
                class="mb-1 neo-flat pa-2"
                rounded="lg"
              >
                <template #prepend>
                  <v-avatar size="40" rounded="lg" class="neo-pressed-sm">
                    <v-img :src="item.product.image_url || 'https://placehold.co/40'" />
                  </v-avatar>
                </template>

                <v-list-item-title class="text-body-2 font-weight-medium">
                  {{ item.product.name }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption">
                  {{ formatHNL(item.product.price) }} x {{ item.quantity }}
                </v-list-item-subtitle>

                <template #append>
                  <div class="d-flex align-center">
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="carritoStore.decrementItem(index)"
                    >
                      <v-icon size="16">mdi-minus</v-icon>
                    </v-btn>
                    <span class="mx-1 text-body-2 font-weight-bold">{{ item.quantity }}</span>
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="carritoStore.incrementItem(index)"
                    >
                      <v-icon size="16">mdi-plus</v-icon>
                    </v-btn>
                    <v-btn
                      icon
                      size="x-small"
                      color="error"
                      variant="text"
                      @click.stop="carritoStore.removeItem(index)"
                    >
                      <v-icon size="16">mdi-delete-outline</v-icon>
                    </v-btn>
                  </div>
                </template>
              </v-list-item>
            </v-list>

            <!-- Carrito vacío -->
            <div v-else class="text-center py-12">
              <div class="neo-circle mx-auto mb-4">
                <v-icon size="28" color="grey-lighten-1">mdi-cart-outline</v-icon>
              </div>
              <p class="text-body-2 text-medium-emphasis">Carrito vacío</p>
              <p class="text-caption text-disabled">Selecciona productos para agregar</p>
            </div>
          </v-card-text>

          <v-divider />

          <!-- Totales -->
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between mb-1 text-body-2">
              <span class="text-medium-emphasis">Subtotal:</span>
              <span>{{ formatHNL(carritoStore.getSubtotal()) }}</span>
            </div>
            <div class="d-flex justify-space-between mb-1 text-body-2">
              <span class="text-medium-emphasis">ISV:</span>
              <span>{{ formatHNL(carritoStore.getTax()) }}</span>
            </div>
            <div class="neo-divider" />
            <div class="d-flex justify-space-between text-h6 font-weight-bold">
              <span>Total:</span>
              <span class="text-primary">{{ formatHNL(carritoStore.getTotal()) }}</span>
            </div>
          </v-card-text>

          <!-- Acciones -->
          <v-card-actions class="pa-4 pt-0">
            <v-btn
              color="error"
              variant="outlined"
              @click="carritoStore.clearCart()"
              :disabled="carritoStore.items.length === 0"
            >
              <v-icon start>mdi-delete-outline</v-icon>
              Limpiar
            </v-btn>
            <v-spacer />
            <v-btn
              color="success"
              size="large"
              @click="showCheckout = true"
              :disabled="carritoStore.items.length === 0"
              class="px-6"
            >
              <v-icon start>mdi-cash-register</v-icon>
              Cobrar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Diálogo de Checkout Multi-Paso -->
    <v-dialog v-model="showCheckout" max-width="520" persistent>
      <v-card>
        <!-- === PASO 1: Selección método de pago === -->
        <template v-if="checkoutStep === 'payment'">
          <div class="pa-6 text-center">
            <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #66BB6A, #81C784);">
              <v-icon color="white" size="28">mdi-cash-register</v-icon>
            </div>
            <h3 class="text-h6 mb-1">Finalizar Venta</h3>
            <p class="text-h5 font-weight-bold text-primary mt-2">
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
                <v-card
                  class="pa-4 text-center cursor-pointer"
                  :color="carritoStore.paymentMethod === 'efectivo' ? 'success' : undefined"
                  :variant="carritoStore.paymentMethod === 'efectivo' ? 'elevated' : 'outlined'"
                  @click="selectPaymentMethod('efectivo')"
                >
                  <v-icon size="36" :color="carritoStore.paymentMethod === 'efectivo' ? 'white' : 'success'">
                    mdi-cash-multiple
                  </v-icon>
                  <div class="text-body-2 font-weight-bold mt-2" :class="carritoStore.paymentMethod === 'efectivo' ? 'text-white' : ''">
                    Efectivo
                  </div>
                </v-card>
              </v-col>
              <v-col cols="6">
                <v-card
                  class="pa-4 text-center cursor-pointer"
                  :color="carritoStore.paymentMethod === 'tarjeta' ? 'primary' : undefined"
                  :variant="carritoStore.paymentMethod === 'tarjeta' ? 'elevated' : 'outlined'"
                  @click="selectPaymentMethod('tarjeta')"
                >
                  <v-icon size="36" :color="carritoStore.paymentMethod === 'tarjeta' ? 'white' : 'primary'">
                    mdi-credit-card-outline
                  </v-icon>
                  <div class="text-body-2 font-weight-bold mt-2" :class="carritoStore.paymentMethod === 'tarjeta' ? 'text-white' : ''">
                    Tarjeta
                  </div>
                </v-card>
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
          <div class="pa-6 text-center">
            <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #66BB6A, #81C784);">
              <v-icon color="white" size="28">mdi-cash-multiple</v-icon>
            </div>
            <h3 class="text-h6 mb-1">Pago en Efectivo</h3>
            <p class="text-body-2 text-medium-emphasis">
              Total a cobrar: <strong class="text-primary">{{ formatHNL(carritoStore.getTotal()) }}</strong>
            </p>
          </div>

          <v-card-text class="px-6 pb-4">
            <!-- Montos rápidos -->
            <p class="text-subtitle-2 font-weight-bold mb-2">Monto rápido</p>
            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn
                v-for="monto in montosRapidos"
                :key="monto"
                :variant="montoRecibido === monto ? 'elevated' : 'outlined'"
                :color="montoRecibido === monto ? 'success' : undefined"
                size="small"
                @click="setQuickAmount(monto)"
              >
                {{ formatHNL(monto) }}
              </v-btn>
            </div>

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
            <div v-if="montoRecibido !== null" class="neo-card-pressed pa-4 text-center mb-4">
              <p class="text-caption text-medium-emphasis mb-1">CAMBIO A DEVOLVER</p>
              <p class="text-h4 font-weight-bold" :class="cashValid ? 'text-success' : 'text-error'">
                {{ formatHNL(cambio) }}
              </p>
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
              size="large"
              :disabled="!cashValid"
              :loading="processingPayment"
              @click="finalizarVenta"
            >
              <v-icon start>mdi-check</v-icon>
              Confirmar Cobro
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
            <v-icon size="72" color="success" class="mb-3">mdi-check-circle-outline</v-icon>
            <h3 class="text-h5 text-success font-weight-bold mb-2">¡Venta Exitosa!</h3>
            <p class="text-body-2 text-medium-emphasis mb-1">
              {{ lastSaleResponse?.message }}
            </p>
            <p v-if="carritoStore.paymentMethod === 'efectivo' && montoRecibido" class="text-body-1">
              Cambio: <strong class="text-success">{{ formatHNL(cambio) }}</strong>
            </p>
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
          <div id="pos-scanner-reader" class="neo-flat pa-2 mb-3" />

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
    <v-bottom-sheet v-model="showMobileCart" max-height="80vh">
      <v-card class="rounded-t-xl" style="border-radius: 24px 24px 0 0 !important;">
        <!-- Handle -->
        <div class="d-flex justify-center pt-3 pb-1">
          <div style="width: 40px; height: 4px; background: rgba(0,0,0,0.15); border-radius: 4px;" />
        </div>

        <!-- Header -->
        <div class="px-4 pb-2 d-flex align-center">
          <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg,#66BB6A,#81C784);">
            <v-icon color="white" size="18">mdi-cart</v-icon>
          </div>
          <span class="text-subtitle-1 font-weight-bold">Carrito</span>
          <v-chip color="primary" variant="tonal" size="small" class="ml-2">
            {{ carritoStore.getItemCount() }} items
          </v-chip>
          <v-spacer />
          <v-btn icon size="small" variant="text" @click="showMobileCart = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>

        <v-divider />

        <!-- Lista de items -->
        <div style="max-height: 40vh; overflow-y: auto;">
          <v-list density="compact" class="pa-2">
            <v-list-item
              v-for="(item, index) in carritoStore.items"
              :key="index"
              class="mb-1 neo-flat pa-2"
              rounded="lg"
            >
              <v-list-item-title class="text-body-2 font-weight-medium">{{ item.product.name }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption">{{ formatHNL(item.product.price) }} x {{ item.quantity }}</v-list-item-subtitle>
              <template #append>
                <div class="d-flex align-center">
                  <v-btn icon size="x-small" variant="text" @click.stop="carritoStore.decrementItem(index)">
                    <v-icon size="16">mdi-minus</v-icon>
                  </v-btn>
                  <span class="mx-1 text-body-2 font-weight-bold">{{ item.quantity }}</span>
                  <v-btn icon size="x-small" variant="text" @click.stop="carritoStore.incrementItem(index)">
                    <v-icon size="16">mdi-plus</v-icon>
                  </v-btn>
                  <v-btn icon size="x-small" color="error" variant="text" @click.stop="carritoStore.removeItem(index)">
                    <v-icon size="16">mdi-delete-outline</v-icon>
                  </v-btn>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </div>

        <v-divider />

        <!-- Totales y acción -->
        <div class="pa-4">
          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span class="text-medium-emphasis">Subtotal:</span>
            <span>{{ formatHNL(carritoStore.getSubtotal()) }}</span>
          </div>
          <div class="d-flex justify-space-between text-body-2 mb-2">
            <span class="text-medium-emphasis">ISV:</span>
            <span>{{ formatHNL(carritoStore.getTax()) }}</span>
          </div>
          <div class="d-flex justify-space-between text-h6 font-weight-bold mb-4">
            <span>Total:</span>
            <span class="text-primary">{{ formatHNL(carritoStore.getTotal()) }}</span>
          </div>
          <div class="d-flex gap-3">
            <v-btn color="error" variant="outlined" @click="carritoStore.clearCart(); showMobileCart = false">
              <v-icon start>mdi-delete-outline</v-icon>
              Limpiar
            </v-btn>
            <v-btn
              color="success"
              size="large"
              flex="1"
              block
              class="ml-2"
              @click="showMobileCart = false; showCheckout = true"
            >
              <v-icon start>mdi-cash-register</v-icon>
              Cobrar
            </v-btn>
          </div>
        </div>
      </v-card>
    </v-bottom-sheet>

  </v-container>
</template>

<style scoped>
.producto-card {
  cursor: pointer;
  transition: var(--neo-transition);
  box-shadow: var(--neo-raised) !important;
  user-select: none;
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

/* Borde de advertencia para stock bajo */
.producto-card-low-stock {
  border-left: 3px solid rgb(var(--v-theme-warning)) !important;
}

/* Placeholder de imagen con color de categoría */
.producto-placeholder {
  height: 100px;
  border-radius: var(--neo-radius-sm) var(--neo-radius-sm) 0 0;
}

/* FAB del carrito en móvil */
.mobile-cart-fab {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
}

.mobile-fab-btn {
  box-shadow: 0 4px 12px rgba(102, 187, 106, 0.4) !important;
  min-width: 200px;
}

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

.gap-3 {
  gap: 12px;
}
</style>
