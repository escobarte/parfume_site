'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Минимальная корзина фазы 3: нужна счётчику в шапке и кнопке «В корзину»
 * на странице товара. Мини-корзина, страница корзины и форма заявки —
 * фаза 4 (PLAN.md §6), она расширяет этот же стор.
 */
export type CartItem = {
  /** kind + productId + sku варианта — позиция уникальна по варианту. */
  key: string
  // Товар (духи) или подарочный товар (сертификат/Gift box, фаза 11.1,
  // задача 2, коллекция `gift-items`) — определяет, какую коллекцию
  // сервер резолвит заново при подтверждении заявки (см. buildItems в
  // src/app/(frontend)/api/order-request/route.ts). Отсутствует у карт,
  // сохранённых в localStorage до этой фазы — везде читается как
  // `item.kind ?? 'product'`.
  kind?: 'product' | 'gift'
  productId: number | string
  slug: string
  title: string
  brandTitle: string
  sku: string
  // Объём — только у товаров-духов, один из 5 фиксированных значений
  // (PRODUCT_VOLUMES). У подарочных товаров нет объёма, номинал в MDL и так
  // виден в `price`, поле остаётся пустым.
  volume?: string
  price: number
  /**
   * Цена до скидки на момент последней синхронизации. Нужна, чтобы корзина
   * показывала зачёркнутую цену и могла применить правило «больший процент
   * выигрывает» (см. `priceLine` в lib/pricing.ts). Отсутствует у позиций,
   * положенных в корзину до 2026-09-12, — читается как «скидки нет».
   */
  oldPrice?: number | null
  image?: string | null
  qty: number
}

/** Свежие данные позиции, приходящие с сервера при открытии корзины. */
export type CartItemSync = {
  key: string
  price: number
  oldPrice: number | null
  /** Товар/вариант пропал или отключён — позиция больше не заказуема. */
  gone?: boolean
}

type CartState = {
  items: CartItem[]
  add: (item: Omit<CartItem, 'key' | 'qty'>, qty?: number) => void
  remove: (key: string) => void
  setQty: (key: string, qty: number) => void
  /**
   * Подтягивает актуальные цены с сервера. Возвращает ключи позиций, у
   * которых цена ИЛИ уценка реально изменились, — вызывающий показывает по
   * ним пометку «цена обновилась». Пропавшие товары удаляются из корзины.
   */
  sync: (updates: CartItemSync[]) => string[]
  clear: () => void
}

export const cartItemKey = (kind: 'product' | 'gift', productId: number | string, sku: string) =>
  `${kind}:${productId}:${sku}`

/** Ключ корзины в localStorage — общий для всех вкладок одного браузера. */
export const CART_STORAGE_KEY = 'mf-cart'

/**
 * Позиции корзины прямо из localStorage, минуя память вкладки.
 *
 * Зачем (баг 2026-11-23, «корзина теряет товары в нескольких вкладках»):
 * каждая вкладка держит свою копию стора, а persist при ЛЮБОЙ записи
 * сохраняет в localStorage то, что лежит в памяти. Вкладка, не знавшая о
 * товаре из соседней, затирала его — в том числе молча, ревалидацией цен
 * при открытии /cart. Поэтому каждая мутация берёт за основу актуальное
 * содержимое хранилища, а память — только запасной вариант (SSR, пустое
 * или битое хранилище).
 */
export function readStoredCartItems(): CartItem[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { items?: unknown } } | null
    const items = parsed?.state?.items
    return Array.isArray(items) ? (items as CartItem[]) : null
  } catch {
    return null
  }
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => {
      /** База для мутации: localStorage, если он доступен, иначе память. */
      const latest = (): CartItem[] => readStoredCartItems() ?? get().items

      return {
        items: [],
        add: (item, qty = 1) => {
          const items = latest()
          const key = cartItemKey(item.kind ?? 'product', item.productId, item.sku)
          const existing = items.find((candidate) => candidate.key === key)
          set({
            items: existing
              ? items.map((candidate) =>
                  candidate.key === key ? { ...candidate, qty: candidate.qty + qty } : candidate,
                )
              : [...items, { ...item, key, qty }],
          })
        },
        remove: (key) => set({ items: latest().filter((item) => item.key !== key) }),
        setQty: (key, qty) =>
          set({
            items: latest().map((item) =>
              item.key === key ? { ...item, qty: Math.max(1, qty) } : item,
            ),
          }),
        sync: (updates) => {
          const changed: string[] = []
          // Цены обновляются только у позиций, которые РЕАЛЬНО лежат в
          // хранилище сейчас: удалённое в соседней вкладке не воскресает,
          // добавленное там же не теряется.
          const items = latest().flatMap((item) => {
            const fresh = updates.find((candidate) => candidate.key === item.key)
            // Позиции нет в ответе — сервер её не проверял (например, её
            // добавили в другой вкладке уже после запроса): оставляем как есть.
            if (!fresh) return [item]
            if (fresh.gone) {
              changed.push(item.key)
              return []
            }
            const oldPriceBefore = item.oldPrice ?? null
            if (fresh.price !== item.price || fresh.oldPrice !== oldPriceBefore) {
              changed.push(item.key)
            }
            return [{ ...item, price: fresh.price, oldPrice: fresh.oldPrice }]
          })
          // Ничего не изменилось — не пишем вовсе: лишняя запись будит
          // storage-событие во всех остальных вкладках.
          if (changed.length > 0) set({ items })
          return changed
        },
        clear: () => set({ items: [] }),
      }
    },
    { name: CART_STORAGE_KEY },
  ),
)

/**
 * Синхронизация между вкладками: соседняя вкладка записала корзину —
 * перечитываем её из localStorage (`storage` срабатывает только в ДРУГИХ
 * вкладках). При возврате на вкладку перечитываем тоже — на случай
 * пропущенного события. `rehydrate()` в хранилище не пишет (только при
 * миграции версии), поэтому цикла «rehydrate → запись → storage» нет.
 */
function subscribeCrossTabSync() {
  if (typeof window === 'undefined') return
  const scope = window as unknown as { __mfCartCrossTabCleanup?: () => void }
  // HMR в dev переисполняет модуль с НОВЫМ стором — снимаем слушатели
  // прежнего экземпляра, иначе они продолжат обновлять устаревший стор.
  scope.__mfCartCrossTabCleanup?.()

  const onStorage = (event: StorageEvent) => {
    // key === null — localStorage.clear() в другой вкладке.
    if (event.key !== CART_STORAGE_KEY && event.key !== null) return
    void useCart.persist.rehydrate()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void useCart.persist.rehydrate()
  }
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisible)
  scope.__mfCartCrossTabCleanup = () => {
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

subscribeCrossTabSync()

export const selectCount = (state: CartState) =>
  state.items.reduce((sum, item) => sum + item.qty, 0)

export const selectTotal = (state: CartState) =>
  state.items.reduce((sum, item) => sum + item.qty * item.price, 0)
