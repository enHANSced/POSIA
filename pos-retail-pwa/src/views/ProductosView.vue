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
const fileInput = ref(null)

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
    <v-dialog v-model="showForm" max-width="900" persistent>
      <v-card class="neo-card pb-4">
        <!-- Header con gradiente sutil -->
        <div class="pa-4 pa-md-6 d-flex align-center justify-space-between" 
             style="background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%);">
          <div class="d-flex align-center">
            <div class="neo-circle-sm mr-4" :style="editingProduct
              ? 'background: linear-gradient(135deg, #FFA726, #FFB74D); box-shadow: 0 4px 12px rgba(255, 167, 38, 0.4);'
              : 'background: linear-gradient(135deg, #4A7BF7, #6B93FF); box-shadow: 0 4px 12px rgba(74, 123, 247, 0.4);'">
              <v-icon color="white" size="24">{{ editingProduct ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
            </div>
            <div>
              <h3 class="text-h5 font-weight-bold text-high-emphasis">
                {{ editingProduct ? 'Editar Producto' : 'Nuevo Producto' }}
              </h3>
              <div class="text-caption text-medium-emphasis">
                {{ editingProduct ? 'Modificá la información del producto' : 'Agregá un nuevo ítem al inventario' }}
              </div>
            </div>
          </div>
          <v-btn icon variant="text" @click="showForm = false" class="neo-flat ml-2">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>

        <v-card-text class="px-4 px-md-6 py-2">
          <v-form v-model="formValid" ref="formRef">
            <v-row>
              <!-- Columna Izquierda: Imagen + IA -->
              <v-col cols="12" md="4">
                <div class="d-flex flex-column align-center">
                  <!-- Area de carga de imagen mejorada -->
                  <v-hover v-slot="{ isHovering, props }">
                    <div 
                      class="neo-pressed d-flex align-center justify-center flex-column position-relative overflow-hidden mb-4"
                      style="width: 100%; aspect-ratio: 1; border-radius: 20px; cursor: pointer; transition: all 0.3s ease;"
                      :style="isHovering ? 'border: 2px solid var(--v-primary-base);' : 'border: 2px dashed transparent;'"
                      v-bind="props"
                      @click="$refs.fileInput.$el.querySelector('input').click()"
                    >
                      <v-img
                        v-if="imagePreview || form.image_url"
                        :src="imagePreview || form.image_url"
                        width="100%"
                        height="100%"
                        cover
                        class="rounded-lg"
                      >
                        <template #placeholder>
                           <div class="d-flex align-center justify-center fill-height bg-grey-lighten-2">
                              <v-progress-circular indeterminate color="primary"></v-progress-circular>
                           </div>
                        </template>
                      </v-img>
                      
                      <div v-else class="text-center pa-4">
                         <v-icon size="48" color="primary" class="mb-2">mdi-camera-plus</v-icon>
                         <div class="text-body-2 font-weight-bold text-medium-emphasis">Subir Imagen</div>
                         <div class="text-caption text-disabled">Click para seleccionar</div>
                      </div>

                      <!-- Overlay de hover para cambiar imagen -->
                      <div v-if="(imagePreview || form.image_url) && isHovering" 
                           class="position-absolute d-flex align-center justify-center"
                           style="inset: 0; background: rgba(0,0,0,0.3);">
                        <v-icon color="white" size="32">mdi-camera-retake</v-icon>
                      </div>
                    </div>
                  </v-hover>

                  <!-- Input file oculto pero funcional -->
                  <v-file-input
                    ref="fileInput"
                    v-model="selectedImageFile"
                    accept="image/*"
                    class="d-none"
                    @update:model-value="onImageSelected"
                    @click:clear="selectedImageFile = null; imagePreview = ''"
                  ></v-file-input>

                  <!-- Botón IA Mejorado -->
                  <v-btn
                    block
                    height="48"
                    class="neo-raised mb-4"
                    :loading="analizandoImagen"
                    @click="autocompletarConIA"
                    color="primary"
                    variant="flat"
                    style="border-radius: 12px; background: linear-gradient(90deg, #4A90E2 0%, #007AFF 100%);"
                  >
                    <v-icon start size="22" class="mr-2">mdi-sparkles</v-icon>
                    <span class="font-weight-bold">Rellenar con IA</span>
                  </v-btn>
                  
                  <v-alert v-if="analisisError" type="error" variant="tonal" density="compact" class="mb-4 text-caption w-100">
                    {{ analisisError }}
                  </v-alert>

                  <div class="text-caption text-center text-medium-emphasis px-2">
                    <v-icon size="14" class="mr-1" color="primary">mdi-information-outline</v-icon>
                    Subí una foto del producto y dejá que la IA complete los datos.
                  </div>
                  
                  <!-- URL imagen alternativo -->
                   <v-expand-transition>
                    <div v-if="!imagePreview && !form.image_url" class="mt-4 w-100">
                      <v-text-field
                        v-model="form.image_url"
                        label="O pegar URL de imagen"
                        density="compact"
                        variant="outlined"
                        hide-details
                        prepend-inner-icon="mdi-link"
                        class="text-body-2"
                      />
                    </div>
                   </v-expand-transition>
                </div>
              </v-col>

              <!-- Columna Derecha: Formulario -->
              <v-col cols="12" md="8">
                <div class="pl-md-4">
                  <!-- Sección: Información Básica -->
                  <div class="mb-4">
                    <h4 class="text-subtitle-2 font-weight-bold text-primary mb-3 d-flex align-center">
                      <v-icon size="18" start>mdi-information</v-icon> Información Básica
                    </h4>
                    
                    <v-row dense>
                      <v-col cols="12">
                        <v-text-field
                          v-model="form.name"
                          label="Nombre del producto *"
                          variant="outlined"
                          bg-color="surface"
                          density="comfortable"
                          :rules="[v => !!v || 'El nombre es requerido']"
                        />
                      </v-col>
                      
                      <v-col cols="12" sm="6">
                        <v-text-field
                          v-model="form.barcode"
                          label="Código de barras"
                          variant="outlined"
                          density="comfortable"
                          prepend-inner-icon="mdi-barcode"
                        >
                          <template #append-inner>
                            <v-fade-transition>
                              <v-btn v-if="!form.barcode" icon size="small" variant="text" color="primary" @click="abrirEscaner" title="Escanear">
                                <v-icon>mdi-barcode-scan</v-icon>
                              </v-btn>
                            </v-fade-transition>
                          </template>
                        </v-text-field>
                      </v-col>
                      
                      <v-col cols="12" sm="6">
                        <v-text-field
                          v-model="form.sku"
                          label="SKU (Opcional)"
                          variant="outlined"
                          density="comfortable"
                          prepend-inner-icon="mdi-identifier"
                        />
                      </v-col>

                      <v-col cols="12" sm="6">
                        <v-select
                          v-model="form.category_id"
                          :items="categories"
                          item-title="name"
                          item-value="id"
                          label="Categoría"
                          variant="outlined"
                          density="comfortable"
                          prepend-inner-icon="mdi-shape"
                        />
                      </v-col>

                      <v-col cols="12" sm="6">
                        <v-switch
                          v-model="form.active"
                          color="success"
                          label="Producto Activo"
                          hide-details
                          inset
                          class="mt-1 ml-2"
                        ></v-switch>
                      </v-col>
                    </v-row>
                  </div>

                  <v-divider class="mb-4 border-opacity-50"></v-divider>

                  <!-- Sección: Precios e Inventario -->
                  <div class="mb-4">
                    <h4 class="text-subtitle-2 font-weight-bold text-primary mb-3 d-flex align-center">
                      <v-icon size="18" start>mdi-currency-usd</v-icon> Precio e Inventario
                    </h4>
                    
                    <v-row dense>
                      <v-col cols="6" sm="4">
                        <v-text-field
                          v-model.number="form.price"
                          label="Precio Venta *"
                          type="number"
                          prefix="L"
                          variant="outlined"
                          density="comfortable"
                          class="font-weight-bold"
                          :rules="[v => v >= 0 || 'Inválido']"
                        />
                      </v-col>

                      <v-col cols="6" sm="4">
                        <v-text-field
                          v-model.number="form.cost"
                          label="Costo Unitario"
                          type="number"
                          prefix="L"
                          variant="outlined"
                          density="comfortable"
                        />
                      </v-col>

                      <v-col cols="12" sm="4">
                        <v-text-field
                          v-model.number="form.tax_rate"
                          label="ISV"
                          type="number"
                          suffix="%"
                          variant="outlined"
                          density="comfortable"
                        />
                      </v-col>

                      <v-col cols="6" sm="6">
                        <v-text-field
                          v-model.number="form.stock"
                          label="Stock Actual"
                          type="number"
                          prepend-inner-icon="mdi-package-variant"
                          variant="outlined"
                          density="comfortable"
                        />
                      </v-col>

                      <v-col cols="6" sm="6">
                        <v-text-field
                          v-model.number="form.min_stock"
                          label="Stock Mínimo"
                          type="number"
                          prepend-inner-icon="mdi-alert-circle-outline"
                          variant="outlined"
                          density="comfortable"
                        />
                      </v-col>
                    </v-row>
                  </div>
                  
                  <!-- Descripción -->
                  <v-textarea
                    v-model="form.description"
                    label="Descripción detallada"
                    rows="2"
                    variant="outlined"
                    auto-grow
                    density="comfortable"
                  ></v-textarea>
                </div>
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>

        <v-card-actions class="px-6 py-4">
          <v-spacer />
          <v-btn 
            size="large"
            variant="text" 
            class="text-none font-weight-regular mr-2"
            @click="showForm = false"
          >
            Cancelar
          </v-btn>
          <v-btn
            size="large"
            color="primary"
            class="neo-raised text-none px-6 font-weight-bold"
            rounded="lg"
            :loading="saving"
            :disabled="!formValid"
            @click="saveProduct"
            elevation="2"
          >
            <v-icon start>mdi-check</v-icon>
            {{ editingProduct ? 'Guardar Cambios' : 'Crear Producto' }}
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
