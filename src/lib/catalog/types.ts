import type { FlagOption } from './searchParams'

/** Данные карточки товара — ровно то, что рисует эталон из WIREFRAMES.md §3. */
export type ProductCardData = {
  id: number | string
  slug: string
  title: string
  brandTitle: string
  family: string | null
  noteTitles: string[]
  volumes: number[]
  /**
   * Вариант B (фаза 4.5): если есть уценённые варианты — цена САМОГО
   * уценённого из них (может быть не минимальным объёмом товара). Если
   * уценённых нет — обычная минимальная цена по вариантам.
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
  minPrice: number | null
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
