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

/*
 * `promoDiscountAmount(subtotal, percent)` удалена 2026-09-12 вместе со
 * старым правилом «промокод — процент от всей корзины». Скидка считается
 * попозиционно (`priceLine` ниже), одного агрегата на заказ больше нет.
 * Не путать с ОДНОИМЁННЫМ ПОЛЕМ `Orders.promoDiscountAmount` — оно живо,
 * хранит фактическую выгоду от кода и читается в CSV, письме и Telegram.
 */

/** Что победило на позиции: своя скидка товара, промокод или ничего. */
export type DiscountSource = 'product' | 'promo' | null

export type LinePricing = {
  /** Цена до всех скидок: oldPrice, если скидка реальна, иначе price. */
  base: number
  /** Собственная скидка товара, %. 0 — своей скидки нет. */
  productPercent: number
  /** Победивший процент (0 — скидок нет вовсе). */
  finalPercent: number
  /** Итоговая цена за единицу. */
  unitPrice: number
  source: DiscountSource
}

/**
 * Правило совмещения товарной скидки и промокода (2026-09-12, решение
 * владельца). Раньше промокод считался процентом от уже уценённой `price`,
 * и скидки перемножались. Теперь **выигрывает больший процент**, и считается
 * он от `oldPrice` — то есть скидки НЕ складываются и не перемножаются.
 *
 * Правило применяется ПОПОЗИЦИОННО: у разных товаров корзины своя скидка,
 * поэтому один и тот же промокод может выигрывать у одних позиций и
 * проигрывать другим.
 *
 * **Почему при победе товарной скидки возвращается сохранённая `price`, а не
 * `base × (1 − процент/100)`.** Процент округляется до целого
 * (`discountPercent`), и обратный пересчёт не возвращает исходную цену:
 * у реального товара 800/1200 процент равен 33, а `1200 × 0.67 = 804` —
 * цена выросла бы на 4 MDL без всякого промокода, просто от округления
 * (проверено на MO-AMBER-SALE: +4 на одном варианте, −2 на другом).
 * Поэтому из `base` пересчитывается только случай, когда промокод строго
 * превзошёл собственную скидку; во всех остальных цена берётся как есть.
 */
export function priceLine(
  price: number,
  oldPrice: number | null | undefined,
  promoPercent: number | null | undefined,
): LinePricing {
  const productPercent = discountPercent(price, oldPrice) ?? 0
  const promo = typeof promoPercent === 'number' && promoPercent > 0 ? promoPercent : 0
  // База — старая цена только если скидка реальна (oldPrice > price).
  const base = productPercent > 0 ? (oldPrice as number) : price

  // Строго больше: при равенстве выигрывает товар — промокод не тратится
  // ради нулевой выгоды.
  if (promo > productPercent) {
    return {
      base,
      productPercent,
      finalPercent: promo,
      unitPrice: Math.round((base * (100 - promo)) / 100),
      source: 'promo',
    }
  }

  return {
    base,
    productPercent,
    finalPercent: productPercent,
    unitPrice: price,
    source: productPercent > 0 ? 'product' : null,
  }
}
