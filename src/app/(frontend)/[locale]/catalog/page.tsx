import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import type { Locale } from '@/i18n/routing'
import { countActiveFilters, loadCatalogParams } from '@/lib/catalog/searchParams'
import { buildMetadata } from '@/lib/seo/metadata'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { locale } = await props.params
  const [query, t] = await Promise.all([
    loadCatalogParams(props.searchParams),
    getTranslations({ locale, namespace: 'Catalog' }),
  ])
  // Активные фильтры → почти дублирующая выдача, canonical всегда ведёт
  // на чистый /catalog (PLAN.md §7.1).
  return buildMetadata({
    locale,
    path: '/catalog',
    title: t('title'),
    noindex: countActiveFilters(query) > 0,
  })
}

export default async function CatalogPage(props: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<SearchParams>
}) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const query = await loadCatalogParams(props.searchParams)
  const t = await getTranslations('Catalog')

  return (
    <>
      <Breadcrumbs items={[{ label: t('title') }]} />
      <CatalogView locale={locale} query={query} scope={{}} title={t('title')} showCategoryNav />
    </>
  )
}
