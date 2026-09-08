/**
 * Страна-производитель — фиксированный список из трёх значений (фаза 11.1,
 * задача 3). Единственный источник истины: отсюда берут и `select` в
 * `Products.ts` (ему нужны русские подписи для админки), и порядок фасета
 * каталога (`facets.ts`), и импортёр CSV (колонка `country_of_origin`).
 *
 * В отличие от `volumes.ts` пары {label, value} здесь обязательны: подпись
 * русская, а value — латиницей, совпасть они не могут. В CSV и в URL-фасете
 * используется именно value — синонимы и русские подписи не принимаются,
 * канон один (решение владельца, тот же принцип, что у объёма).
 */
export const PRODUCT_COUNTRIES = [
  { label: 'ОАЭ', value: 'uae' },
  { label: 'Европа', value: 'europe' },
  { label: 'США', value: 'usa' },
] as const

export type ProductCountry = (typeof PRODUCT_COUNTRIES)[number]['value']

export const PRODUCT_COUNTRY_VALUES: readonly ProductCountry[] = PRODUCT_COUNTRIES.map(
  (country) => country.value,
)

export const isProductCountry = (value: unknown): value is ProductCountry =>
  typeof value === 'string' && (PRODUCT_COUNTRY_VALUES as readonly string[]).includes(value)
