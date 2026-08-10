import React from 'react'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { PromoBanner } from '@/components/layout/PromoBanner'
import { inter } from '@/lib/fonts'
import { routing } from '@/i18n/routing'
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

export const metadata = {
  description: 'MON FLACON — parfumuri pentru toată lumea.',
  title: 'MON FLACON',
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

  return (
    <html lang={locale} className={inter.variable}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider>
          {/* nuqs держит состояние фильтров в URL — адаптер обязателен (фаза 3.3) */}
          <NuqsAdapter>
            <PromoBanner locale={locale} />
            <Header locale={locale} />
            <main className="flex-1">{children}</main>
            <Footer locale={locale} />
          </NuqsAdapter>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
