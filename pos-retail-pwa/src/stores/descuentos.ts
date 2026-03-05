import { defineStore } from 'pinia'
import { shallowRef, triggerRef } from 'vue'
import type { CartItem, Combo, Discount } from '@/types/supabase'
import {
  fetchActiveCombos,
  fetchActiveDiscounts,
  fetchDiscountApplications,
  type DiscountApplicationHistoryItem
} from '@/services/database'

export type ApplicablePromotion = {
  id: string
  source: 'discount' | 'combo'
  name: string
  description: string | null
  type: 'percentage' | 'fixed'
  value: number
  amount: number
  reason: string
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export const useDescuentosStore = defineStore('descuentos', () => {
  const discounts = shallowRef<Discount[]>([])
  const combos = shallowRef<Combo[]>([])
  const applications = shallowRef<DiscountApplicationHistoryItem[]>([])
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)

  async function cargarPromocionesActivas() {
    loading.value = true
    error.value = null
    try {
      const [activeDiscounts, activeCombos] = await Promise.all([
        fetchActiveDiscounts(),
        fetchActiveCombos()
      ])
      discounts.value = activeDiscounts
      combos.value = activeCombos
      triggerRef(discounts)
      triggerRef(combos)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Error al cargar promociones'
    } finally {
      loading.value = false
    }
  }

  async function cargarAplicacionesRecientes(limit: number = 100) {
    try {
      applications.value = await fetchDiscountApplications(undefined, undefined, limit)
      triggerRef(applications)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Error al cargar historial de promociones'
    }
  }

  function calcularDescuentoMonto(type: 'percentage' | 'fixed', value: number, base: number): number {
    if (type === 'percentage') {
      return round2((base * value) / 100)
    }
    return round2(Math.min(value, base))
  }

  function getApplicableDiscounts(cartItems: CartItem[]): ApplicablePromotion[] {
    if (cartItems.length === 0) return []

    const subtotal = cartItems.reduce((acc, item) => acc + item.subtotal, 0)
    const productosIds = new Set(cartItems.map(item => item.product.id))

    const applicableDiscounts: ApplicablePromotion[] = discounts.value
      .filter(discount => {
        if (!discount.active) return false

        if (discount.min_amount !== null && subtotal < discount.min_amount) {
          return false
        }

        const matchingItems = cartItems.filter(item => {
          if (discount.applicable_to === 'all') return true
          if (discount.applicable_to === 'category') return item.product.category_id === discount.category_id
          return discount.product_ids.includes(item.product.id)
        })

        if (matchingItems.length === 0) return false

        if (discount.min_quantity !== null) {
          const qty = matchingItems.reduce((acc, item) => acc + item.quantity, 0)
          if (qty < discount.min_quantity) return false
        }

        return true
      })
      .map(discount => {
        const amount = calcularDescuentoMonto(discount.type, discount.value, subtotal)
        return {
          id: discount.id,
          source: 'discount' as const,
          name: discount.name,
          description: discount.description,
          type: discount.type,
          value: discount.value,
          amount,
          reason: 'Descuento elegible según reglas vigentes'
        }
      })

    const applicableCombos: ApplicablePromotion[] = combos.value
      .filter(combo => {
        if (!combo.active) return false

        const matchedCount = combo.product_ids.filter(productId => productosIds.has(productId)).length
        if (combo.required_all) {
          if (matchedCount !== combo.product_ids.length) return false
        } else if (matchedCount === 0) {
          return false
        }

        const qtyByProductOk = combo.product_ids.every(productId => {
          const item = cartItems.find(cartItem => cartItem.product.id === productId)
          if (!item) return !combo.required_all
          return item.quantity >= combo.min_quantity_per_product
        })

        return qtyByProductOk
      })
      .map(combo => {
        const amount = calcularDescuentoMonto(combo.discount_type, combo.discount_value, subtotal)
        return {
          id: combo.id,
          source: 'combo' as const,
          name: combo.name,
          description: combo.description,
          type: combo.discount_type,
          value: combo.discount_value,
          amount,
          reason: 'Combo elegible con productos actuales del carrito'
        }
      })

    return [...applicableDiscounts, ...applicableCombos]
      .sort((a, b) => b.amount - a.amount)
  }

  return {
    discounts,
    combos,
    applications,
    loading,
    error,
    cargarPromocionesActivas,
    cargarAplicacionesRecientes,
    getApplicableDiscounts
  }
})
