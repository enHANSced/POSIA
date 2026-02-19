<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useProductosStore } from '@/stores/productos'
import { fetchCategories, createProduct, updateProduct, uploadProductImage } from '@/services/database'
import { analizarProductoImagen } from '@/services/edge-functions'
import type { Category, Product } from '@/types/supabase'
import { Html5QrcodeScanner } from 'html5-qrcode'

const productosStore = useProductosStore()

const categories = ref<Category[]>([])
const searchQuery = ref('')
const showForm = ref(false)
const editingProduct = ref<Product | null>(null)
let unsubscribe: (() => void) | null = null
let barcodeScanner: Html5QrcodeScanner | null = null

// Formulario
const form = ref({
  name: '',
  barcode: '',
  sku: '',
  category_id: null as string | null,
  price: 0,
  cost: 0,
  image_url: '',
  stock: 0,
  min_stock: 5,
  tax_rate: 16,
  description: '',
  active: true
})

const formValid = ref(false)
const saving = ref(false)
const selectedImageFile = ref<File | null>(null)
const imagePreview = ref('')
const showBarcodeScanner = ref(false)
const scannerManualCode = ref('')
const scannerStatus = ref('')
const scannerError = ref('')
const analizandoImagen = ref(false)
const analisisError = ref('')

// Cargar datos
onMounted(async () => {
  await Promise.all([
    productosStore.fetchProducts(),
    loadCategories()
  ])

  unsubscribe = productosStore.subscribeToChanges()
})

