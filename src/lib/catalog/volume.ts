/**
 * Объём товара — фиксированный список из 5 значений (ПРОМПТ 12-дополнение),
 * не свободное число в мл. Модуль без Payload-импортов — безопасен и для
 * серверных, и для клиентских ('use client') компонентов.
 *
 * Подписи не переводятся по локалям (как `Catalog.flags.hasDiscount` = Sale,
 * `CatalogNav.giftBox` = Gift box — BRAND.md §7): «3 ml»/«Travel Size»/
 * «Full Size» одинаковы на RO/RU/EN.
 */
export const VOLUME_VALUES = ['3ml', '5ml', '10ml', 'travel', 'full'] as const
export type VolumeValue = (typeof VOLUME_VALUES)[number]

/** Порядок отображения — не порядок объявления enum в БД, а фиксированный UX-порядок. */
export const VOLUME_ORDER: Record<VolumeValue, number> = Object.fromEntries(
  VOLUME_VALUES.map((value, index) => [value, index]),
) as Record<VolumeValue, number>

export const VOLUME_LABELS: Record<VolumeValue, string> = {
  '3ml': '3 ml',
  '5ml': '5 ml',
  '10ml': '10 ml',
  travel: 'Travel Size',
  full: 'Full Size',
}

export const isVolumeValue = (value: string): value is VolumeValue =>
  (VOLUME_VALUES as readonly string[]).includes(value)

/** Сортировка по фиксированному UX-порядку, не по алфавиту/числу. */
export function sortByVolume<T>(items: T[], getVolume: (item: T) => VolumeValue): T[] {
  return [...items].sort((a, b) => VOLUME_ORDER[getVolume(a)] - VOLUME_ORDER[getVolume(b)])
}

/**
 * CSV/строковый токен → канонический код объёма, либо `null`, если не
 * распознан (плохое значение — предупреждение в отчёте импорта, не ошибка
 * формата, см. src/lib/import/applyProducts.ts).
 */
export function resolveVolumeToken(raw: string): VolumeValue | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (['3', '3ml', '3 ml'].includes(normalized)) return '3ml'
  if (['5', '5ml', '5 ml'].includes(normalized)) return '5ml'
  if (['10', '10ml', '10 ml'].includes(normalized)) return '10ml'
  if (['travel', 'travel size', 'travelsize'].includes(normalized)) return 'travel'
  if (['full', 'full size', 'fullsize'].includes(normalized)) return 'full'
  return null
}

/**
 * Миграционное правило (ПРОМПТ 12-дополнение) для переноса старых
 * произвольных чисел мл в фиксированный список — используется и в SQL
 * миграции (как CASE WHEN, см. комментарий там), и здесь для тестов/сверки:
 * точное совпадение 3/5/10 — прямое; >10 — всегда Full Size (Travel Size
 * миграция никогда не проставляет сама); всё, что между — к ближайшему из
 * {3,5,10} по границам 4 и 7 (середины между 3–5 и 5–10, округление вниз).
 */
export function migrateLegacyVolume(oldMl: number): VolumeValue {
  if (oldMl > 10) return 'full'
  if (oldMl <= 4) return '3ml'
  if (oldMl <= 7) return '5ml'
  return '10ml'
}
