'use client'

import { ShoppingBag, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { selectCount, selectTotal, useCart } from '@/lib/cart/store'
import { formatPrice, formatVolume } from '@/lib/format'
import { useHasHydrated } from '@/lib/useHasHydrated'

const PREVIEW_LIMIT = 3

/**
 * Мини-корзина в шапке: иконка с бейджем, по клику — выпадающий список
 * последних позиций и итог. Линии вместо теней, как везде (BRAND.md §5).
 */
export function MiniCart({ className }: { className?: string }) {
  const t = useTranslations('Cart')
  const tn = useTranslations('Nav')
  const locale = useLocale() as Locale
  const items = useCart((state) => state.items)
  const count = useCart(selectCount)
  const total = useCart(selectTotal)
  const remove = useCart((state) => state.remove)
  const hydrated = useHasHydrated()
  const [open, setOpen] = useState(false)

  const visible = hydrated ? count : 0
  const preview = items.slice(0, PREVIEW_LIMIT)

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-cream hover:text-ink-on-dark-muted relative inline-flex cursor-pointer transition-colors"
        aria-label={tn('cart')}
        aria-expanded={open}
      >
        <ShoppingBag className="size-[18px]" strokeWidth={1.6} />
        {visible > 0 && (
          <span className="bg-cream text-navy text-micro absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full font-medium">
            {visible > 99 ? '99+' : visible}
          </span>
        )}
      </button>

      {open && hydrated && (
        <>
          <button
            type="button"
            aria-label={t('title')}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="border-line bg-surface absolute top-full right-0 z-50 mt-4 w-[min(20rem,calc(100vw-2.5rem))] border">
            <div className="border-line flex items-center justify-between border-b px-4 py-3">
              <span className="text-ink text-eyebrow tracking-display uppercase">
                {t('miniTitle')}
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('remove')}>
                <X className="text-ink-muted size-4" strokeWidth={1.6} />
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-ink-muted text-body-sm px-4 py-6">{t('empty')}</p>
            ) : (
              <>
                <ul className="divide-line divide-y">
                  {preview.map((item) => (
                    <li key={item.key} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-ink text-body-sm truncate font-medium">{item.title}</p>
                        <p className="text-ink-muted text-eyebrow mt-0.5">
                          {[
                            item.volume ? formatVolume(item.volume) : null,
                            `${item.qty} × ${formatPrice(item.price, locale)}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(item.key)}
                        aria-label={t('remove')}
                        className="text-ink-subtle hover:text-danger shrink-0 cursor-pointer transition-colors"
                      >
                        <X className="size-4" strokeWidth={1.6} />
                      </button>
                    </li>
                  ))}
                </ul>

                {items.length > PREVIEW_LIMIT && (
                  <p className="text-ink-muted text-eyebrow px-4 py-2">
                    {t('more', { count: items.length - PREVIEW_LIMIT })}
                  </p>
                )}

                <div className="border-line flex items-center justify-between border-t px-4 py-3">
                  <span className="text-ink-muted text-eyebrow tracking-label uppercase">
                    {t('total')}
                  </span>
                  <span className="text-ink text-body font-medium">
                    {formatPrice(total, locale)}
                  </span>
                </div>

                <div className="p-3">
                  <Link
                    href="/cart"
                    onClick={() => setOpen(false)}
                    className="bg-navy text-cream text-label tracking-display block rounded-sm py-2.5 text-center uppercase"
                  >
                    {t('viewCart')}
                  </Link>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
