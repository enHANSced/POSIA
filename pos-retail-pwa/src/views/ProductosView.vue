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
  <v-container fluid class="pa-4">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-package-variant-closed</v-icon>
        Gestión de Productos
        <v-spacer />
        <v-btn color="primary" @click="openNewForm">
          <v-icon start>mdi-plus</v-icon>
          Nuevo Producto
        </v-btn>
      </v-card-title>

      <v-card-text>
        <!-- Búsqueda -->
        <v-text-field
          v-model="searchQuery"
          label="Buscar producto"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4"
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
          density="comfortable"
        >
          <template #item.price="{ item }">
            ${{ item.price.toFixed(2) }}
          </template>

          <template #item.category_id="{ item }">
            {{ getCategoryName(item.category_id) }}
          </template>

          <template #item.stock="{ item }">
            <v-chip
              :color="(item.stock || 0) > (item.min_stock || 5) ? 'success' : 'warning'"
              size="small"
            >
              {{ item.stock || 0 }}
            </v-chip>
          </template>

          <template #item.active="{ item }">
            <v-icon :color="item.active ? 'success' : 'grey'">
              {{ item.active ? 'mdi-check-circle' : 'mdi-close-circle' }}
            </v-icon>
          </template>

          <template #item.actions="{ item }">
            <v-btn icon size="small" variant="text" @click="editProduct(item)">
              <v-icon>mdi-pencil</v-icon>
            </v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <!-- Diálogo de formulario -->
    <v-dialog v-model="showForm" max-width="600" persistent>
      <v-card>
        <v-card-title class="bg-primary pa-4">
          <v-icon start>{{ editingProduct ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
          {{ editingProduct ? 'Editar Producto' : 'Nuevo Producto' }}
        </v-card-title>

        <v-card-text class="pa-6">
          <v-form v-model="formValid">
            <v-row>
              <v-col cols="12">
                <v-text-field
                  v-model="form.name"
                  label="Nombre del producto *"
                  :rules="[v => !!v || 'Requerido']"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="6">
                <v-text-field
                  v-model="form.barcode"
                  label="Código de barras"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="6">
                <v-text-field
                  v-model="form.sku"
                  label="SKU"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="12">
                <v-select
                  v-model="form.category_id"
                  :items="categories"
                  item-title="name"
                  item-value="id"
                  label="Categoría"
                  variant="outlined"
                  clearable
                />
              </v-col>

              <v-col cols="6">
                <v-text-field
                  v-model.number="form.price"
                  label="Precio de venta *"
                  type="number"
                  prefix="$"
                  :rules="[v => v > 0 || 'Debe ser mayor a 0']"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="6">
                <v-text-field
                  v-model.number="form.cost"
                  label="Costo"
                  type="number"
                  prefix="$"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="4">
                <v-text-field
                  v-model.number="form.stock"
                  label="Stock actual"
                  type="number"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="4">
                <v-text-field
                  v-model.number="form.min_stock"
                  label="Stock mínimo"
                  type="number"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="4">
                <v-text-field
                  v-model.number="form.tax_rate"
                  label="IVA %"
                  type="number"
                  suffix="%"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="12">
                <v-textarea
                  v-model="form.description"
                  label="Descripción"
                  variant="outlined"
                  rows="3"
                />
              </v-col>

              <v-col cols="12">
                <v-switch
                  v-model="form.active"
                  label="Producto activo"
                  color="primary"
                />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>

        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="showForm = false">Cancelar</v-btn>
          <v-btn
            color="primary"
            :loading="saving"
            :disabled="!formValid"
            @click="saveProduct"
          >
            Guardar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
