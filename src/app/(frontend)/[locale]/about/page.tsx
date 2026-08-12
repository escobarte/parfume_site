import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { StaticPage } from '@/components/pages/StaticPage'
import type { Locale } from '@/i18n/routing'
import { staticPageMetadata } from '@/lib/content/pages'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
  const { locale } = await props.params
  return staticPageMetadata(locale, 'about')
}

export default async function AboutPage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  return <StaticPage locale={locale} slug="about" />
}
