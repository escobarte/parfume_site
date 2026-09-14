import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

/**
 * Когда персональный промокод сгорает (2026-09-12).
 *
 * Правило: одноразовый код помечается использованным ТОЛЬКО если он реально
 * дал выгоду хотя бы на одной позиции корзины (`promoWonAnywhere` в
 * order-request/route.ts). Проиграл собственным скидкам везде — остаётся у
 * клиента и применим позже. Публичный код не сгорает никогда.
 *
 * Проверяется сам роут целиком, а не отдельная функция: правило живёт на
 * стыке `priceLine` и `claimPromoCode`, и тест на одной из половин его бы
 * не поймал. Внешние отправки глушатся `ORDERS_DRY_RUN=1` — тем же флагом,
 * которым проверяется заявка вживую, без подмены модуля уведомлений.
 */

process.env.ORDERS_DRY_RUN = '1'

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

const { POST } = await import('@/app/(frontend)/api/order-request/route')

type Doc = Record<string, unknown>

const PHONE = '+37360123456'

/** MO-AMBER-SALE, Full Size: 800 из 1200 — собственная скидка 33%. */
const DEEP_DISCOUNT = { sku: 'MO-AS-30', price: 800, oldPrice: 1200, isActive: true }
/** MO-SIGNATURE-WOOD, 5ml: 240 без уценки. */
const NO_DISCOUNT = { sku: 'MO-SW-05', price: 240, isActive: true }

const product = (slug: string, variants: Doc[]) => ({
  id: slug,
  slug,
  title: `Товар ${slug}`,
  brand: { title: 'Maison Orphée' },
  variants,
})

const personalCode = (over: Doc = {}) => ({
  id: 7,
  code: 'WELCOME-ABC123',
  percent: 15,
  codeType: 'personal',
  isActive: true,
  isUsed: false,
  email: 'a@b.c',
  phone: PHONE,
  ...over,
})

/**
 * @param claimed сколько документов «обновил» claimPromoCode. 0 — код уже
 * забрала параллельная заявка (гонка).
 */
const stub = (promo: Doc | null, products: Doc[], claimed = 1) => {
  find.mockImplementation(async ({ collection, where }: { collection: string; where: Doc }) => {
    if (collection === 'promo-codes') return { docs: promo ? [promo] : [] }
    const slug = (where as { slug: { equals: string } }).slug.equals
    const docs = products.filter((doc) => (doc as { slug: string }).slug === slug)
    return { docs }
  })
  create.mockImplementation(async ({ data }: { data: Doc }) => ({
    ...data,
    id: 1,
    orderNumber: 'MF-TEST-1',
    createdAt: new Date().toISOString(),
  }))
  update.mockImplementation(async ({ collection }: { collection: string }) =>
    collection === 'promo-codes' ? { docs: Array.from({ length: claimed }, () => ({ id: 7 })) } : {},
  )
}

/** Заявка, отличающаяся от соседней только позициями и промокодом. */
let ipCounter = 0
const order = async (items: Doc[], over: Doc = {}) => {
  // Свой IP на каждый вызов: лимит 5 заявок на IP за 10 минут иначе
  // уронил бы шестой тест в файле на 429 вместо его собственной темы.
  ipCounter += 1
  const response = await POST(
    new Request('http://localhost/api/order-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': `10.0.0.${ipCounter}` },
      body: JSON.stringify({
        name: 'Тест',
        phone: PHONE,
        locale: 'ro',
        items,
        ...over,
      }),
    }),
  )
  return { status: response.status, body: await response.json() }
}

const item = (slug: string, sku: string, qty = 1) => ({
  kind: 'product',
  productId: slug,
  slug,
  title: 'неважно — сервер берёт своё',
  sku,
  price: 1,
  qty,
})

/** Данные, с которыми был создан заказ. */
const createdOrder = () => create.mock.calls[0][0].data as Doc
/** Вызовы обновления промокода — их наличие и есть «код сгорел». */
const claimCalls = () =>
  update.mock.calls.filter((call) => call[0].collection === 'promo-codes')

beforeEach(() => {
  find.mockReset()
  create.mockReset()
  update.mockReset()
  warn.mockReset()
})

describe('персональный код ПРОИГРАЛ на всех позициях — не сгорает', () => {
  const cart = [item('deep', 'MO-AS-30')]

  it('код не помечается использованным', async () => {
    stub(personalCode({ percent: 15 }), [product('deep', [DEEP_DISCOUNT])])
    const { status, body } = await order(cart, {
      promoCode: 'WELCOME-ABC123',
      promoPhone: PHONE,
    })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(claimCalls()).toHaveLength(0)
  })

  it('заявка всё равно принимается — по собственной цене товара', async () => {
    stub(personalCode({ percent: 15 }), [product('deep', [DEEP_DISCOUNT])])
    await order(cart, { promoCode: 'WELCOME-ABC123', promoPhone: PHONE })
    // 15% проиграли собственным 33% — платим сохранённые 800, не 1200−15%.
    expect(createdOrder().total).toBe(800)
  })

  it('выгода от кода записана нулём, а не суммой товарной скидки', async () => {
    stub(personalCode({ percent: 15 }), [product('deep', [DEEP_DISCOUNT])])
    await order(cart, { promoCode: 'WELCOME-ABC123', promoPhone: PHONE })
    expect(createdOrder().promoDiscountAmount).toBe(0)
    // Сам код в заявке сохраняется: менеджер должен видеть, что его вводили.
    expect(createdOrder().promoCode).toBe('WELCOME-ABC123')
  })

  it('в позицию попал снапшот ТОВАРНОЙ скидки, а не промокодовой', async () => {
    stub(personalCode({ percent: 15 }), [product('deep', [DEEP_DISCOUNT])])
    await order(cart, { promoCode: 'WELCOME-ABC123', promoPhone: PHONE })
    const [line] = createdOrder().items as Doc[]
    expect(line).toMatchObject({
      price: 800,
      basePrice: 1200,
      discountPercent: 33,
      discountSource: 'product',
    })
  })

  it('равные проценты — тоже проигрыш кода: он не тратится ради нулевой выгоды', async () => {
    stub(personalCode({ percent: 33 }), [product('deep', [DEEP_DISCOUNT])])
    await order(cart, { promoCode: 'WELCOME-ABC123', promoPhone: PHONE })
    expect(claimCalls()).toHaveLength(0)
    expect(createdOrder().total).toBe(800)
  })
})

