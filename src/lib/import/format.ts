/** Список через запятую с обрезкой для длинных отчётов — используется CSV- и ZIP-отчётами. */
export const list = (items: string[], limit = 12): string =>
  items.length <= limit
    ? items.join(', ')
    : `${items.slice(0, limit).join(', ')} … и ещё ${items.length - limit}`

/**
 * Русская форма существительного по числу: 1 бренд · 2 бренда · 5 брендов.
 * Отчёт читает клиент, а «проставлены у 1 брендов» выглядит как баг.
 */
export const plural = (count: number, one: string, few: string, many: string): string => {
  const mod100 = Math.abs(count) % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = mod100 % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
