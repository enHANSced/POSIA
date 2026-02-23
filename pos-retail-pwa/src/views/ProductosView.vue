<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useDisplay } from 'vuetify'
import { useProductosStore } from '@/stores/productos'
import { fetchCategories, createCategory, updateCategory, deleteCategory, createProduct, updateProduct, uploadProductImage } from '@/services/database'
import { analizarProductoImagen, type WebSource } from '@/services/edge-functions'
import type { Category, Product } from '@/types/supabase'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

const productosStore = useProductosStore()
const { mobile } = useDisplay()

const categories = ref<Category[]>([])
const searchQuery = ref('')
const showForm = ref(false)
const editingProduct = ref<Product | null>(null)
let unsubscribe: (() => void) | null = null
let barcodeScanner: Html5Qrcode | null = null

// Formulario
const form = ref({
  name: '',
  barcode: '',
  sku: '',
  category_id: null as string | null,
  price: null as number | null,
  cost: null as number | null,
  image_url: '',
  stock: null as number | null,
  min_stock: null as number | null,
  tax_rate: null as number | null,
  description: '',
  active: true,
  sell_by: 'unit' as 'unit' | 'weight',
})

const saveError = ref('')

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
const fileInput = ref<any>(null)
let barcodeDetected = false

// AI suggested category (when not in registered list)
const suggestedCategoryName = ref('')

// Fuentes de precios investigadas por IA
const priceSources = ref<WebSource[]>([])
const priceResearched = ref(false)

// Barcode formats for scanner
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

// Camera capture
const showCamera = ref(false)
let cameraStream: MediaStream | null = null

// Category management
const showCategoryManager = ref(false)
const categoryForm = ref({ name: '', description: '', color: '#4A7BF7', icon: 'mdi-shape' })
const editingCategory = ref<Category | null>(null)
const savingCategory = ref(false)
const categoryError = ref('')

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
  cerrarCamara()
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
  suggestedCategoryName.value = ''
  priceSources.value = []
  priceResearched.value = false
  form.value = {
    name: '',
    barcode: '',
    sku: '',
    category_id: null,
    price: null,
    cost: null,
    image_url: '',
    stock: null,
    min_stock: null,
    tax_rate: null,
    description: '',
    active: true,
    sell_by: 'unit',
  }
  saveError.value = ''
  showForm.value = true
}

function editProduct(product: Product) {
  editingProduct.value = product
  selectedImageFile.value = null
  imagePreview.value = product.image_url || ''
  suggestedCategoryName.value = ''
  priceSources.value = []
  priceResearched.value = false
  const meta = product.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
    ? (product.metadata as Record<string, unknown>)
    : {}
  form.value = {
    name: product.name,
    barcode: product.barcode || '',
    sku: product.sku || '',
    category_id: product.category_id,
    price: product.price,
    cost: product.cost ?? null,
    image_url: product.image_url || '',
    stock: product.stock ?? null,
    min_stock: product.min_stock ?? null,
    tax_rate: product.tax_rate ?? null,
    description: product.description || '',
    active: product.active !== false,
    sell_by: (meta.sell_by === 'weight' ? 'weight' : 'unit') as 'unit' | 'weight',
  }
  saveError.value = ''
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
  if (barcodeDetected) return
  const barcode = code.trim()
  if (!barcode) return

  barcodeDetected = true
  form.value.barcode = barcode
  scannerError.value = ''
  scannerStatus.value = `Código detectado: ${barcode}`
  setTimeout(() => cerrarEscaner(), 800)
}

async function initBarcodeScanner() {
  if (barcodeScanner) return

  try {
    barcodeScanner = new Html5Qrcode('productos-scanner-reader', {
      formatsToSupport: BARCODE_FORMATS,
      verbose: false,
      useBarCodeDetectorIfSupported: true,
    })

    await barcodeScanner.start(
      { facingMode: 'environment' },
      { fps: 15, qrbox: { width: 300, height: 150 }, aspectRatio: 1.777778 },
      async (decodedText) => {
        await handleBarcode(decodedText)
      },
      () => {}
    )
  } catch {
    scannerError.value = 'No se pudo iniciar el escáner. Verificá los permisos de cámara.'
  }
}

