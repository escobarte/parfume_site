/**
 * Общее правило активности по датам для промо-баннера и акционного hero
 * (PLAN.md §4.5). Обе границы необязательны: отсутствующая — не ограничивает.
 * Сравнение включительное — акция видна весь endDate целиком.
 */
export type DateWindow = {
  startDate?: string | null
  endDate?: string | null
}

export function isWithinWindow(window: DateWindow, now: Date = new Date()): boolean {
  if (window.startDate && now < new Date(window.startDate)) return false
  if (window.endDate && now > new Date(window.endDate)) return false
  return true
}
