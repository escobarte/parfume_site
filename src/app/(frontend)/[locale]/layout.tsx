import type { Metadata } from 'next'
import React from 'react'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { ConsentBanner } from '@/components/analytics/ConsentBanner'
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics'
import { CartToast } from '@/components/cart/CartToast'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { PromoBanner } from '@/components/layout/PromoBanner'
import { JsonLd } from '@/components/seo/JsonLd'
import { inter } from '@/lib/fonts'
import { routing, type Locale } from '@/i18n/routing'
import { getSettings } from '@/lib/content/globals'
import { organizationJsonLd } from '@/lib/seo/jsonld'
import { localizedPaths, SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/seo/config'
import './styles.css'

/**
 * Витрина рендерится по запросу, а не пререндерится на сборке.
 * Причина: шапка и футер берут меню и контакты из Payload, а образ собирается
 * без доступа к БД (в Coolify билд идёт до старта Postgres) — пререндер падал
 * с «missing secret key». На скорость это почти не влияет: сами данные лежат
 * в unstable_cache с тегами, БД на каждый запрос не дёргается.
 * К полному кэшу маршрутов вернёмся в фазе 7, когда будет прод-окружение.
 */
export const dynamic = 'force-dynamic'

/**
 * `metadataBase` — единственное место, где резолвятся относительные URL из
 * `alternates`/`openGraph` дочерних `generateMetadata` (фаза 7.1). Заголовок —
 * шаблон: дочерние страницы задают свой `title`, сюда всегда добавляется
 * суффикс бренда; главная (без собственного `generateMetadata`) — дефолт.
 */
export async function generateMetadata(props: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await props.params
  const activeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  const t = await getTranslations({ locale: activeLocale, namespace: 'Seo' })

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
    description: t('description'),
    alternates: { canonical: `/${activeLocale}`, languages: localizedPaths('') },
    openGraph: {
      siteName: SITE_NAME,
      locale: activeLocale,
      type: 'website',
    },
  }
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout(props: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { children } = props
  const { locale } = await props.params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)
  const settings = await getSettings(locale as Locale)

  return (
    <html lang={locale} className={inter.variable}>
      <body className="flex min-h-screen flex-col">
        {/* Organization/LocalBusiness JSON-LD — сайт-wide (PLAN.md §7.2). */}
        <JsonLd data={organizationJsonLd(settings, locale as Locale)} />
        {/* GA4 грузится только после согласия в ConsentBanner (PLAN.md §7.5). */}
        <GoogleAnalytics />
        <NextIntlClientProvider>
          {/* nuqs держит состояние фильтров в URL — адаптер обязателен (фаза 3.3) */}
          <NuqsAdapter>
            <PromoBanner locale={locale} />
            <Header locale={locale} />
            <main className="flex-1">{children}</main>
            <Footer locale={locale} />
            <ConsentBanner />
            {/* Тост «добавлено в корзину» — поверх любой страницы (фаза 9.1). */}
            <CartToast />
          </NuqsAdapter>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
