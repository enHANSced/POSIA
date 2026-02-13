<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useProductosStore } from '@/stores/productos'
import { useCarritoStore } from '@/stores/carrito'
import { createSale } from '@/services/database'

const productosStore = useProductosStore()
const carritoStore = useCarritoStore()

const searchQuery = ref('')
const showScanner = ref(false)
const showCheckout = ref(false)
const processingPayment = ref(false)
const saleSuccess = ref(false)
const saleError = ref('')

// Cargar productos y suscribir a realtime
let unsubscribe: (() => void) | null = null

onMounted(async () => {
  await productosStore.fetchProducts()
  unsubscribe = productosStore.subscribeToChanges()
})

onUnmounted(() => {
  unsubscribe?.()
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

function agregarAlCarrito(producto: any) {
  carritoStore.addItem(producto)
}

async function finalizarVenta() {
  if (carritoStore.items.length === 0) return

  processingPayment.value = true
  saleError.value = ''
  saleSuccess.value = false

  try {
    await createSale(
      carritoStore.getSaleItems(),
      carritoStore.getTotal(),
      carritoStore.paymentMethod,
      carritoStore.discount
    )
    saleSuccess.value = true
    carritoStore.clearCart()
    await productosStore.fetchProducts()

    setTimeout(() => {
      showCheckout.value = false
      saleSuccess.value = false
    }, 2000)
  } catch (err) {
    saleError.value = err instanceof Error ? err.message : 'Error al procesar la venta'
  } finally {
    processingPayment.value = false
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
              <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
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
                Escanear
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
                  :disabled="(producto.stock || 0) <= 0"
                  @click="agregarAlCarrito(producto)"
                >
                  <v-img
                    :src="producto.image_url || 'https://placehold.co/150x100?text=Producto'"
                    height="100"
                    cover
                    class="neo-rounded-sm"
                  />
                  <v-card-text class="pa-3">
                    <div class="text-subtitle-2 text-truncate font-weight-medium">
                      {{ producto.name }}
                    </div>
                    <div class="d-flex justify-space-between align-center mt-2">
                      <span class="text-body-1 text-primary font-weight-bold">
                        {{ formatHNL(producto.price) }}
                      </span>
                      <v-chip
                        :color="(producto.stock || 0) > 5 ? 'success' : 'warning'"
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

    <!-- Diálogo de Checkout -->
    <v-dialog v-model="showCheckout" max-width="450">
      <v-card>
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
          <!-- Método de pago -->
          <p class="text-subtitle-2 font-weight-bold mb-3">Método de Pago</p>
          <div class="d-flex gap-3 mb-4">
            <v-btn
              :variant="carritoStore.paymentMethod === 'efectivo' ? 'elevated' : 'outlined'"
              :color="carritoStore.paymentMethod === 'efectivo' ? 'success' : undefined"
              @click="carritoStore.setPaymentMethod('efectivo')"
              class="flex-grow-1"
            >
              <v-icon start>mdi-cash</v-icon>
              Efectivo
            </v-btn>
            <v-btn
              :variant="carritoStore.paymentMethod === 'tarjeta' ? 'elevated' : 'outlined'"
              :color="carritoStore.paymentMethod === 'tarjeta' ? 'success' : undefined"
              @click="carritoStore.setPaymentMethod('tarjeta')"
              class="flex-grow-1"
            >
              <v-icon start>mdi-credit-card</v-icon>
              Tarjeta
            </v-btn>
          </div>

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

          <v-alert v-if="saleSuccess" type="success" class="mb-3">
            Venta procesada exitosamente
          </v-alert>
          <v-alert v-if="saleError" type="error" class="mb-3">
            {{ saleError }}
          </v-alert>
        </v-card-text>

        <v-card-actions class="pa-6 pt-0">
          <v-btn variant="text" @click="showCheckout = false" :disabled="processingPayment">
            Cancelar
          </v-btn>
          <v-spacer />
          <v-btn
            color="success"
            size="large"
            :loading="processingPayment"
            :disabled="saleSuccess"
            @click="finalizarVenta"
          >
            <v-icon start>mdi-check</v-icon>
            Confirmar Venta
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.producto-card {
  cursor: pointer;
  transition: var(--neo-transition);
}

.producto-card:hover {
  transform: translateY(-2px);
}

.producto-card:active {
  box-shadow: var(--neo-pressed) !important;
  transform: scale(0.98);
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
