<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useAuthStore } from '@/stores/auth'
import AsistenteIADrawer from '@/components/ia/AsistenteIADrawer.vue'
import NotificacionesPanel from '@/components/notificaciones/NotificacionesPanel.vue'
import { useNotificacionesStore } from '@/stores/notificaciones'

const authStore = useAuthStore()
const notificacionesStore = useNotificacionesStore()
const router = useRouter()
const route = useRoute()
const { mobile } = useDisplay()

// Inicializar autenticación al montar la app
onMounted(async () => {
  await authStore.initialize()

  if (authStore.isAuthenticated) {
    await notificacionesStore.initialize()
  }
})

watch(
  () => authStore.isAuthenticated,
  async (isAuthenticated) => {
    if (isAuthenticated) {
      await notificacionesStore.initialize()
      return
    }

    notificacionesStore.reset()
  }
)

onBeforeUnmount(() => {
  notificacionesStore.stopRealtime()
})

// Estado del drawer — cerrado por defecto en móvil
const drawer = ref(!mobile.value)
const rail = ref(false)
const iaDrawer = ref(false)
const notificationsDrawer = ref(false)

const canUseIA = computed(() => authStore.isAdmin)

// Items de navegación
const navItems = [
  { title: 'Punto de Venta', icon: 'mdi-point-of-sale', to: '/pos' },
  { title: 'Productos', icon: 'mdi-package-variant-closed', to: '/productos', admin: true },
  { title: 'Inventario', icon: 'mdi-warehouse', to: '/inventario', admin: true },
  { title: 'Historial', icon: 'mdi-history', to: '/historial' },
  { title: 'Reportes', icon: 'mdi-chart-bar', to: '/reportes', admin: true },
  { title: 'Empleados', icon: 'mdi-account-group', to: '/empleados', admin: true },
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
      <v-container class="fill-height neo-bg">
        <v-row justify="center" align="center">
          <v-col cols="auto" class="text-center">
            <div class="neo-circle mx-auto mb-4">
              <v-progress-circular indeterminate color="primary" size="32" width="3" />
            </div>
            <p class="text-body-2 text-medium-emphasis">Cargando...</p>
          </v-col>
        </v-row>
      </v-container>
    </template>

    <!-- Contenido cuando está autenticado -->
    <template v-else-if="authStore.isAuthenticated">
      <!-- App Bar Neomórfica -->
      <v-app-bar flat class="neo-appbar px-2">
        <v-btn icon variant="text" @click="mobile ? (drawer = !drawer) : (rail = !rail)" class="neo-btn-icon">
          <v-icon>{{ (mobile ? !drawer : !rail) ? 'mdi-menu' : 'mdi-menu-open' }}</v-icon>
        </v-btn>

        <v-toolbar-title>
          <div class="d-flex align-center">
            <div class="neo-circle-sm mr-2" style="background: linear-gradient(135deg, #4A7BF7, #6B93FF); flex-shrink: 0;">
              <v-icon color="white" size="20">mdi-point-of-sale</v-icon>
            </div>
            <span class="text-h6 font-weight-bold d-none d-sm-inline">POS Retail IA</span>
          </div>
        </v-toolbar-title>

        <v-spacer />

        <!-- Badge de notificaciones -->
        <v-btn icon variant="text" class="neo-btn-icon mr-2" @click="notificationsDrawer = true">
          <v-badge
            color="error"
            :content="notificacionesStore.unreadCount > 99 ? '99+' : String(notificacionesStore.unreadCount)"
            :model-value="notificacionesStore.unreadCount > 0"
            overlap
          >
            <v-icon>mdi-bell-outline</v-icon>
          </v-badge>
        </v-btn>

        <v-btn v-if="canUseIA" icon variant="text" class="neo-btn-icon mr-2" @click="iaDrawer = true">
          <v-icon>mdi-robot-happy-outline</v-icon>
        </v-btn>

        <!-- Menú de usuario -->
        <v-menu>
          <template #activator="{ props }">
            <v-btn v-bind="props" icon variant="text" class="neo-btn-icon">
              <v-avatar size="34" class="neo-avatar">
                <span class="text-body-1 font-weight-bold text-primary">
                  {{ authStore.userName.charAt(0).toUpperCase() }}
                </span>
              </v-avatar>
            </v-btn>
          </template>
          <v-list density="compact" min-width="220" class="pa-2">
            <v-list-item class="mb-1">
              <v-list-item-title class="font-weight-bold">
                {{ authStore.userName }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ authStore.userRole }}
              </v-list-item-subtitle>
            </v-list-item>
            <v-divider class="my-1" />
            <v-list-item to="/configuracion" prepend-icon="mdi-account-cog" rounded="lg">
              <v-list-item-title>Mi Perfil</v-list-item-title>
            </v-list-item>
            <v-list-item @click="handleLogout" prepend-icon="mdi-logout" class="text-error" rounded="lg">
              <v-list-item-title>Cerrar Sesión</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </v-app-bar>

      <!-- Navigation Drawer Neomórfico -->
      <v-navigation-drawer
        v-model="drawer"
        :rail="!mobile && rail"
        :permanent="!mobile"
        :temporary="mobile"
        @click="!mobile && rail ? (rail = false) : null"
      >
        <v-list nav density="compact" class="pa-3">
          <v-list-item
            v-for="item in visibleNavItems"
            :key="item.to"
            :to="item.to"
            :prepend-icon="item.icon"
            :title="item.title"
            :active="route.path === item.to"
            color="primary"
            rounded="lg"
            class="mb-1"
          />
        </v-list>

        <template #append>
          <div class="pa-3">
            <div v-if="canUseIA && !rail" class="neo-card-pressed pa-3 text-center">
              <v-icon size="20" color="primary" class="mr-1">mdi-robot-happy</v-icon>
              <span class="text-caption text-medium-emphasis">Asistente IA</span>
            </div>
          </div>
        </template>
      </v-navigation-drawer>

      <!-- Main Content -->
      <v-main>
        <router-view />
      </v-main>

      <AsistenteIADrawer v-if="canUseIA" v-model="iaDrawer" />
      <NotificacionesPanel v-model="notificationsDrawer" />
    </template>

    <!-- Login/Guest content -->
    <template v-else>
      <v-main>
        <router-view />
      </v-main>
    </template>
  </v-app>
</template>

<style scoped>
.neo-appbar {
  background-color: var(--neo-bg) !important;
  border-bottom: none !important;
}

.neo-btn-icon {
  box-shadow: var(--neo-raised-sm) !important;
  background-color: var(--neo-bg) !important;
}

.neo-btn-icon:active {
  box-shadow: var(--neo-pressed-sm) !important;
}

.neo-avatar {
  box-shadow: var(--neo-raised-sm) !important;
  background-color: var(--neo-bg-alt) !important;
}
</style>
