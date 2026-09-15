/**
 * Раздел каталога (тип товара) — фиксированный список (фаза 11.1, задача 1;
 * `lipBalm` — 2026-09-15). Это НЕ «Кому» (пол) и не таксономия `categories`:
 * поле решает, в какой закрытый раздел левой навигации попадёт товар —
 * «Body Care» / «Lip balm», а парфюмерия (`perfume`) — в «For Her/Him/Kids»
 * по полу (см. `sections.ts`).
 *
 * Список вынесен сюда из `collections/Products.ts` по той же причине, что и
 * `countries.ts`: значениями пользуются и `select` в админке (ему нужны
 * русские подписи), и CSV-импортёр (колонка `product_category`), а импортёру
 * нельзя тянуть за собой конфиг коллекции целиком.
 *
 * В CSV и в админке канон один — латинское value; русские подписи
 * («Парфюмерия», «Уход за телом») импортом не принимаются, тот же принцип,
 * что у объёма и страны.
 */
export const PRODUCT_CATEGORIES = [
  { label: 'Парфюмерия', value: 'perfume' },
  { label: 'Уход за телом', value: 'bodyCare' },
  { label: 'Бальзам для губ', value: 'lipBalm' },
] as const

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]['value']

export const PRODUCT_CATEGORY_VALUES: readonly ProductCategory[] = PRODUCT_CATEGORIES.map(
  (category) => category.value,
)

export const isProductCategory = (value: unknown): value is ProductCategory =>
  typeof value === 'string' && (PRODUCT_CATEGORY_VALUES as readonly string[]).includes(value)

/**
 * Канон по «сырой» ячейке CSV: точное совпадение без учёта регистра и краевых
 * пробелов (` bodycare ` → `bodyCare`). Отдельная функция, а не `toLowerCase()`
 * + `isProductCategory`, как у страны: значения стран все в нижнем регистре, а
 * `bodyCare` — camelCase, и наивный `toLowerCase()` не дал бы канона обратно.
 */
export const canonicalProductCategory = (raw: string): ProductCategory | undefined => {
  const normalized = raw.trim().toLowerCase()
  return PRODUCT_CATEGORY_VALUES.find((value) => value.toLowerCase() === normalized)
}
