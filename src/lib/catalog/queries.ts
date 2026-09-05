import { unstable_cache } from 'next/cache'
import { CACHE_TTL } from '@/lib/cache'
import type { Where } from 'payload'
import type { Locale } from '@/i18n/routing'

import { getPayloadClient } from '@/lib/payload'
import { CATALOG_TAG } from '@/lib/revalidate'
import { getBrands } from './taxonomy'
import { PAGE_SIZE, type CatalogQuery, type FlagOption } from './searchParams'
import { toCard } from './cards'
import type { FacetRow, ProductCardData } from './types'

/** Область выдачи: категория и/или список slug-ов из поиска. */
export type CatalogScope = {
  categoryIds?: (number | string)[]
  brandIds?: (number | string)[]
  slugs?: string[]
  // Раздел каталога (`Products.productCategory`, фаза 11.1) — не «Кому»,
  // используется левой навигационной колонкой для «Уход за телом».
  productCategory?: string
}

const scopeWhere = (scope: CatalogScope): Where[] => {
  const conditions: Where[] = []
  if (scope.categoryIds?.length) conditions.push({ categories: { in: scope.categoryIds } })
  if (scope.brandIds?.length) conditions.push({ brand: { in: scope.brandIds } })
  if (scope.productCategory) conditions.push({ productCategory: { equals: scope.productCategory } })
  if (scope.slugs) {
    // Поиск ничего не нашёл: пустой список в `in` уходит в SQL пустым
    // параметром и роняет запрос (invalid byte sequence 0x00), поэтому
    // подставляем заведомо ложное условие — slug есть у каждого товара.
    conditions.push(
      scope.slugs.length ? { slug: { in: scope.slugs } } : { slug: { exists: false } },
    )
  }
  return conditions
}

/** Фильтры пользователя → Payload-условия. Пустой фильтр не сужает выдачу. */
function filterWhere(query: CatalogQuery, ids: { brands: Map<string, number | string> }): Where[] {
  const conditions: Where[] = []

  const brandIds = query.brand.map((slug) => ids.brands.get(slug)).filter(Boolean)
  if (brandIds.length) conditions.push({ brand: { in: brandIds as (number | string)[] } })

  if (query.gender.length) conditions.push({ gender: { in: query.gender } })
  if (query.country.length) conditions.push({ countryOfOrigin: { in: query.country } })

  // Диапазон цены — пересечение с ценовым интервалом товара, а не попадание
  // minPrice в интервал: товар 200–900 должен находиться и по фильтру 500–600.
  if (query.priceMin !== null) conditions.push({ maxPrice: { greater_than_equal: query.priceMin } })
  if (query.priceMax !== null) conditions.push({ minPrice: { less_than_equal: query.priceMax } })

  if (query.flags.length) {
    conditions.push({ or: query.flags.map((flag) => ({ [flag]: { equals: true } })) })
  }

  return conditions
}

const SORT: Record<CatalogQuery['sort'], string> = {
  new: '-createdAt',
  priceAsc: 'minPrice',
  priceDesc: '-minPrice',
  titleAsc: 'title',
  discount: '-maxDiscountPercent',
}

/**
 * Выдача листинга. «Показать ещё» не накапливает состояние в клиенте:
 * страница N отдаёт N × 24 товара одним запросом, поэтому ссылка со
 * `?page=3` открывается ровно тем же экраном и дублей не бывает.
 */