async function clearBarcodeScanner() {
  if (!barcodeScanner) return
  try {
    await barcodeScanner.stop()
  } catch {
  } finally {
    barcodeScanner = null
  }
}

async function abrirEscaner() {
  barcodeDetected = false
  showBarcodeScanner.value = true
  scannerStatus.value = ''
  scannerError.value = ''
  await nextTick()
  setTimeout(() => {
    void initBarcodeScanner()
  }, 150)
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
      categories: categories.value.map(c => c.name),
    })

    const s = resultado.suggestion || {}

    form.value.name = s.name || form.value.name
    form.value.description = s.description || form.value.description
    form.value.sku = s.sku || form.value.sku
    form.value.barcode = s.barcode || form.value.barcode
    form.value.price = typeof s.price === 'number' && s.price > 0 ? s.price : form.value.price
    form.value.cost = typeof s.cost === 'number' && s.cost >= 0 ? s.cost : form.value.cost
    form.value.tax_rate = typeof s.tax_rate === 'number' && s.tax_rate >= 0 ? s.tax_rate : form.value.tax_rate
    form.value.min_stock = typeof s.min_stock === 'number' && s.min_stock > 0 ? s.min_stock : form.value.min_stock

    // Tipo de venta sugerido por IA
    if (s.sell_by === 'unit' || s.sell_by === 'weight') {
      form.value.sell_by = s.sell_by
    }

    // Guardar fuentes de precios investigadas
    priceSources.value = resultado.price_sources || []
    priceResearched.value = resultado.price_researched || false

    suggestedCategoryName.value = ''
    if (s.category_name) {
      const category = categories.value.find(
        c => c.name.trim().toLowerCase() === s.category_name?.trim().toLowerCase()
      )

      if (category) {
        form.value.category_id = category.id
      } else {
        // Categoría sugerida por IA no registrada: mostrarla como sugerencia
        suggestedCategoryName.value = s.category_name
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

// Camera capture
async function abrirCamara() {
  showCamera.value = true
  await nextTick()
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    })
    cameraStream = stream
    const video = document.getElementById('camera-preview') as HTMLVideoElement
    if (video) {
      video.srcObject = stream
      await video.play()
    }
  } catch {
    analisisError.value = 'No se pudo acceder a la cámara.'
    showCamera.value = false
  }
}

function capturarFoto() {
  const video = document.getElementById('camera-preview') as HTMLVideoElement
  if (!video) return

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.drawImage(video, 0, 0)
  canvas.toBlob((blob) => {
    if (!blob) return
    const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' })
    selectedImageFile.value = file
    imagePreview.value = URL.createObjectURL(file)
    cerrarCamara()
  }, 'image/jpeg', 0.85)
}

function cerrarCamara() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop())
    cameraStream = null
  }
  showCamera.value = false
}

// Category management
function openCategoryForm(category?: Category) {
  if (category) {
    editingCategory.value = category
    categoryForm.value = {
      name: category.name,
      description: category.description || '',
      color: category.color || '#4A7BF7',
      icon: category.icon || 'mdi-shape',
    }
  } else {
    editingCategory.value = null
    categoryForm.value = { name: '', description: '', color: '#4A7BF7', icon: 'mdi-shape' }
  }
}

async function saveCategoryForm() {
  if (!categoryForm.value.name.trim()) return
  savingCategory.value = true
  categoryError.value = ''

  try {
    if (editingCategory.value) {
      await updateCategory(editingCategory.value.id, categoryForm.value)
    } else {
      await createCategory(categoryForm.value as any)
    }
    await loadCategories()
    editingCategory.value = null
    categoryForm.value = { name: '', description: '', color: '#4A7BF7', icon: 'mdi-shape' }
  } catch (err) {
    console.error('Error guardando categoría:', err)
    categoryError.value = 'Error al guardar la categoría.'
  } finally {
    savingCategory.value = false
  }
}

function categoryProductCount(categoryId: string): number {
  return productosStore.products.filter((p: Product) => p.category_id === categoryId).length
}

