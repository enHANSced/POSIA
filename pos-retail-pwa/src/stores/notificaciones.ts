import { defineStore } from 'pinia'
import { shallowRef, computed, triggerRef } from 'vue'
import { fetchLowStockProducts, fetchTodaySales, subscribeToProducts, subscribeToSales } from '@/services/database'
import type { LowStockProduct, Product, Sale } from '@/types/supabase'
import { supabase } from '@/services/supabase'

type NotificationType = 'venta' | 'inventario' | 'sistema'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt: string
  read: boolean
}

const STORAGE_KEY = 'posia.notifications.v1'
const MAX_NOTIFICATIONS = 50

export const useNotificacionesStore = defineStore('notificaciones', () => {
  const notifications = shallowRef<AppNotification[]>([])
  const loading = shallowRef(false)
  const initialized = shallowRef(false)

  let salesChannel: ReturnType<typeof subscribeToSales> | null = null
  let productsChannel: ReturnType<typeof subscribeToProducts> | null = null

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

  function addOrUpdateNotification(notification: AppNotification) {
    const index = notifications.value.findIndex(n => n.id === notification.id)

    if (index !== -1) {
      notifications.value[index] = {
        ...notifications.value[index],
        ...notification,
        read: false,
        createdAt: new Date().toISOString()
      }
    } else {
      notifications.value.unshift(notification)
    }

    notifications.value = notifications.value
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_NOTIFICATIONS)

    triggerRef(notifications)
    saveToStorage()
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

  function createLowStockNotification(product: Pick<Product, 'id' | 'name' | 'stock' | 'min_stock'>) {
    const stock = product.stock ?? 0
    const minStock = product.min_stock ?? 0

    addOrUpdateNotification({
      id: `stock:${product.id}`,
      type: 'inventario',
      title: 'Stock bajo',
      message: `${product.name} está en ${stock} unidades (mínimo ${minStock})`,
      createdAt: new Date().toISOString(),
      read: false
    })
  }

  function createSaleNotification(sale: Pick<Sale, 'id' | 'sale_number' | 'total' | 'payment_method'>) {
    addOrUpdateNotification({
      id: `sale:${sale.id}`,
      type: 'venta',
      title: `Nueva venta ${sale.sale_number}`,
      message: `${formatCurrency(sale.total)} - ${normalizePaymentMethod(sale.payment_method)}`,
      createdAt: new Date().toISOString(),
      read: false
    })
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
      })
    })

    todaySales.slice(0, 5).forEach((sale) => {
      createSaleNotification(sale)
    })
  }

  function startRealtime() {
    if (salesChannel || productsChannel) return

    salesChannel = subscribeToSales((payload) => {
      if (payload.eventType !== 'INSERT') return
      const sale = payload.new as Sale
      createSaleNotification(sale)
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
        createLowStockNotification(updatedProduct)
      }
    })
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
  }

  async function initialize() {
    if (initialized.value) {
      startRealtime()
      return
    }

    loading.value = true
    loadFromStorage()

    try {
      if (notifications.value.length === 0) {
        await loadInitialNotifications()
      }
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