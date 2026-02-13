import { defineStore } from 'pinia'
import { shallowRef, computed, triggerRef } from 'vue'
import { fetchProducts, searchProducts, fetchProductByBarcode } from '@/services/database'
import { supabase } from '@/services/supabase'
import type { Product } from '@/types/supabase'

export const useProductosStore = defineStore('productos', () => {
  // Estado - usar shallowRef para evitar recursión de tipos
  const products = shallowRef<Product[]>([])
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const searchQuery = shallowRef('')

  // Funciones getter para evitar problemas de inferencia
  function getActiveProducts(): Product[] {
    return products.value.filter(p => p.active !== false)
  }

  function getLowStockProducts(): Product[] {
    return products.value.filter(p => (p.stock ?? 0) <= (p.min_stock ?? 5))
  }

  const productCount = computed(() => products.value.length)

  // Acciones
  async function fetchAllProducts(): Promise<void> {
    loading.value = true
    error.value = null

    try {
      products.value = await fetchProducts()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Error cargando productos'
      console.error('Error:', err)
    } finally {
      loading.value = false
    }
  }

  async function search(query: string): Promise<void> {
    if (!query.trim()) {
      await fetchAllProducts()
      return
    }

    loading.value = true
    error.value = null

    try {
      products.value = await searchProducts(query)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Error buscando'
      console.error('Error:', err)
    } finally {
      loading.value = false
    }
  }

  async function getByBarcode(barcode: string): Promise<Product | null> {
    try {
      return await fetchProductByBarcode(barcode)
    } catch (err) {
      console.error('Error buscando por código:', err)
      return null
    }
  }

  function getById(id: string): Product | undefined {
    return products.value.find((p: Product) => p.id === id)
  }

  // Suscripción a cambios en tiempo real
  function subscribeToChanges(): () => void {
    const channel = supabase
      .channel('products-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newProduct = payload.new as Product
            products.value.push(newProduct)
          } else if (payload.eventType === 'UPDATE') {
            const updatedProduct = payload.new as Product
            const index = products.value.findIndex((p: Product) => p.id === updatedProduct.id)
            if (index !== -1) {
              products.value[index] = updatedProduct
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id
            products.value = products.value.filter((p: Product) => p.id !== deletedId)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  return {
    // Estado
    products,
    loading,
    error,
    searchQuery,
    // Getters
    getActiveProducts,
    getLowStockProducts,
    productCount,
    // Acciones
    fetchProducts: fetchAllProducts,
    search,
    getByBarcode,
    getById,
    subscribeToChanges
  }
})
