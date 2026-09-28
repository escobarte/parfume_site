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
// Сортировки «Новинки» (`new`, `-createdAt`) больше нет — снята по правке
// владельца 16.09 вместе с подписью в messages; дефолт каталога — «по названию».
// Значение `?sort=new` из старых ссылок молча падает в дефолт (parseAsStringLiteral).
// Новинки остаются отдельным фасетом/ссылкой шапки (`flags=isNew`), это не она.
//
// `relevance` — порядок, который задаёт полнотекстовый поиск (ранг FTS). Он
// существует ТОЛЬКО на `/search`: в каталоге ранжировать нечем. До 2026-09-28
// его не было как значения, и поиск просто перебивал любую выбранную
// сортировку своим порядком — селект на странице поиска был неработающим.
export const SORT_OPTIONS = ['relevance', 'priceAsc', 'priceDesc', 'titleAsc', 'discount'] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

/**
 * Сортировки каталога/категории/бренда — без `relevance` (ранжировать нечего).
 * Порядок = порядок опций в селекте.
 */
export const CATALOG_SORT_OPTIONS = [
  'priceAsc',
  'priceDesc',
  'titleAsc',
  'discount',
] as const satisfies readonly SortOption[]

/** Сортировки страницы поиска: та же выдача плюс «по релевантности» первой. */
export const SEARCH_SORT_OPTIONS = [
  'relevance',
  'priceAsc',
  'priceDesc',
  'titleAsc',
  'discount',
] as const satisfies readonly SortOption[]

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
  // `clearOnDefault: false` — выбранная сортировка ВСЕГДА остаётся в URL.
  // Иначе выбор значения, совпадающего с дефолтом этого парсера (`titleAsc`),
  // вычистил бы параметр, а страница поиска, у которой дефолт свой
  // (`relevance`, см. `loadSearchParams`), прочитала бы пустой URL как
  // релевантность — селект показывал бы «По названию», а сервер сортировал бы
  // по рангу. Цена решения — `?sort=titleAsc` в адресе, это приемлемо.
  sort: parseAsStringLiteral(CATALOG_SORT_OPTIONS)
    .withDefault('titleAsc')
    .withOptions({ clearOnDefault: false }),
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

/**
 * Страница поиска: те же фильтры, но сортировок на одну больше и дефолт
 * другой — «по релевантности». Отдельный лоадер, а не флаг: дефолт обязан
 * жить в парсере, иначе `?sort=` из URL и то, что реально применил сервер,
 * разъезжаются (см. `clearOnDefault` выше).
 *
 * Каталог `relevance` не принимает вовсе: значение не проходит
 * `parseAsStringLiteral(CATALOG_SORT_OPTIONS)` и падает в `titleAsc` — то же
 * самое, что сервер сделает с этим значением без результатов поиска.
 */
export const searchSearchParams = {
  ...catalogSearchParams,
  sort: parseAsStringLiteral(SEARCH_SORT_OPTIONS)
    .withDefault('relevance')
    .withOptions({ clearOnDefault: false }),
}

export const loadSearchParams = createLoader(searchSearchParams)

/**
 * Сортировка подарочных разделов (Gift Card / Gift Box, 2026-09-15) — тот же
 * ключ `sort`, что у каталога (клиент пишет его через общий `SortSelect`),
 * но только подмножество значений, фильтров там нет осознанно. Дефолт
 * `titleAsc` — прежний порядок выдачи до появления сортировки.
 */
export const GIFT_SORT_OPTIONS = [
  'titleAsc',
  'priceAsc',
  'priceDesc',
] as const satisfies readonly SortOption[]
export type GiftSortOption = (typeof GIFT_SORT_OPTIONS)[number]

export const loadGiftSortParams = createLoader({
  sort: parseAsStringLiteral(GIFT_SORT_OPTIONS).withDefault('titleAsc'),
})

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
