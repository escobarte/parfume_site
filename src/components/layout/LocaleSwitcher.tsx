'use client'

import { useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

/**
 * RO · RU · EN — активная cream с подчёркиванием, остальные приглушены
 * (WIREFRAMES.md §Шапка). Переключение сохраняет текущий путь и query.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const active = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Смена языка не должна терять состояние фильтров — оно живёт в query.
  const query = searchParams.toString()
  const target = query ? `${pathname}?${query}` : pathname

  return (
    <div className={`text-eyebrow tracking-label flex items-center gap-1.5 ${className ?? ''}`}>
      {routing.locales.map((locale, index) => (
        <span key={locale} className="flex items-center gap-1.5">
          {index > 0 && <span className="text-ink-on-dark-faint">·</span>}
          <button
            type="button"
            lang={locale}
            aria-current={locale === active ? 'true' : undefined}
            onClick={() => router.replace(target, { locale })}
            className={
              locale === active
                ? 'text-cream decoration-cream cursor-default uppercase underline underline-offset-4'
                : 'text-ink-on-dark-faint hover:text-cream cursor-pointer uppercase transition-colors'
            }
          >
            {locale}
          </button>
        </span>
      ))}
    </div>
  )
}
