'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { cartItemsToGaItems, trackEvent } from '@/lib/analytics/gtag'
import { useCart } from '@/lib/cart/store'
import type { GiftItemView } from '@/lib/giftItems/queries'
import { formatPrice } from '@/lib/format'
import { useToast } from '@/lib/ui/toast'

/**
 * Выбор номинала и покупка подарочного товара (фаза 11.1, задача 2) — копия
 * структуры `BuyBlock.tsx` (переключатель вариантов, тост, «в 1 клик»), но
 * без ml-объёма и скидок: номинал сам по себе и есть цена, показывать его
 * дважды (в чипе и отдельной строкой цены) было бы просто дублированием.
 */
export function GiftBuyBlock({
  item,
  image,
  typeLabel,
}: {
  item: GiftItemView
  image: string | null
  typeLabel: string
}) {
  const t = useTranslations('Product')
  const tg = useTranslations('GiftItem')
  const locale = useLocale() as Locale
  const add = useCart((state) => state.add)
  const showCartToast = useToast((state) => state.showCartToast)
  const router = useRouter()

  const firstAvailable = item.variants.findIndex((variant) => variant.stock > 0)
  const [index, setIndex] = useState(firstAvailable >= 0 ? firstAvailable : 0)
  const [added, setAdded] = useState(false)

  const variant = item.variants[index]
  if (!variant) return null

  const available = variant.stock > 0

  const putInCart = () => {
    add({
      kind: 'gift',
      productId: item.id,
      slug: item.slug,
      title: item.title,
      brandTitle: typeLabel,
      sku: variant.sku,
      price: variant.amount,
      image,
    })
    trackEvent('add_to_cart', {
      currency: 'MDL',
      value: variant.amount,
      items: cartItemsToGaItems([
        { productId: item.id, title: item.title, brandTitle: typeLabel, price: variant.amount, qty: 1 },
      ]),
    })
  }

  const addToCart = () => {
    putInCart()
    showCartToast({ title: item.title, brandTitle: typeLabel, image })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const oneClick = () => {
    putInCart()
    router.push('/cart')
  }

  return (
    <div>
      <div className="text-ink-muted text-eyebrow tracking-display mb-2 uppercase">
        {tg('amount')}
      </div>
      <div className="flex flex-wrap gap-2">
        {item.variants.map((variantItem, itemIndex) => {
          const disabled = variantItem.stock === 0
          const active = itemIndex === index
          return (
            <button
              key={variantItem.sku}
              type="button"
              disabled={disabled}
              onClick={() => setIndex(itemIndex)}
              className={`text-label rounded-sm border px-3 py-1.5 transition-colors ${
                active
                  ? 'border-navy bg-navy text-cream'
                  : disabled
                    ? 'border-line text-ink-subtle cursor-not-allowed line-through'
                    : 'border-line text-ink hover:border-navy cursor-pointer'
              }`}
            >
              {formatPrice(variantItem.amount, locale)}
            </button>
          )
        })}
      </div>

      <div className="border-line mt-6 flex flex-wrap items-baseline gap-3 border-t pt-6">
        <span
          className={`text-eyebrow tracking-label ml-auto uppercase ${
            available ? 'text-ink-muted' : 'text-danger'
          }`}
        >
          {available ? t('inStock') : t('outOfStock')}
        </span>
      </div>

      <p className="text-ink-subtle text-eyebrow tracking-label mt-2 uppercase">
        {t('sku')}: {variant.sku}
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={!available}
          onClick={addToCart}
          className="bg-navy text-cream text-label tracking-display flex-1 cursor-pointer rounded-sm px-6 py-3.5 uppercase transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {added ? t('added') : t('addToCart')}
        </button>
        <button
          type="button"
          disabled={!available}
          onClick={oneClick}
          className="border-navy text-navy hover:bg-navy hover:text-cream text-label tracking-display flex-1 cursor-pointer rounded-sm border px-6 py-3.5 uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('oneClick')}
        </button>
      </div>
    </div>
  )
}
