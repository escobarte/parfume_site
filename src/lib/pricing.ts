/**
 * Скидка вычисляется из уже существующих полей варианта (price/oldPrice) —
 * схема не меняется (см. фазу 4.5 в docs/PLAN.md). Общая точка для хука
 * денормализации (сервер) и карточки/кнопки покупки (клиент), чтобы процент
 * округлялся одинаково везде.
 */
export function discountPercent(
  price: number | null | undefined,
  oldPrice: number | null | undefined,
): number | null {
  if (typeof price !== 'number' || typeof oldPrice !== 'number') return null
  if (oldPrice <= price) return null
  return Math.round((1 - price / oldPrice) * 100)
}

/**
 * Сумма промокодовой скидки (фаза 11.2, задача 7) — только процент, округление
 * до целого MDL, как и остальные суммы в проекте. `discountableSubtotal` уже
 * не должен включать подарочные товары — это фильтрует вызывающий код
 * (`buildItems` в order-request/route.ts, по `kind !== 'gift'`), не эта функция.
 */
export function promoDiscountAmount(discountableSubtotal: number, percent: number): number {
  return Math.round((discountableSubtotal * percent) / 100)
}
