import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import type { Locale } from '@/i18n/routing'
import { countActiveFilters, loadCatalogParams } from '@/lib/catalog/searchParams'
import { buildMetadata } from '@/lib/seo/metadata'

/**
 * «Уход за телом» (фаза 11.1, задача 1) — не таксономия `categories`
 * (`/catalog/[category]`), а раздел `Products.productCategory`
 * (задача введена этой же сессией). Статический сегмент внутри каталога
 * побеждает соседний динамический `[category]` в маршрутизации Next.js.
 */
export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { locale } = await props.params
  const [query, tNav] = await Promise.all([
    loadCatalogParams(props.searchParams),
    getTranslations({ locale, namespace: 'CatalogNav' }),
  ])
  return buildMetadata({
    locale,
    path: '/catalog/body-care',
    title: tNav('bodyCare'),
    noindex: countActiveFilters(query) > 0,
  })
}

export default async function BodyCarePage(props: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<SearchParams>
}) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const query = await loadCatalogParams(props.searchParams)
  const [t, tNav] = await Promise.all([
    getTranslations('Catalog'),
    getTranslations('CatalogNav'),
  ])

  return (
    <>
      <Breadcrumbs items={[{ label: t('title'), href: '/catalog' }, { label: tNav('bodyCare') }]} />
      <CatalogView
        locale={locale}
        query={query}
        scope={{ productCategory: 'bodyCare' }}
        title={tNav('bodyCare')}
        showCategoryNav
        activeNavKey="bodyCare"
      />
    </>
  )
}
