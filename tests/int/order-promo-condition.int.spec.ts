import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

/**
 * Условия применения промокода (минимум штук в корзине + фильтр по объёму,
 * 2026-10-23) — авторитетная проверка на сервере (`order-request/route.ts`).
 *
 * Тот же стиль мока, что у `order-promo-burn.int.spec.ts`: условие живёт на
 * стыке `resolveOrderLines` → `promoConditionMet` → `priceOrderLines`,
 * юнит-проверка одной из частей не поймала бы интеграционную ошибку (как
 * условие само по себе не учитывает объём из БД, а не от клиента).
 *
 * Цены/объёмы вариантов — реальные числа дев-каталога (maison-orphee-
 * signature-wood: 5ml/240, 10ml/420, Full Size/980, без собственной уценки —
 * взято намеренно без скидки товара, чтобы победа промокода читалась
 * однозначно, без наложения на правило «больший процент»).
 */

process.env.ORDERS_DRY_RUN = '1'
process.env.ORDER_EXPORT_DIR = mkdtempSync(path.join(tmpdir(), 'order-export-test-'))

const find = vi.fn()
const create = vi.fn()
const update = vi.fn()
const warn = vi.fn()

vi.mock('@/lib/payload', () => ({
  getPayloadClient: async () =>
    ({
      find,
      create,
      update,
      logger: { info: vi.fn(), warn, error: vi.fn() },
    }) as unknown as Payload,
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (task: () => unknown) => {
      void Promise.resolve().then(task).catch(() => {})
    },
  }
})

const { POST } = await import('@/app/(frontend)/api/order-request/route')

type Doc = Record<string, unknown>

const PHONE = '+37360123456'

// maison-orphee-signature-wood, без собственной уценки — дев-каталог.
const WOOD_5ML = { sku: 'MO-SW-05', price: 240, volume: '5ml', isActive: true }
const WOOD_10ML = { sku: 'MO-SW-10', price: 420, volume: '10ml', isActive: true }
const WOOD_FULL = { sku: 'MO-SW-30', price: 980, volume: 'Full Size', isActive: true }

const product = (slug: string, variants: Doc[]) => ({
  id: slug,
  slug,
  title: `Товар ${slug}`,
  brand: { title: 'Maison Orphée' },
  variants,
})

const GIFT_VARIANT = { sku: 'GIFT-300', amount: 300, isActive: true }
const giftItem = (slug: string) => ({
  id: slug,
  slug,
  title: `Подарок ${slug}`,
  isActive: true,
  variants: [GIFT_VARIANT],
})

/** Публичный код 20%, условие настраивается тестом поверх дефолта. */
const conditionalCode = (over: Doc = {}) => ({
  id: 11,
  code: 'DECANT20',
  percent: 20,
  codeType: 'public',
  isActive: true,
  isUsed: false,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  minQuantity: 3,
  appliesTo: 'decants',
  volumes: [],
  ...over,
})

const stub = (promo: Doc | null, products: Doc[], gifts: Doc[] = []) => {
  find.mockImplementation(async ({ collection, where }: { collection: string; where: Doc }) => {
    if (collection === 'promo-codes') return { docs: promo ? [promo] : [] }
    const slug = (where as { slug: { equals: string } }).slug.equals
    if (collection === 'gift-items') {
      return { docs: gifts.filter((doc) => (doc as { slug: string }).slug === slug) }
    }
    return { docs: products.filter((doc) => (doc as { slug: string }).slug === slug) }
  })
  create.mockImplementation(async ({ data }: { data: Doc }) => ({
    ...data,
    id: 1,
    orderNumber: 'MF-TEST-1',
    createdAt: new Date().toISOString(),
  }))
  update.mockImplementation(async () => ({ docs: [{ id: 11 }] }))
}

let ipCounter = 0
const order = async (items: Doc[], over: Doc = {}) => {
  // Свой IP на каждый вызов — иначе лимит заявок на IP уронит тест раньше,
  // чем проверяемая логика.
  ipCounter += 1
  const response = await POST(
    new Request('http://localhost/api/order-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': `10.0.1.${ipCounter}` },
      body: JSON.stringify({ name: 'Тест', phone: PHONE, locale: 'ro', items, ...over }),
    }),
  )
  return { status: response.status, body: await response.json() }
}

const item = (slug: string, sku: string, qty = 1, kind: 'product' | 'gift' = 'product') => ({
  kind,
  productId: slug,
  slug,
  title: 'неважно — сервер берёт своё',
  sku,
  price: 1,
  qty,
})

const createdOrder = () => create.mock.calls[0][0].data as Doc

beforeEach(() => {
  find.mockReset()
  create.mockReset()
  update.mockReset()
  warn.mockReset()
})

