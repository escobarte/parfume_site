import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { getPayloadClient } from '@/lib/payload'
import { buildMetadata } from '@/lib/seo/metadata'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale; token: string }>
}): Promise<Metadata> {
  const { locale, token } = await props.params
  const t = await getTranslations({ locale, namespace: 'OrderStatusPage' })
  // Приватные данные конкретного заказа — никогда не в выдаче.
  return buildMetadata({ locale, path: `/order/${token}`, title: t('title'), noindex: true })
}

/**
 * Публичная страница статуса заказа (PLAN.md §9, 4.7.2) — без регистрации,
 * по неугадываемому токену (`orders.statusToken`, крипто-случайный, фаза
 * 4.6). Показывает состав/статус/сумму человеческим языком, без единого
 * служебного поля (id товара, sku и т.п. — сознательно не выводятся).
 */
export default async function OrderStatusPage(props: {
  params: Promise<{ locale: Locale; token: string }>
}) {
  const { locale, token } = await props.params
  setRequestLocale(locale)

  const order = await findOrderByToken(token)
  if (!order) notFound()

  const [t, ts] = await Promise.all([
    getTranslations('OrderStatusPage'),
    getTranslations('OrderStatus'),
  ])

  return (
    <section className="mx-auto max-w-140 px-5 py-16 md:px-8 md:py-24">
      <p className="text-ink-subtle text-eyebrow tracking-eyebrow uppercase">
        {t('orderNumber')} {order.orderNumber}
      </p>
      <h1 className="text-ink text-section tracking-display mt-3 font-light uppercase">
        {t('title')}
      </h1>

      <span className="bg-navy text-cream text-label tracking-display mt-5 inline-block rounded-sm px-3 py-1.5 uppercase">
        {ts(order.status)}
      </span>

      <h2 className="text-ink-muted text-eyebrow tracking-label mt-9 uppercase">
        {t('itemsHeading')}
      </h2>
      <ul className="border-line mt-4 flex flex-col divide-y divide-line border-t">
        {(order.items ?? []).map((item, index) => (
          <li key={item.id ?? index} className="text-body-sm flex justify-between gap-4 py-3">
            <span>
              {item.brandTitle ? `${item.brandTitle} · ` : ''}
              {item.title}
              {item.volume ? ` — ${item.volume} ml` : ''} × {item.qty}
            </span>
            <span className="whitespace-nowrap">{item.lineTotal} MDL</span>
          </li>
        ))}
      </ul>
      <p className="border-line mt-4 border-t pt-4 text-right">
        <b>
          {t('totalLabel')}: {order.total} MDL
        </b>
      </p>
    </section>
  )
}

async function findOrderByToken(token: string) {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'orders',
    where: { statusToken: { equals: token } },
    limit: 1,
    depth: 0,
  })
  return docs[0] ?? null
}
