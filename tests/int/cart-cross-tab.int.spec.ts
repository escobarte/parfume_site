import { beforeEach, describe, expect, it } from 'vitest'
import { CART_STORAGE_KEY, cartItemKey, useCart, type CartItem } from '@/lib/cart/store'

/**
 * Баг 2026-11-23 «корзина теряет товары в нескольких вкладках»: каждая
 * вкладка держит свою копию стора, и любая запись (добавление, ревалидация
 * цен на /cart) затирала localStorage памятью вкладки. Здесь «соседняя
 * вкладка» — прямая запись в localStorage в обход стора: память этого
 * экземпляра о ней не знает, как и реальная вкладка без storage-события.
 */

type NewItem = Omit<CartItem, 'key' | 'qty'>

const wood: NewItem = {
  kind: 'product',
  productId: 1,
  slug: 'maison-orphee-signature-wood',
  title: 'Signature Wood',
  brandTitle: 'Maison Orphée',
  sku: 'MO-SW-05',
  volume: '5ml',
  price: 240,
  oldPrice: null,
}

const rose: NewItem = {
  kind: 'product',
  productId: 2,
  slug: 'casa-lumina-trandafir-de-mai',
  title: 'Trandafir de Mai',
  brandTitle: 'Casa Lumina',
  sku: 'CL-TM-05',
  volume: '5ml',
  price: 210,
  oldPrice: null,
}

const asLine = (item: NewItem, qty = 1): CartItem => ({
  ...item,
  key: cartItemKey('product', item.productId, item.sku),
  qty,
})

/** Запись «из другой вкладки»: только localStorage, память стора не трогаем. */
const writeFromOtherTab = (items: CartItem[]) =>
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ state: { items }, version: 0 }))

const stored = (): CartItem[] =>
  JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '{"state":{"items":[]}}').state.items

const skus = (items: CartItem[]) => items.map((item) => `${item.sku}x${item.qty}`).sort()

beforeEach(() => {
  useCart.getState().clear()
  localStorage.clear()
})

describe('корзина в нескольких вкладках', () => {
  it('add поверх более нового состояния из localStorage сохраняет оба товара', () => {
    useCart.getState().add(wood)
    // Соседняя вкладка видела wood и добавила rose.
    writeFromOtherTab([asLine(wood), asLine(rose)])
    // Эта вкладка ещё «помнит» только wood и добавляет wood повторно.
    expect(skus(useCart.getState().items)).toEqual(['MO-SW-05x1'])
    useCart.getState().add(wood)

    expect(skus(stored())).toEqual(['CL-TM-05x1', 'MO-SW-05x2'])
    expect(skus(useCart.getState().items)).toEqual(['CL-TM-05x1', 'MO-SW-05x2'])
  })

  it('sync (ревалидация цен) не затирает чужую позицию и обновляет цену своей', () => {
    useCart.getState().add(wood)
    writeFromOtherTab([asLine(wood), asLine(rose)])

    // Ответ сервера — только по позициям, которые эта вкладка знала.
    const changed = useCart
      .getState()
      .sync([{ key: asLine(wood).key, price: 199, oldPrice: 240 }])

    expect(changed).toEqual([asLine(wood).key])
    const items = stored()
    expect(skus(items)).toEqual(['CL-TM-05x1', 'MO-SW-05x1'])
    expect(items.find((item) => item.sku === 'MO-SW-05')?.price).toBe(199)
    expect(items.find((item) => item.sku === 'CL-TM-05')?.price).toBe(210)
  })

  it('sync без изменений цен ничего не пишет', () => {
    useCart.getState().add(wood)
    writeFromOtherTab([asLine(wood), asLine(rose)])
    const before = localStorage.getItem(CART_STORAGE_KEY)

    const changed = useCart.getState().sync([{ key: asLine(wood).key, price: 240, oldPrice: null }])

    expect(changed).toEqual([])
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(before)
  })

  it('удалённое в другой вкладке не воскресает при следующей мутации', () => {
    useCart.getState().add(wood)
    useCart.getState().add(rose)
    // Соседняя вкладка удалила rose.
    writeFromOtherTab([asLine(wood)])

    useCart.getState().setQty(asLine(wood).key, 3)

    expect(skus(stored())).toEqual(['MO-SW-05x3'])
  })

  it('remove работает поверх свежего состояния', () => {
    useCart.getState().add(wood)
    writeFromOtherTab([asLine(wood), asLine(rose, 2)])

    useCart.getState().remove(asLine(wood).key)

    expect(skus(stored())).toEqual(['CL-TM-05x2'])
  })

  it('storage-событие подтягивает состояние соседней вкладки без записи', async () => {
    useCart.getState().add(wood)
    writeFromOtherTab([asLine(wood), asLine(rose)])
    const raw = localStorage.getItem(CART_STORAGE_KEY)

    window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY, newValue: raw }))
    await Promise.resolve()

    expect(skus(useCart.getState().items)).toEqual(['CL-TM-05x1', 'MO-SW-05x1'])
    // rehydrate не пишет обратно — иначе вкладки будили бы друг друга по кругу.
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(raw)
  })

  it('чужие ключи localStorage корзину не перечитывают', async () => {
    useCart.getState().add(wood)
    writeFromOtherTab([asLine(wood), asLine(rose)])

    window.dispatchEvent(new StorageEvent('storage', { key: 'mf-promo-popup-seen' }))
    await Promise.resolve()

    expect(skus(useCart.getState().items)).toEqual(['MO-SW-05x1'])
  })
})