describe('персональный код ВЫИГРАЛ хотя бы на одной позиции — сгорает', () => {
  it('код помечается использованным и привязывается к заявке', async () => {
    stub(personalCode(), [product('plain', [NO_DISCOUNT])])
    await order([item('plain', 'MO-SW-05')], {
      promoCode: 'WELCOME-ABC123',
      promoPhone: PHONE,
    })
    expect(claimCalls()).toHaveLength(1)
    expect(claimCalls()[0][0].data).toEqual({ isUsed: true, usedInOrder: 1 })
  })

  it('скидка применена: 240 − 15% = 204', async () => {
    stub(personalCode(), [product('plain', [NO_DISCOUNT])])
    await order([item('plain', 'MO-SW-05')], {
      promoCode: 'WELCOME-ABC123',
      promoPhone: PHONE,
    })
    expect(createdOrder().total).toBe(204)
    expect(createdOrder().promoDiscountAmount).toBe(36)
  })

  it('СМЕШАННАЯ корзина: выиграл на одной позиции — код сгорает', async () => {
    stub(personalCode(), [product('plain', [NO_DISCOUNT]), product('deep', [DEEP_DISCOUNT])])
    await order([item('plain', 'MO-SW-05'), item('deep', 'MO-AS-30')], {
      promoCode: 'WELCOME-ABC123',
      promoPhone: PHONE,
    })
    expect(claimCalls()).toHaveLength(1)
    // Выгода считается ТОЛЬКО по выигранной позиции: 36, не 36 + что-то с MO-AS-30.
    expect(createdOrder().promoDiscountAmount).toBe(36)
    expect(createdOrder().total).toBe(204 + 800)
  })

  it('в смешанной корзине у позиций разные источники скидки', async () => {
    stub(personalCode(), [product('plain', [NO_DISCOUNT]), product('deep', [DEEP_DISCOUNT])])
    await order([item('plain', 'MO-SW-05'), item('deep', 'MO-AS-30')], {
      promoCode: 'WELCOME-ABC123',
      promoPhone: PHONE,
    })
    const lines = createdOrder().items as Doc[]
    expect(lines.map((line) => line.discountSource)).toEqual(['promo', 'product'])
  })

  it('количество учитывается в выгоде', async () => {
    stub(personalCode(), [product('plain', [NO_DISCOUNT])])
    await order([item('plain', 'MO-SW-05', 3)], {
      promoCode: 'WELCOME-ABC123',
      promoPhone: PHONE,
    })
    expect(createdOrder().promoDiscountAmount).toBe(36 * 3)
    expect(createdOrder().total).toBe(204 * 3)
  })

  it('проигранная гонка за код заявку не роняет, а пишется в лог', async () => {
    stub(personalCode(), [product('plain', [NO_DISCOUNT])], 0)
    const { status, body } = await order([item('plain', 'MO-SW-05')], {
      promoCode: 'WELCOME-ABC123',
      promoPhone: PHONE,
    })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('публичный код не сгорает никогда', () => {
  const publicCode = {
    id: 9,
    code: 'AUTUMN20',
    percent: 20,
    codeType: 'public',
    isActive: true,
    isUsed: false,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  }

  it('даже когда выиграл и дал скидку', async () => {
    stub(publicCode, [product('plain', [NO_DISCOUNT])])
    await order([item('plain', 'MO-SW-05')], { promoCode: 'AUTUMN20' })
    expect(createdOrder().total).toBe(192)
    expect(claimCalls()).toHaveLength(0)
  })
})

describe('без промокода правило скидок работает само по себе', () => {
  it('товар со своей уценкой считается по сохранённой цене', async () => {
    stub(null, [product('deep', [DEEP_DISCOUNT])])
    await order([item('deep', 'MO-AS-30')])
    expect(createdOrder().total).toBe(800)
    expect((createdOrder().items as Doc[])[0]).toMatchObject({
      basePrice: 1200,
      discountPercent: 33,
      discountSource: 'product',
    })
  })

  it('товар без скидки — без снапшота скидки в позиции', async () => {
    stub(null, [product('plain', [NO_DISCOUNT])])
    await order([item('plain', 'MO-SW-05')])
    const [line] = createdOrder().items as Doc[]
    expect(line.discountSource).toBeUndefined()
    expect(line.basePrice).toBeUndefined()
    expect(createdOrder().total).toBe(240)
  })
})
