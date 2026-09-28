import type { FlagOption } from './searchParams'

/** Данные карточки товара — ровно то, что рисует эталон из WIREFRAMES.md §3. */
export type ProductCardData = {
  id: number | string
  slug: string
  title: string
  brandTitle: string
  family: string | null
  noteTitles: string[]
  volumes: string[]
  /**
   * Единственная цена карточки (фаза «новая логика цены», отменяет «вариант
   * B» фазы 4.5): цена САМОГО ДОРОГОГО активного варианта — денормализованный
   * `maxPrice`. Без «от» и без диапазона. По ней же работают сортировка по
   * цене и фильтр «цена от/до» (`SORT`/`filterWhere` в queries.ts).
   */
  displayPrice: number | null
  /** Старая цена того же варианта, что и displayPrice — только если он со скидкой. */
  oldPrice: number | null
  /** Бейдж скидки: процент того же варианта, что и displayPrice/oldPrice. */
  discountPercent: number | null
  image: { url: string; alt: string } | null
  inStock: boolean
  flags: FlagOption[]
}

/** Строка для подсчёта фасетов: только поля, по которым фильтруем. */
export type FacetRow = {
  id: number | string
  brand: string | null
  categories: (number | string)[]
  gender: string | null
  // Страна-производитель (фаза 11.1, задача 3) — заменила «Объём»/«Ноты».
  country: string | null
  /**
   * Цена, которую видно на карточке (`maxPrice`) — та же, по которой фильтрует
   * и сортирует листинг. Раньше здесь лежал `minPrice`, и счётчики фасета
   * цены расходились с выдачей (2026-09-28).
   */
  displayPrice: number | null
  flags: Record<FlagOption, boolean>
}

export type FacetCount = { value: string; label: string; count: number }

export type Facets = {
  brand: FacetCount[]
  gender: FacetCount[]
  country: FacetCount[]
  flags: FacetCount[]
  price: { min: number; max: number } | null
}