export async function getProductCards(
  locale: Locale,
  query: CatalogQuery,
  scope: CatalogScope = {},
): Promise<{ items: ProductCardData[]; total: number }> {
  const brands = await getBrands(locale)
  const ids = { brands: new Map(brands.map((brand) => [brand.slug, brand.id])) }

  const conditions = [...scopeWhere(scope), ...filterWhere(query, ids)]
  const where: Where = conditions.length ? { and: conditions } : {}
  const limit = Math.max(1, query.page) * PAGE_SIZE

  const key = JSON.stringify({ locale, where, sort: query.sort, limit })

  return unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      const result = await payload.find({
        collection: 'products',
        locale,
        depth: 1,
        limit,
        page: 1,
        sort: SORT[query.sort],
        where,
      })

      const items = result.docs.map(toCard)
      // Поиск задаёт свой порядок релевантности — сохраняем его.
      if (scope.slugs?.length) {
        const rank = new Map(scope.slugs.map((slug, index) => [slug, index]))
        items.sort((a, b) => (rank.get(a.slug) ?? 0) - (rank.get(b.slug) ?? 0))
      }

      return { items, total: result.totalDocs }
    },
    ['catalog', key],
    { tags: [CATALOG_TAG], revalidate: CACHE_TTL },
  )()
}

/**
 * Источник для счётчиков фасетов: все товары области без пользовательских
 * фильтров. Считаем в JS — так счётчик каждого фасета учитывает остальные
 * фильтры (иначе выбор бренда обнулял бы все прочие значения).
 * Потолок в 1000 строк осознанный: каталог клиента — сотни позиций.
 */
export async function getFacetSource(
  locale: Locale,
  scope: CatalogScope = {},
): Promise<FacetRow[]> {
  const conditions = scopeWhere(scope)
  const where: Where = conditions.length ? { and: conditions } : {}
  const key = JSON.stringify({ locale, where })

  return unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      const { docs } = await payload.find({
        collection: 'products',
        locale,
        depth: 1,
        limit: 1000,
        pagination: false,
        where,
      })

      return docs.map((doc): FacetRow => {
        const brand = typeof doc.brand === 'object' && doc.brand ? doc.brand : null
        const categories = Array.isArray(doc.categories)
          ? doc.categories.map((category) =>
              typeof category === 'object' ? category.id : category,
            )
          : []

        return {
          id: doc.id,
          brand: brand?.slug ?? null,
          categories,
          gender: doc.gender ?? null,
          country: doc.countryOfOrigin ?? null,
          minPrice: doc.minPrice ?? null,
          flags: {
            isNew: Boolean(doc.isNew),
            isHit: Boolean(doc.isHit),
            hasDiscount: Boolean(doc.hasDiscount),
          },
        }
      })
    },
    ['facet-source', key],
    { tags: [CATALOG_TAG], revalidate: CACHE_TTL },
  )()
}

/**
 * Товарный ряд главной («Новинки»/«Хиты», WIREFRAMES.md §3): N товаров по
 * одному булеву флагу, свежие сверху. Отдельно от `getProductCards` — та
 * всегда тянет кратно `PAGE_SIZE` (листинг «показать ещё»), здесь нужен
 * именно `limit` ряда (обычно 4), без лишней выборки.
 */
export async function getFlaggedProducts(
  locale: Locale,
  flag: FlagOption,
  limit: number,
): Promise<ProductCardData[]> {
  const key = JSON.stringify({ locale, flag, limit })

  return unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      const result = await payload.find({
        collection: 'products',
        locale,
        depth: 1,
        limit,
        sort: '-createdAt',
        where: { [flag]: { equals: true } },
      })

      return result.docs.map(toCard)
    },
    ['home-row', key],
    { tags: [CATALOG_TAG], revalidate: CACHE_TTL },
  )()
}

/** Счётчик товаров категории для плиток главной и заголовков разделов. */
export async function countProductsInCategories(
  locale: Locale,
  categoryIds: (number | string)[],
): Promise<number> {
  if (!categoryIds.length) return 0
  const key = JSON.stringify({ locale, categoryIds })

  return unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      const { totalDocs } = await payload.count({
        collection: 'products',
        where: { categories: { in: categoryIds } },
      })
      return totalDocs
    },
    ['category-count', key],
    { tags: [CATALOG_TAG], revalidate: CACHE_TTL },
  )()
}
