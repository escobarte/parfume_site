import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolvePromoCode } from '@/lib/orders/promo'
import { getPayloadClient } from '@/lib/payload'

/**
 * Предпросмотр промокода (фаза 11.2, задача 7) — из корзины, ДО отправки
 * заявки. Отдаёт только `percent`: сумму скидки клиент считает сам по
 * текущей корзине (без подарочных товаров) — это превью, не источник
 * истины. Авторитетная переоценка — ещё раз, в `order-request/route.ts`
 * при реальном оформлении (тот же resolvePromoCode).
 *
 * **Лимита запросов здесь НЕТ — снят 2026-09-19, решение владельца.** Раньше
 * стоял тот же счётчик, что у формы заявки (scope `promo-code`, 5 запросов с
 * IP за 10 минут), и он ломал ровно тот сценарий, ради которого существует:
 * проверка идёт в ДВА шага (код, затем подтверждение телефона), поэтому две-
 * три попытки клиента выедали окно, и с шестого запроса эндпойнт отвечал 429
 * `rate_limit` ВМЕСТО настоящей причины. Человек с уже использованным кодом
 * видел «слишком много попыток» и не понимал, что код просто потрачен.
 *
 * Снятие безопасно по устройству ручки: она ничего не пишет в базу, ничего не
 * расходует и не гасит код (код гасится только успешным заказом), а отвечает
 * лишь «годен / не годен и почему». Лимиты соседних ручек НЕ тронуты и живут
 * в своих scope: `/api/promo-popup` (выдача кода — там лимит защищает чужой
 * почтовый ящик от рассылки), `/api/order-request` и `/api/order-status`.
 *
 * Чем сдержан перебор без лимита — см. `docs/GOTCHAS.md`: энтропия кода
 * (`WELCOME-` + 6 символов из 31-буквенного алфавита, ~887 млн вариантов),
 * обязательный второй шаг с телефоном у персонального кода и то, что скидка
 * всё равно переоценивается при оформлении конкретной заявки.
 */
const bodySchema = z.object({
  code: z.string().trim().min(1).max(50),
  /**
   * Второй шаг для персонального кода: телефон, на который он выдан.
   * Пусто/отсутствует — первый шаг, ответ будет `phone_required`.
   */
  phone: z.string().trim().max(40).optional(),
})

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

  const payload = await getPayloadClient()
  const result = await resolvePromoCode(payload, parsed.data.code, parsed.data.phone)

  if (!result.ok) {
    // `phone_required` — не отказ, а штатный промежуточный шаг: код найден и
    // годен, форме осталось спросить номер. Отдавать на него 404 было бы
    // враньём и мешало бы отличать его от «кода нет» в логах и мониторинге.
    // `phone_mismatch` — ошибка ввода, повторная попытка разрешена (человек
    // мог опечататься), поэтому 400, а не 404.
    const status = result.error === 'phone_required' ? 200 : result.error === 'phone_mismatch' ? 400 : 404
    return NextResponse.json(result, { status })
  }
  return NextResponse.json(result)
}
