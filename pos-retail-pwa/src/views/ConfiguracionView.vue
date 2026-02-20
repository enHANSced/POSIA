<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from 'vuetify'
import {
  isPushSupported,
  getExistingPushSubscription,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications
} from '@/services/push'

const authStore = useAuthStore()
const theme = useTheme()

const saving = ref(false)
const showMessage = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')
const pushSupported = ref(false)
const pushEnabled = ref(false)
const pushLoading = ref(false)

// Formulario de perfil
const profileForm = ref({
  full_name: '',
  phone: ''
})

// Formulario de cambio de contraseña
const passwordForm = ref({
  newPassword: '',
  confirmPassword: ''
})
const showPassword = ref(false)

// Tema actual
const isDarkMode = computed({
  get: () => theme.global.current.value.dark,
  set: (value) => {
    const themeName = value ? 'dark' : 'light'
    theme.change(themeName)
    localStorage.setItem('theme', themeName)
  }
})

onMounted(async () => {
  // Cargar datos del perfil
  if (authStore.profile) {
    profileForm.value.full_name = authStore.profile.full_name || ''
    profileForm.value.phone = authStore.profile.phone || ''
  }

  // Cargar tema guardado
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    theme.change(savedTheme)
  }

  await refreshPushState()
})

async function refreshPushState() {
  pushSupported.value = isPushSupported()

  if (!pushSupported.value) {
    pushEnabled.value = false
    return
  }

  const subscription = await getExistingPushSubscription()
  pushEnabled.value = !!subscription
}

async function togglePushNotifications() {
  if (!pushSupported.value || pushLoading.value) return

  pushLoading.value = true

  try {
    if (pushEnabled.value) {
      await unsubscribeFromPushNotifications()
      message.value = 'Notificaciones desactivadas'
      messageType.value = 'success'
    } else {
      await subscribeToPushNotifications()
      message.value = 'Notificaciones activadas correctamente'
      messageType.value = 'success'
    }

    showMessage.value = true
    await refreshPushState()
  } catch (err: any) {
    message.value = err?.message || 'No se pudieron actualizar las notificaciones'
    messageType.value = 'error'
    showMessage.value = true
  } finally {
    pushLoading.value = false
  }
}

async function saveProfile() {
  saving.value = true
  message.value = ''

  try {
    const result = await authStore.updateProfile({
      full_name: profileForm.value.full_name,
      phone: profileForm.value.phone
    })

    if (result.success) {
      message.value = 'Perfil actualizado correctamente'
      messageType.value = 'success'
      showMessage.value = true
    } else {
      message.value = result.error || 'Error al actualizar'
      messageType.value = 'error'
      showMessage.value = true
    }
  } catch (err) {
    message.value = 'Error inesperado'
    messageType.value = 'error'
    showMessage.value = true
  } finally {
    saving.value = false
    setTimeout(() => {
      showMessage.value = false
      message.value = ''
    }, 3000)
  }
}

