import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendPromoCodeEmail } from '@/lib/orders/email'
import {
  findPersonalCodeByEmail,
  generatePersonalCode,
  normalizePromoEmail,
} from '@/lib/orders/promo'
import { checkRateLimit, clientIp } from '@/lib/orders/rateLimit'
import { getPayloadClient } from '@/lib/payload'
import { routing } from '@/i18n/routing'

/**
 * Выдача персонального промокода из попапа «первая скидка» (2026-09-11).
 *
 * Код придумывает БЭКЕНД, не клиент: процент берётся из глобала
 * `promo-popup-settings`, а не из тела запроса — иначе скидку можно было бы
 * назначить себе самому, подменив запрос.
 *
 * Один email — один код. Повторная отправка формы тем же адресом не создаёт
 * второй код, а возвращает выданный ранее с флагом `existing: true` (в том
 * числе уже использованный: клиент увидит свой код, а не получит второй
 * бонус). Это же и есть защита от накрутки: телефон и имя на уникальность не
 * проверяются, ключ — только email.
 */
const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().default(''),
  locale: z.enum(routing.locales).optional(),
})

export async function POST(request: Request) {
  const ip = clientIp(request)
  // Свой scope: подбор/накрутка кодов не должна топить форму заявки и наоборот.
  const limit = checkRateLimit(ip, 'promo-popup')
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
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'form')
    return NextResponse.json({ ok: false, error: 'validation', fields }, { status: 400 })
  }

  const payload = await getPayloadClient()
  const settings = await payload.findGlobal({ slug: 'promo-popup-settings', depth: 0 })

  // Выключенный попап не должен раздавать коды через прямой запрос к API.
  if (!settings?.isEnabled) {
    return NextResponse.json({ ok: false, error: 'disabled' }, { status: 403 })
  }

  // Телефон обязателен, только если так настроено в админке — то же правило,
  // что рисует форму, проверяется и на сервере.
  if (settings.requirePhone && !parsed.data.phone) {
    return NextResponse.json({ ok: false, error: 'validation', fields: ['phone'] }, { status: 400 })
  }

  const email = normalizePromoEmail(parsed.data.email)

  // Письмо шлётся только при выдаче НОВОГО кода. Повторная отправка формы
  // тем же адресом письмо не дублирует: код и так показывается на экране, а
  // «переотправка по запросу» открыла бы почтовую бомбардировку чужого ящика
  // (лимит 5 запросов на IP за 10 минут её только ограничивает, но не
  // исключает). Если понадобится «прислать ещё раз» — это осознанная
  // отдельная ручка с собственным лимитом, а не побочный эффект этой.
  const existing = await findPersonalCodeByEmail(payload, email)
  if (existing) {
    return NextResponse.json({
      ok: true,
      existing: true,
      code: existing.code,
      percent: existing.percent,
      isUsed: Boolean(existing.isUsed),
    })
  }

  const code = await generatePersonalCode(payload)
  if (!code) {
    payload.logger.error('Не удалось сгенерировать уникальный персональный промокод')
    return NextResponse.json({ ok: false, error: 'generic' }, { status: 500 })
  }

  const percent = settings.discountPercent
  await payload.create({
    collection: 'promo-codes',
    data: {
      codeType: 'personal',
      code,
      percent,
      isActive: true,
      isUsed: false,
      email,
      phone: parsed.data.phone || undefined,
      customerName: parsed.data.name,
    },
  })

  // Письмо уходит ПОСЛЕ ответа и не задерживает попап: `after()` из
  // next/server, а не «висячий» промис — рантайм гарантирует, что работа
  // доживёт до конца, тогда как брошенный промис может быть убит вместе с
  // завершением запроса. Сбой почты на UX не влияет вообще: код клиент уже
  // видит на экране, письмо — дубль канала, а не единственная доставка.
  after(async () => {
    try {
      const mail = await sendPromoCodeEmail({
        to: email,
        name: parsed.data.name,
        code,
        percent,
        locale: parsed.data.locale ?? routing.defaultLocale,
      })
      if (mail.skipped) {
        payload.logger.info(`Письмо с промокодом ${code} пропущено: ${mail.skipped}`)
      } else if (!mail.ok) {
        payload.logger.error(`Письмо с промокодом ${code} не ушло: ${mail.error}`)
      }
    } catch (error) {
      // Отдельный catch: исключение внутри after() уже некому поймать —
      // ответ клиенту отправлен, всплывать ему некуда.
      payload.logger.error(
        `Письмо с промокодом ${code} упало: ${error instanceof Error ? error.message : error}`,
      )
    }
  })

  return NextResponse.json({ ok: true, existing: false, code, percent, isUsed: false })
}
