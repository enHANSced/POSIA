<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useEmpleadosStore } from '@/stores/empleados'
import { useAuthStore } from '@/stores/auth'
import type { UserProfile } from '@/types/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

const empleadosStore = useEmpleadosStore()
const authStore = useAuthStore()

// Estado local
const search = ref('')
const filterRole = ref<string | null>(null)
const filterActive = ref<string | null>(null)

// Diálogo crear empleado
const showCreateDialog = ref(false)
const createFormValid = ref(false)
const newEmployee = ref({
  email: '',
  password: '',
  full_name: '',
  role: 'seller' as 'admin' | 'seller' | 'viewer',
  phone: '',
})
const showCreatePassword = ref(false)

// Diálogo editar empleado
const showEditDialog = ref(false)
const editFormValid = ref(false)
const editingEmployee = ref<UserProfile | null>(null)
const editForm = ref({
  full_name: '',
  phone: '',
  role: 'seller' as string,
})

// Snackbar
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

// Reglas de validación
const emailRules = [
  (v: string) => !!v || 'El correo es requerido',
  (v: string) => /.+@.+\..+/.test(v) || 'Correo inválido',
]
const passwordRules = [
  (v: string) => !!v || 'La contraseña es requerida',
  (v: string) => v.length >= 6 || 'Mínimo 6 caracteres',
]
const nameRules = [
  (v: string) => !!v || 'El nombre es requerido',
  (v: string) => v.length >= 2 || 'Mínimo 2 caracteres',
]

const roleOptions = [
  { title: 'Administrador', value: 'admin' },
  { title: 'Vendedor', value: 'seller' },
  { title: 'Visor', value: 'viewer' },
]

// Empleados filtrados
const filteredEmployees = computed(() => {
  let list = empleadosStore.empleados

  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(e =>
      e.full_name?.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.phone?.toLowerCase().includes(q)
    )
  }

  if (filterRole.value) {
    list = list.filter(e => e.role === filterRole.value)
  }

  if (filterActive.value !== null) {
    if (filterActive.value === 'active') {
      list = list.filter(e => e.active !== false)
    } else if (filterActive.value === 'inactive') {
      list = list.filter(e => e.active === false)
    }
  }

  return list
})

// Helpers
function getRoleLabel(role: string | null): string {
  const map: Record<string, string> = {
    admin: 'Administrador',
    seller: 'Vendedor',
    viewer: 'Visor',
  }
  return map[role || ''] || role || 'Sin rol'
}

function getRoleColor(role: string | null): string {
  const map: Record<string, string> = {
    admin: 'error',
    seller: 'primary',
    viewer: 'secondary',
  }
  return map[role || ''] || 'grey'
}

function getRoleIcon(role: string | null): string {
  const map: Record<string, string> = {
    admin: 'mdi-shield-crown',
    seller: 'mdi-point-of-sale',
    viewer: 'mdi-eye',
  }
  return map[role || ''] || 'mdi-account'
}

function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('es-HN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function isCurrentUser(id: string): boolean {
  return authStore.user?.id === id
}

// Crear empleado
function openCreateDialog() {
  newEmployee.value = {
    email: '',
    password: '',
    full_name: '',
    role: 'seller',
    phone: '',
  }
  showCreatePassword.value = false
  showCreateDialog.value = true
}

async function handleCreateEmployee() {
  if (!createFormValid.value) return

  const result = await empleadosStore.crearNuevoEmpleado({
    email: newEmployee.value.email,
    password: newEmployee.value.password,
    full_name: newEmployee.value.full_name,
    role: newEmployee.value.role,
    phone: newEmployee.value.phone || undefined,
  })

  if (result.success) {
    showCreateDialog.value = false
    showNotification('Empleado creado exitosamente', 'success')
  } else {
    showNotification(result.error || 'Error al crear empleado', 'error')
  }
}

// Editar empleado
function openEditDialog(employee: UserProfile) {
  editingEmployee.value = employee
  editForm.value = {
    full_name: employee.full_name || '',
    phone: employee.phone || '',
    role: employee.role || 'seller',
  }
  showEditDialog.value = true
}