describe('условие «минимум штук» не выполнено', () => {
  it('2 отливанта из нужных 3 — отказ с min_quantity, заявка не создаётся', async () => {
    stub(conditionalCode(), [product('wood', [WOOD_5ML, WOOD_10ML, WOOD_FULL])])
    const { status, body } = await order(
      [item('wood', 'MO-SW-05', 1), item('wood', 'MO-SW-10', 1)],
      { promoCode: 'DECANT20' },
    )
    expect(status).toBe(400)
    expect(body).toEqual({ ok: false, error: 'promo_invalid', promoError: 'min_quantity' })
    expect(create).not.toHaveBeenCalled()
  })

  it('подарочная позиция в счёт не идёт, даже в большом количестве', async () => {
    stub(conditionalCode(), [product('wood', [WOOD_5ML])], [giftItem('cert')])
    const { status, body } = await order(
      [item('wood', 'MO-SW-05', 2), item('cert', 'GIFT-300', 5, 'gift')],
      { promoCode: 'DECANT20' },
    )
    // 2 отливанта + 5 подарочных = не 7, подарочные не считаются → отказ.
    expect(status).toBe(400)
    expect(body.promoError).toBe('min_quantity')
  })
})

describe('режим «только отливанты» — условие выполнено', () => {
  it('скидка только на отливантах, Full Size — по полной цене, подарок не тронут', async () => {
    stub(
      conditionalCode(),
      [product('wood', [WOOD_5ML, WOOD_10ML, WOOD_FULL])],
      [giftItem('cert')],
    )
    const { status, body } = await order(
      [
        item('wood', 'MO-SW-05', 1),
        item('wood', 'MO-SW-10', 2),
        item('wood', 'MO-SW-30', 1),
        item('cert', 'GIFT-300', 1, 'gift'),
      ],
      { promoCode: 'DECANT20' },
    )
    expect(status).toBe(200)
    expect(body.ok).toBe(true)

    const lines = createdOrder().items as Doc[]
    const bySku = (sku: string) => lines.find((line) => line.sku === sku)!

    // 5ml: 240 − 20% = 192.
    expect(bySku('MO-SW-05')).toMatchObject({ price: 192, discountPercent: 20, discountSource: 'promo' })
    // 10ml × 2: 420 − 20% = 336 за штуку.
    expect(bySku('MO-SW-10')).toMatchObject({
      price: 336,
      qty: 2,
      lineTotal: 672,
      discountPercent: 20,
      discountSource: 'promo',
    })
    // Full Size — вне фильтра кода: полная цена, без снапшота скидки.
    const full = bySku('MO-SW-30')
    expect(full.price).toBe(980)
    expect(full.discountSource).toBeUndefined()
    expect(full.basePrice).toBeUndefined()
    // Подарок — без скидки, как и раньше.
    expect(bySku('GIFT-300')).toMatchObject({ price: 300 })

    // Итог: 192 + 672 + 980 + 300 = 2144.
    expect(createdOrder().total).toBe(2144)
    // Выгода от кода — только по двум decant-позициям: 48 + (84*2) = 216.
    expect(createdOrder().promoDiscountAmount).toBe(216)
  })
})

describe('режим «выбранные объёмы»', () => {
  it('считает и дискaунтит только перечисленные объёмы — 10ml, не 5ml', async () => {
    stub(
      conditionalCode({ appliesTo: 'volumes', volumes: ['10ml'], minQuantity: 2 }),
      [product('wood', [WOOD_5ML, WOOD_10ML])],
    )

    // 1×10ml не хватает — отказ.
    const short = await order([item('wood', 'MO-SW-05', 3), item('wood', 'MO-SW-10', 1)], {
      promoCode: 'DECANT20',
    })
    expect(short.status).toBe(400)
    expect(short.body.promoError).toBe('min_quantity')

    // 2×10ml — хватает; 5ml вне фильтра объёма, без скидки.
    const ok = await order([item('wood', 'MO-SW-05', 3), item('wood', 'MO-SW-10', 2)], {
      promoCode: 'DECANT20',
    })
    expect(ok.status).toBe(200)
    const lines = createdOrder().items as Doc[]
    const fiveMl = lines.find((line) => line.sku === 'MO-SW-05')!
    expect(fiveMl.price).toBe(240)
    expect(fiveMl.discountSource).toBeUndefined()
    expect(lines.find((line) => line.sku === 'MO-SW-10')).toMatchObject({
      price: 336,
      discountSource: 'promo',
    })
  })
})

describe('режим «любые товары» с минимумом штук', () => {
  it('Full Size тоже считается и получает скидку — appliesTo не ограничивает объём', async () => {
    stub(
      conditionalCode({ appliesTo: 'all', minQuantity: 2, volumes: [] }),
      [product('wood', [WOOD_FULL])],
      [giftItem('cert')],
    )
    const { status } = await order(
      [item('wood', 'MO-SW-30', 1), item('cert', 'GIFT-300', 1, 'gift')],
      { promoCode: 'DECANT20' },
    )
    // 1 товар + 1 подарок — подарок не считается, товаров всего 1 < 2 → отказ.
    expect(status).toBe(400)

    const { status: status2, body } = await order([item('wood', 'MO-SW-30', 2)], {
      promoCode: 'DECANT20',
    })
    expect(status2).toBe(200)
    expect(body.ok).toBe(true)
    const [line] = createdOrder().items as Doc[]
    expect(line).toMatchObject({ price: 784, discountSource: 'promo' }) // 980 − 20%
  })
})
