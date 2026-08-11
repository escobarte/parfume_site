import { NextResponse } from 'next/server'
import type { Order } from '@/payload-types'
import { buildOrderCsv } from '@/lib/orders/csv'
import { logNotifyReport, notifyOrder } from '@/lib/orders/notify'
import { checkRateLimit, clientIp } from '@/lib/orders/rateLimit'
import { orderRequestSchema, type OrderRequest } from '@/lib/orders/schema'
import { getPayloadClient } from '@/lib/payload'

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
  const items = await buildItems(payload, data)
  if (!items.length) {
    return NextResponse.json({ ok: false, error: 'items_unavailable' }, { status: 400 })
  }

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0)

  const order = (await payload.create({
    collection: 'orders',
    data: {
      status: 'new',
      locale: data.locale,
      source: data.source,
      customer: {
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        messenger: data.messenger,
      },
      comment: data.comment,
      items,
      total,
    },
  })) as Order

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

  for (const requested of data.items) {
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
  }

  return items
}
