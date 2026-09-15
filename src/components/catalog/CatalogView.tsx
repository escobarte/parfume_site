import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { computeFacets } from '@/lib/catalog/facets'
import type { CatalogNavKey } from '@/lib/catalog/navSections'
import { getFacetSource, getProductCards, type CatalogScope } from '@/lib/catalog/queries'
import { countActiveFilters, PAGE_SIZE, type CatalogQuery } from '@/lib/catalog/searchParams'
import { getBrands } from '@/lib/catalog/taxonomy'
import { ActiveFilters } from './ActiveFilters'
import { CatalogShell } from './CatalogShell'
import { FiltersDrawer } from './FiltersDrawer'
import { LoadMore } from './LoadMore'
import { ProductCard } from './ProductCard'
import { SortSelect } from './SortSelect'

/**
 * Общая раскладка выдачи: каталог, категория и результаты поиска — один
 * и тот же экран, отличается только областью (scope) и заголовком.
 * Сетка карточек: 4 колонки ≥1280, 3 на 1024–1279, 2 на мобиле
 * (WIREFRAMES.md §3).
 *
 * Фильтры с фазы 9.1 живут в дровере (FiltersDrawer) на всех разрешениях,
 * постоянного сайдбара больше нет: сетка занимает всю ширину и не меняет
 * её при открытии фильтров.
 *
 * `showCategoryNav` — видимость левого меню (`CatalogShell`), включена на
 * `/catalog`, `/catalog/[category]` и закрытых разделах меню
 * (`CatalogSectionPage`: for-her / for-him / kids / body-care / lip-balm);
 * страница бренда рендерит тот же `CatalogView`, но меню не просит.
 *
 * Тулбар (заголовок, счётчик, «Фильтры», чипы, сортировка) виден везде
 * (2026-09-15). Раньше он прятался на пунктах меню «Для неё/него/Детям/Уход
 * за телом» (`hideToolbar`), пока те были фильтром `?gender=` общего
 * каталога; теперь это закрытые разделы со своим scope, и фильтры внутри
 * раздела из него не выводят. `hideGenderFacet` — раздел сам задаёт пол:
 * фасета «Кому» и его чипов нет (`gender` из URL страница уже отбросила).
 */
export async function CatalogView({
  locale,
  query,
  scope,
  title,
  subtitle,
  showCategoryNav = false,
  activeNavKey,
  hideGenderFacet = false,
}: {
  locale: Locale
  query: CatalogQuery
  scope: CatalogScope
  title: string
  subtitle?: string
  // Левая колонка навигации (задача 1, фаза 11.1) — только на страницах
  // каталога/категорий, не на страницах бренда (те тоже рендерят CatalogView).
  showCategoryNav?: boolean
  activeNavKey?: CatalogNavKey
  hideGenderFacet?: boolean
}) {
  const [t, tGender, tCountry, tFlags, brands] = await Promise.all([
    getTranslations('Catalog'),
    getTranslations('Catalog.gender'),
    getTranslations('Catalog.country'),
    getTranslations('Catalog.flags'),
    getBrands(locale),
  ])

  const [{ items, total }, facetRows] = await Promise.all([
    getProductCards(locale, query, scope),
    getFacetSource(locale, scope),
  ])

  const computed = computeFacets(facetRows, query, {
    brands,
    gender: {
      female: tGender('female'),
      male: tGender('male'),
      unisex: tGender('unisex'),
      kids: tGender('kids'),
    },
    country: {
      uae: tCountry('uae'),
      europe: tCountry('europe'),
      usa: tCountry('usa'),
    },
    flags: {
      isNew: tFlags('isNew'),
      isHit: tFlags('isHit'),
      hasDiscount: tFlags('hasDiscount'),
    },
  })
  const facets = hideGenderFacet ? { ...computed, gender: [] } : computed

  const activeCount = countActiveFilters(query)

  const grid = (
    <div>
      {items.length === 0 ? (
        <div className="border-line flex flex-col items-center gap-2 border py-20 text-center">
          <p className="text-ink text-body">{t('empty')}</p>
          <p className="text-ink-muted text-body-sm">{t('emptyHint')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
            {items.map((product, index) => (
              <ProductCard key={product.id} product={product} locale={locale} priority={index < 4} />
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <LoadMore shown={items.length} total={total} />
          </div>
        </>
      )}
    </div>
  )

  const content = (
    <>
      <div className="border-line flex flex-wrap items-baseline justify-between gap-3 border-b pb-5">
        <div>
          <h1 className="text-ink text-section tracking-display font-light uppercase">{title}</h1>
          {subtitle && <p className="text-ink-muted text-body-sm mt-2">{subtitle}</p>}
        </div>
        <span className="text-ink-muted text-eyebrow tracking-label uppercase">
          {t('showing', { shown: Math.min(items.length, total), total })}
        </span>
      </div>

      <div className="mt-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 max-lg:w-full">
            <FiltersDrawer facets={facets} activeCount={activeCount} />
            <ActiveFilters facets={facets} hideGender={hideGenderFacet} />
          </div>
          <SortSelect />
        </div>

        {grid}
      </div>
    </>
  )

  if (showCategoryNav) {
    return (
      <CatalogShell activeKey={activeNavKey}>
        {content}
      </CatalogShell>
    )
  }

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-10 md:px-8 md:py-12">{content}</div>
  )
}

export { PAGE_SIZE }
