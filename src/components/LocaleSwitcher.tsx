'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

// Заглушка фазы 1 — визуальное оформление придёт в фазе 6 (дизайн-интеграция).
export function LocaleSwitcher() {
  const t = useTranslations('LocaleSwitcher')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  return (
    <label>
      {t('label')}:{' '}
      <select
        aria-label={t('label')}
        value={locale}
        onChange={(event) => {
          router.replace(pathname, { locale: event.target.value })
        }}
      >
        {routing.locales.map((loc) => (
          <option key={loc} value={loc}>
            {t(loc)}
          </option>
        ))}
      </select>
    </label>
  )
}
