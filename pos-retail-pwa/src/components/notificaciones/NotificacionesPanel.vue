<script setup lang="ts">
import { computed } from 'vue'
import { useNotificacionesStore, type AppNotification } from '@/stores/notificaciones'

const model = defineModel<boolean>({ default: false })

const notificacionesStore = useNotificacionesStore()

const canClear = computed(() => notificacionesStore.notifications.length > 0)

function getIcon(notification: AppNotification): string {
  if (notification.type === 'inventario') return 'mdi-alert'
  if (notification.type === 'venta') return 'mdi-cash-register'
  return 'mdi-bell-outline'
}

function getColor(notification: AppNotification): string {
  if (notification.type === 'inventario') return 'warning'
  if (notification.type === 'venta') return 'success'
  return 'primary'
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return 'Hace un momento'
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `Hace ${diffHours} h`

  return date.toLocaleDateString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function openSettings() {
  model.value = false
}
</script>

<template>
  <v-navigation-drawer
    v-model="model"
    location="right"
    temporary
    width="380"
  >
    <div class="d-flex align-center justify-space-between pa-4 border-b">
      <div>
        <h3 class="text-subtitle-1 font-weight-bold">Notificaciones</h3>
        <p class="text-caption text-medium-emphasis mb-0">
          {{ notificacionesStore.unreadCount }} sin leer
        </p>
      </div>
      <v-btn icon variant="text" @click="model = false">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </div>

    <div class="d-flex ga-2 px-4 py-3 border-b">
      <v-btn
        size="small"
        variant="outlined"
        :disabled="!canClear"
        @click="notificacionesStore.markAllAsRead"
      >
        Marcar todo leído
      </v-btn>
      <v-btn
        size="small"
        variant="text"
        color="error"
        :disabled="!canClear"
        @click="notificacionesStore.clearAll"
      >
        Limpiar
      </v-btn>
    </div>

    <div v-if="notificacionesStore.loading" class="pa-6 text-center">
      <v-progress-circular indeterminate color="primary" />
      <p class="text-caption text-medium-emphasis mt-3">Cargando notificaciones...</p>
    </div>

    <v-list v-else lines="two" class="pa-0">
      <v-list-item
        v-for="notification in notificacionesStore.notifications"
        :key="notification.id"
        class="py-2"
        @click="notificacionesStore.markAsRead(notification.id)"
      >
        <template #prepend>
          <v-avatar size="36" :color="`${getColor(notification)}-lighten-5`">
            <v-icon :color="getColor(notification)" size="18">{{ getIcon(notification) }}</v-icon>
          </v-avatar>
        </template>

        <v-list-item-title class="text-body-2 font-weight-medium d-flex align-center ga-2">
          {{ notification.title }}
          <v-badge
            v-if="!notification.read"
            inline
            dot
            color="primary"
          />
        </v-list-item-title>

        <v-list-item-subtitle class="text-body-2">
          {{ notification.message }}
        </v-list-item-subtitle>

        <template #append>
          <span class="text-caption text-medium-emphasis">{{ formatTime(notification.createdAt) }}</span>
        </template>
      </v-list-item>

      <v-list-item v-if="notificacionesStore.notifications.length === 0" class="py-10 text-center">
        <template #prepend>
          <v-icon color="medium-emphasis">mdi-bell-off-outline</v-icon>
        </template>
        <v-list-item-title>No tienes notificaciones</v-list-item-title>
        <v-list-item-subtitle>Las alertas de ventas e inventario aparecerán aquí.</v-list-item-subtitle>
      </v-list-item>
    </v-list>

    <template #append>
      <div class="pa-4 border-t">
        <v-btn
          block
          variant="tonal"
          prepend-icon="mdi-cog-outline"
          to="/configuracion"
          @click="openSettings"
        >
          Ajustes de notificaciones
        </v-btn>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
.border-b {
  border-bottom: 1px solid var(--color-border);
}

.border-t {
  border-top: 1px solid var(--color-border);
}
</style>