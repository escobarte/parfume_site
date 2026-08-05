'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Минимальная корзина фазы 3: нужна счётчику в шапке и кнопке «В корзину»
 * на странице товара. Мини-корзина, страница корзины и форма заявки —
 * фаза 4 (PLAN.md §6), она расширяет этот же стор.
 */
export type CartItem = {
  /** product.id + sku варианта — позиция уникальна по варианту. */
  key: string
  productId: number | string
  slug: string
  title: string
  brandTitle: string
  sku: string
  volume: number
  price: number
  image?: string | null
  qty: number
}

type CartState = {
  items: CartItem[]
  add: (item: Omit<CartItem, 'key' | 'qty'>, qty?: number) => void
  remove: (key: string) => void
  setQty: (key: string, qty: number) => void
  clear: () => void
}

export const cartItemKey = (productId: number | string, sku: string) => `${productId}:${sku}`

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item, qty = 1) =>
        set((state) => {
          const key = cartItemKey(item.productId, item.sku)
          const existing = state.items.find((candidate) => candidate.key === key)
          return {
            items: existing
              ? state.items.map((candidate) =>
                  candidate.key === key ? { ...candidate, qty: candidate.qty + qty } : candidate,
                )
              : [...state.items, { ...item, key, qty }],
          }
        }),
      remove: (key) => set((state) => ({ items: state.items.filter((item) => item.key !== key) })),
      setQty: (key, qty) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.key === key ? { ...item, qty: Math.max(1, qty) } : item,
          ),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: 'mf-cart' },
  ),
)

export const selectCount = (state: CartState) =>
  state.items.reduce((sum, item) => sum + item.qty, 0)

export const selectTotal = (state: CartState) =>
  state.items.reduce((sum, item) => sum + item.qty * item.price, 0)
