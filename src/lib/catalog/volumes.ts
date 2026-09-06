/**
 * Объём товара — фиксированный список из ровно 5 значений (ПРОМПТ «новая
 * модель объёма»). Единственный источник истины: значение и подпись на
 * витрине/в /admin/в CSV совпадают буквально (label === value), поэтому
 * хватает одного массива строк, а не пар {label, value}, как у GENDERS.
 * Порядок массива — канонический порядок отображения (кнопки на карточке
 * товара и на странице товара идут строго в этом порядке).
 */
export const PRODUCT_VOLUMES = ['3ml', '5ml', '10ml', 'Travel Size', 'Full Size'] as const

export type ProductVolume = (typeof PRODUCT_VOLUMES)[number]

export const isProductVolume = (value: unknown): value is ProductVolume =>
  typeof value === 'string' && (PRODUCT_VOLUMES as readonly string[]).includes(value)

/** Индекс в каноническом порядке — для сортировки; -1 у значения вне списка. */
export const volumeOrder = (value: string): number => PRODUCT_VOLUMES.indexOf(value as ProductVolume)
