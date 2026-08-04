import React from 'react'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { inter } from '@/lib/fonts'
import { routing } from '@/i18n/routing'
import './styles.css'

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
      <body>
        <NextIntlClientProvider>
          <main>{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
