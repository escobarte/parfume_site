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
  minPrice: number | null
  image: { url: string; alt: string } | null
  inStock: boolean
  flags: FlagOption[]
}

/** Строка для подсчёта фасетов: только поля, по которым фильтруем. */
export type FacetRow = {
  id: number | string
  brand: string | null
  categories: (number | string)[]
  notes: string[]
  gender: string | null
  volumes: number[]
  minPrice: number | null
  flags: Record<FlagOption, boolean>
}

export type FacetCount = { value: string; label: string; count: number }

export type Facets = {
  brand: FacetCount[]
  gender: FacetCount[]
  notes: FacetCount[]
  volume: FacetCount[]
  flags: FacetCount[]
  price: { min: number; max: number } | null
}
