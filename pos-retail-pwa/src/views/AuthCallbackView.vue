<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const status = ref<'loading' | 'success' | 'error'>('loading')
const message = ref('Verificando tu cuenta...')

onMounted(async () => {
  try {
    // Supabase detecta automáticamente los tokens en la URL
    // gracias a detectSessionInUrl: true en la configuración del cliente.
    // Pero necesitamos darle tiempo y luego verificar la sesión.
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      throw error
    }

    if (data.session) {
      // Sesión detectada — email verificado exitosamente
      status.value = 'success'
      message.value = '¡Cuenta verificada exitosamente!'

      // Inicializar el store de auth con la sesión activa
      await authStore.initialize()

      // Redirigir al POS después de 2 segundos
      setTimeout(() => {
        router.replace('/pos')
      }, 2000)
    } else {
      // No hay sesión aún — intentar extraer tokens del hash
      // Supabase usa el hash de la URL para pasar tokens de verificación
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const type = hashParams.get('type')

      if (accessToken && refreshToken) {
        // Establecer la sesión manualmente con los tokens
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (sessionError) throw sessionError

        if (sessionData.session) {
          status.value = 'success'
          message.value = type === 'recovery'
            ? '¡Verificación exitosa! Redirigiendo...'
            : '¡Cuenta verificada exitosamente!'

          await authStore.initialize()

          setTimeout(() => {
            router.replace(type === 'recovery' ? '/configuracion' : '/pos')
          }, 2000)
        }
      } else {
        // No hay tokens — posiblemente el link expiró o ya fue usado
        status.value = 'error'
        message.value = 'El enlace de verificación es inválido o ha expirado. Intenta registrarte de nuevo.'
      }
    }
  } catch (err) {
    console.error('Error en callback de autenticación:', err)
    status.value = 'error'
    message.value = err instanceof Error
      ? err.message
      : 'Error al verificar la cuenta. Intenta de nuevo.'
  }
})

function goToLogin() {
  router.replace('/login')
}
</script>

<template>
  <v-container fluid class="fill-height neo-bg">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card class="neo-animate-in pa-0 overflow-hidden">
          <div class="text-center pa-10">
            <!-- Loading -->
            <template v-if="status === 'loading'">
              <v-progress-circular
                indeterminate
                color="primary"
                size="64"
                width="4"
                class="mb-6"
              />
              <h2 class="text-h6 font-weight-bold mb-2">Procesando verificación</h2>
              <p class="text-body-2 text-medium-emphasis">{{ message }}</p>
            </template>

            <!-- Success -->
            <template v-if="status === 'success'">
              <div class="neo-circle mx-auto mb-6" style="background: linear-gradient(135deg, #4CAF50, #66BB6A);">
                <v-icon size="32" color="white">mdi-check-circle</v-icon>
              </div>
              <h2 class="text-h6 font-weight-bold mb-2">{{ message }}</h2>
              <p class="text-body-2 text-medium-emphasis mb-4">
                Serás redirigido automáticamente...
              </p>
              <v-progress-linear
                indeterminate
                color="success"
                rounded
                class="mx-auto"
                style="max-width: 200px;"
              />
            </template>

            <!-- Error -->
            <template v-if="status === 'error'">
              <div class="neo-circle mx-auto mb-6" style="background: linear-gradient(135deg, #EF5350, #F44336);">
                <v-icon size="32" color="white">mdi-alert-circle</v-icon>
              </div>
              <h2 class="text-h6 font-weight-bold mb-2">Error de verificación</h2>
              <p class="text-body-2 text-medium-emphasis mb-6">{{ message }}</p>
              <v-btn
                color="primary"
                size="large"
                class="neo-btn-primary"
                @click="goToLogin"
              >
                <v-icon start>mdi-arrow-left</v-icon>
                Volver al Login
              </v-btn>
            </template>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.fill-height {
  min-height: 100vh;
}

.neo-btn-primary {
  font-weight: 600 !important;
  letter-spacing: 0.5px !important;
}
</style>
