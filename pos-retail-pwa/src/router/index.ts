import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/pos'
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresGuest: true }
    },
    {
      path: '/pos',
      name: 'pos',
      component: () => import('@/views/POSView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/productos',
      name: 'productos',
      component: () => import('@/views/ProductosView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/inventario',
      name: 'inventario',
      component: () => import('@/views/InventarioView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/historial',
      name: 'historial',
      component: () => import('@/views/HistorialView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/reportes',
      name: 'reportes',
      component: () => import('@/views/ReportesView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/descuentos',
      name: 'descuentos',
      component: () => import('@/views/DescuentosView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/empleados',
      name: 'empleados',
      component: () => import('@/views/EmpleadosView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/configuracion',
      name: 'configuracion',
      component: () => import('@/views/ConfiguracionView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('@/views/AuthCallbackView.vue'),
      meta: { isCallback: true }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      redirect: '/pos'
    }
  ]
})

// Navigation Guards
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  // Esperar a que se inicialice el store si es necesario
  if (authStore.loading && !authStore.isAuthenticated) {
    await authStore.initialize()
  }

  const isAuthenticated = authStore.isAuthenticated
  const isAdmin = authStore.isAdmin

  // Permitir acceso a la ruta de callback de auth sin autenticación
  if (to.meta.isCallback) {
    return next()
  }

  // Rutas que requieren autenticación
  if (to.meta.requiresAuth && !isAuthenticated) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  // Rutas solo para invitados (ej: login)
  if (to.meta.requiresGuest && isAuthenticated) {
    return next({ name: 'pos' })
  }

  // Rutas que requieren ser admin
  if (to.meta.requiresAdmin && !isAdmin) {
    return next({ name: 'pos' })
  }

  next()
})

export default router
