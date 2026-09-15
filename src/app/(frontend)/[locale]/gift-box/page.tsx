import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { CatalogShell } from '@/components/catalog/CatalogShell'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { GiftItemsView } from '@/components/giftItems/GiftItemsView'
import type { Locale } from '@/i18n/routing'
import { loadGiftSortParams } from '@/lib/catalog/searchParams'
import { buildMetadata } from '@/lib/seo/metadata'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'CatalogNav' })
  return buildMetadata({ locale, path: '/gift-box', title: t('giftBox') })
}

export default async function GiftBoxPage(props: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<SearchParams>
}) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const [t, { sort }] = await Promise.all([
    getTranslations('CatalogNav'),
    loadGiftSortParams(props.searchParams),
  ])

  return (
    <>
      <Breadcrumbs items={[{ label: t('giftBox') }]} />
      <CatalogShell activeKey="giftBox">
        <GiftItemsView locale={locale} type="giftBox" title={t('giftBox')} sort={sort} />
      </CatalogShell>
    </>
  )
}
