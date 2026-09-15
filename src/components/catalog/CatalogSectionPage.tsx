import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import type { Locale } from '@/i18n/routing'
import { CATALOG_SECTIONS, type CatalogSectionKey } from '@/lib/catalog/sections'
import { countActiveFilters, loadCatalogParams } from '@/lib/catalog/searchParams'
import { buildMetadata } from '@/lib/seo/metadata'
import { CatalogView } from './CatalogView'

export type SectionPageProps = {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<SearchParams>
}

/**
 * Закрытый раздел левого меню (2026-09-15) — общий рендер для
 * `/catalog/{for-her,for-him,kids,body-care,lip-balm}`, страницы отличаются
 * только ключом раздела. Статические сегменты побеждают соседний
 * `/catalog/[category]` (см. GOTCHAS.md).
 *
 * У пол-разделов `gender` из URL отбрасывается ещё до запроса: раздел сам
 * задаёт пол, и `?gender=male` на `/catalog/for-her` не должен ни вывести из
 * раздела, ни дать пустую выдачу, ни попасть в счётчик фильтров/noindex.
 */
async function sectionQuery(section: CatalogSectionKey, searchParams: Promise<SearchParams>) {
  const query = await loadCatalogParams(searchParams)
  return CATALOG_SECTIONS[section].hideGenderFacet ? { ...query, gender: [] } : query
}

export async function sectionMetadata(
  section: CatalogSectionKey,
  props: SectionPageProps,
): Promise<Metadata> {
  const { locale } = await props.params
  const [query, tNav] = await Promise.all([
    sectionQuery(section, props.searchParams),
    getTranslations({ locale, namespace: 'CatalogNav' }),
  ])
  return buildMetadata({
    locale,
    path: CATALOG_SECTIONS[section].path,
    title: tNav(section),
    noindex: countActiveFilters(query) > 0,
  })
}

export async function CatalogSectionPage({
  section,
  ...props
}: SectionPageProps & { section: CatalogSectionKey }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const [query, t, tNav] = await Promise.all([
    sectionQuery(section, props.searchParams),
    getTranslations('Catalog'),
    getTranslations('CatalogNav'),
  ])
  const { scope, hideGenderFacet } = CATALOG_SECTIONS[section]

  return (
    <>
      <Breadcrumbs items={[{ label: t('title'), href: '/catalog' }, { label: tNav(section) }]} />
      <CatalogView
        locale={locale}
        query={query}
        scope={scope}
        title={tNav(section)}
        showCategoryNav
        activeNavKey={section}
        hideGenderFacet={hideGenderFacet}
      />
    </>
  )
}
