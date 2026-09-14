import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayloadClient } from '@/lib/payload'

/**
 * Актуальные цены позиций корзины (2026-09-12).
 *
 * Корзина живёт в `localStorage`, и цена в ней зафиксирована на момент
 * добавления. Пока товар лежит, каталог мог подорожать, подешеветь или
 * уйти со скидки — клиент видел одно, а сервер при оформлении пересчитывал
 * по своим данным (`buildItems`) и молча выставлял другую сумму. Этот роут
 * закрывает разрыв: корзина перед показом итогов спрашивает правду.
 *
 * Лимита нет намеренно: это чтение без побочных эффектов, вызывается при
 * каждом открытии корзины, и счётчик по IP только мешал бы обычной работе
 * (в отличие от промокодов, где перебор — реальный риск).
 *
 * Возвращаются ТОЛЬКО цены. Промокод, скидки и итог считает клиент и
 * заново — сервер при оформлении заявки: этот роут не источник истины для
 * денег, а способ показать клиенту то же, что увидит сервер.
 */
const bodySchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        kind: z.enum(['product', 'gift']).optional(),
        slug: z.string().min(1).max(200),
        sku: z.string().min(1).max(100),
      }),
    )
    .max(100),
})

type Result = { key: string; price: number; oldPrice: number | null; gone?: boolean }

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation' }, { status: 400 })
  }
  if (parsed.data.items.length === 0) return NextResponse.json({ ok: true, items: [] })

  const payload = await getPayloadClient()
  const items: Result[] = []

  for (const requested of parsed.data.items) {
    if ((requested.kind ?? 'product') === 'gift') {
      const { docs } = await payload.find({
        collection: 'gift-items',
        depth: 0,
        limit: 1,
        where: { slug: { equals: requested.slug } },
      })
      const gift = docs[0]
      const variant = gift?.variants?.find((candidate) => candidate.sku === requested.sku)
      if (!gift || gift.isActive === false || !variant || variant.isActive === false) {
        items.push({ key: requested.key, price: 0, oldPrice: null, gone: true })
        continue
      }
      // У подарочных позиций уценки не бывает — номинал и есть цена.
      items.push({ key: requested.key, price: variant.amount, oldPrice: null })
      continue
    }

    const { docs } = await payload.find({
      collection: 'products',
      depth: 0,
      limit: 1,
      where: { slug: { equals: requested.slug } },
    })
    const product = docs[0]
    const variant = product?.variants?.find((candidate) => candidate.sku === requested.sku)
    // Те же условия «позиция больше не заказуема», что в buildItems при
    // оформлении, — иначе корзина показывала бы то, что сервер отбросит.
    if (!product || !variant || variant.isActive === false) {
      items.push({ key: requested.key, price: 0, oldPrice: null, gone: true })
      continue
    }

    items.push({ key: requested.key, price: variant.price, oldPrice: variant.oldPrice ?? null })
  }

  return NextResponse.json({ ok: true, items })
}