async function removeCategory(id: string) {
  categoryError.value = ''
  const count = categoryProductCount(id)
  if (count > 0) {
    categoryError.value = `No se puede eliminar: hay ${count} producto${count > 1 ? 's' : ''} asociado${count > 1 ? 's' : ''} a esta categoría.`
    return
  }
  try {
    await deleteCategory(id)
    await loadCategories()
    if (form.value.category_id === id) {
      form.value.category_id = null
    }
  } catch (err) {
    console.error('Error eliminando categoría:', err)
    categoryError.value = 'No se pudo eliminar la categoría.'
  }
}

async function crearCategoriaSugerida() {
  if (!suggestedCategoryName.value.trim()) return
  savingCategory.value = true
  try {
    const newCat = await createCategory({
      name: suggestedCategoryName.value.trim(),
      description: null,
      color: '#4A7BF7',
      icon: 'mdi-shape',
    })
    await loadCategories()
    form.value.category_id = newCat.id
    suggestedCategoryName.value = ''
  } catch (err) {
    console.error('Error creando categoría sugerida:', err)
  } finally {
    savingCategory.value = false
  }
}

async function saveProduct() {
  if (!formValid.value) {
    saveError.value = 'Completa los campos requeridos (nombre del producto).'
    return
  }
  saving.value = true
  saveError.value = ''

  try {
    if (selectedImageFile.value) {
      const uploadedUrl = await uploadProductImage(selectedImageFile.value, editingProduct.value?.id)
      form.value.image_url = uploadedUrl
    }

    // Extraer sell_by para metadata
    const { sell_by, ...formFields } = form.value

    // Preparar datos con valores por defecto para campos vacíos
    const productData = {
      ...formFields,
      sku: formFields.sku || null,
      barcode: formFields.barcode || null,
      price: formFields.price ?? 0,
      cost: formFields.cost ?? 0,
      stock: formFields.stock ?? 0,
      min_stock: formFields.min_stock ?? 5,
      tax_rate: formFields.tax_rate ?? 15,
      metadata: { sell_by },
    }

    if (editingProduct.value) {
      await updateProduct(editingProduct.value.id, productData)
    } else {
      await createProduct(productData as any)
    }

    selectedImageFile.value = null
    imagePreview.value = ''
    await productosStore.fetchProducts()
    showForm.value = false
  } catch (err) {
    console.error('Error guardando producto:', err)
    saveError.value = err instanceof Error ? err.message : 'Error al guardar el producto. Verifica los datos e intenta de nuevo.'
  } finally {
    saving.value = false
  }
}

/** Determina si un producto se vende por peso */
function isSellByWeight(product: Product): boolean {
  const meta = product.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
    ? (product.metadata as Record<string, unknown>)
    : {}
  return meta.sell_by === 'weight'
}

