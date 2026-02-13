<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useProductosStore } from '@/stores/productos'
import { fetchCategories, createProduct, updateProduct } from '@/services/database'
import type { Category, Product } from '@/types/supabase'

const productosStore = useProductosStore()

const categories = ref<Category[]>([])
const searchQuery = ref('')
const showForm = ref(false)
const editingProduct = ref<Product | null>(null)

// Formulario
const form = ref({
  name: '',
  barcode: '',
  sku: '',
  category_id: null as string | null,
  price: 0,
  cost: 0,
  stock: 0,
  min_stock: 5,
  tax_rate: 16,
  description: '',
  active: true
})

const formValid = ref(false)
const saving = ref(false)

// Cargar datos
onMounted(async () => {
  await Promise.all([
    productosStore.fetchProducts(),
    loadCategories()
  ])
})

async function loadCategories() {
  try {
    categories.value = await fetchCategories()
  } catch (err) {
    console.error('Error cargando categorías:', err)
  }
}

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

function openNewForm() {
  editingProduct.value = null
  form.value = {
    name: '',
    barcode: '',
    sku: '',
    category_id: null,
    price: 0,
    cost: 0,
    stock: 0,
    min_stock: 5,
    tax_rate: 16,
    description: '',
    active: true
  }
  showForm.value = true
}

function editProduct(product: Product) {
  editingProduct.value = product
  form.value = {
    name: product.name,
    barcode: product.barcode || '',
    sku: product.sku || '',
    category_id: product.category_id,
    price: product.price,
    cost: product.cost || 0,
    stock: product.stock || 0,
    min_stock: product.min_stock || 5,
    tax_rate: product.tax_rate || 16,
    description: product.description || '',
    active: product.active !== false
  }
  showForm.value = true
}

async function saveProduct() {
  if (!formValid.value) return
  saving.value = true

  try {
    if (editingProduct.value) {
      await updateProduct(editingProduct.value.id, form.value)
    } else {
      await createProduct(form.value as any)
    }
    await productosStore.fetchProducts()
    showForm.value = false
  } catch (err) {
    console.error('Error guardando producto:', err)
  } finally {
    saving.value = false
  }
}