async function handleEditEmployee() {
  if (!editFormValid.value || !editingEmployee.value) return

  const result = await empleadosStore.actualizarEmpleado(editingEmployee.value.id, {
    full_name: editForm.value.full_name,
    phone: editForm.value.phone || null,
    role: editForm.value.role,
  })

  if (result.success) {
    showEditDialog.value = false
    showNotification('Empleado actualizado exitosamente', 'success')
  } else {
    showNotification(result.error || 'Error al actualizar', 'error')
  }
}

// Toggle estado activo/inactivo
async function handleToggleActive(employee: UserProfile) {
  const newActive = employee.active === false ? true : false
  const label = newActive ? 'activado' : 'desactivado'

  const result = await empleadosStore.toggleEstadoEmpleado(employee.id, newActive)

  if (result.success) {
    showNotification(`Empleado ${label} exitosamente`, 'success')
  } else {
    showNotification(result.error || 'Error al cambiar estado', 'error')
  }
}

function showNotification(text: string, color: string) {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

// Sincronizar usuarios de auth sin perfil
async function handleSincronizar() {
  const result = await empleadosStore.sincronizar()
  if (result.success) {
    const msg = result.synced > 0
      ? `Se sincronizaron ${result.synced} usuario(s) nuevos desde autenticación`
      : 'Todos los perfiles ya están sincronizados'
    showNotification(msg, result.synced > 0 ? 'success' : 'info')
  } else {
    showNotification((result as any).error || 'Error al sincronizar', 'error')
  }
}

// Lifecycle
let subscription: RealtimeChannel | null = null

onMounted(async () => {
  await empleadosStore.cargarEmpleados()
  subscription = empleadosStore.iniciarSuscripcion()
})

onUnmounted(() => {
  subscription?.unsubscribe()
})
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <!-- Header -->
    <div class="d-flex flex-wrap align-center justify-space-between mb-6 ga-4">
      <div>
        <h1 class="text-h5 font-weight-bold">
          <v-icon start color="primary">mdi-account-group</v-icon>
          Empleados
        </h1>
        <p class="text-body-2 text-medium-emphasis mt-1">
          Gestión de usuarios y roles del sistema
        </p>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          variant="outlined"
          prepend-icon="mdi-sync"
          :loading="empleadosStore.saving"
          @click="handleSincronizar"
        >
          Sincronizar
          <v-tooltip activator="parent" location="bottom">
            Importa usuarios de autenticación que no tienen perfil en la tabla de empleados
          </v-tooltip>
        </v-btn>
        <v-btn
          color="primary"
          prepend-icon="mdi-account-plus"
          @click="openCreateDialog"
        >
          Nuevo Empleado
        </v-btn>
      </div>
    </div>

    <!-- Estadísticas rápidas -->
    <v-row class="mb-6">
      <v-col cols="6" md="3">
        <v-card class="pa-4 text-center">
          <div class="text-h5 font-weight-bold text-primary">{{ empleadosStore.totalEmpleados }}</div>
          <div class="text-caption text-medium-emphasis">Total</div>
        </v-card>
      </v-col>
      <v-col cols="6" md="3">
        <v-card class="pa-4 text-center">
          <div class="text-h5 font-weight-bold text-error">{{ empleadosStore.countByRole.admin }}</div>
          <div class="text-caption text-medium-emphasis">Administradores</div>
        </v-card>
      </v-col>
      <v-col cols="6" md="3">
        <v-card class="pa-4 text-center">
          <div class="text-h5 font-weight-bold" style="color: rgb(var(--v-theme-primary));">{{ empleadosStore.countByRole.seller }}</div>
          <div class="text-caption text-medium-emphasis">Vendedores</div>
        </v-card>
      </v-col>
      <v-col cols="6" md="3">
        <v-card class="pa-4 text-center">
          <div class="text-h5 font-weight-bold text-success">{{ empleadosStore.empleadosActivos.length }}</div>
          <div class="text-caption text-medium-emphasis">Activos</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Filtros -->
    <v-card class="mb-6 pa-4">
      <v-row dense align="center">
        <v-col cols="12" md="5">
          <v-text-field
            v-model="search"
            label="Buscar empleado"
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-select
            v-model="filterRole"
            label="Filtrar por rol"
            :items="[{ title: 'Todos', value: null }, ...roleOptions]"
            clearable
            hide-details
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-select
            v-model="filterActive"
            label="Estado"
            :items="[
              { title: 'Todos', value: null },
              { title: 'Activos', value: 'active' },
              { title: 'Inactivos', value: 'inactive' },
            ]"
            clearable
            hide-details
          />
        </v-col>
        <v-col cols="12" md="1" class="text-center">
          <v-btn
            icon
            variant="text"
            :loading="empleadosStore.loading"
            @click="empleadosStore.cargarEmpleados()"
          >
            <v-icon>mdi-refresh</v-icon>
            <v-tooltip activator="parent" location="top">Recargar</v-tooltip>
          </v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Loading -->
    <div v-if="empleadosStore.loading && empleadosStore.empleados.length === 0" class="text-center py-12">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-body-2 text-medium-emphasis mt-4">Cargando empleados...</p>
    </div>

    <!-- Error -->
    <v-alert
      v-else-if="empleadosStore.error && empleadosStore.empleados.length === 0"
      type="error"
      class="mb-4"
    >
      {{ empleadosStore.error }}
    </v-alert>

    <!-- Lista de empleados -->
    <v-card v-else>
      <v-table hover>
        <thead>
          <tr>
            <th class="text-left">Empleado</th>
            <th class="text-left">Correo</th>
            <th class="text-center">Rol</th>
            <th class="text-center">Estado</th>
            <th class="text-center">Registro</th>
            <th class="text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="emp in filteredEmployees"
            :key="emp.id"
            :class="{ 'opacity-50': emp.active === false }"
          >
            <td>
              <div class="d-flex align-center py-2">
                <v-avatar size="36" :color="getRoleColor(emp.role)" class="mr-3">
                  <span class="text-white text-body-2 font-weight-bold">
                    {{ (emp.full_name || emp.email).charAt(0).toUpperCase() }}
                  </span>
                </v-avatar>
                <div>
                  <div class="text-body-2 font-weight-medium">
                    {{ emp.full_name || '(Sin nombre)' }}
                    <v-chip
                      v-if="isCurrentUser(emp.id)"
                      size="x-small"
                      color="info"
                      class="ml-1"
                    >
                      Tú
                    </v-chip>
                  </div>
                  <div v-if="emp.phone" class="text-caption text-medium-emphasis">
                    {{ emp.phone }}
                  </div>
                </div>
              </div>
            </td>
            <td>
              <span class="text-body-2">{{ emp.email }}</span>
            </td>
            <td class="text-center">
              <v-chip
                :color="getRoleColor(emp.role)"
                size="small"
                :prepend-icon="getRoleIcon(emp.role)"
              >
                {{ getRoleLabel(emp.role) }}
              </v-chip>
            </td>
            <td class="text-center">
              <v-chip
                :color="emp.active !== false ? 'success' : 'grey'"
                size="small"
                variant="tonal"
              >
                {{ emp.active !== false ? 'Activo' : 'Inactivo' }}
              </v-chip>
            </td>
            <td class="text-center">
              <span class="text-caption">{{ formatDate(emp.created_at) }}</span>
            </td>
            <td class="text-center">
              <v-btn
                icon
                variant="text"
                size="small"
                @click="openEditDialog(emp)"
              >
                <v-icon size="small">mdi-pencil</v-icon>
                <v-tooltip activator="parent" location="top">Editar</v-tooltip>
              </v-btn>
              <v-btn
                icon
                variant="text"
                size="small"
                :color="emp.active !== false ? 'error' : 'success'"
                :disabled="isCurrentUser(emp.id)"
                @click="handleToggleActive(emp)"
              >
                <v-icon size="small">
                  {{ emp.active !== false ? 'mdi-account-off' : 'mdi-account-check' }}
                </v-icon>
                <v-tooltip activator="parent" location="top">
                  {{ emp.active !== false ? 'Desactivar' : 'Activar' }}
                </v-tooltip>
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>

      <!-- Empty state -->
      <div v-if="filteredEmployees.length === 0" class="text-center py-12">
        <v-icon size="64" color="grey-lighten-1">mdi-account-search</v-icon>
        <p class="text-body-1 text-medium-emphasis mt-3">No se encontraron empleados</p>
        <p class="text-caption text-medium-emphasis">
          Intentá con otros filtros o creá un nuevo empleado.
        </p>
      </div>
    </v-card>

    <!-- Diálogo: Crear Empleado -->
    <v-dialog v-model="showCreateDialog" max-width="520" persistent>
      <v-card>
        <div class="pa-6 text-center">
          <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
            <v-icon color="white" size="28">mdi-account-plus</v-icon>
          </div>
          <h3 class="text-h6 mb-1">Nuevo Empleado</h3>
          <p class="text-caption text-medium-emphasis">
            Creá una cuenta para un nuevo miembro del equipo.
          </p>
        </div>

        <v-card-text class="px-6 pb-2">
          <v-form v-model="createFormValid" @submit.prevent="handleCreateEmployee">
            <v-text-field
              v-model="newEmployee.full_name"
              label="Nombre completo"
              :rules="nameRules"
              prepend-inner-icon="mdi-account-outline"
              class="mb-3"
            />

            <v-text-field
              v-model="newEmployee.email"
              label="Correo electrónico"
              type="email"
              :rules="emailRules"
              prepend-inner-icon="mdi-email-outline"
              class="mb-3"
            />

            <v-text-field
              v-model="newEmployee.password"
              label="Contraseña temporal"
              :type="showCreatePassword ? 'text' : 'password'"
              :rules="passwordRules"
              prepend-inner-icon="mdi-lock-outline"
              :append-inner-icon="showCreatePassword ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="showCreatePassword = !showCreatePassword"
              hint="El empleado podrá cambiarla luego"
              persistent-hint
              class="mb-3"
            />

            <v-select
              v-model="newEmployee.role"
              label="Rol"
              :items="roleOptions"
              prepend-inner-icon="mdi-shield-account"
              class="mb-3"
            />

            <v-text-field
              v-model="newEmployee.phone"
              label="Teléfono (opcional)"
              prepend-inner-icon="mdi-phone-outline"
            />
          </v-form>
        </v-card-text>

        <v-card-actions class="pa-6 pt-2">
          <v-spacer />
          <v-btn variant="text" @click="showCreateDialog = false" :disabled="empleadosStore.saving">
            Cancelar
          </v-btn>
          <v-btn
            color="primary"
            :loading="empleadosStore.saving"
            :disabled="!createFormValid"
            @click="handleCreateEmployee"
          >
            <v-icon start>mdi-account-plus</v-icon>
            Crear Empleado
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo: Editar Empleado -->
    <v-dialog v-model="showEditDialog" max-width="520" persistent>
      <v-card v-if="editingEmployee">
        <div class="pa-6 text-center">
          <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #FFA726, #FFB74D);">
            <v-icon color="white" size="28">mdi-account-edit</v-icon>
          </div>
          <h3 class="text-h6 mb-1">Editar Empleado</h3>
          <p class="text-caption text-medium-emphasis">
            {{ editingEmployee.email }}
          </p>
        </div>

        <v-card-text class="px-6 pb-2">
          <v-form v-model="editFormValid" @submit.prevent="handleEditEmployee">
            <v-text-field
              v-model="editForm.full_name"
              label="Nombre completo"
              :rules="nameRules"
              prepend-inner-icon="mdi-account-outline"
              class="mb-3"
            />

            <v-text-field
              v-model="editForm.phone"
              label="Teléfono"
              prepend-inner-icon="mdi-phone-outline"
              class="mb-3"
            />

            <v-select
              v-model="editForm.role"
              label="Rol"
              :items="roleOptions"
              prepend-inner-icon="mdi-shield-account"
              :disabled="isCurrentUser(editingEmployee.id)"
              :hint="isCurrentUser(editingEmployee.id) ? 'No podés cambiar tu propio rol' : ''"
              :persistent-hint="isCurrentUser(editingEmployee.id)"
            />
          </v-form>
        </v-card-text>

        <v-card-actions class="pa-6 pt-2">
          <v-spacer />
          <v-btn variant="text" @click="showEditDialog = false" :disabled="empleadosStore.saving">
            Cancelar
          </v-btn>
          <v-btn
            color="primary"
            :loading="empleadosStore.saving"
            :disabled="!editFormValid"
            @click="handleEditEmployee"
          >
            <v-icon start>mdi-content-save</v-icon>
            Guardar Cambios
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar -->
    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000" location="bottom right">
      {{ snackbarText }}
      <template #actions>
        <v-btn variant="text" @click="snackbar = false">Cerrar</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>
