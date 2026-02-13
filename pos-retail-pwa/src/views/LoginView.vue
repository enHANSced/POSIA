<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// Redirigir si el usuario ya está autenticado (ej: auto-confirmación)
watch(() => authStore.isAuthenticated, (isAuth) => {
  if (isAuth) {
    const redirect = (route.query.redirect as string) || '/pos'
    router.replace(redirect)
  }
}, { immediate: true })

const tab = ref<'login' | 'register'>('login')
const showPassword = ref(false)
const formValid = ref(false)

// Login form
const loginEmail = ref('')
const loginPassword = ref('')

// Register form
const registerEmail = ref('')
const registerPassword = ref('')
const registerConfirmPassword = ref('')
const registerName = ref('')

// Forgot password
const showForgotPassword = ref(false)
const forgotEmail = ref('')
const forgotMessage = ref('')
const showRegistrationSuccess = ref(false)

// Reglas de validación
const emailRules = [
  (v: string) => !!v || 'El correo es requerido',
  (v: string) => /.+@.+\..+/.test(v) || 'Correo inválido'
]

const passwordRules = [
  (v: string) => !!v || 'La contraseña es requerida',
  (v: string) => v.length >= 6 || 'Mínimo 6 caracteres'
]

const confirmPasswordRules = computed(() => [
  (v: string) => !!v || 'Confirma tu contraseña',
  (v: string) => v === registerPassword.value || 'Las contraseñas no coinciden'
])

const nameRules = [
  (v: string) => !!v || 'El nombre es requerido',
  (v: string) => v.length >= 2 || 'Mínimo 2 caracteres'
]

async function handleLogin() {
  if (!formValid.value) return

  const result = await authStore.login(loginEmail.value, loginPassword.value)
  
  if (result.success) {
    router.push('/pos')
  }
}

async function handleRegister() {
  if (!formValid.value) return

  const result = await authStore.register(
    registerEmail.value,
    registerPassword.value,
    registerName.value
  )

  if (result.success) {
    if (result.autoConfirmed) {
      // Usuario auto-confirmado — redirigir al POS
      const redirect = (route.query.redirect as string) || '/pos'
      router.replace(redirect)
    } else {
      // Necesita confirmación por email
      tab.value = 'login'
      loginEmail.value = registerEmail.value
      showRegistrationSuccess.value = true
    }
  }
}

async function handleForgotPassword() {
  if (!forgotEmail.value) return

  const result = await authStore.resetPassword(forgotEmail.value)
  forgotMessage.value = result.success 
    ? result.message || 'Correo enviado' 
    : result.error || 'Error'
  
  if (result.success) {
    setTimeout(() => {
      showForgotPassword.value = false
      forgotMessage.value = ''
    }, 3000)
  }
}
</script>

