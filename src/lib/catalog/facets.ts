import { FLAG_OPTIONS, type CatalogQuery, type FlagOption } from './searchParams'
import type { FacetCount, FacetRow, Facets } from './types'
import type { TaxonomyItem } from './taxonomy'

// Порядок фасета «Кому» зафиксирован ПРОМПТ 11A задача 3: Для неё / Для
// него / Детям / Унисекс — не порядок значений в Products.GENDERS.
const GENDERS = ['female', 'male', 'kids', 'unisex'] as const
const COUNTRIES = ['uae', 'europe', 'usa'] as const

/**
 * Счётчик фасета честный: он показывает, сколько товаров останется, если
 * добавить это значение к уже выбранным — то есть учитывает все прочие
 * фильтры, но не сам фасет (иначе счётчики невыбранных значений всегда 0).
 */
type Predicate = (row: FacetRow) => boolean

function predicates(query: CatalogQuery) {
  const brand: Predicate = (row) =>
    !query.brand.length || (!!row.brand && query.brand.includes(row.brand))
  const gender: Predicate = (row) =>
    !query.gender.length || (!!row.gender && query.gender.includes(row.gender))
  const country: Predicate = (row) =>
    !query.country.length || (!!row.country && query.country.includes(row.country))
  const flags: Predicate = (row) =>
    !query.flags.length || query.flags.some((flag) => row.flags[flag])
  const price: Predicate = (row) => {
    if (row.minPrice === null) return query.priceMin === null && query.priceMax === null
    if (query.priceMin !== null && row.minPrice < query.priceMin) return false
    if (query.priceMax !== null && row.minPrice > query.priceMax) return false
    return true
  }

  return { brand, gender, country, flags, price }
}

/** Все фильтры, кроме одного — база для счётчиков этого фасета. */
const except = (all: Record<string, Predicate>, skip: string): Predicate[] =>
  Object.entries(all)
    .filter(([name]) => name !== skip)
    .map(([, predicate]) => predicate)

const countBy = (rows: FacetRow[], base: Predicate[], match: Predicate) =>
  rows.filter((row) => base.every((predicate) => predicate(row)) && match(row)).length

const sortByCount = (items: FacetCount[]) =>
  items
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

export function computeFacets(
  rows: FacetRow[],
  query: CatalogQuery,
  labels: {
    brands: TaxonomyItem[]
    gender: Record<string, string>
    country: Record<string, string>
    flags: Record<FlagOption, string>
  },
): Facets {
  const all = predicates(query)

  const brand = sortByCount(
    labels.brands.map((item) => ({
      value: item.slug,
      label: item.title,
      count: countBy(rows, except(all, 'brand'), (row) => row.brand === item.slug),
    })),
  )

  const gender = GENDERS.map((value) => ({
    value,
    label: labels.gender[value] ?? value,
    count: countBy(rows, except(all, 'gender'), (row) => row.gender === value),
  })).filter((item) => item.count > 0)

  const country = COUNTRIES.map((value) => ({
    value,
    label: labels.country[value] ?? value,
    count: countBy(rows, except(all, 'country'), (row) => row.country === value),
  })).filter((item) => item.count > 0)

  const flags = FLAG_OPTIONS.map((flag) => ({
    value: flag,
    label: labels.flags[flag],
    count: countBy(rows, except(all, 'flags'), (row) => row.flags[flag]),
  })).filter((item) => item.count > 0)

  // Границы слайдера цены берём по всей области, а не по текущей выдаче —
  // иначе диапазон схлопывается вокруг уже выбранного значения.
  const prices = rows.map((row) => row.minPrice).filter((price): price is number => price !== null)
  const price = prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null

  return { brand, gender, country, flags, price }
}
