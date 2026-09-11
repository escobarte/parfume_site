import type { Payload } from 'payload'
import type { PromoCodeType } from '@/collections/PromoCodes'
import { normalizePhone } from '@/lib/orders/schema'

/**
 * Промокоды — общая точка резолва для проверки (`/api/promo-code-check`,
 * только предпросмотр) и для оформления заявки (`order-request/route.ts`,
 * авторитетная переоценка). Одна и та же функция, чтобы правила не
 * разъехались между двумя местами.
 *
 * С 2026-09-11 правила зависят от типа кода (см. `PromoCodes.ts`):
 *
 * | тип        | isActive | isUsed              | expiresAt          |
 * |------------|----------|---------------------|--------------------|
 * | `personal` | да       | да (одноразовый)    | **не проверяется** |
 * | `public`   | да       | **не проверяется**  | да (обязателен)    |
 */

export type PromoCheckError =
  | 'not_found'
  | 'inactive'
  | 'used'
  | 'expired'
  /** Персональный код найден, но нужен телефон — это ШАГ, а не отказ. */
  | 'phone_required'
  | 'phone_mismatch'

export type PromoCheckResult =
  | { ok: true; id: number | string; code: string; percent: number; codeType: PromoCodeType }
  /** `code` заполняется только у `phone_required`: экрану нужно его показать. */
  | { ok: false; error: PromoCheckError; code?: string }

/** Регистронезависимость (assumption клиента) — верхний регистр, не ILIKE на каждый запрос. */
export const normalizePromoCode = (value: string): string => value.trim().toUpperCase()

/** Email как ключ поиска персонального кода: регистр в почте не значим. */
export const normalizePromoEmail = (value: string): string => value.trim().toLowerCase()

/**
 * Сверка телефона для персонального кода (2026-09-11). Оба номера приводятся
 * к `+373XXXXXXXX` тем же `normalizePhone`, что и форма заявки, — клиент
 * может ввести номер со скобками, пробелами и без кода страны.
 *
 * Пустой телефон В БАЗЕ означает «сверять не с чем»: такие коды остались от
 * времён до типизации (миграция пометила их `personal`, но email/phone у них
 * нет). Требовать у них номер — значит сломать их навсегда, поэтому сверка
 * пропускается. У кодов из попапа телефон есть всегда — схема требует.
 */
const phoneMatches = (stored: string | null | undefined, given: string): boolean => {
  const expected = (stored ?? '').trim()
  if (!expected) return true
  return normalizePhone(expected) === normalizePhone(given)
}

/**
 * @param rawPhone телефон для сверки персонального кода. `undefined` на шаге
 * превью в корзине — тогда вернётся `phone_required`, и фронт покажет поле
 * подтверждения. Для `public` параметр игнорируется полностью.
 */
export async function resolvePromoCode(
  payload: Payload,
  rawCode: string,
  rawPhone?: string,
): Promise<PromoCheckResult> {
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

  // Тип по умолчанию — personal: так ведут себя коды, заведённые ДО появления
  // типов (миграция проставила всем 'personal', но подстраховка дешёвая).
  const codeType: PromoCodeType = promo.codeType === 'public' ? 'public' : 'personal'

  if (codeType === 'personal') {
    // Одноразовый и бессрочный: срок действия у персонального кода
    // намеренно не проверяется, даже если поле чем-то заполнено.
    if (promo.isUsed) return { ok: false, error: 'used' }

    // Телефон сверяется ПОСЛЕ проверки самого кода: иначе по ответу можно
    // было бы отличить «кода нет» от «код есть, но номер не тот» и
    // перебирать номера к чужому коду.
    const phone = rawPhone?.trim()
    if (!phone) return { ok: false, error: 'phone_required', code: promo.code }
    if (!phoneMatches(promo.phone, phone)) return { ok: false, error: 'phone_mismatch' }
  } else {
    // Многоразовый, но со сроком. Пустой expiresAt у публичного кода схема
    // не даёт сохранить; если он всё же пуст (правка мимо админки) — считаем
    // код просроченным, а не бессрочным: безопасный исход.
    if (!promo.expiresAt) return { ok: false, error: 'expired' }
    if (new Date(promo.expiresAt).getTime() < Date.now()) return { ok: false, error: 'expired' }
  }

  return { ok: true, id: promo.id, code: promo.code, percent: promo.percent, codeType }
}

/**
 * Выставляет код использованным ТОЛЬКО после успешного создания заказа
 * (не в момент проверки — иначе код «сгорал» бы у передумавшего клиента).
 * Условие `isUsed: { equals: false }` в `where` — однократный UPDATE атомарен
 * на уровне Postgres и снижает (не устраняет полностью) гонку одновременного
 * использования одного кода двумя заявками — см. GOTCHAS.md.
 *
 * Вызывать только для `personal`: публичный код многоразовый, помечать его
 * использованным нельзя — он перестал бы работать после первой же заявки.
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

/** Префикс персонального кода — вынесен, чтобы не разъезжался с тестами. */
export const PERSONAL_CODE_PREFIX = 'WELCOME'

/**
 * Алфавит без визуально спорных символов: нет 0/O, 1/I/L — код диктуют по
 * телефону и переписывают с экрана, а «WELCOME-I0OL1» гарантирует поддержку.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LENGTH = 6

const randomCode = (): string => {
  let suffix = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return `${PERSONAL_CODE_PREFIX}-${suffix}`
}

/**
 * Уникальный персональный код. Уникальность проверяется запросом перед
 * сохранением, а не одной лишь надеждой на 31^6 (~887 млн) комбинаций:
 * на коде висит unique-индекс, и коллизия иначе вылезла бы пользователю
 * ошибкой сохранения. Больше `attempts` попыток не делаем — если алфавит
 * вдруг исчерпан, честная ошибка лучше вечного цикла.
 */
export async function generatePersonalCode(payload: Payload, attempts = 8): Promise<string | null> {
  for (let i = 0; i < attempts; i += 1) {
    const code = randomCode()
    const { totalDocs } = await payload.find({
      collection: 'promo-codes',
      where: { code: { equals: code } },
      limit: 1,
      depth: 0,
    })
    if (totalDocs === 0) return code
  }
  return null
}

/**
 * Ранее выданный персональный код этого email. Один email — один код: повтор
 * формы попапа не плодит дубликаты, а возвращает то же самое (в том числе
 * уже использованное — клиент увидит свой код, а не получит второй бонус).
 */
export async function findPersonalCodeByEmail(payload: Payload, rawEmail: string) {
  const email = normalizePromoEmail(rawEmail)
  if (!email) return null

  const { docs } = await payload.find({
    collection: 'promo-codes',
    where: { and: [{ codeType: { equals: 'personal' } }, { email: { equals: email } }] },
    limit: 1,
    sort: '-createdAt',
  })
  return docs[0] ?? null
}
