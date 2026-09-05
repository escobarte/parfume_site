import { NextResponse } from 'next/server'
import type { Order } from '@/payload-types'
import { buildOrderCsv } from '@/lib/orders/csv'
import { logNotifyReport, notifyOrder } from '@/lib/orders/notify'
import { claimPromoCode, resolvePromoCode } from '@/lib/orders/promo'
import { checkRateLimit, clientIp } from '@/lib/orders/rateLimit'
import { orderRequestSchema, type OrderRequest } from '@/lib/orders/schema'
import { getPayloadClient } from '@/lib/payload'
import { promoDiscountAmount } from '@/lib/pricing'

/**
 * Приём заявки. Путь намеренно НЕ `/api/orders`: там живёт REST-эндпоинт
 * коллекции Payload, и статический роут Next перекрыл бы его — админка
 * перестала бы читать заявки (проверено: GET /api/orders отдавал 405).
 *
 * Логика: валидация → снапшот позиций по данным БД → заказ в Payload →
 * CSV → уведомления. Заявка считается принятой, как только она в базе;
 * проблемы с Telegram или почтой в ответ клиенту не протекают.
 */
export async function POST(request: Request) {
  const ip = clientIp(request)
  const limit = checkRateLimit(ip)
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limit' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }

  let payloadBody: unknown
  try {
    payloadBody = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 })
  }

  const parsed = orderRequestSchema.safeParse(payloadBody)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'form')
    // Ботам, попавшимся на honeypot, отвечаем как обычной ошибкой формы.
    return NextResponse.json({ ok: false, error: 'validation', fields }, { status: 400 })
  }

  const data: OrderRequest = parsed.data
  const payload = await getPayloadClient()

  // Цены и названия берём из БД, а не из тела запроса: клиент может прислать
  // что угодно, а в заявке должен лежать честный снапшот каталога.
  const { items, discountableSubtotal } = await buildItems(payload, data)
  if (!items.length) {
    return NextResponse.json({ ok: false, error: 'items_unavailable' }, { status: 400 })
  }

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)

  // Промокод (фаза 11.2, задача 7) — переоценивается заново здесь, клиентский
  // percent из /api/promo-code-check не принимается вообще (только сам код).
  // Невалидный/протухший между проверкой и оформлением код — не тихо
  // игнорируется, а отклоняет заявку явной ошибкой (не молчать, по заданию).
  let promo: Awaited<ReturnType<typeof resolvePromoCode>> | null = null
  let discount = 0
  if (data.promoCode) {
    promo = await resolvePromoCode(payload, data.promoCode)
    if (!promo.ok) {
      return NextResponse.json(
        { ok: false, error: 'promo_invalid', promoError: promo.error },
        { status: 400 },
      )
    }
    discount = promoDiscountAmount(discountableSubtotal, promo.percent)
  }

  const total = subtotal - discount

  const order = (await payload.create({
    collection: 'orders',
    data: {
      status: 'new',
      locale: data.locale,
      source: data.source,
      checkoutMode: data.checkoutMode,
      deliveryMethod: data.deliveryMethod,
      paymentMethod: data.paymentMethod,
      customer: {
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        address: data.address || undefined,
        messenger: data.messenger,
      },
      comment: data.comment,
      items,
      total,
      ...(promo?.ok
        ? { promoCode: promo.code, promoDiscountPercent: promo.percent, promoDiscountAmount: discount }
        : {}),
    },
  })) as Order

  // Код помечается использованным ТОЛЬКО после того, как заказ реально создан
  // (не в момент проверки) — см. комментарий в src/lib/orders/promo.ts.
  if (promo?.ok) {
    const claimed = await claimPromoCode(payload, promo.id, order.id)
    if (!claimed) {
      // Крайне маловероятная гонка (два одновременных оформления одним кодом)
      // — заказ уже создан со скидкой, откатывать его ради этого не стоит,
      // просто фиксируем в логе (см. GOTCHAS.md).
      payload.logger.warn(`Промокод ${promo.code} не удалось пометить использованным (гонка?)`)
    }
  }

  const csv = buildOrderCsv(order)
  await payload.update({
    collection: 'orders',
    id: order.id,
    data: { exportCsv: csv },
  })

  const report = await notifyOrder(order, csv)
  logNotifyReport(payload.logger, order, report)

  return NextResponse.json({
    ok: true,
    orderNumber: order.orderNumber,
    dryRun: report.dryRun,
  })
}

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>

async function buildItems(payload: PayloadClient, data: OrderRequest) {
  const items: NonNullable<Order['items']> = []
  // Скидка по промокоду не действует на подарочные сертификаты/Gift box
  // (фаза 11.2, задача 7) — считаем базу скидки отдельно, не по всем items.
  let discountableSubtotal = 0

  for (const requested of data.items) {
    if (requested.kind === 'gift') {
      // Подарочный товар (фаза 11.1, задача 2) — та же переоценка по слагу
      // и SKU, что у обычного товара ниже, только другая коллекция и без
      // ml-объёма. `product` (relationship) намеренно не проставляется:
      // связь необязательна (снапшот остаётся честным и без неё), заводить
      // полиморфную `relationTo` ради одного поля админ-ссылки — лишнее.
      const { docs } = await payload.find({
        collection: 'gift-items',
        locale: data.locale,
        depth: 0,
        limit: 1,
        where: { slug: { equals: requested.slug } },
      })

      const giftItem = docs[0]
      const variant = giftItem?.variants?.find((candidate) => candidate.sku === requested.sku)
      if (!giftItem || giftItem.isActive === false || !variant || variant.isActive === false) {
        continue
      }

      const qty = requested.qty
      items.push({
        title: giftItem.title,
        brandTitle: '',
        sku: variant.sku,
        price: variant.amount,
        qty,
        lineTotal: variant.amount * qty,
      })
      continue
    }

    const { docs } = await payload.find({
      collection: 'products',
      locale: data.locale,
      depth: 1,
      limit: 1,
      where: { slug: { equals: requested.slug } },
    })

    const product = docs[0]
    const variant = product?.variants?.find((candidate) => candidate.sku === requested.sku)
    // Товар пропал или вариант отключили, пока корзина лежала в localStorage.
    if (!product || !variant || variant.isActive === false) continue

    const brand = typeof product.brand === 'object' && product.brand ? product.brand.title : ''
    const qty = requested.qty

    items.push({
      product: product.id,
      title: product.title,
      brandTitle: brand,
      sku: variant.sku,
      volume: variant.volume,
      price: variant.price,
      qty,
      lineTotal: variant.price * qty,
    })
    discountableSubtotal += variant.price * qty
  }

  return { items, discountableSubtotal }
}
