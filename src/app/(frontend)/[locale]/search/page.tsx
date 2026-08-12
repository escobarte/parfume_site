import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import type { Locale } from '@/i18n/routing'
import { loadCatalogParams } from '@/lib/catalog/searchParams'
import { searchProductSlugs } from '@/lib/search/fts'
import { buildMetadata } from '@/lib/seo/metadata'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'Search' })
  // Результаты поиска — тонкий/дублирующий контент, не для выдачи.
  return buildMetadata({ locale, path: '/search', title: t('title'), noindex: true })
}

export default async function SearchPage(props: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<SearchParams>
}) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const [query, t] = await Promise.all([
    loadCatalogParams(props.searchParams),
    getTranslations('Search'),
  ])

  const term = query.q.trim()

  return (
    <>
      <Breadcrumbs items={[{ label: t('title') }]} />

      {term.length < 2 ? (
        <div className="mx-auto max-w-[1440px] px-5 py-20 text-center md:px-8">
          <p className="text-ink text-body">{t('prompt')}</p>
        </div>
      ) : (
        <CatalogView
          locale={locale}
          query={query}
          // Поиск отдаёт slug-и в порядке релевантности — они и задают область.
          scope={{ slugs: await searchProductSlugs(term, locale) }}
          title={t('title')}
          subtitle={t('resultsFor', { query: term })}
        />
      )}
    </>
  )
}
