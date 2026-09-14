import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

/**
 * `/api/cart-revalidate` (2026-09-12) — корзина спрашивает актуальные цены
 * перед показом итогов: она живёт в localStorage, и пока товар лежал,
 * каталог мог подорожать, подешеветь или уйти со скидки.
 *
 * `Payload` подменён заглушкой, как в promo.int.spec.ts: проверяются
 * ПРАВИЛА роута (что он возвращает и что считает незаказуемым), а не работа
 * Payload с базой. Числа — у реальных товаров дев-каталога.
 */

const findMock = vi.fn()

vi.mock('@/lib/payload', () => ({
  getPayloadClient: async () => ({ find: findMock }) as unknown as Payload,
}))

const { POST } = await import('@/app/(frontend)/api/cart-revalidate/route')

type Doc = Record<string, unknown>

/** MO-AMBER-SALE: три варианта, у всех уценка. */
const amberSale = {
  slug: 'maison-orphee-amber-sale',
  isActive: true,
  variants: [
    { sku: 'MO-AS-05', price: 200, oldPrice: 250, isActive: true },
    { sku: 'MO-AS-10', price: 380, oldPrice: 450, isActive: true },
    { sku: 'MO-AS-30', price: 800, oldPrice: 1200, isActive: true },
  ],
}

/** MO-SIGNATURE-WOOD: без уценки. */
const signatureWood = {
  slug: 'maison-orphee-signature-wood',
  isActive: true,
  variants: [{ sku: 'MO-SW-05', price: 240, isActive: true }],
}

const giftCard = {
  slug: 'gift-card-500',
  isActive: true,
  variants: [{ sku: 'GC-500', amount: 500, isActive: true }],
}

/**
 * Заглушка: отдаёт документ по slug из переданного набора, отдельно для
 * товаров и подарочных позиций — роут ходит в две разные коллекции.
 */
const stubCatalog = (products: Doc[], gifts: Doc[] = []) => {
  findMock.mockImplementation(
    async ({ collection, where }: { collection: string; where: { slug: { equals: string } } }) => {
      const source = collection === 'gift-items' ? gifts : products
      const docs = source.filter((doc) => doc.slug === where.slug.equals)
      return { docs, totalDocs: docs.length }
    },
  )
}

const call = async (items: Doc[]) => {
  const response = await POST(
    new Request('http://localhost/api/cart-revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }),
  )
  return { status: response.status, body: await response.json() }
}

/** Позиция корзины в том виде, в каком её шлёт CartView. */
const line = (slug: string, sku: string, over: Doc = {}) => ({
  key: `${slug}:${sku}`,
  kind: 'product',
  slug,
  sku,
  ...over,
})

beforeEach(() => {
  findMock.mockReset()
})

describe('cart-revalidate — актуальные цены', () => {
  it('возвращает price и oldPrice по данным каталога, а не по присланным', () => {
    stubCatalog([amberSale])
    return call([line('maison-orphee-amber-sale', 'MO-AS-30')]).then(({ status, body }) => {
      expect(status).toBe(200)
      expect(body).toEqual({
        ok: true,
        items: [{ key: 'maison-orphee-amber-sale:MO-AS-30', price: 800, oldPrice: 1200 }],
      })
    })
  })

  it('товар без уценки отдаёт oldPrice: null, а не undefined', async () => {
    stubCatalog([signatureWood])
    const { body } = await call([line('maison-orphee-signature-wood', 'MO-SW-05')])
    expect(body.items[0]).toEqual({
      key: 'maison-orphee-signature-wood:MO-SW-05',
      price: 240,
      oldPrice: null,
    })
  })

  it('каждая позиция резолвится своим вариантом, порядок сохраняется', async () => {
    stubCatalog([amberSale, signatureWood])
    const { body } = await call([
      line('maison-orphee-amber-sale', 'MO-AS-05'),
      line('maison-orphee-signature-wood', 'MO-SW-05'),
      line('maison-orphee-amber-sale', 'MO-AS-10'),
    ])
    expect(body.items.map((item: Doc) => [item.price, item.oldPrice])).toEqual([
      [200, 250],
      [240, null],
      [380, 450],
    ])
  })

  it('пустая корзина в базу не ходит вообще', async () => {
    stubCatalog([amberSale])
    const { status, body } = await call([])
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, items: [] })
    expect(findMock).not.toHaveBeenCalled()
  })
})

