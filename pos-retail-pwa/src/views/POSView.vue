<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProductosStore } from '@/stores/productos'
import { useCarritoStore } from '@/stores/carrito'

const productosStore = useProductosStore()
const carritoStore = useCarritoStore()

const searchQuery = ref('')
const showScanner = ref(false)

// Cargar productos al montar
onMounted(async () => {
  await productosStore.fetchProducts()
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

function finalizarVenta() {
  // TODO: Implementar checkout
  console.log('Finalizar venta', carritoStore.items)
}
</script>

<template>
  <v-container fluid class="pa-4">
    <v-row>
      <!-- Panel de productos (izquierda) -->
      <v-col cols="12" md="7" lg="8">
        <v-card>
          <v-card-title class="d-flex align-center">
            <v-icon start>mdi-point-of-sale</v-icon>
            Punto de Venta
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
          </v-card-title>

          <v-card-text>
            <!-- Búsqueda -->
            <v-text-field
              v-model="searchQuery"
              label="Buscar producto (nombre, código, SKU)"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              clearable
              class="mb-4"
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
                  hover
                >
                  <v-img
                    :src="producto.image_url || 'https://via.placeholder.com/150?text=Sin+imagen'"
                    height="100"
                    cover
                  />
                  <v-card-text class="pa-2">
                    <div class="text-subtitle-2 text-truncate">{{ producto.name }}</div>
                    <div class="d-flex justify-space-between align-center mt-1">
                      <span class="text-h6 text-primary font-weight-bold">
                        ${{ producto.price.toFixed(2) }}
                      </span>
                      <v-chip
                        :color="(producto.stock || 0) > 5 ? 'success' : 'warning'"
                        size="x-small"
                      >
                        {{ producto.stock }}
                      </v-chip>
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>

            <!-- Loading -->
            <v-row v-else justify="center" class="py-8">
              <v-progress-circular indeterminate color="primary" />
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Panel del carrito (derecha) -->
      <v-col cols="12" md="5" lg="4">
        <v-card class="carrito-card" height="calc(100vh - 120px)">
          <v-card-title class="bg-primary">
            <v-icon start>mdi-cart</v-icon>
            Carrito
            <v-spacer />
            <v-chip color="white" text-color="primary">
              {{ carritoStore.itemCount }} items
            </v-chip>
          </v-card-title>

          <v-card-text class="pa-0" style="height: calc(100% - 200px); overflow-y: auto;">
            <v-list v-if="carritoStore.items.length > 0" density="compact">
              <v-list-item
                v-for="(item, index) in carritoStore.items"
                :key="index"
              >
                <template #prepend>
                  <v-avatar size="40" rounded>
                    <v-img :src="item.product.image_url || 'https://via.placeholder.com/40'" />
                  </v-avatar>
                </template>

                <v-list-item-title class="text-body-2">
                  {{ item.product.name }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  ${{ item.product.price }} x {{ item.quantity }}
                </v-list-item-subtitle>

                <template #append>
                  <div class="d-flex align-center">
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="carritoStore.decrementItem(index)"
                    >
                      <v-icon>mdi-minus</v-icon>
                    </v-btn>
                    <span class="mx-2">{{ item.quantity }}</span>
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="carritoStore.incrementItem(index)"
                    >
                      <v-icon>mdi-plus</v-icon>
                    </v-btn>
                    <v-btn
                      icon
                      size="x-small"
                      color="error"
                      variant="text"
                      @click.stop="carritoStore.removeItem(index)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </div>
                </template>
              </v-list-item>
            </v-list>

            <v-container v-else class="text-center py-8">
              <v-icon size="64" color="grey-lighten-1">mdi-cart-outline</v-icon>
              <p class="text-grey mt-2">Carrito vacío</p>
            </v-container>
          </v-card-text>

          <v-divider />

          <!-- Totales -->
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between mb-2">
              <span>Subtotal:</span>
              <span>${{ carritoStore.subtotal.toFixed(2) }}</span>
            </div>
            <div class="d-flex justify-space-between mb-2">
              <span>IVA:</span>
              <span>${{ carritoStore.tax.toFixed(2) }}</span>
            </div>
            <v-divider class="my-2" />
            <div class="d-flex justify-space-between text-h6 font-weight-bold">
              <span>Total:</span>
              <span class="text-primary">${{ carritoStore.total.toFixed(2) }}</span>
            </div>
          </v-card-text>

          <v-card-actions class="pa-4 pt-0">
            <v-btn
              color="error"
              variant="outlined"
              @click="carritoStore.clearCart()"
              :disabled="carritoStore.items.length === 0"
            >
              <v-icon start>mdi-delete</v-icon>
              Limpiar
            </v-btn>
            <v-spacer />
            <v-btn
              color="success"
              size="large"
              @click="finalizarVenta"
              :disabled="carritoStore.items.length === 0"
            >
              <v-icon start>mdi-cash-register</v-icon>
              Cobrar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.producto-card {
  cursor: pointer;
  transition: transform 0.2s;
}

.producto-card:hover {
  transform: scale(1.02);
}

.carrito-card {
  position: sticky;
  top: 80px;
  display: flex;
  flex-direction: column;
}
</style>