<template>
  <v-container fluid class="fill-height neo-bg">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card class="neo-animate-in pa-0 overflow-hidden">
          <!-- Header neomórfico -->
          <div class="neo-login-header text-center pa-8">
            <div class="neo-circle mx-auto mb-4" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF);">
              <v-icon size="28" color="white">mdi-point-of-sale</v-icon>
            </div>
            <h1 class="text-h5 font-weight-bold">POS Retail</h1>
            <p class="text-caption text-medium-emphasis mt-1">Sistema con Inteligencia Artificial</p>
          </div>

          <!-- Tabs neomórficas -->
          <div class="d-flex justify-center px-6 py-3">
            <div class="neo-tab-group d-flex">
              <button
                :class="['neo-tab', { 'neo-tab-active': tab === 'login' }]"
                @click="tab = 'login'"
              >
                <v-icon start size="18">mdi-login</v-icon>
                Iniciar Sesión
              </button>
              <button
                :class="['neo-tab', { 'neo-tab-active': tab === 'register' }]"
                @click="tab = 'register'"
              >
                <v-icon start size="18">mdi-account-plus</v-icon>
                Registrarse
              </button>
            </div>
          </div>

          <v-window v-model="tab">
            <!-- Login Tab -->
            <v-window-item value="login">
              <v-card-text class="pa-6">
                <v-form v-model="formValid" @submit.prevent="handleLogin">
                  <v-text-field
                    v-model="loginEmail"
                    label="Correo electrónico"
                    type="email"
                    :rules="emailRules"
                    prepend-inner-icon="mdi-email-outline"
                    class="mb-3"
                    autocomplete="email"
                  />

                  <v-text-field
                    v-model="loginPassword"
                    label="Contraseña"
                    :type="showPassword ? 'text' : 'password'"
                    :rules="passwordRules"
                    prepend-inner-icon="mdi-lock-outline"
                    :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                    @click:append-inner="showPassword = !showPassword"
                    class="mb-2"
                    autocomplete="current-password"
                  />

                  <div class="d-flex justify-end mb-4">
                    <v-btn
                      variant="text"
                      size="small"
                      color="primary"
                      @click="showForgotPassword = true"
                    >
                      ¿Olvidaste tu contraseña?
                    </v-btn>
                  </div>

                  <v-alert
                    v-if="authStore.error"
                    type="error"
                    class="mb-4"
                    closable
                  >
                    {{ authStore.error }}
                  </v-alert>

                  <v-btn
                    type="submit"
                    color="primary"
                    size="large"
                    block
                    :loading="authStore.loading"
                    :disabled="!formValid"
                    class="neo-btn-primary"
                  >
                    <v-icon start>mdi-login</v-icon>
                    Iniciar Sesión
                  </v-btn>
                </v-form>
              </v-card-text>
            </v-window-item>

            <!-- Register Tab -->
            <v-window-item value="register">
              <v-card-text class="pa-6">
                <v-form v-model="formValid" @submit.prevent="handleRegister">
                  <v-text-field
                    v-model="registerName"
                    label="Nombre completo"
                    :rules="nameRules"
                    prepend-inner-icon="mdi-account-outline"
                    class="mb-3"
                    autocomplete="name"
                  />

                  <v-text-field
                    v-model="registerEmail"
                    label="Correo electrónico"
                    type="email"
                    :rules="emailRules"
                    prepend-inner-icon="mdi-email-outline"
                    class="mb-3"
                    autocomplete="email"
                  />

                  <v-text-field
                    v-model="registerPassword"
                    label="Contraseña"
                    :type="showPassword ? 'text' : 'password'"
                    :rules="passwordRules"
                    prepend-inner-icon="mdi-lock-outline"
                    :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                    @click:append-inner="showPassword = !showPassword"
                    class="mb-3"
                    autocomplete="new-password"
                  />

                  <v-text-field
                    v-model="registerConfirmPassword"
                    label="Confirmar contraseña"
                    :type="showPassword ? 'text' : 'password'"
                    :rules="confirmPasswordRules"
                    prepend-inner-icon="mdi-lock-check-outline"
                    class="mb-4"
                    autocomplete="new-password"
                  />

                  <v-alert
                    v-if="authStore.error"
                    type="error"
                    class="mb-4"
                    closable
                  >
                    {{ authStore.error }}
                  </v-alert>

                  <v-btn
                    type="submit"
                    color="primary"
                    size="large"
                    block
                    :loading="authStore.loading"
                    :disabled="!formValid"
                    class="neo-btn-primary"
                  >
                    <v-icon start>mdi-account-plus</v-icon>
                    Crear Cuenta
                  </v-btn>
                </v-form>
              </v-card-text>
            </v-window-item>
          </v-window>

          <!-- Mensaje de registro exitoso -->
          <v-alert
            v-if="showRegistrationSuccess"
            type="info"
            variant="tonal"
            class="mx-4 mb-3"
            closable
            @click:close="showRegistrationSuccess = false"
          >
            <div class="text-subtitle-2 font-weight-bold">¡Registro exitoso!</div>
            <div class="text-caption">
              Revisa tu correo electrónico y haz clic en el enlace de verificación.
              <strong>El servidor de desarrollo debe estar corriendo</strong> para completar la verificación.
            </div>
          </v-alert>

          <!-- Footer -->
          <div class="text-center text-caption pa-4 neo-card-pressed mx-4 mb-4">
            <v-icon size="small" class="mr-1" color="success">mdi-shield-check</v-icon>
            Conexión segura con Supabase
          </div>
        </v-card>

        <!-- Forgot Password Dialog -->
        <v-dialog v-model="showForgotPassword" max-width="400">
          <v-card>
            <div class="pa-6 text-center">
              <div class="neo-circle mx-auto mb-3" style="background: linear-gradient(135deg, #FFA726, #FFB74D);">
                <v-icon color="white" size="28">mdi-lock-reset</v-icon>
              </div>
              <h3 class="text-h6 mb-1">Restablecer Contraseña</h3>
              <p class="text-caption text-medium-emphasis mb-4">
                Ingresa tu correo y te enviaremos instrucciones.
              </p>
            </div>
            <v-card-text class="px-6 pb-2">
              <v-text-field
                v-model="forgotEmail"
                label="Correo electrónico"
                type="email"
                :rules="emailRules"
                prepend-inner-icon="mdi-email-outline"
              />
              <v-alert
                v-if="forgotMessage"
                :type="forgotMessage.includes('Error') ? 'error' : 'success'"
                class="mt-3"
              >
                {{ forgotMessage }}
              </v-alert>
            </v-card-text>
            <v-card-actions class="pa-6 pt-2">
              <v-spacer />
              <v-btn variant="text" @click="showForgotPassword = false">Cancelar</v-btn>
              <v-btn
                color="primary"
                :loading="authStore.loading"
                @click="handleForgotPassword"
              >
                Enviar
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.fill-height {
  min-height: 100vh;
}

.neo-login-header {
  background-color: var(--neo-bg);
}

.neo-tab-group {
  background-color: var(--neo-bg-alt);
  box-shadow: var(--neo-pressed-sm);
  border-radius: var(--neo-radius-sm);
  padding: 4px;
  gap: 4px;
}

.neo-tab {
  padding: 8px 20px;
  border-radius: var(--neo-radius-xs);
  font-size: 13px;
  font-weight: 500;
  color: var(--neo-shadow-dark-strong);
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: var(--neo-transition);
}

.neo-tab:hover {
  color: rgb(var(--v-theme-primary));
}

.neo-tab-active {
  box-shadow: var(--neo-raised-sm);
  background-color: var(--neo-bg) !important;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.neo-btn-primary {
  font-weight: 600 !important;
  letter-spacing: 0.5px !important;
}
</style>
