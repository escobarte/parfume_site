import type { ReactNode } from 'react'
import { hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { inter } from '@/lib/fonts'
import { routing } from '@/i18n/routing'
import '../../../(frontend)/[locale]/styles.css'

/**
 * Корневой layout заглушки (фаза 9.2). Отдельная группа маршрутов, потому что
 * layout витрины (`(frontend)/[locale]/layout.tsx`) тянет шапку, футер и
 * глобалы из Payload — заглушке ни то, ни другое не нужно, а зависимость от БД
 * на закрытом сайте прямо вредна.
 *
 * Стили — тот же самый `styles.css` витрины, второй копии токенов не заводится.
 */
export default async function MaintenanceLayout(props: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await props.params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  return (
    <html lang={locale} className={inter.variable}>
      <body className="bg-navy flex min-h-screen flex-col">{props.children}</body>
    </html>
  )
}
