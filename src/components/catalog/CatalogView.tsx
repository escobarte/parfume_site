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
 * `/catalog`, `/catalog/[category]` и `/catalog/body-care` (страница бренда
 * рендерит тот же `CatalogView`, но меню не просит).
 *
 * Тулбар (заголовок, счётчик, «Фильтры», чипы, сортировка) скрывается
 * отдельным условием — `hideToolbar` ниже (ПРОМПТ 13, задача 1) — только
 * на «чистых» посадочных состояниях четырёх товарных пунктов левого меню
 * (Для неё/Для него/Детям/Уход за телом), НЕ на всём `showCategoryNav`:
 * `/catalog` без параметров (переход по «CATALOG» в шапке) и
 * `/catalog/[category]` (произвольные категории CMS, не связаны с левым
 * меню) обязаны сохранить полноценную фильтрацию — иначе с сайта пропадает
 * единственный способ отфильтровать/отсортировать общую выдачу. Пункты
 * «Для неё/него/Детям» технически используют тот же URL
 * (`/catalog?gender=…`), что и обычный фасет «Кому» в дровере — различить
 * «пришёл по ссылке меню» от «включил фасет сам» нечем в принципе, поэтому
 * тулбар скрывается только пока `gender` — единственный активный фильтр
 * (ровно то состояние, в которое ведёт пункт меню); стоит добавить любой
 * другой фильтр (бренд, цена, страна, флаг) — тулбар возвращается, и
 * пользователь снова может фильтровать/сбрасывать как обычно.
 */
export async function CatalogView({
  locale,
  query,
  scope,
  title,
  subtitle,
  showCategoryNav = false,
  activeNavKey,
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

  const facets = computeFacets(facetRows, query, {
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

  const activeCount = countActiveFilters(query)

  const isSingleGenderLanding =
    query.gender.length === 1 &&
    (['female', 'male', 'kids'] as string[]).includes(query.gender[0]) &&
    activeCount === query.gender.length
  const hideToolbar =
    showCategoryNav && (activeNavKey === 'bodyCare' || isSingleGenderLanding)

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

  const content = hideToolbar ? (
    grid
  ) : (
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
            <ActiveFilters facets={facets} />
          </div>
          <SortSelect />
        </div>

        {grid}
      </div>
    </>
  )

  if (showCategoryNav) {
    return (
      <CatalogShell activeKey={activeNavKey} gender={query.gender}>
        {content}
      </CatalogShell>
    )
  }

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-10 md:px-8 md:py-12">{content}</div>
  )
}

export { PAGE_SIZE }
