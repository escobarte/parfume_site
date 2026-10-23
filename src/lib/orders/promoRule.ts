import { DECANT_VOLUMES } from '@/lib/catalog/volumes'

/**
 * Условия применения промокода (акция «от 3 отливантов −20%») — настройка
 * самого кода в /admin, не отдельная коллекция кампаний. Общая точка для
 * клиента (превью в корзине, `/api/promo-code-check`) и сервера
 * (`order-request/route.ts`) — как `priceLine` в `lib/pricing.ts`, чтобы
 * правило «подходит ли позиция» и «выполнено ли условие» не разъехалось
 * между двумя местами.
 */
export const PROMO_APPLIES_TO_VALUES = ['all', 'decants', 'volumes'] as const
export type PromoAppliesTo = (typeof PROMO_APPLIES_TO_VALUES)[number]

export type PromoRule = {
  /** Целое ≥1, пусто/`null` — условия по количеству нет. */
  minQuantity: number | null
  appliesTo: PromoAppliesTo
  /** Только для `appliesTo === 'volumes'` — иначе пустой список. */
  volumes: string[]
}

/** Старый код без новых полей — читается ровно как раньше: без условий. */
export const NO_PROMO_RULE: PromoRule = { minQuantity: null, appliesTo: 'all', volumes: [] }

/** Минимальная форма позиции, достаточная для проверки правила — что в корзине, что в заявке. */
export type PromoEligibleLine = {
  kind?: 'product' | 'gift' | null
  volume?: string | null
  qty: number
}

/** Подарочные позиции (сертификаты/Gift box) никогда не подходят под условие промокода. */
export function lineMatchesPromoRule(line: PromoEligibleLine, rule: PromoRule): boolean {
  if ((line.kind ?? 'product') === 'gift') return false
  if (rule.appliesTo === 'decants') {
    return typeof line.volume === 'string' && (DECANT_VOLUMES as readonly string[]).includes(line.volume)
  }
  if (rule.appliesTo === 'volumes') {
    return typeof line.volume === 'string' && rule.volumes.includes(line.volume)
  }
  return true
}

/** Сумма qty подходящих позиций — считаем по подходящим, а не по выигравшим. */
export function matchingQuantity(lines: PromoEligibleLine[], rule: PromoRule): number {
  return lines
    .filter((line) => lineMatchesPromoRule(line, rule))
    .reduce((sum, line) => sum + line.qty, 0)
}

/** Нет `minQuantity` — условия нет, правило всегда выполнено (старые коды). */
export function promoConditionMet(lines: PromoEligibleLine[], rule: PromoRule): boolean {
  if (!rule.minQuantity || rule.minQuantity < 1) return true
  return matchingQuantity(lines, rule) >= rule.minQuantity
}

type PromoRuleSource = {
  minQuantity?: number | null
  appliesTo?: string | null
  volumes?: (string | null | undefined)[] | null
}

/** Из записи промокода (БД/API) — нормализует чужие для режима поля сама, не доверяя источнику. */
export function promoRuleFrom(source: PromoRuleSource): PromoRule {
  const appliesTo: PromoAppliesTo =
    source.appliesTo === 'decants' || source.appliesTo === 'volumes' ? source.appliesTo : 'all'
  return {
    minQuantity:
      typeof source.minQuantity === 'number' && Number.isInteger(source.minQuantity) && source.minQuantity >= 1
        ? source.minQuantity
        : null,
    appliesTo,
    volumes:
      appliesTo === 'volumes'
        ? (source.volumes ?? []).filter((value): value is string => typeof value === 'string')
        : [],
  }
}