async function changePassword() {
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    message.value = 'Las contraseñas no coinciden'
    messageType.value = 'error'
    showMessage.value = true
    return
  }

  saving.value = true
  message.value = ''

  try {
    const { error } = await import('@/services/supabase').then(m => 
      m.supabase.auth.updateUser({ password: passwordForm.value.newPassword })
    )

    if (error) throw error

    message.value = 'Contraseña actualizada correctamente'
    messageType.value = 'success'
    showMessage.value = true
    passwordForm.value = { newPassword: '', confirmPassword: '' }
  } catch (err: any) {
    message.value = err.message || 'Error al cambiar contraseña'
    messageType.value = 'error'
    showMessage.value = true
  } finally {
    saving.value = false
    setTimeout(() => {
      showMessage.value = false
      message.value = ''
    }, 3000)
  }
}
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <v-row>
      <v-col cols="12" md="6">
        <!-- Perfil -->
        <v-card class="mb-5 neo-animate-in">
          <v-card-text class="pa-5">
            <div class="d-flex align-center mb-5">
              <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
                <v-icon color="white" size="20">mdi-account</v-icon>
              </div>
              <h3 class="text-subtitle-1 font-weight-bold">Mi Perfil</h3>
            </div>

            <v-form @submit.prevent="saveProfile">
              <v-text-field
                v-model="profileForm.full_name"
                label="Nombre completo"
                prepend-inner-icon="mdi-account-outline"
                class="mb-3"
              />

              <v-text-field
                :model-value="authStore.user?.email"
                label="Correo electrónico"
                prepend-inner-icon="mdi-email-outline"
                disabled
                class="mb-3"
              />

              <v-text-field
                v-model="profileForm.phone"
                label="Teléfono"
                prepend-inner-icon="mdi-phone-outline"
                class="mb-4"
              />

              <v-chip class="mb-5" :color="authStore.isAdmin ? 'primary' : 'secondary'" variant="tonal">
                <v-icon start>mdi-shield-account</v-icon>
                Rol: {{ authStore.userRole }}
              </v-chip>

              <v-btn
                type="submit"
                color="primary"
                :loading="saving"
                block
              >
                <v-icon start>mdi-content-save</v-icon>
                Guardar Cambios
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>

        <!-- Cambiar contraseña -->
        <v-card class="neo-animate-in">
          <v-card-text class="pa-5">
            <div class="d-flex align-center mb-5">
              <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #FFA726, #FFB74D);">
                <v-icon color="white" size="20">mdi-lock</v-icon>
              </div>
              <h3 class="text-subtitle-1 font-weight-bold">Cambiar Contraseña</h3>
            </div>

            <v-form @submit.prevent="changePassword">
              <v-text-field
                v-model="passwordForm.newPassword"
                label="Nueva contraseña"
                :type="showPassword ? 'text' : 'password'"
                prepend-inner-icon="mdi-lock-outline"
                :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="showPassword = !showPassword"
                class="mb-3"
                :rules="[v => v.length >= 6 || 'Mínimo 6 caracteres']"
              />

              <v-text-field
                v-model="passwordForm.confirmPassword"
                label="Confirmar contraseña"
                :type="showPassword ? 'text' : 'password'"
                prepend-inner-icon="mdi-lock-check-outline"
                class="mb-4"
                :rules="[v => v === passwordForm.newPassword || 'No coinciden']"
              />

              <v-btn
                type="submit"
                color="primary"
                :loading="saving"
                :disabled="!passwordForm.newPassword || !passwordForm.confirmPassword"
                block
              >
                <v-icon start>mdi-lock-reset</v-icon>
                Cambiar Contraseña
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <!-- Preferencias -->
        <v-card class="mb-5 neo-animate-in">
          <v-card-text class="pa-5">
            <div class="d-flex align-center mb-5">
              <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #AB47BC, #CE93D8);">
                <v-icon color="white" size="20">mdi-cog</v-icon>
              </div>
              <h3 class="text-subtitle-1 font-weight-bold">Preferencias</h3>
            </div>

            <div class="neo-card-pressed pa-4 d-flex align-center justify-space-between">
              <div class="d-flex align-center">
                <v-icon class="mr-3" size="22">
                  {{ isDarkMode ? 'mdi-weather-night' : 'mdi-weather-sunny' }}
                </v-icon>
                <span class="text-body-2 font-weight-medium">Modo oscuro</span>
              </div>
              <v-switch
                v-model="isDarkMode"
                color="primary"
                inset
                hide-details
              />
            </div>

            <div class="neo-card-pressed pa-4 d-flex align-center justify-space-between mt-4">
              <div class="d-flex align-center">
                <v-icon class="mr-3" size="22">mdi-bell-outline</v-icon>
                <div>
                  <div class="text-body-2 font-weight-medium">Notificaciones push</div>
                  <div class="text-caption text-medium-emphasis">
                    {{
                      pushSupported
                        ? (pushEnabled ? 'Activadas en este dispositivo' : 'Desactivadas en este dispositivo')
                        : 'No soportadas en este navegador'
                    }}
                  </div>
                </div>
              </div>

              <v-btn
                :color="pushEnabled ? 'warning' : 'primary'"
                :variant="pushEnabled ? 'outlined' : 'flat'"
                :loading="pushLoading"
                :disabled="!pushSupported"
                size="small"
                @click="togglePushNotifications"
              >
                {{ pushEnabled ? 'Desactivar' : 'Activar' }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Info del sistema -->
        <v-card class="neo-animate-in">
          <v-card-text class="pa-5">
            <div class="d-flex align-center mb-5">
              <div class="neo-circle-sm mr-3" style="background: linear-gradient(135deg, #42A5F5, #64B5F6);">
                <v-icon color="white" size="20">mdi-information</v-icon>
              </div>
              <h3 class="text-subtitle-1 font-weight-bold">Información del Sistema</h3>
            </div>

            <v-list density="compact">
              <v-list-item rounded="lg" class="mb-1">
                <v-list-item-title class="text-body-2">Versión</v-list-item-title>
                <template #append>
                  <span class="text-caption text-medium-emphasis">1.0.0</span>
                </template>
              </v-list-item>

              <v-list-item rounded="lg" class="mb-1">
                <v-list-item-title class="text-body-2">Backend</v-list-item-title>
                <template #append>
                  <v-chip size="small" color="success" variant="tonal">Supabase</v-chip>
                </template>
              </v-list-item>

              <v-list-item rounded="lg" class="mb-1">
                <v-list-item-title class="text-body-2">PWA</v-list-item-title>
                <template #append>
                  <v-chip size="small" color="primary" variant="tonal">Activo</v-chip>
                </template>
              </v-list-item>

              <v-list-item rounded="lg" class="mb-1">
                <v-list-item-title class="text-body-2">IA</v-list-item-title>
                <template #append>
                  <v-chip size="small" color="info" variant="tonal">Gemini</v-chip>
                </template>
              </v-list-item>

              <v-list-item rounded="lg">
                <v-list-item-title class="text-body-2">Moneda</v-list-item-title>
                <template #append>
                  <v-chip size="small" variant="tonal">HNL (L)</v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Mensaje de feedback -->
    <v-snackbar
      v-model="showMessage"
      :color="messageType"
      :timeout="3000"
      location="bottom right"
    >
      {{ message }}
    </v-snackbar>
  </v-container>
</template>
