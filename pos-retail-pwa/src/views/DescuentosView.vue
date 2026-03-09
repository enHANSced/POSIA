<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  fetchDiscounts,
  fetchCombos,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  createCombo,
  updateCombo,
  deleteCombo,
  fetchDiscountApplications,
  fetchCategories,
  fetchProducts,
  type DiscountApplicationHistoryItem
} from '@/services/database'
import type { Discount, Combo, Category, Product } from '@/types/supabase'

// ==================== ESTADO ====================
const tab = ref<'descuentos' | 'combos' | 'historial'>('descuentos')
const loading = ref(false)
const saving = ref(false)
const discounts = ref<Discount[]>([])
const combos = ref<Combo[]>([])
const applications = ref<DiscountApplicationHistoryItem[]>([])
const categories = ref<Category[]>([])
const products = ref<Product[]>([])

// Snackbar
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

// Filtros
const searchDiscount = ref('')
const searchCombo = ref('')
const showInactive = ref(false)

// Formularios
const showDiscountForm = ref(false)
const showComboForm = ref(false)
const showDeleteConfirm = ref(false)
const deleteTarget = ref<{ type: 'discount' | 'combo'; id: string; name: string } | null>(null)

const editingDiscount = ref<Discount | null>(null)
const editingCombo = ref<Combo | null>(null)

const discountForm = ref({
  name: '',
  description: '',
  type: 'percentage' as 'percentage' | 'fixed',
  value: null as number | null,
  min_amount: null as number | null,
  min_quantity: null as number | null,
  applicable_to: 'all' as 'all' | 'category' | 'product',
  category_id: null as string | null,
  product_ids: [] as string[],
  valid_from: '',
  valid_until: '',
  active: true
})
const discountFormValid = ref(false)

const comboForm = ref({
  name: '',
  description: '',
  discount_type: 'percentage' as 'percentage' | 'fixed',
  discount_value: null as number | null,
  product_ids: [] as string[],
  required_all: true,
  min_quantity_per_product: 1,
  max_uses_per_sale: 1,
  valid_from: '',
  valid_until: '',
  active: true
})
const comboFormValid = ref(false)

// ==================== REGLAS DE VALIDACIÓN ====================
const nameRules = [
  (v: string) => !!v || 'El nombre es requerido',
  (v: string) => v.length >= 2 || 'Mínimo 2 caracteres'
]
const valueRules = [
  (v: number | null) => v !== null || 'El valor es requerido',
  (v: number | null) => (v !== null && v > 0) || 'Debe ser mayor a 0'
]
const percentRules = [
  (v: number | null) => v !== null || 'El valor es requerido',
  (v: number | null) => (v !== null && v > 0 && v <= 100) || 'Debe estar entre 1 y 100'
]
const comboProductsRules = [
  (v: string[]) => v.length >= 2 || 'Selecciona al menos 2 productos'
]

// ==================== COMPUTED ====================
const filteredDiscounts = computed(() => {
  let list = discounts.value
  if (!showInactive.value) list = list.filter(d => d.active)
  if (searchDiscount.value) {
    const q = searchDiscount.value.toLowerCase()
    list = list.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q)
    )
  }
  return list
})

const filteredCombos = computed(() => {
  let list = combos.value
  if (!showInactive.value) list = list.filter(c => c.active)
  if (searchCombo.value) {
    const q = searchCombo.value.toLowerCase()
    list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q)
    )
  }
  return list
})

const totalDescuentosActivos = computed(() => discounts.value.filter(d => d.active).length)
const totalCombosActivos = computed(() => combos.value.filter(c => c.active).length)
const totalAhorrado30d = computed(() => {
  const hace30d = new Date()
  hace30d.setDate(hace30d.getDate() - 30)
  return applications.value
    .filter(a => new Date(a.created_at) >= hace30d)
    .reduce((acc, a) => acc + a.amount_saved, 0)
})
const totalAplicaciones30d = computed(() => {
  const hace30d = new Date()
  hace30d.setDate(hace30d.getDate() - 30)
  return applications.value.filter(a => new Date(a.created_at) >= hace30d).length
})

// Maps para nombres de productos y categorías
const productMap = computed(() => {
  const m = new Map<string, Product>()
  products.value.forEach(p => m.set(p.id, p))
  return m
})
const categoryMap = computed(() => {
  const m = new Map<string, Category>()
  categories.value.forEach(c => m.set(c.id, c))
  return m
})

// ==================== LIFECYCLE ====================
onMounted(async () => {
  await loadAll()
})

