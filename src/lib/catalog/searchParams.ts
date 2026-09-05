import {
  createLoader,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server'

/**
 * Состояние каталога целиком живёт в URL (PLAN.md §5.3): ссылку можно
 * переслать и открыть в новой вкладке — фильтры, сортировка и «показать ещё»
 * восстановятся один в один. Парсеры общие для сервера и клиента.
 */
export const SORT_OPTIONS = ['new', 'priceAsc', 'priceDesc', 'titleAsc', 'discount'] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

// 'hasDiscount' — денормализованное поле products (фаза 4.5), а не ручной
// флаг вроде isNew/isHit, но фильтруется тем же generic-механизмом
// (см. filterWhere в queries.ts): { [flag]: { equals: true } }. В UI подписан
// как Sale (см. messages Catalog.flags.hasDiscount) — ручного тега isSale
// в модели больше нет, он путал рядом с этим авто-фасетом (правка фазы 4.5).
export const FLAG_OPTIONS = ['isNew', 'isHit', 'hasDiscount'] as const
export type FlagOption = (typeof FLAG_OPTIONS)[number]

export const PAGE_SIZE = 24

const slugList = parseAsArrayOf(parseAsString).withDefault([])

export const catalogSearchParams = {
  brand: slugList,
  gender: slugList,
  // Страна-производитель (фаза 11.1, задача 3) — новый фасет, замена
  // убранных «Объём»/«Ноты» (см. GOTCHAS.md — не два места, а три: тут,
  // filterWhere в queries.ts, и computeFacets в facets.ts).
  country: slugList,
  flags: parseAsArrayOf(parseAsStringLiteral(FLAG_OPTIONS)).withDefault([]),
  priceMin: parseAsInteger,
  priceMax: parseAsInteger,
  sort: parseAsStringLiteral(SORT_OPTIONS).withDefault('new'),
  page: parseAsInteger.withDefault(1),
  q: parseAsString.withDefault(''),
}

export type CatalogQuery = {
  brand: string[]
  gender: string[]
  country: string[]
  flags: FlagOption[]
  priceMin: number | null
  priceMax: number | null
  sort: SortOption
  page: number
  q: string
}

export const loadCatalogParams = createLoader(catalogSearchParams)

/** Сколько фильтров реально выбрано — для бейджа на мобильной кнопке. */
export function countActiveFilters(query: CatalogQuery): number {
  return (
    query.brand.length +
    query.gender.length +
    query.country.length +
    query.flags.length +
    (query.priceMin !== null ? 1 : 0) +
    (query.priceMax !== null ? 1 : 0)
  )
}
