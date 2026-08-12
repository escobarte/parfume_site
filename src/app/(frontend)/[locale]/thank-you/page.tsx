import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { getPayloadClient } from '@/lib/payload'
import { buildMetadata } from '@/lib/seo/metadata'
import { LeadEvent } from './LeadEvent'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'ThankYou' })
  // Персональная страница подтверждения заказа — не для выдачи.
  return buildMetadata({ locale, path: '/thank-you', title: t('title'), noindex: true })
}

export default async function ThankYouPage(props: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<SearchParams>
}) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const search = await props.searchParams
  const orderNumber = typeof search.order === 'string' ? search.order : null

  const [t, tc] = await Promise.all([getTranslations('ThankYou'), getTranslations('Catalog')])

  // Данные подтягиваются по номеру заказа из query (фаза 4.6.3) — без него
  // страница работает как раньше, просто без блока деталей.
  const order = orderNumber ? await findOrder(orderNumber) : null

  return (
    <section className="bg-navy px-5 py-20 text-center md:px-8 md:py-28">
      <LeadEvent orderNumber={orderNumber} items={order?.items ?? undefined} total={order?.total} />

      <p className="text-ink-on-dark-subtle text-eyebrow tracking-eyebrow uppercase">
        A scent for every story.
      </p>
      <h1 className="text-cream text-hero-mobile tracking-display leading-tight sm:text-hero mt-6 font-light uppercase">
        {t('title')}
      </h1>
      <div className="bg-cream/45 mx-auto mt-7 h-px w-11" />
      <p className="text-ink-on-dark-muted text-body leading-body mx-auto mt-7 max-w-100 font-light">
        {t('text')}
      </p>

      {orderNumber && (
        <p className="text-ink-on-dark-faint text-eyebrow tracking-label mt-6 uppercase">
          {t('orderNumber')}: {orderNumber}
        </p>
      )}

      {order && (
        <div className="border-cream/25 text-cream mx-auto mt-9 max-w-120 border-t pt-9 text-left">
          <h2 className="text-eyebrow tracking-label text-ink-on-dark-subtle uppercase">
            {t('itemsHeading')}
          </h2>
          <ul className="mt-4 flex flex-col gap-2">
            {(order.items ?? []).map((item, index) => (
              <li key={item.id ?? index} className="text-body-sm flex justify-between gap-4">
                <span>
                  {item.brandTitle ? `${item.brandTitle} · ` : ''}
                  {item.title}
                  {item.volume ? ` — ${item.volume} ml` : ''} × {item.qty}
                </span>
                <span className="whitespace-nowrap">{item.lineTotal} MDL</span>
              </li>
            ))}
          </ul>
          <p className="border-cream/25 text-body-sm mt-4 border-t pt-4">
            <b>
              {t('totalLabel')}: {order.total} MDL
            </b>
          </p>

          <h2 className="text-eyebrow tracking-label text-ink-on-dark-subtle mt-7 uppercase">
            {t('contactsHeading')}
          </h2>
          <p className="text-body-sm mt-3 leading-relaxed">
            {t('nameLabel')}: {order.customer?.name}
            <br />
            {t('phoneLabel')}: {order.customer?.phone}
            {order.customer?.email && (
              <>
                <br />
                {t('emailLabel')}: {order.customer.email}
              </>
            )}
          </p>

          {order.statusToken && (
            <Link
              href={`/order/${order.statusToken}`}
              className="text-cream text-eyebrow tracking-label mt-5 inline-block underline underline-offset-4"
            >
              {t('statusCta')}
            </Link>
          )}
        </div>
      )}

      <Link
        href="/catalog"
        className="border-cream text-cream hover:bg-cream hover:text-navy text-label tracking-display mt-9 inline-block border px-8 py-3.5 uppercase transition-colors"
      >
        {tc('title')}
      </Link>
    </section>
  )
}

async function findOrder(orderNumber: string) {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'orders',
    where: { orderNumber: { equals: orderNumber } },
    limit: 1,
    depth: 0,
  })
  return docs[0] ?? null
}
