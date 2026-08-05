'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/routing'
import { useCart } from '@/lib/cart/store'
import type { ProductView } from '@/lib/catalog/product'
import { formatPrice, formatVolume } from '@/lib/format'

/**
 * Переключатель объёма и кнопки покупки. Смена объёма меняет цену, SKU
 * и наличие без перезагрузки — состояние живёт в клиенте (PLAN.md §5.4).
 * Вариант с нулевым остатком выбрать нельзя.
 */
export function BuyBlock({ product, image }: { product: ProductView; image: string | null }) {
  const t = useTranslations('Product')
  const locale = useLocale() as Locale
  const add = useCart((state) => state.add)

  const firstAvailable = product.variants.findIndex((variant) => variant.stock > 0)
  const [index, setIndex] = useState(firstAvailable >= 0 ? firstAvailable : 0)
  const [added, setAdded] = useState(false)

  const variant = product.variants[index]
  if (!variant) return null

  const available = variant.stock > 0

  const addToCart = () => {
    add({
      productId: product.id,
      slug: product.slug,
      title: product.title,
      brandTitle: product.brand?.title ?? '',
      sku: variant.sku,
      volume: variant.volume,
      price: variant.price,
      image,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div>
      <div className="text-ink-muted text-eyebrow tracking-display mb-2 uppercase">
        {t('volume')}
      </div>
      <div className="flex flex-wrap gap-2">
        {product.variants.map((item, itemIndex) => {
          const disabled = item.stock === 0
          const active = itemIndex === index
          return (
            <button
              key={item.sku}
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
              {formatVolume(item.volume)}
            </button>
          )
        })}
      </div>

      <div className="border-line mt-6 flex flex-wrap items-baseline gap-3 border-t pt-6">
        <span className="text-ink text-display font-medium">
          {formatPrice(variant.price, locale)}
        </span>
        {variant.oldPrice && variant.oldPrice > variant.price && (
          <span className="text-ink-subtle text-body line-through">
            {formatPrice(variant.oldPrice, locale)}
          </span>
        )}
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
          className="border-navy text-navy hover:bg-navy hover:text-cream text-label tracking-display flex-1 cursor-pointer rounded-sm border px-6 py-3.5 uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('oneClick')}
        </button>
      </div>
    </div>
  )
}