async function loadAll() {
  loading.value = true
  try {
    const [d, c, a, cats, prods] = await Promise.all([
      fetchDiscounts(true),
      fetchCombos(true),
      fetchDiscountApplications(undefined, undefined, 200),
      fetchCategories(),
      fetchProducts()
    ])
    discounts.value = d
    combos.value = c
    applications.value = a
    categories.value = cats
    products.value = prods
  } catch (err) {
    notify('Error al cargar datos: ' + (err instanceof Error ? err.message : String(err)), 'error')
  } finally {
    loading.value = false
  }
}

// ==================== HELPERS ====================
function notify(text: string, color: string = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('es-HN', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

function formatCurrency(value: number): string {
  return `L ${value.toFixed(2)}`
}

function formatDiscountValue(type: string, value: number): string {
  return type === 'percentage' ? `${value}%` : formatCurrency(value)
}

function getApplicableLabel(applicable_to: string): string {
  const map: Record<string, string> = {
    all: 'Todos los productos',
    category: 'Por categoría',
    product: 'Productos específicos'
  }
  return map[applicable_to] || applicable_to
}

function getProductNames(productIds: string[]): string {
  return productIds
    .map(id => productMap.value.get(id)?.name || 'Producto eliminado')
    .join(', ')
}

function getCategoryName(catId: string | null): string {
  if (!catId) return '—'
  return categoryMap.value.get(catId)?.name || 'Categoría eliminada'
}

function isVigente(validFrom: string | null, validUntil: string | null): boolean {
  const now = new Date()
  if (validFrom && now < new Date(validFrom)) return false
  if (validUntil && now > new Date(validUntil)) return false
  return true
}

// ==================== DESCUENTOS CRUD ====================
function openNewDiscount() {
  editingDiscount.value = null
  discountForm.value = {
    name: '',
    description: '',
    type: 'percentage',
    value: null,
    min_amount: null,
    min_quantity: null,
    applicable_to: 'all',
    category_id: null,
    product_ids: [],
    valid_from: '',
    valid_until: '',
    active: true
  }
  showDiscountForm.value = true
}

function editDiscount(d: Discount) {
  editingDiscount.value = d
  discountForm.value = {
    name: d.name,
    description: d.description || '',
    type: d.type,
    value: d.value,
    min_amount: d.min_amount,
    min_quantity: d.min_quantity,
    applicable_to: d.applicable_to,
    category_id: d.category_id,
    product_ids: [...d.product_ids],
    valid_from: d.valid_from ? d.valid_from.substring(0, 10) : '',
    valid_until: d.valid_until ? d.valid_until.substring(0, 10) : '',
    active: d.active
  }
  showDiscountForm.value = true
}

async function saveDiscount() {
  if (!discountFormValid.value) return
  saving.value = true
  try {
    const payload = {
      name: discountForm.value.name.trim(),
      description: discountForm.value.description.trim() || null,
      type: discountForm.value.type,
      value: discountForm.value.value!,
      min_amount: discountForm.value.min_amount,
      min_quantity: discountForm.value.min_quantity,
      applicable_to: discountForm.value.applicable_to,
      category_id: discountForm.value.applicable_to === 'category' ? discountForm.value.category_id : null,
      product_ids: discountForm.value.applicable_to === 'product' ? discountForm.value.product_ids : [],
      valid_from: discountForm.value.valid_from || null,
      valid_until: discountForm.value.valid_until || null,
      active: discountForm.value.active
    }

    if (editingDiscount.value) {
      await updateDiscount(editingDiscount.value.id, payload)
      notify('Descuento actualizado exitosamente')
    } else {
      await createDiscount(payload)
      notify('Descuento creado exitosamente')
    }
    showDiscountForm.value = false
    await loadAll()
  } catch (err) {
    notify('Error: ' + (err instanceof Error ? err.message : String(err)), 'error')
  } finally {
    saving.value = false
  }
}

async function toggleDiscountActive(d: Discount) {
  try {
    await updateDiscount(d.id, { active: !d.active })
    notify(`Descuento ${!d.active ? 'activado' : 'desactivado'}`)
    await loadAll()
  } catch (err) {
    notify('Error al cambiar estado', 'error')
  }
}

// ==================== COMBOS CRUD ====================
function openNewCombo() {
  editingCombo.value = null
  comboForm.value = {
    name: '',
    description: '',
    discount_type: 'percentage',
    discount_value: null,
    product_ids: [],
    required_all: true,
    min_quantity_per_product: 1,
    max_uses_per_sale: 1,
    valid_from: '',
    valid_until: '',
    active: true
  }
  showComboForm.value = true
}

function editCombo(c: Combo) {
  editingCombo.value = c
  comboForm.value = {
    name: c.name,
    description: c.description || '',
    discount_type: c.discount_type,
    discount_value: c.discount_value,
    product_ids: [...c.product_ids],
    required_all: c.required_all,
    min_quantity_per_product: c.min_quantity_per_product,
    max_uses_per_sale: c.max_uses_per_sale,
    valid_from: c.valid_from ? c.valid_from.substring(0, 10) : '',
    valid_until: c.valid_until ? c.valid_until.substring(0, 10) : '',
    active: c.active
  }
  showComboForm.value = true
}

async function saveCombo() {
  if (!comboFormValid.value) return
  saving.value = true
  try {
    const payload = {
      name: comboForm.value.name.trim(),
      description: comboForm.value.description.trim() || null,
      discount_type: comboForm.value.discount_type,
      discount_value: comboForm.value.discount_value!,
      product_ids: comboForm.value.product_ids,
      required_all: comboForm.value.required_all,
      min_quantity_per_product: comboForm.value.min_quantity_per_product,
      max_uses_per_sale: comboForm.value.max_uses_per_sale,
      valid_from: comboForm.value.valid_from || null,
      valid_until: comboForm.value.valid_until || null,
      active: comboForm.value.active
    }

    if (editingCombo.value) {
      await updateCombo(editingCombo.value.id, payload)
      notify('Combo actualizado exitosamente')
    } else {
      await createCombo(payload)
      notify('Combo creado exitosamente')
    }
    showComboForm.value = false
    await loadAll()
  } catch (err) {
    notify('Error: ' + (err instanceof Error ? err.message : String(err)), 'error')
  } finally {
    saving.value = false
  }
}

async function toggleComboActive(c: Combo) {
  try {
    await updateCombo(c.id, { active: !c.active })
    notify(`Combo ${!c.active ? 'activado' : 'desactivado'}`)
    await loadAll()
  } catch (err) {
    notify('Error al cambiar estado', 'error')
  }
}

// ==================== ELIMINAR ====================
function confirmDelete(type: 'discount' | 'combo', id: string, name: string) {
  deleteTarget.value = { type, id, name }
  showDeleteConfirm.value = true
}

async function executeDelete() {
  if (!deleteTarget.value) return
  saving.value = true
  try {
    if (deleteTarget.value.type === 'discount') {
      await deleteDiscount(deleteTarget.value.id)
    } else {
      await deleteCombo(deleteTarget.value.id)
    }
    notify(`${deleteTarget.value.type === 'discount' ? 'Descuento' : 'Combo'} eliminado`)
    showDeleteConfirm.value = false
    deleteTarget.value = null
    await loadAll()
  } catch (err) {
    notify('Error al eliminar: ' + (err instanceof Error ? err.message : String(err)), 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <!-- Header -->
    <div class="d-flex flex-wrap align-center justify-space-between mb-6 ga-4">
      <div>
        <h1 class="text-h5 font-weight-bold">
          <v-icon start color="primary">mdi-tag-multiple</v-icon>
          Descuentos y Combos
        </h1>
        <p class="text-body-2 text-medium-emphasis mt-1">
          Gestión de promociones, descuentos y combos del sistema
        </p>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          icon
          variant="text"
          :loading="loading"
          @click="loadAll"
        >
          <v-icon>mdi-refresh</v-icon>
          <v-tooltip activator="parent" location="top">Recargar</v-tooltip>
        </v-btn>
      </div>
    </div>

    <!-- KPIs -->
    <v-row class="mb-6">
      <v-col cols="6" md="3">
        <v-card class="pa-4 text-center">
          <div class="text-h5 font-weight-bold text-primary">{{ totalDescuentosActivos }}</div>
          <div class="text-caption text-medium-emphasis">Descuentos Activos</div>
        </v-card>
      </v-col>
      <v-col cols="6" md="3">
        <v-card class="pa-4 text-center">
          <div class="text-h5 font-weight-bold text-info">{{ totalCombosActivos }}</div>
          <div class="text-caption text-medium-emphasis">Combos Activos</div>
        </v-card>
      </v-col>
      <v-col cols="6" md="3">
        <v-card class="pa-4 text-center">
          <div class="text-h5 font-weight-bold text-success">{{ totalAplicaciones30d }}</div>
          <div class="text-caption text-medium-emphasis">Aplicaciones (30 días)</div>
        </v-card>
      </v-col>
      <v-col cols="6" md="3">
        <v-card class="pa-4 text-center">
          <div class="text-h5 font-weight-bold text-warning">{{ formatCurrency(totalAhorrado30d) }}</div>
          <div class="text-caption text-medium-emphasis">Total Ahorrado (30 días)</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Tabs -->
    <v-card class="mb-6">
      <v-tabs v-model="tab" color="primary" grow>
        <v-tab value="descuentos">
          <v-icon start>mdi-percent</v-icon>
          Descuentos
          <v-badge :content="String(totalDescuentosActivos)" color="primary" inline class="ml-2" />
        </v-tab>
        <v-tab value="combos">
          <v-icon start>mdi-package-variant</v-icon>
          Combos
          <v-badge :content="String(totalCombosActivos)" color="info" inline class="ml-2" />
        </v-tab>
        <v-tab value="historial">
          <v-icon start>mdi-history</v-icon>
          Historial
        </v-tab>
      </v-tabs>
    </v-card>

    <!-- Loading -->
    <div v-if="loading && discounts.length === 0" class="text-center py-12">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-body-2 text-medium-emphasis mt-4">Cargando promociones...</p>
    </div>

    <!-- ==================== TAB DESCUENTOS ==================== -->
    <template v-else-if="tab === 'descuentos'">
      <!-- Toolbar -->
      <v-card class="mb-4 pa-4">
        <v-row dense align="center">
          <v-col cols="12" md="5">
            <v-text-field
              v-model="searchDiscount"
              label="Buscar descuento"
              prepend-inner-icon="mdi-magnify"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" md="3">
            <v-switch
              v-model="showInactive"
              label="Mostrar inactivos"
              color="primary"
              hide-details
              density="compact"
            />
          </v-col>
          <v-col cols="6" md="4" class="text-right">
            <v-btn color="primary" prepend-icon="mdi-plus" @click="openNewDiscount">
              Nuevo Descuento
            </v-btn>
          </v-col>
        </v-row>
      </v-card>

      <!-- Lista de descuentos -->
      <v-row>
        <v-col
          v-for="d in filteredDiscounts"
          :key="d.id"
          cols="12"
          md="6"
          lg="4"
        >
          <v-card :class="{ 'opacity-60': !d.active }" class="pa-4">
            <div class="d-flex align-start justify-space-between mb-2">
              <div class="d-flex align-center ga-2">
                <div
                  class="neo-circle-sm"
                  :style="{ background: d.type === 'percentage' ? 'linear-gradient(135deg, #4CAF50, #66BB6A)' : 'linear-gradient(135deg, #FF9800, #FFB74D)' }"
                >
                  <v-icon color="white" size="18">{{ d.type === 'percentage' ? 'mdi-percent' : 'mdi-currency-usd' }}</v-icon>
                </div>
                <div>
                  <h3 class="text-subtitle-1 font-weight-bold">{{ d.name }}</h3>
                  <p v-if="d.description" class="text-caption text-medium-emphasis">{{ d.description }}</p>
                </div>
              </div>
              <v-chip
                :color="d.active && isVigente(d.valid_from, d.valid_until) ? 'success' : 'grey'"
                size="small"
                variant="tonal"
              >
                {{ d.active ? (isVigente(d.valid_from, d.valid_until) ? 'Vigente' : 'Programado') : 'Inactivo' }}
              </v-chip>
            </div>

            <!-- Valor del descuento -->
            <div class="neo-card-pressed pa-3 rounded-lg mb-3">
              <div class="d-flex justify-space-between align-center">
                <span class="text-caption text-medium-emphasis">Descuento</span>
                <span class="text-h6 font-weight-bold text-primary">{{ formatDiscountValue(d.type, d.value) }}</span>
              </div>
            </div>

            <!-- Detalles -->
            <div class="text-caption mb-2">
              <div class="d-flex justify-space-between mb-1">
                <span class="text-medium-emphasis">Aplica a:</span>
                <span class="font-weight-medium">{{ getApplicableLabel(d.applicable_to) }}</span>
              </div>
              <div v-if="d.applicable_to === 'category' && d.category_id" class="d-flex justify-space-between mb-1">
                <span class="text-medium-emphasis">Categoría:</span>
                <span class="font-weight-medium">{{ getCategoryName(d.category_id) }}</span>
              </div>
              <div v-if="d.applicable_to === 'product' && d.product_ids.length > 0" class="mb-1">
                <span class="text-medium-emphasis">Productos: </span>
                <span class="font-weight-medium">{{ getProductNames(d.product_ids) }}</span>
              </div>
              <div v-if="d.min_amount" class="d-flex justify-space-between mb-1">
                <span class="text-medium-emphasis">Monto mínimo:</span>
                <span class="font-weight-medium">{{ formatCurrency(d.min_amount) }}</span>
              </div>
              <div v-if="d.min_quantity" class="d-flex justify-space-between mb-1">
                <span class="text-medium-emphasis">Cantidad mínima:</span>
                <span class="font-weight-medium">{{ d.min_quantity }} unidades</span>
              </div>
              <div class="d-flex justify-space-between">
                <span class="text-medium-emphasis">Vigencia:</span>
                <span class="font-weight-medium">
                  {{ d.valid_from ? formatDate(d.valid_from) : 'Sin inicio' }}
                  —
                  {{ d.valid_until ? formatDate(d.valid_until) : 'Sin fin' }}
                </span>
              </div>
            </div>

            <!-- Acciones -->
            <v-divider class="my-2" />
            <div class="d-flex justify-end ga-1">
              <v-btn icon variant="text" size="small" @click="toggleDiscountActive(d)">
                <v-icon size="small" :color="d.active ? 'warning' : 'success'">
                  {{ d.active ? 'mdi-eye-off' : 'mdi-eye' }}
                </v-icon>
                <v-tooltip activator="parent" location="top">{{ d.active ? 'Desactivar' : 'Activar' }}</v-tooltip>
              </v-btn>
              <v-btn icon variant="text" size="small" @click="editDiscount(d)">
                <v-icon size="small">mdi-pencil</v-icon>
                <v-tooltip activator="parent" location="top">Editar</v-tooltip>
              </v-btn>
              <v-btn icon variant="text" size="small" color="error" @click="confirmDelete('discount', d.id, d.name)">
                <v-icon size="small">mdi-delete</v-icon>
                <v-tooltip activator="parent" location="top">Eliminar</v-tooltip>
              </v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Empty state descuentos -->
      <div v-if="!loading && filteredDiscounts.length === 0" class="text-center py-12">
        <v-icon size="64" color="grey-lighten-1">mdi-tag-off-outline</v-icon>
        <p class="text-body-1 text-medium-emphasis mt-3">No se encontraron descuentos</p>
        <v-btn color="primary" class="mt-4" prepend-icon="mdi-plus" @click="openNewDiscount">
          Crear primer descuento
        </v-btn>
      </div>
    </template>

    <!-- ==================== TAB COMBOS ==================== -->
    <template v-else-if="tab === 'combos'">
      <!-- Toolbar -->
      <v-card class="mb-4 pa-4">
        <v-row dense align="center">
          <v-col cols="12" md="5">
            <v-text-field
              v-model="searchCombo"
              label="Buscar combo"
              prepend-inner-icon="mdi-magnify"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" md="3">
            <v-switch
              v-model="showInactive"
              label="Mostrar inactivos"
              color="primary"
              hide-details
              density="compact"
            />
          </v-col>
          <v-col cols="6" md="4" class="text-right">
            <v-btn color="primary" prepend-icon="mdi-plus" @click="openNewCombo">
              Nuevo Combo
            </v-btn>
          </v-col>
        </v-row>
      </v-card>

      <!-- Lista de combos -->
      <v-row>
        <v-col
          v-for="c in filteredCombos"
          :key="c.id"
          cols="12"
          md="6"
          lg="4"
        >
          <v-card :class="{ 'opacity-60': !c.active }" class="pa-4">
            <div class="d-flex align-start justify-space-between mb-2">
              <div class="d-flex align-center ga-2">
                <div
                  class="neo-circle-sm"
                  style="background: linear-gradient(135deg, #7C4DFF, #B388FF);"
                >
                  <v-icon color="white" size="18">mdi-package-variant</v-icon>
                </div>
                <div>
                  <h3 class="text-subtitle-1 font-weight-bold">{{ c.name }}</h3>
                  <p v-if="c.description" class="text-caption text-medium-emphasis">{{ c.description }}</p>
                </div>
              </div>
              <v-chip
                :color="c.active && isVigente(c.valid_from, c.valid_until) ? 'success' : 'grey'"
                size="small"
                variant="tonal"
              >
                {{ c.active ? (isVigente(c.valid_from, c.valid_until) ? 'Vigente' : 'Programado') : 'Inactivo' }}
              </v-chip>
            </div>

            <!-- Valor del combo -->
            <div class="neo-card-pressed pa-3 rounded-lg mb-3">
              <div class="d-flex justify-space-between align-center">
                <span class="text-caption text-medium-emphasis">Descuento del combo</span>
                <span class="text-h6 font-weight-bold text-primary">{{ formatDiscountValue(c.discount_type, c.discount_value) }}</span>
              </div>
            </div>

            <!-- Productos del combo -->
            <div class="mb-2">
              <span class="text-caption text-medium-emphasis">Productos incluidos:</span>
              <div class="d-flex flex-wrap ga-1 mt-1">
                <v-chip
                  v-for="pid in c.product_ids"
                  :key="pid"
                  size="x-small"
                  color="primary"
                  variant="tonal"
                >
                  {{ productMap.get(pid)?.name || 'Eliminado' }}
                </v-chip>
              </div>
            </div>

            <!-- Detalles -->
            <div class="text-caption mb-2">
              <div class="d-flex justify-space-between mb-1">
                <span class="text-medium-emphasis">Requiere todos:</span>
                <span class="font-weight-medium">{{ c.required_all ? 'Sí' : 'No' }}</span>
              </div>
              <div class="d-flex justify-space-between mb-1">
                <span class="text-medium-emphasis">Cantidad mín. por producto:</span>
                <span class="font-weight-medium">{{ c.min_quantity_per_product }}</span>
              </div>
              <div class="d-flex justify-space-between mb-1">
                <span class="text-medium-emphasis">Usos máx. por venta:</span>
                <span class="font-weight-medium">{{ c.max_uses_per_sale }}</span>
              </div>
              <div class="d-flex justify-space-between">
                <span class="text-medium-emphasis">Vigencia:</span>
                <span class="font-weight-medium">
                  {{ c.valid_from ? formatDate(c.valid_from) : 'Sin inicio' }}
                  —
                  {{ c.valid_until ? formatDate(c.valid_until) : 'Sin fin' }}
                </span>
              </div>
            </div>

            <!-- Acciones -->
            <v-divider class="my-2" />
            <div class="d-flex justify-end ga-1">
              <v-btn icon variant="text" size="small" @click="toggleComboActive(c)">
                <v-icon size="small" :color="c.active ? 'warning' : 'success'">
                  {{ c.active ? 'mdi-eye-off' : 'mdi-eye' }}
                </v-icon>
                <v-tooltip activator="parent" location="top">{{ c.active ? 'Desactivar' : 'Activar' }}</v-tooltip>
              </v-btn>
              <v-btn icon variant="text" size="small" @click="editCombo(c)">
                <v-icon size="small">mdi-pencil</v-icon>
                <v-tooltip activator="parent" location="top">Editar</v-tooltip>
              </v-btn>
              <v-btn icon variant="text" size="small" color="error" @click="confirmDelete('combo', c.id, c.name)">
                <v-icon size="small">mdi-delete</v-icon>
                <v-tooltip activator="parent" location="top">Eliminar</v-tooltip>
              </v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Empty state combos -->
      <div v-if="!loading && filteredCombos.length === 0" class="text-center py-12">
        <v-icon size="64" color="grey-lighten-1">mdi-package-variant-closed-remove</v-icon>
        <p class="text-body-1 text-medium-emphasis mt-3">No se encontraron combos</p>
        <v-btn color="primary" class="mt-4" prepend-icon="mdi-plus" @click="openNewCombo">
          Crear primer combo
        </v-btn>
      </div>
    </template>

    <!-- ==================== TAB HISTORIAL ==================== -->
    <template v-else-if="tab === 'historial'">
      <v-card>
        <v-table hover density="comfortable">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Venta</th>
              <th>Promoción</th>
              <th>Tipo</th>
              <th class="text-right">Valor</th>
              <th class="text-right">Ahorrado</th>
              <th>Razón</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in applications" :key="a.id">
              <td class="text-caption">{{ formatDate(a.created_at) }}</td>
              <td>
                <v-chip size="x-small" variant="tonal">{{ a.sales?.sale_number || '—' }}</v-chip>
              </td>
              <td class="font-weight-medium">
                {{ a.discounts?.name || a.combos?.name || 'Manual' }}
              </td>
              <td>
                <v-chip
                  size="x-small"
                  :color="a.discount_id ? 'success' : a.combo_id ? 'info' : 'grey'"
                  variant="tonal"
                >
                  {{ a.discount_id ? 'Descuento' : a.combo_id ? 'Combo' : 'Manual' }}
                </v-chip>
              </td>
              <td class="text-right">{{ formatDiscountValue(a.discount_type, a.discount_value) }}</td>
              <td class="text-right font-weight-bold text-success">{{ formatCurrency(a.amount_saved) }}</td>
              <td class="text-caption text-medium-emphasis">{{ a.reason || '—' }}</td>
            </tr>
          </tbody>
        </v-table>

        <div v-if="applications.length === 0" class="text-center py-12">
          <v-icon size="64" color="grey-lighten-1">mdi-history</v-icon>
          <p class="text-body-1 text-medium-emphasis mt-3">No hay aplicaciones de descuento registradas</p>
        </div>
      </v-card>
    </template>

    <!-- ==================== DIÁLOGO: DESCUENTO ==================== -->
    <v-dialog v-model="showDiscountForm" max-width="620" persistent>
      <v-card>
        <div class="pa-6 text-center">
          <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #4CAF50, #66BB6A);">
            <v-icon color="white" size="28">mdi-percent</v-icon>
          </div>
          <h3 class="text-h6 mb-1">{{ editingDiscount ? 'Editar Descuento' : 'Nuevo Descuento' }}</h3>
          <p class="text-caption text-medium-emphasis">
            Configurá las reglas del descuento que se aplicará en ventas.
          </p>
        </div>

        <v-card-text class="px-6 pb-2">
          <v-form v-model="discountFormValid" @submit.prevent="saveDiscount">
            <v-text-field
              v-model="discountForm.name"
              label="Nombre del descuento"
              :rules="nameRules"
              prepend-inner-icon="mdi-tag"
              class="mb-3"
            />

            <v-textarea
              v-model="discountForm.description"
              label="Descripción (opcional)"
              rows="2"
              prepend-inner-icon="mdi-text"
              class="mb-3"
            />

            <v-row dense class="mb-3">
              <v-col cols="6">
                <v-select
                  v-model="discountForm.type"
                  label="Tipo de descuento"
                  :items="[
                    { title: 'Porcentaje (%)', value: 'percentage' },
                    { title: 'Monto fijo (L)', value: 'fixed' }
                  ]"
                  prepend-inner-icon="mdi-calculator"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model.number="discountForm.value"
                  :label="discountForm.type === 'percentage' ? 'Porcentaje (%)' : 'Monto (L)'"
                  type="number"
                  :rules="discountForm.type === 'percentage' ? percentRules : valueRules"
                  :suffix="discountForm.type === 'percentage' ? '%' : 'L'"
                  prepend-inner-icon="mdi-numeric"
                />
              </v-col>
            </v-row>

            <v-select
              v-model="discountForm.applicable_to"
              label="Aplica a"
              :items="[
                { title: 'Todos los productos', value: 'all' },
                { title: 'Por categoría', value: 'category' },
                { title: 'Productos específicos', value: 'product' }
              ]"
              prepend-inner-icon="mdi-filter-variant"
              class="mb-3"
            />

            <v-select
              v-if="discountForm.applicable_to === 'category'"
              v-model="discountForm.category_id"
              label="Categoría"
              :items="categories.map(c => ({ title: c.name, value: c.id }))"
              prepend-inner-icon="mdi-shape"
              class="mb-3"
            />

            <v-autocomplete
              v-if="discountForm.applicable_to === 'product'"
              v-model="discountForm.product_ids"
              label="Productos"
              :items="products.map(p => ({ title: `${p.name} (${p.sku || 'sin SKU'})`, value: p.id }))"
              multiple
              chips
              closable-chips
              prepend-inner-icon="mdi-package-variant"
              class="mb-3"
            />

            <v-row dense class="mb-3">
              <v-col cols="6">
                <v-text-field
                  v-model.number="discountForm.min_amount"
                  label="Monto mínimo (opcional)"
                  type="number"
                  prepend-inner-icon="mdi-cash"
                  clearable
                  hint="Subtotal mínimo para aplicar"
                  persistent-hint
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model.number="discountForm.min_quantity"
                  label="Cantidad mín. (opcional)"
                  type="number"
                  prepend-inner-icon="mdi-counter"
                  clearable
                  hint="Productos mín. en carrito"
                  persistent-hint
                />
              </v-col>
            </v-row>

            <v-row dense class="mb-3">
              <v-col cols="6">
                <v-text-field
                  v-model="discountForm.valid_from"
                  label="Válido desde (opcional)"
                  type="date"
                  prepend-inner-icon="mdi-calendar-start"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model="discountForm.valid_until"
                  label="Válido hasta (opcional)"
                  type="date"
                  prepend-inner-icon="mdi-calendar-end"
                />
              </v-col>
            </v-row>

            <v-switch
              v-model="discountForm.active"
              label="Activo inmediatamente"
              color="success"
              hide-details
            />
          </v-form>
        </v-card-text>

        <v-card-actions class="pa-6 pt-2">
          <v-spacer />
          <v-btn variant="text" @click="showDiscountForm = false" :disabled="saving">Cancelar</v-btn>
          <v-btn
            color="primary"
            :loading="saving"
            :disabled="!discountFormValid"
            @click="saveDiscount"
          >
            <v-icon start>{{ editingDiscount ? 'mdi-content-save' : 'mdi-plus' }}</v-icon>
            {{ editingDiscount ? 'Guardar Cambios' : 'Crear Descuento' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ==================== DIÁLOGO: COMBO ==================== -->
    <v-dialog v-model="showComboForm" max-width="620" persistent>
      <v-card>
        <div class="pa-6 text-center">
          <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #7C4DFF, #B388FF);">
            <v-icon color="white" size="28">mdi-package-variant</v-icon>
          </div>
          <h3 class="text-h6 mb-1">{{ editingCombo ? 'Editar Combo' : 'Nuevo Combo' }}</h3>
          <p class="text-caption text-medium-emphasis">
            Combiná productos con un descuento especial para tus clientes.
          </p>
        </div>

        <v-card-text class="px-6 pb-2">
          <v-form v-model="comboFormValid" @submit.prevent="saveCombo">
            <v-text-field
              v-model="comboForm.name"
              label="Nombre del combo"
              :rules="nameRules"
              prepend-inner-icon="mdi-tag"
              class="mb-3"
            />

            <v-textarea
              v-model="comboForm.description"
              label="Descripción (opcional)"
              rows="2"
              prepend-inner-icon="mdi-text"
              class="mb-3"
            />

            <v-autocomplete
              v-model="comboForm.product_ids"
              label="Productos del combo"
              :items="products.map(p => ({ title: `${p.name} (${p.sku || 'sin SKU'}) — L ${p.price.toFixed(2)}`, value: p.id }))"
              :rules="comboProductsRules"
              multiple
              chips
              closable-chips
              prepend-inner-icon="mdi-package-variant"
              hint="Selecciona al menos 2 productos"
              persistent-hint
              class="mb-3"
            />

            <v-row dense class="mb-3">
              <v-col cols="6">
                <v-select
                  v-model="comboForm.discount_type"
                  label="Tipo de descuento"
                  :items="[
                    { title: 'Porcentaje (%)', value: 'percentage' },
                    { title: 'Monto fijo (L)', value: 'fixed' }
                  ]"
                  prepend-inner-icon="mdi-calculator"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model.number="comboForm.discount_value"
                  :label="comboForm.discount_type === 'percentage' ? 'Porcentaje (%)' : 'Monto (L)'"
                  type="number"
                  :rules="comboForm.discount_type === 'percentage' ? percentRules : valueRules"
                  :suffix="comboForm.discount_type === 'percentage' ? '%' : 'L'"
                  prepend-inner-icon="mdi-numeric"
                />
              </v-col>
            </v-row>

            <v-switch
              v-model="comboForm.required_all"
              label="Requiere todos los productos del combo"
              color="primary"
              hide-details
              class="mb-3"
            />

            <v-row dense class="mb-3">
              <v-col cols="6">
                <v-text-field
                  v-model.number="comboForm.min_quantity_per_product"
                  label="Cantidad mín. por producto"
                  type="number"
                  min="1"
                  prepend-inner-icon="mdi-counter"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model.number="comboForm.max_uses_per_sale"
                  label="Usos máx. por venta"
                  type="number"
                  min="1"
                  prepend-inner-icon="mdi-repeat"
                />
              </v-col>
            </v-row>

            <v-row dense class="mb-3">
              <v-col cols="6">
                <v-text-field
                  v-model="comboForm.valid_from"
                  label="Válido desde (opcional)"
                  type="date"
                  prepend-inner-icon="mdi-calendar-start"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model="comboForm.valid_until"
                  label="Válido hasta (opcional)"
                  type="date"
                  prepend-inner-icon="mdi-calendar-end"
                />
              </v-col>
            </v-row>

            <v-switch
              v-model="comboForm.active"
              label="Activo inmediatamente"
              color="success"
              hide-details
            />
          </v-form>
        </v-card-text>

        <v-card-actions class="pa-6 pt-2">
          <v-spacer />
          <v-btn variant="text" @click="showComboForm = false" :disabled="saving">Cancelar</v-btn>
          <v-btn
            color="primary"
            :loading="saving"
            :disabled="!comboFormValid"
            @click="saveCombo"
          >
            <v-icon start>{{ editingCombo ? 'mdi-content-save' : 'mdi-plus' }}</v-icon>
            {{ editingCombo ? 'Guardar Cambios' : 'Crear Combo' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ==================== DIÁLOGO: CONFIRMAR ELIMINACIÓN ==================== -->
    <v-dialog v-model="showDeleteConfirm" max-width="440">
      <v-card v-if="deleteTarget">
        <div class="pa-6 text-center">
          <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #F44336, #E57373);">
            <v-icon color="white" size="28">mdi-delete-alert</v-icon>
          </div>
          <h3 class="text-h6 mb-2">Confirmar Eliminación</h3>
          <p class="text-body-2 text-medium-emphasis">
            ¿Estás seguro de que querés eliminar
            <strong>{{ deleteTarget.name }}</strong>?
            Esta acción no se puede deshacer.
          </p>
        </div>
        <v-card-actions class="pa-6 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="showDeleteConfirm = false" :disabled="saving">Cancelar</v-btn>
          <v-btn color="error" :loading="saving" @click="executeDelete">
            <v-icon start>mdi-delete</v-icon>
            Eliminar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar -->
    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000" location="bottom right">
      {{ snackbarText }}
      <template #actions>
        <v-btn variant="text" @click="snackbar = false">Cerrar</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<style scoped>
.neo-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.neo-circle-sm {
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.opacity-60 {
  opacity: 0.6;
}
</style>
