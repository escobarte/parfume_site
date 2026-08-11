import { NextResponse } from 'next/server'
import { checkRateLimit, clientIp } from '@/lib/orders/rateLimit'
import { orderLookupSchema } from '@/lib/orders/schema'
import { getPayloadClient } from '@/lib/payload'

/**
 * Запасной путь страницы статуса заказа (PLAN.md §9, 4.7.2): токен потерян
 * или письма не было (email в форме заявки необязателен) — ищем по номеру
 * заказа И телефону вместе. Отдаём только токен, не данные заказа: клиент
 * переходит на /order/<token>, которая уже показывает состав/статус/сумму.
 *
 * Безопасность — без исключений: доступ только по токену ИЛИ по паре
 * номер+телефон одновременно. Поиск по одному лишь номеру запрещён здесь на
 * уровне API (не только скрыт в UI, см. orderLookupSchema — phone required),
 * и `where` ниже ВСЕГДА требует оба поля разом — иначе номер, который
 * короткий и подбираемый, открыл бы перебором чужие персональные данные.
 */
export async function POST(request: Request) {
  const ip = clientIp(request)
  // Отдельный счётчик от формы заявки (checkRateLimit(ip, 'order-status')) —
  // тот же механизм (checkRateLimit/clientIp, фаза 4.2), независимый лимит.
  const limit = checkRateLimit(ip, 'order-status')
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limit' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 })
  }

  const parsed = orderLookupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation' }, { status: 400 })
  }

  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'orders',
    where: {
      and: [
        { orderNumber: { equals: parsed.data.orderNumber } },
        { 'customer.phone': { equals: parsed.data.phone } },
      ],
    },
    limit: 1,
    depth: 0,
  })

  const order = docs[0]
  if (!order) {
    // Одна и та же ошибка независимо от того, что именно не совпало —
    // номер или телефон: иначе можно было бы перебором подтвердить номер.
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, token: order.statusToken })
}
