<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from 'vuetify'

const authStore = useAuthStore()
const theme = useTheme()

const saving = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

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
    theme.global.name.value = value ? 'dark' : 'light'
    localStorage.setItem('theme', value ? 'dark' : 'light')
  }
})

onMounted(() => {
  // Cargar datos del perfil
  if (authStore.profile) {
    profileForm.value.full_name = authStore.profile.full_name || ''
    profileForm.value.phone = authStore.profile.phone || ''
  }

  // Cargar tema guardado
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    theme.global.name.value = savedTheme
  }
})

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
    } else {
      message.value = result.error || 'Error al actualizar'
      messageType.value = 'error'
    }
  } catch (err) {
    message.value = 'Error inesperado'
    messageType.value = 'error'
  } finally {
    saving.value = false
    setTimeout(() => { message.value = '' }, 3000)
  }
}

async function changePassword() {
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    message.value = 'Las contraseñas no coinciden'
    messageType.value = 'error'
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
    passwordForm.value = { newPassword: '', confirmPassword: '' }
  } catch (err: any) {
    message.value = err.message || 'Error al cambiar contraseña'
    messageType.value = 'error'
  } finally {
    saving.value = false
    setTimeout(() => { message.value = '' }, 3000)
  }
}
</script>

<template>
  <v-container fluid class="pa-4">
    <v-row>
      <v-col cols="12" md="6">
        <!-- Perfil -->
        <v-card class="mb-4">
          <v-card-title>
            <v-icon start>mdi-account</v-icon>
            Mi Perfil
          </v-card-title>

          <v-card-text>
            <v-form @submit.prevent="saveProfile">
              <v-text-field
                v-model="profileForm.full_name"
                label="Nombre completo"
                prepend-inner-icon="mdi-account"
                variant="outlined"
                class="mb-3"
              />

              <v-text-field
                :model-value="authStore.user?.email"
                label="Correo electrónico"
                prepend-inner-icon="mdi-email"
                variant="outlined"
                disabled
                class="mb-3"
              />

              <v-text-field
                v-model="profileForm.phone"
                label="Teléfono"
                prepend-inner-icon="mdi-phone"
                variant="outlined"
                class="mb-3"
              />

              <v-chip class="mb-4" :color="authStore.isAdmin ? 'primary' : 'secondary'">
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
        <v-card>
          <v-card-title>
            <v-icon start>mdi-lock</v-icon>
            Cambiar Contraseña
          </v-card-title>

          <v-card-text>
            <v-form @submit.prevent="changePassword">
              <v-text-field
                v-model="passwordForm.newPassword"
                label="Nueva contraseña"
                :type="showPassword ? 'text' : 'password'"
                prepend-inner-icon="mdi-lock"
                :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="showPassword = !showPassword"
                variant="outlined"
                class="mb-3"
                :rules="[v => v.length >= 6 || 'Mínimo 6 caracteres']"
              />

              <v-text-field
                v-model="passwordForm.confirmPassword"
                label="Confirmar contraseña"
                :type="showPassword ? 'text' : 'password'"
                prepend-inner-icon="mdi-lock-check"
                variant="outlined"
                class="mb-4"
                :rules="[v => v === passwordForm.newPassword || 'No coinciden']"
              />

              <v-btn
                type="submit"
                color="warning"
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
        <v-card class="mb-4">
          <v-card-title>
            <v-icon start>mdi-cog</v-icon>
            Preferencias
          </v-card-title>

          <v-card-text>
            <v-switch
              v-model="isDarkMode"
              label="Modo oscuro"
              color="primary"
              inset
            >
              <template #prepend>
                <v-icon>{{ isDarkMode ? 'mdi-weather-night' : 'mdi-weather-sunny' }}</v-icon>
              </template>
            </v-switch>
          </v-card-text>
        </v-card>

        <!-- Info del sistema -->
        <v-card>
          <v-card-title>
            <v-icon start>mdi-information</v-icon>
            Información del Sistema
          </v-card-title>

          <v-card-text>
            <v-list density="compact">
              <v-list-item>
                <v-list-item-title>Versión</v-list-item-title>
                <template #append>
                  <span class="text-grey">1.0.0</span>
                </template>
              </v-list-item>

              <v-list-item>
                <v-list-item-title>Backend</v-list-item-title>
                <template #append>
                  <v-chip size="small" color="success">Supabase</v-chip>
                </template>
              </v-list-item>

              <v-list-item>
                <v-list-item-title>PWA</v-list-item-title>
                <template #append>
                  <v-chip size="small" color="primary">Activo</v-chip>
                </template>
              </v-list-item>

              <v-list-item>
                <v-list-item-title>IA</v-list-item-title>
                <template #append>
                  <v-chip size="small" color="info">Gemini</v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Mensaje de feedback -->
    <v-snackbar
      v-model="message"
      :color="messageType"
      :timeout="3000"
    >
      {{ message }}
    </v-snackbar>
  </v-container>
</template>
