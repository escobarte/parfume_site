import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import type { Locale } from '@/i18n/routing'
import { loadCatalogParams } from '@/lib/catalog/searchParams'

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
      <CatalogView locale={locale} query={query} scope={{}} title={t('title')} />
    </>
  )
}
