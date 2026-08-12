import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { buildMetadata } from '@/lib/seo/metadata'
import { OrderLookupForm } from './OrderLookupForm'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'OrderLookup' })
  return buildMetadata({ locale, path: '/order', title: t('title'), noindex: true })
}

/**
 * Запасной путь страницы статуса заказа (фаза 4.7.2): токен потерян или
 * письма не было — поиск по номеру заказа и телефону вместе (см.
 * /api/order-status). Основной путь — прямая ссылка /order/<token>.
 */
export default async function OrderLookupPage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const t = await getTranslations('OrderLookup')

  return (
    <section className="mx-auto max-w-100 px-5 py-16 md:px-8 md:py-24">
      <h1 className="text-ink text-section tracking-display font-light uppercase">{t('title')}</h1>
      <p className="text-ink-muted text-body-sm mt-3">{t('text')}</p>
      <div className="mt-7">
        <OrderLookupForm />
      </div>
    </section>
  )
}
