import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { MaintenanceContacts } from '@/components/maintenance/MaintenanceContacts'
import { MaintenanceHeader } from '@/components/maintenance/MaintenanceHeader'
import { MaintenanceSocial } from '@/components/maintenance/MaintenanceSocial'
import { routing, type Locale } from '@/i18n/routing'
import { isMaintenanceEnabled } from '@/lib/maintenance'
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/seo/config'

/** Заглушка не кэшируется нигде — ни в Next, ни на edge Cloudflare (заголовок ставит мидлварь). */
export const dynamic = 'force-dynamic'

/** Фирменные EN-фразы бренда — не переводятся ни в одной локали (BRAND.md §7). */
const EYEBROW = SITE_TAGLINE
const SIGNATURE = 'Find your signature.'

/**
 * OG-превью — тот же генератор, что у остальных страниц (фаза 7.1,
 * `/{locale}/og-image`), второго механизма не заводится. На картинке
 * намеренно нет ни слова о разработке: соцсети кэшируют превью надолго,
 * и после запуска оно висело бы неделями.
 */
function ogImageUrl(locale: Locale): string {
  const params = new URLSearchParams({ title: SITE_NAME, subtitle: SIGNATURE })
  return `${SITE_URL}/${locale}/og-image?${params.toString()}`
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: raw } = await props.params
  const locale: Locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale
  const t = await getTranslations({ locale, namespace: 'Maintenance' })

  const title = t('title')
  const description = t('text')
  // Заглушка отдаётся на любом URL, поэтому канонический адрес для соцсетей —
  // корень локали, а не тот путь, по которому посетитель пришёл.
  const url = `${SITE_URL}/${locale}`
  const image = ogImageUrl(locale)

  return {
    metadataBase: new URL(SITE_URL),
    title: `${title} · ${SITE_NAME}`,
    description,
    // robots.txt намеренно не трогаем (Disallow: / уважает facebookexternalhit,
    // и превью в соцсетях перестало бы собираться) — закрываем только страницу.
    robots: { index: false },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale,
      type: 'website',
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

/**
 * Страница-заглушка «Сайт в разработке» (фаза 9.2) — в стиле главной:
 * шапка витрины без поиска и корзины → hero-композиция (eyebrow → фирменная
 * фраза → hairline) → текст о разработке вместо кнопки «CATALOG» → соцсети
 * → контакты. Достижима только через rewrite из `src/proxy.ts`.
 */
export default async function MaintenancePage(props: {
  params: Promise<{ locale: string }>
}) {
  // При выключенном режиме заглушки нет нигде, включая её собственный путь.
  if (!isMaintenanceEnabled()) notFound()

  const { locale: raw } = await props.params
  if (!hasLocale(routing.locales, raw)) notFound()
  const locale: Locale = raw

  const t = await getTranslations({ locale, namespace: 'Maintenance' })

  return (
    <>
      <MaintenanceHeader locale={locale} />

      <main className="flex flex-1 items-center justify-center px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto w-full max-w-160 text-center">
          <p className="text-ink-on-dark-subtle text-eyebrow tracking-eyebrow uppercase">
            {EYEBROW}
          </p>
          <h1 className="text-cream text-hero-mobile tracking-display leading-tight sm:text-hero mt-6 font-light uppercase">
            {SIGNATURE}
          </h1>
          <div className="bg-cream/45 mx-auto mt-7 h-px w-11" />

          <h2 className="text-cream text-display tracking-display leading-display mt-10 font-light uppercase">
            {t('title')}
          </h2>
          <p className="text-ink-on-dark-muted text-body leading-body mx-auto mt-5 max-w-100 font-light">
            {t('text')}
          </p>

          <MaintenanceSocial />
          <MaintenanceContacts />
        </div>
      </main>
    </>
  )
}
