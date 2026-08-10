'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'

const STORAGE_KEY = 'mf-promo-banner-dismissed'

/**
 * Крестик закрытия + память на сессию (PLAN.md §4.5). Видимость по датам
 * решается сервером в PromoBanner — здесь только «закрыли / не закрыли».
 * sessionStorage, а не localStorage: баннер должен вернуться в новой вкладке
 * или на следующий день, а не быть закрытым навсегда одним кликом.
 */
export function PromoBannerClient({
  text,
  linkLabel,
  linkHref,
  closeLabel,
}: {
  text: string
  linkLabel?: string | null
  linkHref?: string | null
  closeLabel: string
}) {
  // Стартуем с «показан» на сервере и на клиенте одинаково — иначе React
  // ловит hydration mismatch. sessionStorage читаем эффектом после гидрации;
  // для ранее закрытого баннера это даёт короткую вспышку-и-скрытие —
  // приемлемо, это не hero и не влияет на LCP.
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // setState не должен идти синхронно в теле эффекта (правило react-hooks,
    // см. этот же приём в SearchBox.tsx) — переносим на следующий тик.
    const id = setTimeout(() => {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') setDismissed(true)
    }, 0)
    return () => clearTimeout(id)
  }, [])

  if (dismissed) return null

  const close = () => {
    sessionStorage.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="bg-cream relative flex min-h-[34px] items-center justify-center gap-2 px-10 py-2 text-center sm:min-h-[38px]">
      <p className="text-navy text-eyebrow tracking-display uppercase">
        {text}
        {linkLabel && linkHref && (
          <Link href={linkHref} className="ml-2 underline decoration-1 underline-offset-2">
            {linkLabel}
          </Link>
        )}
      </p>
      <button
        type="button"
        onClick={close}
        aria-label={closeLabel}
        className="text-navy absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer"
      >
        <X className="size-4" strokeWidth={1.6} />
      </button>
    </div>
  )
}
