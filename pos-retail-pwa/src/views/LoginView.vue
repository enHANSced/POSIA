<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

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
    // Mostrar mensaje de confirmación
    tab.value = 'login'
    loginEmail.value = registerEmail.value
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
  <v-container fluid class="fill-height bg-background">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card class="elevation-12 rounded-lg">
          <!-- Header -->
          <v-card-title class="pa-6 bg-primary">
            <div class="d-flex align-center justify-center w-100">
              <v-icon size="40" class="mr-3">mdi-point-of-sale</v-icon>
              <div>
                <h1 class="text-h5 font-weight-bold">POS Retail</h1>
                <p class="text-caption ma-0 opacity-80">Sistema con Inteligencia Artificial</p>
              </div>
            </div>
          </v-card-title>

          <!-- Tabs -->
          <v-tabs v-model="tab" grow bg-color="primary-darken-1">
            <v-tab value="login">
              <v-icon start>mdi-login</v-icon>
              Iniciar Sesión
            </v-tab>
            <v-tab value="register">
              <v-icon start>mdi-account-plus</v-icon>
              Registrarse
            </v-tab>
          </v-tabs>

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
                    prepend-inner-icon="mdi-email"
                    variant="outlined"
                    class="mb-3"
                    autocomplete="email"
                  />

                  <v-text-field
                    v-model="loginPassword"
                    label="Contraseña"
                    :type="showPassword ? 'text' : 'password'"
                    :rules="passwordRules"
                    prepend-inner-icon="mdi-lock"
                    :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                    @click:append-inner="showPassword = !showPassword"
                    variant="outlined"
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
                    variant="tonal"
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
                    prepend-inner-icon="mdi-account"
                    variant="outlined"
                    class="mb-3"
                    autocomplete="name"
                  />

                  <v-text-field
                    v-model="registerEmail"
                    label="Correo electrónico"
                    type="email"
                    :rules="emailRules"
                    prepend-inner-icon="mdi-email"
                    variant="outlined"
                    class="mb-3"
                    autocomplete="email"
                  />

                  <v-text-field
                    v-model="registerPassword"
                    label="Contraseña"
                    :type="showPassword ? 'text' : 'password'"
                    :rules="passwordRules"
                    prepend-inner-icon="mdi-lock"
                    :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                    @click:append-inner="showPassword = !showPassword"
                    variant="outlined"
                    class="mb-3"
                    autocomplete="new-password"
                  />

                  <v-text-field
                    v-model="registerConfirmPassword"
                    label="Confirmar contraseña"
                    :type="showPassword ? 'text' : 'password'"
                    :rules="confirmPasswordRules"
                    prepend-inner-icon="mdi-lock-check"
                    variant="outlined"
                    class="mb-4"
                    autocomplete="new-password"
                  />

                  <v-alert
                    v-if="authStore.error"
                    type="error"
                    variant="tonal"
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
                  >
                    <v-icon start>mdi-account-plus</v-icon>
                    Crear Cuenta
                  </v-btn>
                </v-form>
              </v-card-text>
            </v-window-item>
          </v-window>

          <!-- Footer -->
          <v-card-text class="text-center text-caption pa-4 bg-grey-lighten-4">
            <v-icon size="small" class="mr-1">mdi-shield-check</v-icon>
            Conexión segura con Supabase
          </v-card-text>
        </v-card>

        <!-- Forgot Password Dialog -->
        <v-dialog v-model="showForgotPassword" max-width="400">
          <v-card>
            <v-card-title class="bg-primary pa-4">
              <v-icon start>mdi-lock-reset</v-icon>
              Restablecer Contraseña
            </v-card-title>
            <v-card-text class="pa-6">
              <p class="mb-4">Ingresa tu correo y te enviaremos instrucciones para restablecer tu contraseña.</p>
              <v-text-field
                v-model="forgotEmail"
                label="Correo electrónico"
                type="email"
                :rules="emailRules"
                prepend-inner-icon="mdi-email"
                variant="outlined"
              />
              <v-alert
                v-if="forgotMessage"
                :type="forgotMessage.includes('Error') ? 'error' : 'success'"
                variant="tonal"
                class="mt-4"
              >
                {{ forgotMessage }}
              </v-alert>
            </v-card-text>
            <v-card-actions class="pa-4 pt-0">
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
</style>
