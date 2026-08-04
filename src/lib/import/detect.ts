import type { ImportKind } from './types'

const has = (header: string[], ...columns: string[]) => columns.every((c) => header.includes(c))

/**
 * Вид файла определяется по заголовку. Порядок проверок важен:
 * переводы содержат handle+title, как и товарные форматы, но отличаются колонкой locale.
 */
export function detectKind(header: string[]): ImportKind | null {
  if (has(header, 'handle', 'locale')) return 'translations'
  if (has(header, 'handle', 'variants')) return 'products-b'
  if (has(header, 'handle', 'sku', 'price')) return 'products-a'
  if (has(header, 'sku') && (header.includes('price') || header.includes('stock'))) return 'prices'
  return null
}

export const KIND_LABELS: Record<ImportKind, string> = {
  'products-a': 'товары, формат A (строка = вариант)',
  'products-b': 'товары, формат B (варианты JSON-колонкой)',
  prices: 'лёгкий прайс (sku, price, stock)',
  translations: 'переводы (handle, locale, title, description)',
}
