'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

/**
 * Кастомная 404 (WIREFRAMES.md, Приложение A: «404 кастомная»). Клиентский
 * компонент — Next.js не передаёт `params` в `not-found.tsx`, локаль берём
 * из уже смонтированного `NextIntlClientProvider` (`[locale]/layout.tsx`).
 * Та же navy-композиция, что thank-you/hero: eyebrow → H1 → hairline →
 * подстрока → CTA.
 */
export default function NotFound() {
  const t = useTranslations('NotFound')

  return (
    <section className="bg-navy px-5 py-20 text-center md:px-8 md:py-28">
      <p className="text-ink-on-dark-subtle text-eyebrow tracking-eyebrow uppercase">404</p>
      <h1 className="text-cream text-hero-mobile tracking-display leading-tight sm:text-hero mt-6 font-light uppercase">
        {t('title')}
      </h1>
      <div className="bg-cream/45 mx-auto mt-7 h-px w-11" />
      <p className="text-ink-on-dark-muted text-body leading-body mx-auto mt-7 max-w-100 font-light">
        {t('text')}
      </p>
      <Link
        href="/catalog"
        className="border-cream text-cream hover:bg-cream hover:text-navy text-label tracking-display mt-9 inline-block border px-8 py-3.5 uppercase transition-colors"
      >
        {t('cta')}
      </Link>
    </section>
  )
}
