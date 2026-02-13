<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

// Inicializar autenticación al montar la app
onMounted(async () => {
  await authStore.initialize()
})

// Estado del drawer
const drawer = ref(true)
const rail = ref(false)

// Items de navegación
const navItems = [
  { title: 'Punto de Venta', icon: 'mdi-point-of-sale', to: '/pos' },
  { title: 'Productos', icon: 'mdi-package-variant-closed', to: '/productos', admin: true },
  { title: 'Historial', icon: 'mdi-history', to: '/historial' },
  { title: 'Reportes', icon: 'mdi-chart-bar', to: '/reportes', admin: true },
  { title: 'Configuración', icon: 'mdi-cog', to: '/configuracion' }
]

// Filtrar items según rol
const visibleNavItems = computed(() => {
  return navItems.filter(item => !item.admin || authStore.isAdmin)
})

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<template>
  <v-app>
    <!-- Loading inicial -->
    <template v-if="authStore.loading && !authStore.isAuthenticated">
      <v-container class="fill-height">
        <v-row justify="center" align="center">
          <v-col cols="auto">
            <v-progress-circular indeterminate color="primary" size="64" />
            <p class="mt-4 text-center text-grey">Cargando...</p>
          </v-col>
        </v-row>
      </v-container>
    </template>

    <!-- Contenido cuando está autenticado -->
    <template v-else-if="authStore.isAuthenticated">
      <!-- App Bar -->
      <v-app-bar color="primary" prominent>
        <v-app-bar-nav-icon @click="rail = !rail" />

        <v-toolbar-title>
          <v-icon class="mr-2">mdi-point-of-sale</v-icon>
          POS Retail IA
        </v-toolbar-title>

        <v-spacer />

        <!-- Badge de notificaciones -->
        <v-btn icon>
          <v-badge color="error" content="3" overlap>
            <v-icon>mdi-bell</v-icon>
          </v-badge>
        </v-btn>

        <!-- Menú de usuario -->
        <v-menu>
          <template #activator="{ props }">
            <v-btn v-bind="props" icon>
              <v-avatar color="secondary" size="32">
                <span class="text-h6">{{ authStore.userName.charAt(0).toUpperCase() }}</span>
              </v-avatar>
            </v-btn>
          </template>
          <v-list density="compact" min-width="200">
            <v-list-item>
              <v-list-item-title class="font-weight-bold">
                {{ authStore.userName }}
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ authStore.userRole }}
              </v-list-item-subtitle>
            </v-list-item>
            <v-divider />
            <v-list-item to="/configuracion" prepend-icon="mdi-account-cog">
              <v-list-item-title>Mi Perfil</v-list-item-title>
            </v-list-item>
            <v-list-item @click="handleLogout" prepend-icon="mdi-logout" class="text-error">
              <v-list-item-title>Cerrar Sesión</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </v-app-bar>

      <!-- Navigation Drawer -->
      <v-navigation-drawer
        v-model="drawer"
        :rail="rail"
        permanent
        @click="rail = false"
      >
        <v-list nav density="compact">
          <v-list-item
            v-for="item in visibleNavItems"
            :key="item.to"
            :to="item.to"
            :prepend-icon="item.icon"
            :title="item.title"
            :active="route.path === item.to"
            color="primary"
          />
        </v-list>

        <template #append>
          <v-divider />
          <v-list-item v-if="!rail" class="pa-4">
            <v-list-item-subtitle class="text-caption">
              <v-icon size="small" class="mr-1">mdi-robot</v-icon>
              Asistente IA disponible
            </v-list-item-subtitle>
          </v-list-item>
        </template>
      </v-navigation-drawer>

      <!-- Main Content -->
      <v-main>
        <router-view />
      </v-main>
    </template>

    <!-- Login/Guest content -->
    <template v-else>
      <v-main>
        <router-view />
      </v-main>
    </template>
  </v-app>
</template>