function getSellByLabel(product: Product): string {
  return isSellByWeight(product) ? 'Peso (lb/kg)' : 'Unidad'
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
            { title: '', key: 'image', sortable: false, width: '56px' },
            { title: 'Producto', key: 'name' },
            { title: 'SKU', key: 'sku' },
            { title: 'Código', key: 'barcode' },
            { title: 'Categoría', key: 'category_id' },
            { title: 'Precio', key: 'price', align: 'end' },
            { title: 'Venta', key: 'sell_by', align: 'center' },
            { title: 'Stock', key: 'stock', align: 'center' },
            { title: 'Estado', key: 'active', align: 'center' },
            { title: 'Acciones', key: 'actions', align: 'center', sortable: false }
          ]"
          :items="productosFiltrados"
          :loading="productosStore.loading"
          item-value="id"
          hover
        >
          <template #item.image="{ item }">
            <v-avatar size="40" rounded="lg" class="my-1">
              <v-img v-if="item.image_url" :src="item.image_url" cover />
              <div v-else class="w-100 h-100 d-flex align-center justify-center bg-grey-lighten-3">
                <v-icon size="20" color="grey">mdi-package-variant</v-icon>
              </div>
            </v-avatar>
          </template>

          <template #item.name="{ item }">
            <span class="text-body-2 font-weight-medium">{{ item.name }}</span>
          </template>

          <template #item.price="{ item }">
            <span class="font-weight-bold text-primary">L {{ item.price.toFixed(2) }}</span>
          </template>

          <template #item.category_id="{ item }">
            <v-chip variant="tonal" size="small">
              {{ getCategoryName(item.category_id) }}
            </v-chip>
          </template>

          <template #item.sell_by="{ item }">
            <v-chip
              :color="isSellByWeight(item) ? 'orange' : 'blue-grey'"
              size="small"
              variant="tonal"
            >
              <v-icon start size="14">{{ isSellByWeight(item) ? 'mdi-scale' : 'mdi-numeric-1-box' }}</v-icon>
              {{ getSellByLabel(item) }}
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
                      @click="(fileInput as any)?.$el?.querySelector('input')?.click()"
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

                  <!-- Botones de captura de imagen -->
                  <div class="d-flex ga-2 mb-3 w-100">
                    <v-btn
                      variant="tonal"
                      color="primary"
                      class="flex-grow-1"
                      size="small"
                      @click="abrirCamara"
                    >
                      <v-icon start size="18">mdi-camera</v-icon>
                      Tomar Foto
                    </v-btn>
                    <v-btn
                      v-if="imagePreview || form.image_url"
                      variant="tonal"
                      color="error"
                      size="small"
                      @click="limpiarImagen"
                    >
                      <v-icon size="18">mdi-delete</v-icon>
                    </v-btn>
                  </div>

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

                  <!-- Indicador de precios investigados en internet -->
                  <v-expand-transition>
                    <div v-if="priceResearched && priceSources.length > 0" class="mb-3 w-100">
                      <v-alert type="success" variant="tonal" density="compact" class="text-caption">
                        <template #prepend>
                          <v-icon size="16">mdi-web-check</v-icon>
                        </template>
                        <div class="font-weight-medium mb-1">Precio investigado en internet</div>
                        <div class="d-flex flex-wrap ga-1 mt-1">
                          <a
                            v-for="(source, idx) in priceSources.slice(0, 4)"
                            :key="idx"
                            :href="source.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-caption d-inline-flex align-center text-success"
                            style="font-size: 0.65rem !important; text-decoration: none;"
                          >
                            <v-icon size="10" class="mr-1">mdi-open-in-new</v-icon>
                            {{ source.title }}
                          </a>
                        </div>
                      </v-alert>
                    </div>
                    <div v-else-if="priceResearched" class="mb-3 w-100">
                      <v-chip size="x-small" variant="tonal" color="success" prepend-icon="mdi-magnify" density="compact">
                        Precio estimado con búsqueda web
                      </v-chip>
                    </div>
                  </v-expand-transition>

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
                          :hint="!form.barcode && !editingProduct ? 'Se generará un código interno automáticamente' : ''"
                          persistent-hint
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
                        >
                          <template #append>
                            <v-btn icon size="x-small" variant="text" color="primary" @click.stop="showCategoryManager = true" title="Gestionar categorías">
                              <v-icon size="18">mdi-cog</v-icon>
                            </v-btn>
                          </template>
                        </v-select>
                        <!-- Sugerencia de categoría de la IA -->
                        <v-alert
                          v-if="suggestedCategoryName && !form.category_id"
                          type="info"
                          variant="tonal"
                          density="compact"
                          class="mt-n2 mb-2 text-caption"
                        >
                          <div class="d-flex align-center flex-wrap ga-2">
                            <v-icon size="14">mdi-sparkles</v-icon>
                            <span>IA sugiere: <strong>{{ suggestedCategoryName }}</strong></span>
                            <v-btn
                              size="x-small"
                              color="primary"
                              variant="tonal"
                              :loading="savingCategory"
                              @click="crearCategoriaSugerida"
                            >
                              <v-icon start size="14">mdi-plus</v-icon>
                              Crear categoría
                            </v-btn>
                            <v-btn
                              size="x-small"
                              variant="text"
                              @click="suggestedCategoryName = ''"
                            >
                              Ignorar
                            </v-btn>
                          </div>
                        </v-alert>
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

                      <v-col cols="12" sm="6">
                        <v-select
                          v-model="form.sell_by"
                          :items="[
                            { title: 'Por Unidad', value: 'unit' },
                            { title: 'Por Peso / Granel (lb, kg)', value: 'weight' },
                          ]"
                          label="Tipo de Venta"
                          variant="outlined"
                          density="comfortable"
                          prepend-inner-icon="mdi-scale-balance"
                          hide-details
                        />
                        <div v-if="form.sell_by === 'weight'" class="text-caption text-warning mt-1 ml-1">
                          <v-icon size="12" color="warning" class="mr-1">mdi-information</v-icon>
                          Se permitirán cantidades decimales (ej. 0.5 lb)
                        </div>
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
                          placeholder="0.00"
                          variant="outlined"
                          density="comfortable"
                          class="font-weight-bold"
                          :rules="[v => v === null || v === '' || v >= 0 || 'Inválido']"
                        />
                      </v-col>

                      <v-col cols="6" sm="4">
                        <v-text-field
                          v-model.number="form.cost"
                          label="Costo Unitario"
                          type="number"
                          prefix="L"
                          placeholder="0.00"
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
                          placeholder="15"
                          variant="outlined"
                          density="comfortable"
                        />
                      </v-col>

                      <v-col cols="6" sm="6">
                        <v-text-field
                          v-model.number="form.stock"
                          :label="form.sell_by === 'weight' ? 'Stock Actual (lb)' : 'Stock Actual'"
                          type="number"
                          :step="form.sell_by === 'weight' ? 0.25 : 1"
                          :min="0"
                          prepend-inner-icon="mdi-package-variant"
                          variant="outlined"
                          density="comfortable"
                          :suffix="form.sell_by === 'weight' ? 'lb' : 'uds'"
                        />
                      </v-col>

                      <v-col cols="6" sm="6">
                        <v-text-field
                          v-model.number="form.min_stock"
                          :label="form.sell_by === 'weight' ? 'Stock Mínimo (lb)' : 'Stock Mínimo'"
                          type="number"
                          :step="form.sell_by === 'weight' ? 0.25 : 1"
                          :min="0"
                          prepend-inner-icon="mdi-alert-circle-outline"
                          variant="outlined"
                          density="comfortable"
                          :suffix="form.sell_by === 'weight' ? 'lb' : 'uds'"
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

          <!-- Error de guardado -->
          <v-alert
            v-if="saveError"
            type="error"
            variant="tonal"
            density="compact"
            closable
            class="mx-6 mt-2"
            @click:close="saveError = ''"
          >
            {{ saveError }}
          </v-alert>
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
          <div id="productos-scanner-reader" class="neo-flat pa-2 mb-3" style="min-height: 250px;" />

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

    <!-- Diálogo de cámara -->
    <v-dialog
      v-model="showCamera"
      :fullscreen="mobile"
      max-width="440"
      @update:model-value="!$event && cerrarCamara()"
    >
      <v-card :class="mobile ? 'rounded-0' : ''" class="d-flex flex-column" style="height: 100%;">
        <!-- Toolbar compacto -->
        <v-toolbar density="compact" flat color="transparent">
          <div class="neo-circle-sm ml-3 mr-2">
            <v-icon color="primary" size="18">mdi-camera</v-icon>
          </div>
          <v-toolbar-title class="text-subtitle-1 font-weight-bold">Tomar Foto del Producto</v-toolbar-title>
          <v-spacer />
          <v-btn icon variant="text" @click="cerrarCamara">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>

        <!-- Visor de cámara: portrait en móvil, cuadrado en desktop -->
        <div class="px-4 pb-2 flex-grow-1 d-flex flex-column justify-center">
          <div
            class="neo-pressed rounded-xl overflow-hidden w-100"
            :style="mobile
              ? 'aspect-ratio: 3/4; max-height: 65dvh;'
              : 'aspect-ratio: 4/3;'
            "
          >
            <video
              id="camera-preview"
              autoplay
              playsinline
              muted
              style="width: 100%; height: 100%; object-fit: cover;"
            />
          </div>
          <p class="text-caption text-medium-emphasis text-center mt-2">
            Centra el producto dentro del recuadro
          </p>
        </div>

        <v-card-actions class="pa-4 pt-0">
          <v-btn variant="text" @click="cerrarCamara">Cancelar</v-btn>
          <v-spacer />
          <v-btn
            color="primary"
            size="large"
            rounded="pill"
            class="px-6"
            @click="capturarFoto"
          >
            <v-icon start>mdi-camera</v-icon>
            Capturar foto
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo de gestión de categorías -->
    <v-dialog v-model="showCategoryManager" max-width="600" persistent>
      <v-card>
        <div class="pa-5 d-flex align-center justify-space-between">
          <div class="d-flex align-center">
            <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #66BB6A, #43A047);">
              <v-icon color="white" size="20">mdi-shape</v-icon>
            </div>
            <h3 class="text-h6 font-weight-bold">Gestionar Categorías</h3>
          </div>
          <v-btn icon variant="text" @click="showCategoryManager = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>

        <v-card-text class="px-5 py-0">
          <v-alert v-if="categoryError" type="error" variant="tonal" density="compact" class="mb-3">
            {{ categoryError }}
          </v-alert>

          <!-- Formulario nueva/editar categoría -->
          <v-card variant="outlined" class="mb-4 pa-3">
            <div class="text-subtitle-2 font-weight-bold mb-2">
              {{ editingCategory ? 'Editar categoría' : 'Nueva categoría' }}
            </div>
            <v-row dense>
              <v-col cols="12" sm="8">
                <v-text-field
                  v-model="categoryForm.name"
                  label="Nombre de categoría *"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="categoryForm.color"
                  label="Color"
                  type="color"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="categoryForm.description"
                  label="Descripción (opcional)"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mt-2"
                />
              </v-col>
              <v-col cols="12" class="d-flex ga-2 mt-2">
                <v-btn
                  color="primary"
                  size="small"
                  :loading="savingCategory"
                  :disabled="!categoryForm.name.trim()"
                  @click="saveCategoryForm"
                >
                  <v-icon start size="18">mdi-check</v-icon>
                  {{ editingCategory ? 'Actualizar' : 'Crear' }}
                </v-btn>
                <v-btn
                  v-if="editingCategory"
                  variant="text"
                  size="small"
                  @click="editingCategory = null; categoryForm = { name: '', description: '', color: '#4A7BF7', icon: 'mdi-shape' }"
                >
                  Cancelar edición
                </v-btn>
              </v-col>
            </v-row>
          </v-card>

          <!-- Lista de categorías existentes -->
          <v-list density="compact" class="mb-2">
            <v-list-item
              v-for="cat in categories"
              :key="cat.id"
              class="px-2"
            >
              <template #prepend>
                <v-avatar size="32" :color="cat.color || '#4A7BF7'" class="mr-3">
                  <v-icon color="white" size="18">{{ cat.icon || 'mdi-shape' }}</v-icon>
                </v-avatar>
              </template>
              <v-list-item-title class="font-weight-medium">{{ cat.name }}</v-list-item-title>
              <v-list-item-subtitle v-if="cat.description">{{ cat.description }}</v-list-item-subtitle>
              <v-list-item-subtitle v-if="categoryProductCount(cat.id) > 0" class="text-caption">
                {{ categoryProductCount(cat.id) }} producto{{ categoryProductCount(cat.id) > 1 ? 's' : '' }}
              </v-list-item-subtitle>
              <template #append>
                <v-btn icon size="x-small" variant="text" @click="openCategoryForm(cat)">
                  <v-icon size="16">mdi-pencil</v-icon>
                </v-btn>
                <v-btn icon size="x-small" variant="text" color="error" @click="removeCategory(cat.id)" :disabled="categoryProductCount(cat.id) > 0" :title="categoryProductCount(cat.id) > 0 ? 'Tiene productos asociados' : 'Eliminar categoría'">
                  <v-icon size="16">mdi-delete</v-icon>
                </v-btn>
              </template>
            </v-list-item>
            <v-list-item v-if="categories.length === 0">
              <v-list-item-title class="text-medium-emphasis text-center py-4">
                No hay categorías registradas
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>

        <v-card-actions class="pa-5 pt-2">
          <v-spacer />
          <v-btn variant="text" @click="showCategoryManager = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
