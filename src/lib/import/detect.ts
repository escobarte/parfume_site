import type { ImportKind } from './types'

const has = (header: string[], ...columns: string[]) => columns.every((c) => header.includes(c))

/**
 * Вид файла определяется по заголовку. Порядок проверок важен:
 * переводы содержат handle, как и товарные форматы, но отличаются колонкой locale.
 */
export function detectKind(header: string[]): ImportKind | null {
  if (has(header, 'handle', 'locale')) return 'translations'
  if (has(header, 'handle', 'variants')) return 'products-b'
  if (has(header, 'handle', 'sku', 'price')) return 'products-a'
  if (has(header, 'sku') && (header.includes('price') || header.includes('stock'))) return 'prices'
  return null
}

export const DESCRIPTION_LOCALES = ['ro', 'ru', 'en'] as const
export type DescriptionLocale = (typeof DESCRIPTION_LOCALES)[number]

/**
 * Форматы A/B: если в заголовке есть хотя бы одна из description_ro /
 * description_ru / description_en — файл несёт описания сразу на нескольких
 * языках за один прогон, независимо от выбранной "Локали контента".
 * Определяется по заголовку файла целиком, не по конкретной строке.
 */
export function detectDescriptionLocales(header: string[]): DescriptionLocale[] {
  return DESCRIPTION_LOCALES.filter((locale) => header.includes(`description_${locale}`))
}

export const KIND_LABELS: Record<ImportKind, string> = {
  'products-a': 'товары, формат A (строка = вариант)',
  'products-b': 'товары, формат B (варианты JSON-колонкой)',
  prices: 'лёгкий прайс (sku, price, stock)',
  translations: 'переводы (handle, locale, description)',
}
