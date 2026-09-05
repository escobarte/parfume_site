import type { Payload } from 'payload'

/**
 * Промокоды (фаза 11.2, задача 7) — общая точка резолва для проверки
 * (`/api/promo-code-check`, только предпросмотр) и для оформления заявки
 * (`order-request/route.ts`, авторитетная переоценка). Одна и та же функция,
 * чтобы правила «валиден/активен/не использован/не истёк» не разъехались
 * между двумя местами.
 */

export type PromoCheckResult =
  | { ok: true; id: number | string; code: string; percent: number }
  | { ok: false; error: 'not_found' | 'inactive' | 'used' | 'expired' }

/** Регистронезависимость (assumption клиента) — верхний регистр, не ILIKE на каждый запрос. */
export const normalizePromoCode = (value: string): string => value.trim().toUpperCase()

export async function resolvePromoCode(payload: Payload, rawCode: string): Promise<PromoCheckResult> {
  const code = normalizePromoCode(rawCode)
  if (!code) return { ok: false, error: 'not_found' }

  const { docs } = await payload.find({
    collection: 'promo-codes',
    where: { code: { equals: code } },
    limit: 1,
  })

  const promo = docs[0]
  if (!promo) return { ok: false, error: 'not_found' }
  if (!promo.isActive) return { ok: false, error: 'inactive' }
  if (promo.isUsed) return { ok: false, error: 'used' }
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: 'expired' }
  }

  return { ok: true, id: promo.id, code: promo.code, percent: promo.percent }
}

/**
 * Выставляет код использованным ТОЛЬКО после успешного создания заказа
 * (не в момент проверки — иначе код «сгорал» бы у передумавшего клиента).
 * Условие `isUsed: { equals: false }` в `where` — однократный UPDATE атомарен
 * на уровне Postgres и снижает (не устраняет полностью) гонку одновременного
 * использования одного кода двумя заявками — см. GOTCHAS.md.
 */
export async function claimPromoCode(
  payload: Payload,
  promoId: number | string,
  orderId: number,
): Promise<boolean> {
  const result = await payload.update({
    collection: 'promo-codes',
    where: { and: [{ id: { equals: promoId } }, { isUsed: { equals: false } }] },
    data: { isUsed: true, usedInOrder: orderId },
  })
  return result.docs.length > 0
}
