'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getConsent, setConsent } from '@/lib/analytics/consent'
import { isGaConfigured } from '@/lib/analytics/gtag'

/**
 * Простой cookie-баннер (PLAN.md §7.5) — до решения пользователя ничего не
 * грузится (`GoogleAnalytics.tsx` слушает то же согласие). Если GA4 ещё не
 * настроен (плейсхолдер `NEXT_PUBLIC_GA_ID`), баннер не показываем вовсе —
 * спрашивать согласие не на что.
 */
export function ConsentBanner() {
  const t = useTranslations('ConsentBanner')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(isGaConfigured() && getConsent() === null)
  }, [])

  if (!visible) return null

  const choose = (value: 'granted' | 'denied') => {
    setConsent(value)
    setVisible(false)
  }

  return (
    <div className="bg-navy border-line-on-dark fixed inset-x-0 bottom-0 z-50 border-t px-5 py-4 md:px-8">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
        <p className="text-ink-on-dark-muted text-body-sm max-w-140">{t('text')}</p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => choose('denied')}
            className="text-ink-on-dark-muted hover:text-cream text-label tracking-display cursor-pointer px-4 py-2 uppercase transition-colors"
          >
            {t('decline')}
          </button>
          <button
            type="button"
            onClick={() => choose('granted')}
            className="border-cream text-cream hover:bg-cream hover:text-navy text-label tracking-display cursor-pointer border px-5 py-2 uppercase transition-colors"
          >
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  )
}
