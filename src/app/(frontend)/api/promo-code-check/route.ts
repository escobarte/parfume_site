import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, clientIp } from '@/lib/orders/rateLimit'
import { resolvePromoCode } from '@/lib/orders/promo'
import { getPayloadClient } from '@/lib/payload'

/**
 * Предпросмотр промокода (фаза 11.2, задача 7) — из корзины, ДО отправки
 * заявки. Отдаёт только `percent`: сумму скидки клиент считает сам по
 * текущей корзине (без подарочных товаров) — это превью, не источник
 * истины. Авторитетная переоценка — ещё раз, в `order-request/route.ts`
 * при реальном оформлении (тот же resolvePromoCode).
 */
const bodySchema = z.object({ code: z.string().trim().min(1).max(50) })

export async function POST(request: Request) {
  const ip = clientIp(request)
  // Отдельный счётчик от формы заявки и поиска статуса — свой scope, чтобы
  // подбор кода перебором не топил и не был потоплен другими лимитами.
  const limit = checkRateLimit(ip, 'promo-code')
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

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation' }, { status: 400 })
  }

  const payload = await getPayloadClient()
  const result = await resolvePromoCode(payload, parsed.data.code)

  if (!result.ok) {
    return NextResponse.json(result, { status: 404 })
  }
  return NextResponse.json(result)
}
