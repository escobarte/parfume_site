import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { StaticPage } from '@/components/pages/StaticPage'
import { routing, type Locale } from '@/i18n/routing'
import { staticParamsOrEmpty } from '@/lib/catalog/staticParams'
import { staticPageMetadata, SYSTEM_PAGE_SLUGS } from '@/lib/content/pages'
import { getPayloadClient } from '@/lib/payload'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await props.params
  return staticPageMetadata(locale, slug)
}

/**
 * Общий маршрут для любого документа `Pages` (2026-09-28) — те же четыре
 * системных slug (about/delivery/returns/contacts) остаются на собственных
 * статических папках, которые Next матчит раньше этого файла сам (приоритет
 * static > dynamic), поэтому они здесь не встречаются никогда — исключены
 * заранее, а не просто «выигрывают молча».
 */
export async function generateStaticParams() {
  return staticParamsOrEmpty(async () => {
    const payload = await getPayloadClient()
    const { docs } = await payload.find({
      collection: 'pages',
      depth: 0,
      limit: 1000,
      pagination: false,
    })

    const system: readonly string[] = SYSTEM_PAGE_SLUGS
    return routing.locales.flatMap((locale) =>
      docs.filter((doc) => !system.includes(doc.slug)).map((doc) => ({ locale, slug: doc.slug })),
    )
  })
}

export default async function DynamicPage(props: {
  params: Promise<{ locale: Locale; slug: string }>
}) {
  const { locale, slug } = await props.params
  setRequestLocale(locale)

  return <StaticPage locale={locale} slug={slug} />
}
