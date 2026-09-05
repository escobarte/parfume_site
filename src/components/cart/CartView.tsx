'use client'

import { Minus, Plus, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { cartItemsToGaItems, cartValue, trackEvent } from '@/lib/analytics/gtag'
import { selectTotal, useCart } from '@/lib/cart/store'
import { formatPrice, formatVolume } from '@/lib/format'
import { promoDiscountAmount } from '@/lib/pricing'
import { usePromo } from '@/lib/orders/promoStore'
import { useHasHydrated } from '@/lib/useHasHydrated'
import { OrderForm } from './OrderForm'
import { PromoCodeInput } from './PromoCodeInput'

/** Страница корзины: позиции с количеством, итог и форма заявки рядом. */
export function CartView() {
  const t = useTranslations('Cart')
  const locale = useLocale() as Locale
  const items = useCart((state) => state.items)
  const total = useCart(selectTotal)
  const setQty = useCart((state) => state.setQty)
  const remove = useCart((state) => state.remove)
  const hydrated = useHasHydrated()
  const checkoutSent = useRef(false)
  const promoCode = usePromo((state) => state.code)
  const promoPercent = usePromo((state) => state.percent)

  // Скидка не действует на подарочные сертификаты/Gift box (фаза 11.2,
  // задача 7) — та же база, что сервер считает в buildItems() при оформлении.
  const discountableSubtotal = items
    .filter((item) => (item.kind ?? 'product') !== 'gift')
    .reduce((sum, item) => sum + item.price * item.qty, 0)
  const discount = promoPercent ? promoDiscountAmount(discountableSubtotal, promoPercent) : 0
  const totalWithDiscount = total - discount

  // GA4 begin_checkout (PLAN.md §7.5) — один раз за визит на непустую
  // корзину, после гидрации (до неё `items` не отражает localStorage).
  useEffect(() => {
    if (!hydrated || items.length === 0 || checkoutSent.current) return
    checkoutSent.current = true
    trackEvent('begin_checkout', {
      currency: 'MDL',
      value: cartValue(items),
      items: cartItemsToGaItems(items),
    })
  }, [hydrated, items])

  // До гидрации содержимое localStorage неизвестно — рисуем пустой каркас.
  if (!hydrated) return <div className="min-h-100" />

  if (items.length === 0) {
    return (
      <div className="border-line flex flex-col items-center gap-2 border py-20 text-center">
        <p className="text-ink text-body">{t('empty')}</p>
        <p className="text-ink-muted text-body-sm">{t('emptyHint')}</p>
        <Link
          href="/catalog"
          className="border-navy text-navy hover:bg-navy hover:text-cream text-label tracking-display mt-4 rounded-sm border px-6 py-3 uppercase transition-colors"
        >
          {t('toCatalog')}
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:gap-12">
      <div>
        <ul className="border-line divide-line divide-y border-y">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-start gap-4 py-4">
              <div className="min-w-0 flex-1">
                {item.brandTitle && (
                  <p className="text-ink-muted text-micro tracking-label uppercase">
                    {item.brandTitle}
                  </p>
                )}
                <Link
                  href={`/product/${item.slug}`}
                  className="text-ink text-body hover:text-ink-muted font-medium transition-colors"
                >
                  {item.title}
                </Link>
                <p className="text-ink-muted text-label mt-1">
                  {[item.volume ? formatVolume(item.volume) : null, item.sku]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              <div className="border-line flex items-center rounded-sm border">
                <button
                  type="button"
                  onClick={() => setQty(item.key, item.qty - 1)}
                  disabled={item.qty <= 1}
                  aria-label={t('qty')}
                  className="text-ink cursor-pointer px-2.5 py-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Minus className="size-3.5" strokeWidth={1.8} />
                </button>
                <span className="text-ink text-body-sm w-8 text-center tabular-nums">
                  {item.qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(item.key, item.qty + 1)}
                  aria-label={t('qty')}
                  className="text-ink cursor-pointer px-2.5 py-2"
                >
                  <Plus className="size-3.5" strokeWidth={1.8} />
                </button>
              </div>

              <div className="text-ink text-body w-24 text-right font-medium">
                {formatPrice(item.price * item.qty, locale)}
              </div>

              <button
                type="button"
                onClick={() => remove(item.key)}
                aria-label={t('remove')}
                className="text-ink-subtle hover:text-danger cursor-pointer py-2 transition-colors"
              >
                <X className="size-4" strokeWidth={1.6} />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <PromoCodeInput />
        </div>

        {promoCode && (
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-ink-muted text-eyebrow tracking-label uppercase">
              {t('promoDiscount', { code: promoCode, percent: promoPercent ?? 0 })}
            </span>
            <span className="text-ink text-body-sm">−{formatPrice(discount, locale)}</span>
          </div>
        )}

        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-ink-muted text-eyebrow tracking-label uppercase">{t('total')}</span>
          <span className="text-ink text-display font-medium">
            {formatPrice(totalWithDiscount, locale)}
          </span>
        </div>
      </div>

      <OrderForm />
    </div>
  )
}
