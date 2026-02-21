import { defineStore } from 'pinia'
import { shallowRef, computed, triggerRef } from 'vue'
import { fetchLowStockProducts, fetchTodaySales, subscribeToProducts, subscribeToSales } from '@/services/database'
import type { LowStockProduct, Product, Sale } from '@/types/supabase'
import { supabase } from '@/services/supabase'
import { showLocalNotification } from '@/services/push'

type NotificationType = 'venta' | 'inventario' | 'sistema'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt: string
  read: boolean
}

export interface NotificationPreferences {
  sales: boolean
  lowStock: boolean
}

const STORAGE_KEY = 'posia.notifications.v1'
const PREFERENCES_KEY = 'posia.notifications.preferences.v1'
const MAX_NOTIFICATIONS = 50
const POLLING_INTERVAL_MS = 15000

export const useNotificacionesStore = defineStore('notificaciones', () => {
  const notifications = shallowRef<AppNotification[]>([])
  const preferences = shallowRef<NotificationPreferences>({
    sales: true,
    lowStock: true
  })
  const loading = shallowRef(false)
  const initialized = shallowRef(false)

  let salesChannel: ReturnType<typeof subscribeToSales> | null = null
  let productsChannel: ReturnType<typeof subscribeToProducts> | null = null
  let pollingTimer: ReturnType<typeof setInterval> | null = null

  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as AppNotification[]
      notifications.value = Array.isArray(parsed) ? parsed.slice(0, MAX_NOTIFICATIONS) : []
    } catch (error) {
      console.error('Error leyendo notificaciones guardadas:', error)
      notifications.value = []
    }
  }

  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.value))
  }

  function loadPreferences() {
    try {
      const raw = localStorage.getItem(PREFERENCES_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as Partial<NotificationPreferences>
      preferences.value = {
        sales: parsed.sales ?? true,
        lowStock: parsed.lowStock ?? true
      }
      triggerRef(preferences)
    } catch (error) {
      console.error('Error leyendo preferencias de notificaciones:', error)
      preferences.value = { sales: true, lowStock: true }
      triggerRef(preferences)
    }
  }

  function savePreferences() {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences.value))
  }

  function setPreference(key: keyof NotificationPreferences, value: boolean) {
    preferences.value[key] = value
    triggerRef(preferences)
    savePreferences()
    void savePreferencesToDatabase()
  }

  async function loadPreferencesFromDatabase() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('sales_push, low_stock_push')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Error cargando preferencias remotas:', error)
      return
    }

    if (!data) {
      await savePreferencesToDatabase()
      return
    }

    preferences.value = {
      sales: data.sales_push,
      lowStock: data.low_stock_push
    }
    triggerRef(preferences)
    savePreferences()
  }

  async function savePreferencesToDatabase() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) return

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: user.id,
          sales_push: preferences.value.sales,
          low_stock_push: preferences.value.lowStock,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('Error guardando preferencias remotas:', error)
    }
  }

  function addOrUpdateNotification(
    notification: AppNotification,
    options: { preserveRead?: boolean; refreshTimestamp?: boolean } = {}
  ): boolean {
    const { preserveRead = false, refreshTimestamp = true } = options
    const index = notifications.value.findIndex(n => n.id === notification.id)

    if (index !== -1) {
      const existing = notifications.value[index]
      if (!existing) return false

      notifications.value[index] = {
        ...existing,
        ...notification,
        read: preserveRead ? existing.read : false,
        createdAt: refreshTimestamp ? new Date().toISOString() : existing.createdAt
      }
    } else {
      notifications.value.unshift(notification)
    }

    notifications.value = notifications.value
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_NOTIFICATIONS)

    triggerRef(notifications)
    saveToStorage()
    return index === -1
  }

  function markAsRead(id: string) {
    const notification = notifications.value.find(n => n.id === id)
    if (!notification || notification.read) return

    notification.read = true
    triggerRef(notifications)
    saveToStorage()
  }

  function markAllAsRead() {
    notifications.value.forEach((notification) => {
      notification.read = true
    })
    triggerRef(notifications)
    saveToStorage()
  }

  function removeNotification(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id)
    saveToStorage()
  }

  function clearAll() {
    notifications.value = []
    saveToStorage()
  }

  function createLowStockNotification(
    product: Pick<Product, 'id' | 'name' | 'stock' | 'min_stock'>,
    source: 'initial' | 'realtime' | 'polling' = 'initial'
  ) {
    if (!preferences.value.lowStock) return

    const stock = product.stock ?? 0
    const minStock = product.min_stock ?? 0

    const created = addOrUpdateNotification({
      id: `stock:${product.id}`,
      type: 'inventario',
      title: 'Stock bajo',
      message: `${product.name} está en ${stock} unidades (mínimo ${minStock})`,
      createdAt: new Date().toISOString(),
      read: false
    }, {
      preserveRead: true,
      refreshTimestamp: false
    })

    if (created && source !== 'initial') {
      notifyInBrowser('Stock bajo', `${product.name} está en ${stock} unidades`)
    }
  }

  function createSaleNotification(
    sale: Pick<Sale, 'id' | 'sale_number' | 'total' | 'payment_method'>,
    source: 'initial' | 'realtime' | 'polling' = 'initial'
  ) {
    if (!preferences.value.sales) return

    const created = addOrUpdateNotification({
      id: `sale:${sale.id}`,
      type: 'venta',
      title: `Nueva venta ${sale.sale_number}`,
      message: `${formatCurrency(sale.total)} - ${normalizePaymentMethod(sale.payment_method)}`,
      createdAt: new Date().toISOString(),
      read: false
    }, {
      preserveRead: true,
      refreshTimestamp: false
    })

    if (created && source !== 'initial') {
      notifyInBrowser(`Nueva venta ${sale.sale_number}`, `${formatCurrency(sale.total)}`)
    }
  }

  async function loadInitialNotifications() {
    const [lowStockProducts, todaySales] = await Promise.all([
      fetchLowStockProducts(),
      fetchTodaySales()
    ])

    lowStockProducts.slice(0, 10).forEach((product: LowStockProduct) => {
      createLowStockNotification({
        id: product.id || 'desconocido',
        name: product.name || 'Producto',
        stock: product.stock,
        min_stock: product.min_stock
      }, 'initial')
    })

    todaySales.slice(0, 5).forEach((sale) => {
      createSaleNotification(sale, 'initial')
    })
  }

  async function syncLatestData() {
    try {
      const [lowStockProducts, todaySales] = await Promise.all([
        fetchLowStockProducts(),
        fetchTodaySales()
      ])

      lowStockProducts.forEach((product: LowStockProduct) => {
        if (!product.id) return
        createLowStockNotification({
          id: product.id,
          name: product.name || 'Producto',
          stock: product.stock,
          min_stock: product.min_stock
        }, 'polling')
      })

      todaySales.slice(0, 20).forEach((sale) => {
        createSaleNotification(sale, 'polling')
      })
    } catch (error) {
      console.error('Error sincronizando notificaciones:', error)
    }
  }

  function startRealtime() {
    if (salesChannel || productsChannel) return

    salesChannel = subscribeToSales((payload) => {
      if (payload.eventType !== 'INSERT') return
      const sale = payload.new as Sale
      createSaleNotification(sale, 'realtime')
    })

    productsChannel = subscribeToProducts((payload) => {
      if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return

      const updatedProduct = payload.new as Product
      const previousProduct = payload.old as Product | null
      const currentStock = updatedProduct.stock ?? 0
      const minStock = updatedProduct.min_stock ?? 0
      const wasLowStock = (previousProduct?.stock ?? Infinity) <= (previousProduct?.min_stock ?? minStock)
      const isLowStock = currentStock <= minStock

      if (isLowStock && !wasLowStock) {
        createLowStockNotification(updatedProduct, 'realtime')
      }
    })

    if (!pollingTimer) {
      pollingTimer = setInterval(() => {
        void syncLatestData()
      }, POLLING_INTERVAL_MS)
    }
  }

  function stopRealtime() {
    if (salesChannel) {
      supabase.removeChannel(salesChannel)
      salesChannel = null
    }

    if (productsChannel) {
      supabase.removeChannel(productsChannel)
      productsChannel = null
    }

    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  async function initialize() {
    if (initialized.value) {
      startRealtime()
      return
    }

    loading.value = true
    loadFromStorage()
    loadPreferences()

    try {
      await loadPreferencesFromDatabase()

      if (notifications.value.length === 0) {
        await loadInitialNotifications()
      }

      await syncLatestData()
      startRealtime()
      initialized.value = true
    } catch (error) {
      console.error('Error inicializando notificaciones:', error)
    } finally {
      loading.value = false
    }
  }

  function reset() {
    stopRealtime()
    notifications.value = []
    initialized.value = false
    saveToStorage()
  }

  return {
    notifications,
    preferences,
    loading,
    initialized,
    unreadCount,
    initialize,
    stopRealtime,
    reset,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll
    ,
    setPreference
  }
})

function formatCurrency(amount: number): string {
  return `L ${Number(amount || 0).toFixed(2)}`
}

function normalizePaymentMethod(paymentMethod: string): string {
  if (paymentMethod === 'efectivo') return 'Efectivo'
  if (paymentMethod === 'tarjeta') return 'Tarjeta'
  return 'Otro'
}

function notifyInBrowser(title: string, body: string) {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    return
  }

  void showLocalNotification(title, body)
}