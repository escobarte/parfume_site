import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

// Главная собирается в фазе 5 строго по WIREFRAMES.md §Главная и мокапу.
// Пока — заглушка со входом в каталог, чтобы layout был проходимым.
export default async function HomePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const [t, tc] = await Promise.all([getTranslations('HomePage'), getTranslations('Catalog')])

  return (
    <section className="bg-navy px-5 py-20 text-center md:px-8 md:py-28">
      <p className="text-ink-on-dark-subtle text-eyebrow tracking-eyebrow uppercase">
        Perfumes for everyone
      </p>
      <h1 className="text-cream text-hero-mobile tracking-display leading-tight sm:text-hero mt-6 font-light uppercase">
        Find your signature.
      </h1>
      <div className="bg-cream/45 mx-auto mt-7 h-px w-11" />
      <p className="text-ink-on-dark-muted text-body leading-body mx-auto mt-7 max-w-100 font-light">
        {t('greeting')}
      </p>
      <Link
        href="/catalog"
        className="border-cream text-cream hover:bg-cream hover:text-navy text-label tracking-display mt-9 inline-block border px-8 py-3.5 uppercase transition-colors"
      >
        {tc('title')}
      </Link>
    </section>
  )
}
