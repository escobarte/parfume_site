'use client'

import { useSyncExternalStore } from 'react'

const noop = () => () => {}

/**
 * Корзина живёт в localStorage, поэтому на сервере её содержимого нет.
 * До гидрации рисуем «пустое» состояние, иначе React ругается на несовпадение.
 * Через useSyncExternalStore, а не setState в эффекте — без лишнего рендера.
 */
export function useHasHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}
