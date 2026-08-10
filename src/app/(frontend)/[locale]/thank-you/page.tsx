import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { LeadEvent } from './LeadEvent'

export default async function ThankYouPage(props: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<SearchParams>
}) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const search = await props.searchParams
  const orderNumber = typeof search.order === 'string' ? search.order : null

  const [t, tc] = await Promise.all([getTranslations('ThankYou'), getTranslations('Catalog')])

  return (
    <section className="bg-navy px-5 py-20 text-center md:px-8 md:py-28">
      <LeadEvent orderNumber={orderNumber} />

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

      <Link
        href="/catalog"
        className="border-cream text-cream hover:bg-cream hover:text-navy text-label tracking-display mt-9 inline-block border px-8 py-3.5 uppercase transition-colors"
      >
        {tc('title')}
      </Link>
    </section>
  )
}
