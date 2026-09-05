import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { GiftItemsView } from '@/components/giftItems/GiftItemsView'
import type { Locale } from '@/i18n/routing'
import { buildMetadata } from '@/lib/seo/metadata'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'CatalogNav' })
  return buildMetadata({ locale, path: '/gift-box', title: t('giftBox') })
}

export default async function GiftBoxPage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const t = await getTranslations('CatalogNav')

  return (
    <>
      <Breadcrumbs items={[{ label: t('giftBox') }]} />
      <GiftItemsView locale={locale} type="giftBox" title={t('giftBox')} />
    </>
  )
}
