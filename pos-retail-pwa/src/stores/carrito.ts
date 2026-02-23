import { defineStore } from 'pinia'
import { shallowRef, computed, triggerRef } from 'vue'
import type { Product, CartItem, SaleItem } from '@/types/supabase'

/** Determina si un producto se vende por peso (granel) */
export function productSellsByWeight(product: Product): boolean {
  const meta = product.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
    ? (product.metadata as Record<string, unknown>)
    : {}
  return meta.sell_by === 'weight'
}

export const useCarritoStore = defineStore('carrito', () => {
  // Estado - usar shallowRef para evitar recursión de tipos
  const items = shallowRef<CartItem[]>([])
  const discount = shallowRef(0)
  const paymentMethod = shallowRef<'efectivo' | 'tarjeta' | 'otro'>('efectivo')

  // Funciones getter
  function getItemCount(): number {
    return items.value.reduce((acc, item) => acc + item.quantity, 0)
  }

  function getSubtotal(): number {
    return items.value.reduce((acc, item) => acc + item.subtotal, 0)
  }

  function getTax(): number {
    return items.value.reduce((acc, item) => acc + item.tax, 0)
  }

  function getTotal(): number {
    return getSubtotal() + getTax() - discount.value
  }

  const isEmpty = computed((): boolean => items.value.length === 0)

  // Acciones
  function addItem(product: Product, quantity: number = 1) {
    const existingIndex = items.value.findIndex(
      item => item.product.id === product.id
    )

    const unitSubtotal = product.price * quantity
    const unitTax = unitSubtotal * ((product.tax_rate ?? 0) / 100)

    if (existingIndex !== -1) {
      const existing = items.value[existingIndex]
      if (existing) {
        existing.quantity += quantity
        existing.subtotal = existing.product.price * existing.quantity
        existing.tax = existing.subtotal * ((existing.product.tax_rate ?? 0) / 100)
      }
    } else {
      items.value.push({
        product,
        quantity,
        subtotal: unitSubtotal,
        tax: unitTax
      })
    }
    triggerRef(items)
  }

  function removeItem(index: number) {
    if (index >= 0 && index < items.value.length) {
      items.value.splice(index, 1)
      triggerRef(items)
    }
  }

  function incrementItem(index: number) {
    if (index < 0 || index >= items.value.length) return
    
    const item = items.value[index]
    if (!item) return

    const isByWeight = productSellsByWeight(item.product)
    const step = isByWeight ? 0.25 : 1
    
    if ((item.product.stock ?? 0) > item.quantity) {
      item.quantity = Math.round((item.quantity + step) * 1000) / 1000
      item.subtotal = item.product.price * item.quantity
      item.tax = item.subtotal * ((item.product.tax_rate ?? 0) / 100)
      triggerRef(items)
    }
  }

  function decrementItem(index: number) {
    if (index < 0 || index >= items.value.length) return
    
    const item = items.value[index]
    if (!item) return

    const isByWeight = productSellsByWeight(item.product)
    const step = isByWeight ? 0.25 : 1
    const minQty = isByWeight ? 0.25 : 1
    
    if (item.quantity > minQty) {
      item.quantity = Math.round((item.quantity - step) * 1000) / 1000
      item.subtotal = item.product.price * item.quantity
      item.tax = item.subtotal * ((item.product.tax_rate ?? 0) / 100)
      triggerRef(items)
    } else {
      removeItem(index)
    }
  }

  function updateQuantity(index: number, quantity: number) {
    if (index < 0 || index >= items.value.length || quantity <= 0) return
    
    const item = items.value[index]
    if (!item) return
    
    const maxQuantity = item.product.stock ?? 0
    item.quantity = Math.min(Math.round(quantity * 1000) / 1000, maxQuantity)
    item.subtotal = item.product.price * item.quantity
    item.tax = item.subtotal * ((item.product.tax_rate ?? 0) / 100)
    triggerRef(items)
  }

  function setDiscount(amount: number) {
    discount.value = Math.max(0, Math.min(amount, getSubtotal()))
  }

  function setPaymentMethod(method: 'efectivo' | 'tarjeta' | 'otro') {
    paymentMethod.value = method
  }

  function clearCart() {
    items.value = []
    discount.value = 0
    paymentMethod.value = 'efectivo'
  }

  function getSaleItems(): SaleItem[] {
    return items.value.map(item => ({
      product_id: item.product.id,
      name: item.product.name,
      quantity: item.quantity,
      unit_price: item.product.price,
      subtotal: item.subtotal,
      tax: item.tax
    }))
  }

  return {
    // Estado
    items,
    discount,
    paymentMethod,
    // Getters
    getItemCount,
    getSubtotal,
    getTax,
    getTotal,
    isEmpty,
    // Acciones
    addItem,
    removeItem,
    incrementItem,
    decrementItem,
    updateQuantity,
    setDiscount,
    setPaymentMethod,
    clearCart,
    getSaleItems
  }
})