describe('cart-revalidate — позиция больше не заказуема', () => {
  // Условия обязаны совпадать с buildItems() в order-request/route.ts:
  // иначе корзина показывала бы то, что сервер при оформлении отбросит.
  it('товар пропал из каталога', async () => {
    stubCatalog([])
    const { body } = await call([line('maison-orphee-amber-sale', 'MO-AS-05')])
    expect(body.items[0]).toEqual({
      key: 'maison-orphee-amber-sale:MO-AS-05',
      price: 0,
      oldPrice: null,
      gone: true,
    })
  })

  it('вариант отключён', async () => {
    stubCatalog([
      {
        ...amberSale,
        variants: [{ sku: 'MO-AS-05', price: 200, oldPrice: 250, isActive: false }],
      },
    ])
    const { body } = await call([line('maison-orphee-amber-sale', 'MO-AS-05')])
    expect(body.items[0].gone).toBe(true)
  })

  it('такого sku у товара нет', async () => {
    stubCatalog([amberSale])
    const { body } = await call([line('maison-orphee-amber-sale', 'MO-AS-99')])
    expect(body.items[0].gone).toBe(true)
  })

  it('пропавшая позиция не мешает остальным пересчитаться', async () => {
    stubCatalog([signatureWood])
    const { body } = await call([
      line('maison-orphee-amber-sale', 'MO-AS-05'),
      line('maison-orphee-signature-wood', 'MO-SW-05'),
    ])
    expect(body.items[0].gone).toBe(true)
    expect(body.items[1]).toEqual({
      key: 'maison-orphee-signature-wood:MO-SW-05',
      price: 240,
      oldPrice: null,
    })
  })
})

describe('cart-revalidate — подарочные позиции', () => {
  it('цена берётся из номинала, уценки у них не бывает', async () => {
    stubCatalog([], [giftCard])
    const { body } = await call([line('gift-card-500', 'GC-500', { kind: 'gift' })])
    expect(body.items[0]).toEqual({ key: 'gift-card-500:GC-500', price: 500, oldPrice: null })
  })

  it('выключенный gift-item помечается gone', async () => {
    stubCatalog([], [{ ...giftCard, isActive: false }])
    const { body } = await call([line('gift-card-500', 'GC-500', { kind: 'gift' })])
    expect(body.items[0].gone).toBe(true)
  })

  it('kind по умолчанию — product: старый клиент без поля ищется в товарах', async () => {
    stubCatalog([signatureWood], [giftCard])
    const { body } = await call([
      { key: 'k', slug: 'maison-orphee-signature-wood', sku: 'MO-SW-05' },
    ])
    expect(body.items[0].price).toBe(240)
    expect(findMock).toHaveBeenCalledWith(expect.objectContaining({ collection: 'products' }))
  })
})

describe('cart-revalidate — вход', () => {
  it('не-JSON отклоняется', async () => {
    stubCatalog([])
    const response = await POST(
      new Request('http://localhost/api/cart-revalidate', { method: 'POST', body: 'не json' }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error: 'bad_json' })
  })

  it('позиция без обязательных полей отклоняется целиком', async () => {
    stubCatalog([amberSale])
    const { status, body } = await call([{ key: 'k', slug: 'maison-orphee-amber-sale' }])
    expect(status).toBe(400)
    expect(body).toEqual({ ok: false, error: 'validation' })
    expect(findMock).not.toHaveBeenCalled()
  })

  it('корзина длиннее 100 позиций отклоняется, а не уходит в базу сотней запросов', async () => {
    stubCatalog([amberSale])
    const many = Array.from({ length: 101 }, (_, index) =>
      line('maison-orphee-amber-sale', `MO-AS-${index}`),
    )
    const { status } = await call(many)
    expect(status).toBe(400)
    expect(findMock).not.toHaveBeenCalled()
  })
})
