'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

/**
 * Кастомный error-boundary раздела (обязателен как клиентский компонент по
 * конвенции Next.js). Та же navy-композиция, что 404/thank-you. `reset()` —
 * штатная попытка перерендерить сегмент без полной перезагрузки страницы.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('ErrorPage')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="bg-navy px-5 py-20 text-center md:px-8 md:py-28">
      <p className="text-ink-on-dark-subtle text-eyebrow tracking-eyebrow uppercase">
        {t('eyebrow')}
      </p>
      <h1 className="text-cream text-hero-mobile tracking-display leading-tight sm:text-hero mt-6 font-light uppercase">
        {t('title')}
      </h1>
      <div className="bg-cream/45 mx-auto mt-7 h-px w-11" />
      <p className="text-ink-on-dark-muted text-body leading-body mx-auto mt-7 max-w-100 font-light">
        {t('text')}
      </p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="border-cream text-cream hover:bg-cream hover:text-navy text-label tracking-display cursor-pointer border px-8 py-3.5 uppercase transition-colors"
        >
          {t('retry')}
        </button>
        <Link
          href="/"
          className="text-ink-on-dark-muted hover:text-cream text-label tracking-link transition-colors"
        >
          {t('home')}
        </Link>
      </div>
    </section>
  )
}
