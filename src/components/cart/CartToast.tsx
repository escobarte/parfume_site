'use client'

import Image from 'next/image'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { formatVolume } from '@/lib/format'
import { useToast } from '@/lib/ui/toast'

/** Сколько тост висит на экране, мс. */
const DURATION = 2600

/**
 * Обратная связь на «В корзину» (фаза 9.1): плашка снизу с миниатюрой,
 * названием и объёмом, автоскрытие через ~2,6 с.
 *
 * Взаимодействие со страницей не блокирует вообще: контейнер и сама плашка —
 * `pointer-events-none`, кликнуть по ней нельзя и она не перехватывает
 * скролл. Стиль — navy/cream и 1px линия, как везде (BRAND.md §5), тени нет.
 * Живёт в layout витрины: показывается поверх любой страницы.
 */
export function CartToast() {
  const t = useTranslations('Cart')
  const toast = useToast((state) => state.toast)
  const hide = useToast((state) => state.hideToast)

  const id = toast?.id
  useEffect(() => {
    if (!id) return
    const timer = setTimeout(hide, DURATION)
    return () => clearTimeout(timer)
  }, [id, hide])

  if (!toast) return null

  const subtitle = [toast.brandTitle, toast.volume ? formatVolume(toast.volume) : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-70 flex justify-center px-5"
      role="status"
      aria-live="polite"
    >
      <div className="bg-navy border-line-on-dark animate-in fade-in slide-in-from-bottom-2 pointer-events-none flex w-full max-w-90 items-center gap-3 rounded-sm border p-3">
        {toast.image ? (
          <div className="bg-surface-warm relative size-12 shrink-0 overflow-hidden rounded-sm">
            <Image src={toast.image} alt="" fill sizes="48px" className="object-contain p-1" />
          </div>
        ) : (
          <span className="border-line-on-dark text-cream flex size-12 shrink-0 items-center justify-center rounded-sm border">
            <Check className="size-5" strokeWidth={1.6} />
          </span>
        )}

        <div className="min-w-0">
          <p className="text-cream text-eyebrow tracking-display uppercase">{t('toastAdded')}</p>
          <p className="text-ink-on-dark-muted text-body-sm truncate">{toast.title}</p>
          {subtitle && (
            <p className="text-ink-on-dark-faint text-eyebrow tracking-label truncate uppercase">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