onUnmounted(() => {
  unsubscribe?.()
  clearBarcodeScanner()
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
  selectedImageFile.value = null
  imagePreview.value = ''
  form.value = {
    name: '',
    barcode: '',
    sku: '',
    category_id: null,
    price: 0,
    cost: 0,
    image_url: '',
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
  selectedImageFile.value = null
  imagePreview.value = product.image_url || ''
  form.value = {
    name: product.name,
    barcode: product.barcode || '',
    sku: product.sku || '',
    category_id: product.category_id,
    price: product.price,
    cost: product.cost || 0,
    image_url: product.image_url || '',
    stock: product.stock || 0,
    min_stock: product.min_stock || 5,
    tax_rate: product.tax_rate || 16,
    description: product.description || '',
    active: product.active !== false
  }
  showForm.value = true
}

function onImageSelected(files: File[] | File | null) {
  const file = Array.isArray(files) ? (files[0] ?? null) : files
  selectedImageFile.value = file

  if (!file) {
    imagePreview.value = form.value.image_url || ''
    return
  }

  imagePreview.value = URL.createObjectURL(file)
}

async function handleBarcode(code: string) {
  const barcode = code.trim()
  if (!barcode) return

  form.value.barcode = barcode
  scannerError.value = ''
  scannerStatus.value = `Código detectado: ${barcode}`
}

async function initBarcodeScanner() {
  if (barcodeScanner) return

  try {
    barcodeScanner = new Html5QrcodeScanner(
      'productos-scanner-reader',
      { fps: 10, qrbox: { width: 260, height: 120 } },
      false
    )

    barcodeScanner.render(
      async (decodedText) => {
        await handleBarcode(decodedText)
      },
      () => {}
    )
  } catch {
    scannerError.value = 'No se pudo iniciar el escáner.'
  }
}

async function clearBarcodeScanner() {
  if (!barcodeScanner) return
  try {
    await barcodeScanner.clear()
  } catch {
  } finally {
    barcodeScanner = null
  }
}

async function abrirEscaner() {
  showBarcodeScanner.value = true
  scannerStatus.value = ''
  scannerError.value = ''
  setTimeout(() => {
    void initBarcodeScanner()
  }, 80)
}

async function cerrarEscaner() {
  showBarcodeScanner.value = false
  await clearBarcodeScanner()
}

async function buscarCodigoManual() {
  await handleBarcode(scannerManualCode.value)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const base64 = result.split(',')[1]
      if (!base64) {
        reject(new Error('No se pudo convertir la imagen'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Error leyendo la imagen'))
    reader.readAsDataURL(file)
  })
}

async function autocompletarConIA() {
  if (!selectedImageFile.value) {
    analisisError.value = 'Primero seleccioná una imagen del producto.'
    return
  }

  analizandoImagen.value = true
  analisisError.value = ''

  try {
    const imageBase64 = await fileToBase64(selectedImageFile.value)
    const resultado = await analizarProductoImagen({
      imageBase64,
      mimeType: selectedImageFile.value.type || 'image/jpeg',
      barcode: form.value.barcode || undefined,
    })

    const s = resultado.suggestion || {}

    form.value.name = s.name || form.value.name
    form.value.description = s.description || form.value.description
    form.value.sku = s.sku || form.value.sku
    form.value.barcode = s.barcode || form.value.barcode
    form.value.price = typeof s.price === 'number' && s.price > 0 ? s.price : form.value.price
    form.value.cost = typeof s.cost === 'number' && s.cost >= 0 ? s.cost : form.value.cost
    form.value.tax_rate = typeof s.tax_rate === 'number' && s.tax_rate >= 0 ? s.tax_rate : form.value.tax_rate

    if (s.category_name) {
      const category = categories.value.find(
        c => c.name.trim().toLowerCase() === s.category_name?.trim().toLowerCase()
      )

      if (category) {
        form.value.category_id = category.id
      }
    }
  } catch (error) {
    analisisError.value = error instanceof Error ? error.message : 'No se pudo analizar la imagen.'
  } finally {
    analizandoImagen.value = false
  }
}

function limpiarImagen() {
  selectedImageFile.value = null
  form.value.image_url = ''
  imagePreview.value = ''
}

async function saveProduct() {
  if (!formValid.value) return
  saving.value = true

  try {
    if (selectedImageFile.value) {
      const uploadedUrl = await uploadProductImage(selectedImageFile.value, editingProduct.value?.id)
      form.value.image_url = uploadedUrl
    }

    if (editingProduct.value) {
      await updateProduct(editingProduct.value.id, form.value)
    } else {
      await createProduct(form.value as any)
    }

    selectedImageFile.value = null
    imagePreview.value = ''
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
                  prepend-inner-icon="mdi-barcode"
                >
                  <template #append>
                    <v-btn icon size="small" variant="text" @click="abrirEscaner">
                      <v-icon size="18">mdi-barcode-scan</v-icon>
                    </v-btn>
                  </template>
                </v-text-field>
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

              <v-col cols="12">
                <v-file-input
                  label="Imagen del producto"
                  accept="image/*"
                  prepend-icon="mdi-camera"
                  show-size
                  clearable
                  @update:model-value="onImageSelected"
                />
              </v-col>

              <v-col cols="12">
                <div class="d-flex align-center ga-2">
                  <v-btn
                    color="primary"
                    variant="outlined"
                    :loading="analizandoImagen"
                    @click="autocompletarConIA"
                  >
                    <v-icon start>mdi-auto-fix</v-icon>
                    Rellenar con IA
                  </v-btn>
                  <span class="text-caption text-medium-emphasis">
                    Usá una foto del empaque para autocompletar campos.
                  </span>
                </div>
                <v-alert v-if="analisisError" type="error" density="compact" class="mt-2">
                  {{ analisisError }}
                </v-alert>
              </v-col>

              <v-col v-if="imagePreview || form.image_url" cols="12">
                <div class="neo-card-pressed pa-3 d-flex align-center">
                  <v-img
                    :src="imagePreview || form.image_url"
                    width="96"
                    height="72"
                    cover
                    class="rounded-lg mr-3"
                  />
                  <div class="text-caption text-medium-emphasis flex-grow-1">
                    Vista previa de imagen
                  </div>
                  <v-btn icon variant="text" size="small" @click="limpiarImagen">
                    <v-icon size="18">mdi-delete-outline</v-icon>
                  </v-btn>
                </div>
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="form.image_url"
                  label="URL de imagen"
                  prepend-inner-icon="mdi-image-outline"
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

    <v-dialog v-model="showBarcodeScanner" max-width="520" @update:model-value="!$event && cerrarEscaner()">
      <v-card>
        <div class="pa-6 d-flex align-center">
          <div class="neo-circle-sm mr-3">
            <v-icon color="primary">mdi-barcode-scan</v-icon>
          </div>
          <h3 class="text-h6 font-weight-bold">Escanear código de barras</h3>
        </div>

        <v-card-text class="px-6 pb-2">
          <div id="productos-scanner-reader" class="neo-flat pa-2 mb-3" />

          <v-text-field
            v-model="scannerManualCode"
            label="Código manual"
            prepend-inner-icon="mdi-keyboard"
            @keyup.enter="buscarCodigoManual"
          />

          <v-alert v-if="scannerStatus" type="success" density="compact" class="mb-2">
            {{ scannerStatus }}
          </v-alert>

          <v-alert v-if="scannerError" type="error" density="compact">
            {{ scannerError }}
          </v-alert>
        </v-card-text>

        <v-card-actions class="pa-6 pt-2">
          <v-btn variant="text" @click="cerrarEscaner">Cerrar</v-btn>
          <v-spacer />
          <v-btn color="primary" @click="buscarCodigoManual">
            <v-icon start>mdi-check</v-icon>
            Usar código
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
