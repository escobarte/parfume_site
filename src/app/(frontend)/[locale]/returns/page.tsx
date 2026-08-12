import { setRequestLocale } from 'next-intl/server'
import { StaticPage } from '@/components/pages/StaticPage'
import type { Locale } from '@/i18n/routing'

export default async function ReturnsPage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  return <StaticPage locale={locale} slug="returns" />
}
