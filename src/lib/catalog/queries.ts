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
  // Раздел каталога (`Products.productCategory`, фаза 11.1) — не «Кому».
  // Вместе с `gender` задаёт закрытые разделы левого меню (`sections.ts`).
  productCategory?: string
  // Список, не одно значение — For Her/For Him берут `female`/`male` ПЛЮС
  // `unisex` (2026-09-28, решение клиентки отменяет решение владельца от
  // 15.09 «unisex только через фасет общего /catalog»), Kids — по-прежнему
  // один элемент (`['kids']`). Одно условие `in`, а не объединение двух
  // отдельных запросов — товар физически не может попасть в выдачу дважды.
  gender?: string | string[]
}

const scopeWhere = (scope: CatalogScope): Where[] => {
  const conditions: Where[] = []
  if (scope.categoryIds?.length) conditions.push({ categories: { in: scope.categoryIds } })
  if (scope.brandIds?.length) conditions.push({ brand: { in: scope.brandIds } })
  if (scope.productCategory) conditions.push({ productCategory: { equals: scope.productCategory } })
  if (scope.gender) {
    const genders = Array.isArray(scope.gender) ? scope.gender : [scope.gender]
    conditions.push({ gender: { in: genders } })
  }
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

  // Диапазон цены — по ЦЕНЕ КАРТОЧКИ (`maxPrice`, максимум по активным
  // вариантам), той же, по которой идёт сортировка. Раньше здесь было
  // пересечение интервала товара с фильтром (`maxPrice >= min` И
  // `minPrice <= max`): товар 200–900 попадал в фильтр «500–600». Это было
  // осмысленно, пока карточка показывала «от 200 MDL» — диапазон. Сейчас она
  // показывает одно число (900), и такой товар в фильтре «до 600» выглядел
  // просто ошибкой: на карточке 900, а она в выдаче «до 600». Заодно правило
  // стало ОДНИМ для листинга и для счётчиков фасетов (`facets.ts`), которые
  // считали по-своему — попаданием `minPrice` в диапазон (2026-09-28).
  if (query.priceMin !== null) conditions.push({ maxPrice: { greater_than_equal: query.priceMin } })
  if (query.priceMax !== null) conditions.push({ maxPrice: { less_than_equal: query.priceMax } })

  if (query.flags.length) {
    conditions.push({ or: query.flags.map((flag) => ({ [flag]: { equals: true } })) })
  }

  return conditions
}

/**
 * Сортировка листинга. **Цена для сортировки обязана быть той же, что на
 * карточке** — а карточка со времён «новой логики цены» показывает ОДНУ цену,
 * максимальную среди активных вариантов (`toCard` → `displayPrice`, фаза
 * «новая логика цены»), а не «от X». Сортировка же осталась с прежних времён
 * на `minPrice` (цена самого маленького объёма), и выдача выглядела
 * неотсортированной вовсе: у товара 3ml/5ml/…/Full Size порядок по minPrice
 * и порядок по видимой цене — два разных порядка (найдено 2026-09-27,
 * пример с прода: `?sort=priceDesc` отдавал 1780 → 1550 → 1490 → 1590 MDL).
 * Поэтому `maxPrice` — денормализованный максимум по активным вариантам,
 * ровно то число, которое напечатано на карточке (оба считает один хук,
 * `denormalizeVariants`).
 *
 * `title` вторым ключом — детерминированный порядок внутри одной цены
 * (в прайсе клиентки цены повторяются десятками): без него равные цены
 * Postgres отдаёт в произвольном порядке, и выдача «прыгает» между заходами.
 */
const SORT: Record<CatalogQuery['sort'], string[]> = {
  priceAsc: ['maxPrice', 'title'],
  priceDesc: ['-maxPrice', 'title'],
  titleAsc: ['title'],
  discount: ['-maxDiscountPercent', 'title'],
  // Релевантность СУБД не знает — порядок задаёт ранг FTS уже после выборки
  // (см. ниже). Значение здесь нужно для случая, когда `relevance` пришло без
  // результатов поиска (руками в адресе каталога): ведём себя как `titleAsc`.
  relevance: ['title'],
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

  // Порядок по релевантности существует только у поиска: ранг считает FTS
  // (`searchProductSlugs` отдаёт slug-и уже отсортированными), СУБД его не
  // знает. Поэтому здесь берём ВСЕ найденные товары (их не больше лимита
  // поиска — 200) и режем страницу уже после сортировки по рангу: сортировать
  // страницу, которую выбрала БД своим порядком, значит показать на первом
  // экране не самые релевантные товары, а первые по алфавиту среди всех
  // найденных. До 2026-09-28 так и было — плюс этот же ранг перебивал любую
  // ВЫБРАННУЮ пользователем сортировку, из-за чего селект на `/search`
  // не работал вообще.
  const byRelevance = query.sort === 'relevance' && !!scope.slugs?.length

  return unstable_cache(
    async () => {
      const payload = await getPayloadClient()

      if (byRelevance) {
        const rank = new Map(scope.slugs!.map((slug, index) => [slug, index]))
        const { docs } = await payload.find({
          collection: 'products',
          locale,
          depth: 1,
          pagination: false,
          where,
        })
        const ordered = [...docs].sort(
          (a, b) => (rank.get(a.slug) ?? Infinity) - (rank.get(b.slug) ?? Infinity),
        )
        return { items: ordered.slice(0, limit).map(toCard), total: ordered.length }
      }

      const result = await payload.find({
        collection: 'products',
        locale,
        depth: 1,
        limit,
        page: 1,
        sort: SORT[query.sort],
        where,
      })

      return { items: result.docs.map(toCard), total: result.totalDocs }
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
          // Цена карточки (максимум по активным вариантам) — по ней же считает
          // фильтр цены в `filterWhere` выше и рисуются границы слайдера.
          displayPrice: doc.maxPrice ?? null,
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