function getCategoryName(categoryId: string | null): string {
  if (!categoryId) return 'Sin categoría'
  const cat = categories.value.find(c => c.id === categoryId)
  return cat?.name || 'Desconocida'
}
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <v-card class="neo-animate-in">
      <v-card-text class="pa-5">
        <!-- Header -->
        <div class="d-flex align-center mb-5">
          <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #FF7043, #FF8A65);">
            <v-icon color="white" size="20">mdi-package-variant-closed</v-icon>
          </div>
          <h2 class="text-h6 font-weight-bold">Gestión de Productos</h2>
          <v-spacer />
          <v-btn color="primary" @click="openNewForm">
            <v-icon start>mdi-plus</v-icon>
            Nuevo Producto
          </v-btn>
        </div>

        <!-- Búsqueda -->
        <v-text-field
          v-model="searchQuery"
          label="Buscar producto"
          prepend-inner-icon="mdi-magnify"
          clearable
          class="mb-5"
        />

        <!-- Tabla de productos -->
        <v-data-table
          :headers="[
            { title: 'Producto', key: 'name' },
            { title: 'SKU', key: 'sku' },
            { title: 'Código', key: 'barcode' },
            { title: 'Categoría', key: 'category_id' },
            { title: 'Precio', key: 'price', align: 'end' },
            { title: 'Stock', key: 'stock', align: 'center' },
            { title: 'Estado', key: 'active', align: 'center' },
            { title: 'Acciones', key: 'actions', align: 'center', sortable: false }
          ]"
          :items="productosFiltrados"
          :loading="productosStore.loading"
          item-value="id"
        >
          <template #item.price="{ item }">
            <span class="font-weight-bold text-primary">L {{ item.price.toFixed(2) }}</span>
          </template>

          <template #item.category_id="{ item }">
            <v-chip variant="tonal" size="small">
              {{ getCategoryName(item.category_id) }}
            </v-chip>
          </template>

          <template #item.stock="{ item }">
            <v-chip
              :color="(item.stock || 0) > (item.min_stock || 5) ? 'success' : 'warning'"
              size="small"
              variant="tonal"
            >
              {{ item.stock || 0 }}
            </v-chip>
          </template>

          <template #item.active="{ item }">
            <v-icon :color="item.active ? 'success' : 'grey'" size="20">
              {{ item.active ? 'mdi-check-circle' : 'mdi-close-circle' }}
            </v-icon>
          </template>

          <template #item.actions="{ item }">
            <v-btn icon size="small" variant="text" @click="editProduct(item)">
              <v-icon size="18">mdi-pencil-outline</v-icon>
            </v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <!-- Diálogo de formulario neomórfico -->
    <v-dialog v-model="showForm" max-width="600" persistent>
      <v-card>
        <div class="pa-6 d-flex align-center">
          <div class="neo-circle-sm mr-3" :style="editingProduct
            ? 'background: linear-gradient(135deg, #FFA726, #FFB74D);'
            : 'background: linear-gradient(135deg, #4A7BF7, #6B93FF);'">
            <v-icon color="white" size="20">{{ editingProduct ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
          </div>
          <h3 class="text-h6 font-weight-bold">
            {{ editingProduct ? 'Editar Producto' : 'Nuevo Producto' }}
          </h3>
        </div>

        <v-card-text class="px-6 pb-2">
          <v-form v-model="formValid">
            <v-row>
              <v-col cols="12">
                <v-text-field
                  v-model="form.name"
                  label="Nombre del producto *"
                  :rules="[v => !!v || 'Requerido']"
                />
              </v-col>

              <v-col cols="6">
                <v-text-field
                  v-model="form.barcode"
                  label="Código de barras"
                />
              </v-col>

              <v-col cols="6">
                <v-text-field
                  v-model="form.sku"
                  label="SKU"
                />
              </v-col>

              <v-col cols="12">
                <v-select
                  v-model="form.category_id"
                  :items="categories"
                  item-title="name"
                  item-value="id"
                  label="Categoría"
                  clearable
                />
              </v-col>

              <v-col cols="6">
                <v-text-field
                  v-model.number="form.price"
                  label="Precio de venta *"
                  type="number"
                  prefix="L"
                  :rules="[v => v > 0 || 'Debe ser mayor a 0']"
                />
              </v-col>

              <v-col cols="6">
                <v-text-field
                  v-model.number="form.cost"
                  label="Costo"
                  type="number"
                  prefix="L"
                />
              </v-col>

              <v-col cols="4">
                <v-text-field
                  v-model.number="form.stock"
                  label="Stock actual"
                  type="number"
                />
              </v-col>

              <v-col cols="4">
                <v-text-field
                  v-model.number="form.min_stock"
                  label="Stock mínimo"
                  type="number"
                />
              </v-col>

              <v-col cols="4">
                <v-text-field
                  v-model.number="form.tax_rate"
                  label="ISV %"
                  type="number"
                  suffix="%"
                />
              </v-col>

              <v-col cols="12">
                <v-textarea
                  v-model="form.description"
                  label="Descripción"
                  rows="3"
                />
              </v-col>

              <v-col cols="12">
                <v-switch
                  v-model="form.active"
                  label="Producto activo"
                  color="primary"
                  inset
                />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>

        <v-card-actions class="pa-6 pt-2">
          <v-spacer />
          <v-btn variant="text" @click="showForm = false">Cancelar</v-btn>
          <v-btn
            color="primary"
            :loading="saving"
            :disabled="!formValid"
            @click="saveProduct"
          >
            <v-icon start>mdi-content-save</v-icon>
            Guardar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
