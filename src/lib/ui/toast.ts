'use client'

import { create } from 'zustand'

/**
 * Одиночный тост витрины (фаза 9.1). Стор, а не локальное состояние кнопки:
 * добавить в корзину можно из разных мест (карточка товара, «в 1 клик»,
 * позже — сетка каталога), а тост на экране всегда один и живёт в layout,
 * поверх любой страницы.
 *
 * Сознательно без очереди: подряд добавленные товары заменяют друг друга и
 * перезапускают таймер — так же ведут себя тосты сохранения в /admin.
 */
export type CartToast = {
  /** Меняется на каждый показ — перезапускает таймер автоскрытия. */
  id: number
  title: string
  brandTitle?: string
  volume?: number
  image?: string | null
}

type ToastState = {
  toast: CartToast | null
  showCartToast: (toast: Omit<CartToast, 'id'>) => void
  hideToast: () => void
}

export const useToast = create<ToastState>()((set) => ({
  toast: null,
  showCartToast: (toast) => set({ toast: { ...toast, id: Date.now() } }),
  hideToast: () => set({ toast: null }),
}))
